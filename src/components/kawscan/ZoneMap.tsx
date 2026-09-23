import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

export type LatLng = [number, number];

export type ZoneMapHandle = { center: () => LatLng | null };

type MapType = "standard" | "satellite" | "hybrid" | "relief";

type Leaflet = typeof import("leaflet");
type LMap = import("leaflet").Map;
type LTileLayer = import("leaflet").TileLayer;
type LMarker = import("leaflet").Marker;
type LPolygon = import("leaflet").Polygon;

const TILE_SOURCES: Record<MapType, { base: { url: string; opts: import("leaflet").TileLayerOptions }; overlay?: { url: string; opts: import("leaflet").TileLayerOptions } }> = {
  standard: {
    base: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      opts: { maxZoom: 21, maxNativeZoom: 19, attribution: "© OpenStreetMap" },
    },
  },
  satellite: {
    base: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      opts: { maxZoom: 21, maxNativeZoom: 19, attribution: "© Esri, Maxar, Earthstar Geographics" },
    },
  },
  hybrid: {
    base: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      opts: { maxZoom: 21, maxNativeZoom: 19, attribution: "© Esri, Maxar, Earthstar Geographics" },
    },
    overlay: {
      // Routes, lieux et limites par-dessus l'imagerie satellite.
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      opts: { maxZoom: 21, maxNativeZoom: 19, attribution: "© Esri" },
    },
  },
  relief: {
    base: {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      opts: { maxZoom: 17, attribution: "© OpenTopoMap (CC-BY-SA)" },
    },
  },
};

const MAP_TYPE_LABELS: { v: MapType; label: string }[] = [
  { v: "standard", label: "Standard" },
  { v: "satellite", label: "Satellite" },
  { v: "hybrid", label: "Hybride" },
  { v: "relief", label: "Relief" },
];

/**
 * Carte (navigateur uniquement) : zone à 4 points réellement déplaçables,
 * sélecteur de type de carte (Standard / Satellite / Hybride / Relief)
 * et marqueur central « emplacement du magasin » déplaçable qui translate
 * toute la zone. La vue Satellite permet de repérer visuellement le magasin.
 */
