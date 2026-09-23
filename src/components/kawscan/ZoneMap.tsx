import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type LatLng = [number, number];

/** Carte (navigateur uniquement) : zone rectangulaire/polygonale à coins déplaçables. */
export default function ZoneMap({ value, onChange, center }: { value: LatLng[]; onChange: (v: LatLng[]) => void; center: LatLng | null }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((mod) => {
      const L = (mod as unknown as { default?: typeof import("leaflet") }).default ?? mod;
      if (cancelled || !el.current || mapRef.current) return;
      LRef.current = L;
      const start = value[0] ?? center ?? [14.6928, -17.4467];
      const map = L.map(el.current, { zoomControl: true }).setView(start, 19);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20,
        maxNativeZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      if (value.length >= 3) map.fitBounds(L.latLngBounds(value), { padding: [30, 30] });
      draw();
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (center && mapRef.current && value.length === 0) mapRef.current.setView(center, 19);
  }, [center, value.length]);

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function draw() {
    const L = LRef.current;
    const layer = layerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    if (value.length < 3) return;
    L.polygon(value, { color: "#1d4ed8", weight: 2, fillOpacity: 0.18 }).addTo(layer);
    value.forEach((pt, i) => {
      const m = L.marker(pt, {
        draggable: true,
        icon: L.divIcon({
          className: "",
          html: '<div style="width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid #1d4ed8;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      }).addTo(layer);
      m.on("dragend", () => {
        const p = m.getLatLng();
        const next = value.slice();
        next[i] = [p.lat, p.lng];
        cb.current(next);
      });
    });
  }

  return <div ref={el} className="h-80 w-full overflow-hidden rounded-xl border" style={{ zIndex: 0 }} />;
}
