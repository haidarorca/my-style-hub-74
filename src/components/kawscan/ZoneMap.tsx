import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type LatLng = [number, number];

export type ZoneMapHandle = { center: () => LatLng | null };

/**
 * Carte (navigateur uniquement) : zone à 4 points réellement déplaçables.
 * La zone se met à jour en direct pendant le déplacement d'un point.
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
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const polyRef = useRef<import("leaflet").Polygon | null>(null);
  const markersRef = useRef<import("leaflet").Marker[]>([]);
  const pointsRef = useRef<LatLng[]>(value);
  const draggingRef = useRef(false);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((mod) => {
      const L = (mod as unknown as { default?: typeof import("leaflet") }).default ?? mod;
      if (cancelled || !el.current || mapRef.current) return;
      LRef.current = L;
      const start = value[0] ?? center ?? [14.6928, -17.4467];
      const map = L.map(el.current, { zoomControl: true, tap: false } as L.MapOptions).setView(start, 19);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 21,
        maxNativeZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      mapRef.current = map;
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
      polyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function rebuild(pts: LatLng[]) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    pointsRef.current = pts.slice();
    polyRef.current?.remove();
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
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
      });
      m.on("dragend", () => {
        draggingRef.current = false;
        const p = m.getLatLng();
        pointsRef.current[i] = [p.lat, p.lng];
        cb.current(pointsRef.current.slice());
      });
      markersRef.current.push(m);
    });
  }

  return <div ref={el} className="h-[60vh] max-h-[480px] min-h-72 w-full overflow-hidden rounded-xl border" style={{ zIndex: 0 }} />;
}