export default function ZoneMap({
  value,
  onChange,
  center,
  handleRef,
}: {
  value: LatLng[];
  onChange: (v: LatLng[]) => void;
  center: LatLng | null;
  handleRef?: React.MutableRefObject<ZoneMapHandle | null>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const LRef = useRef<Leaflet | null>(null);
  const polyRef = useRef<LPolygon | null>(null);
  const markersRef = useRef<LMarker[]>([]);
  const centerMarkerRef = useRef<LMarker | null>(null);
  const baseLayerRef = useRef<LTileLayer | null>(null);
  const overlayLayerRef = useRef<LTileLayer | null>(null);
  const pointsRef = useRef<LatLng[]>(value);
  const draggingRef = useRef(false);
  const cb = useRef(onChange);
  cb.current = onChange;
  const [mapType, setMapType] = useState<MapType>("standard");

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((mod) => {
      const L = (mod as unknown as { default?: Leaflet }).default ?? mod;
      if (cancelled || !el.current || mapRef.current) return;
      LRef.current = L;
      const start = value[0] ?? center ?? [14.6928, -17.4467];
      const map = L.map(el.current, { zoomControl: true, taps: false } as L.MapOptions).setView(start, 19);
      LRef.current = L;
      mapRef.current = map;
      applyTileLayer(L, map, mapType);
      if (handleRef) {
        handleRef.current = {
          center: () => {
            const c = map.getCenter();
            return [c.lat, c.lng];
          },
        };
      }
      if (value.length >= 3) map.fitBounds(L.latLngBounds(value), { padding: [40, 40] });
      rebuild(value);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = [];
      centerMarkerRef.current = null;
      polyRef.current = null;
      baseLayerRef.current = null;
      overlayLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Changer de type de carte sans recréer la carte ni perdre la zone.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    applyTileLayer(L, map, mapType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapType]);

  // Recentrer quand la position du vendeur arrive.
  useEffect(() => {
    if (center && mapRef.current) mapRef.current.setView(center, 19);
  }, [center]);

  // Nouvelle zone venue de l'extérieur (Ma position / Refaire / chargement).
  useEffect(() => {
    if (draggingRef.current) return;
    const same =
      value.length === pointsRef.current.length &&
      value.every((p, i) => p[0] === pointsRef.current[i]?.[0] && p[1] === pointsRef.current[i]?.[1]);
    if (!same || markersRef.current.length === 0) rebuild(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function applyTileLayer(L: Leaflet, map: LMap, type: MapType) {
    const src = TILE_SOURCES[type];
    overlayLayerRef.current?.remove();
    overlayLayerRef.current = null;
    baseLayerRef.current?.remove();
    baseLayerRef.current = null;
    baseLayerRef.current = L.tileLayer(src.base.url, src.base.opts).addTo(map);
    if (src.overlay) {
      overlayLayerRef.current = L.tileLayer(src.overlay.url, src.overlay.opts).addTo(map);
    }
  }

  function centroid(pts: LatLng[]): LatLng | null {
    if (pts.length < 3) return null;
    let lat = 0;
    let lng = 0;
    for (const p of pts) {
      lat += p[0];
      lng += p[1];
    }
    return [lat / pts.length, lng / pts.length];
  }

  function rebuild(pts: LatLng[]) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    pointsRef.current = pts.slice();
    polyRef.current?.remove();
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    centerMarkerRef.current?.remove();
    centerMarkerRef.current = null;
    polyRef.current = null;
    if (pts.length < 3) return;
    polyRef.current = L.polygon(pts, { color: "#1d4ed8", weight: 3, fillOpacity: 0.2 }).addTo(map);
    pts.forEach((pt, i) => {
      const m = L.marker(pt, {
        draggable: true,
        autoPan: true,
        icon: L.divIcon({
          className: "",
          // Grande cible tactile (44 px) avec un point visible numéroté.
          html: `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;touch-action:none"><div style="width:28px;height:28px;border-radius:50%;background:#1d4ed8;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);color:#fff;font:700 13px/22px system-ui;text-align:center">${i + 1}</div></div>`,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        }),
      }).addTo(map);
      m.on("dragstart", () => {
        draggingRef.current = true;
      });
      m.on("drag", () => {
        const p = m.getLatLng();
        pointsRef.current[i] = [p.lat, p.lng];
        polyRef.current?.setLatLngs(pointsRef.current);
        moveCenterMarkerOnly();
      });
      m.on("dragend", () => {
        draggingRef.current = false;
        const p = m.getLatLng();
        pointsRef.current[i] = [p.lat, p.lng];
        cb.current(pointsRef.current.slice());
      });
      markersRef.current.push(m);
    });

    // Marqueur central « emplacement du magasin » : déplace toute la zone.
    const c = centroid(pts);
    if (c) {
      const cm = L.marker(c, {
        draggable: true,
        autoPan: true,
        icon: L.divIcon({
          className: "",
          html: `<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;touch-action:none"><div style="width:34px;height:34px;border-radius:50% 50% 50% 0;background:#b45309;border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.5);color:#fff;font:700 16px/34px system-ui;text-align:center;transform:rotate(-45deg)">📍</div></div>`,
          iconSize: [48, 48],
          iconAnchor: [24, 44],
        }),
        zIndexOffset: 1000,
      }).addTo(map);
      let startPts: LatLng[] | null = null;
      let startCenter: LatLng | null = null;
      cm.on("dragstart", () => {
        draggingRef.current = true;
        startPts = pointsRef.current.map((p) => [...p] as LatLng);
        startCenter = c;
      });
      cm.on("drag", () => {
        if (!startPts || !startCenter) return;
        const np = cm.getLatLng();
        const dLat = np.lat - startCenter[0];
        const dLng = np.lng - startCenter[1];
        const moved = startPts.map((p) => [p[0] + dLat, p[1] + dLng] as LatLng);
        pointsRef.current = moved;
        // Déplacer les marqueurs de coin sans les recréer (évite le saut visuel).
        markersRef.current.forEach((mk, i) => mk.setLatLng(moved[i]));
        polyRef.current?.setLatLngs(moved);
      });
      cm.on("dragend", () => {
        draggingRef.current = false;
        cb.current(pointsRef.current.slice());
        startPts = null;
        startCenter = null;
      });
      centerMarkerRef.current = cm;
    }
  }

  // Repositionne seulement le marqueur central sans toucher aux coins.
  function moveCenterMarkerOnly() {
    const L = LRef.current;
    const cm = centerMarkerRef.current;
    if (!L || !cm) return;
    const c = centroid(pointsRef.current);
    if (c) cm.setLatLng(c);
  }

  return (
    <div className="relative">
      <div ref={el} className="h-[60vh] max-h-[520px] min-h-72 w-full overflow-hidden rounded-xl border" style={{ zIndex: 0 }} />
      {/* Sélecteur de type de carte — au-dessus de la carte, cible tactile mobile. */}
      <div className="absolute right-2 top-2 z-[1000] flex flex-col gap-1 rounded-lg bg-background/90 p-1 shadow-md backdrop-blur sm:flex-row">
        {MAP_TYPE_LABELS.map((m) => (
          <button
            key={m.v}
            type="button"
            onClick={() => setMapType(m.v)}
            aria-pressed={mapType === m.v}
            className={`h-9 rounded-md px-3 text-xs font-semibold transition-colors ${
              mapType === m.v ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
