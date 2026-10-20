import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  /** Short text inside the pin (order no, initials, "R"). */
  label?: string;
  /** Tooltip / popup text. */
  title?: string;
  color: string;
  kind?: "pin" | "dot" | "home";
}
export interface MapLine { id: string; points: [number, number][]; color: string; dashed?: boolean }

/** Pins as plain HTML (no image assets to bundle), so they stay crisp and themeable. */
function icon(m: MapMarker) {
  const size = m.kind === "dot" ? 30 : m.kind === "home" ? 36 : 32;
  const shape = m.kind === "pin" || !m.kind ? "border-radius:50% 50% 50% 0;transform:rotate(-45deg)" : "border-radius:50%";
  const inner = m.kind === "pin" || !m.kind ? "transform:rotate(45deg)" : "";
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: m.kind === "pin" || !m.kind ? [size / 2, size] : [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;background:${m.color};${shape};display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 8px rgb(0 0 0/.35);border:2px solid #fff"><span style="${inner};color:#fff;font:700 11px/1 system-ui">${m.label ?? ""}</span></div>`,
  });
}

/** A Leaflet map on OpenStreetMap tiles that keeps its view while markers move (fits once, then only when asked). */
export function LiveMap({ markers, lines = [], className, fitKey, onMapClick }: {
  markers: MapMarker[]; lines?: MapLine[]; className?: string; fitKey?: string; onMapClick?: (lat: number, lng: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef<string | undefined>(undefined);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;

  useEffect(() => {
    if (!host.current || map.current) return;
    const m = L.map(host.current, { zoomControl: true, attributionControl: true }).setView([31.52, 74.36], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => clickRef.current?.(e.latlng.lat, e.latlng.lng));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(host.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    lines.forEach((l) => L.polyline(l.points, { color: l.color, weight: 3, opacity: 0.8, dashArray: l.dashed ? "6 6" : undefined }).addTo(g));
    markers.forEach((mk) => L.marker([mk.lat, mk.lng], { icon: icon(mk), title: mk.title }).bindTooltip(mk.title ?? "", { direction: "top" }).addTo(g));
    const key = fitKey ?? "once";
    if (markers.length && fitted.current !== key) {
      fitted.current = key;
      const b = L.latLngBounds(markers.map((x) => [x.lat, x.lng] as [number, number]));
      m.fitBounds(b.pad(0.25), { maxZoom: 15 });
    }
  }, [markers, lines, fitKey]);

  return <div ref={host} className={className} style={{ minHeight: 240 }} />;
}
