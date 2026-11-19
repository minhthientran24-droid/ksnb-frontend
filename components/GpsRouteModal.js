import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { getGpsRoute } from "../lib/api";

// Popup "Lịch sử hành trình" (chốt 18/11) — kích thước 85% màn hình, căn giữa: bản đồ (kiểu Google ban ngày / vệ tinh) vẽ lộ trình tô màu theo tốc độ, điểm bắt đầu / kết thúc,
// các điểm dừng; bên phải là danh sách điểm dừng + bảng các điểm đi. Dữ liệu lấy trực tiếp từ gpsthanhnam.com theo khoảng ngày chọn.

// Nguồn bản đồ không cần khoá API. (tile.openstreetmap.org không truy cập được từ mạng ở đây, CARTO thì đòi khoá -> dùng Esri + OSM Đức)
// Nền mặc định (chốt 18/11): bản đồ vector OpenFreeMap (dữ liệu OpenStreetMap) tô lại bảng màu gần giống Google Maps ban ngày — xem public/gps-map-style.json.
// Các nền raster bên dưới là phương án dự phòng (máy không có WebGL) / lựa chọn thêm.
const GOOGLE_STYLE_URL = "/gps-map-style.json";
// Esri "Light Gray Canvas" — xám sáng, đường phố mờ nhạt (chốt 18/11: nền vàng/đường đậm của World_Street_Map làm chói mắt, khó nhìn lộ trình)
const LIGHT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const LIGHT_REF_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"; // tên đường / địa danh
const STREET_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const OSM_URL = "https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png";
const SAT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const MAX_ROWS = 3000;

// Màu lộ trình theo tốc độ — tránh vàng/cam/xanh lá vì trùng màu đường lớn / công viên của nền bản đồ kiểu Google (chốt 18/11)
const SPEED_LEGEND = [
  ["#6B7280", "≤ 5 km/h"],
  ["#1A73E8", "6–40"],
  ["#8E24AA", "41–60"],
  ["#D93025", "> 60"],
];

function speedColor(v) {
  if (v <= 5) return "#6B7280";
  if (v <= 40) return "#1A73E8";
  if (v <= 60) return "#8E24AA";
  return "#D93025";
}

function todayVn() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtT(t) {
  if (!t || t.length < 19) return t || "—";
  return `${t.slice(8, 10)}/${t.slice(5, 7)} ${t.slice(11, 19)}`;
}

function fmtDur(v) {
  if (!v) return "—";
  const p = String(v).split(":");
  return p.length === 3 ? `${p[0]}:${p[1].padStart(2, "0")}:${p[2].padStart(2, "0")}` : v;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export default function GpsRouteModal({ device, onClose }) {
  const [from, setFrom] = useState(todayVn());
  const [to, setTo] = useState(todayVn());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("stops");
  const [sel, setSel] = useState(null);
  // Khung hẹp (điện thoại / cửa sổ nhỏ): bản đồ ở trên, danh sách ở dưới, mỗi bên 1 nửa chiều cao — danh sách tự cuộn bên trong
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && (window.innerWidth - 24) * 0.85 < 980);
  useEffect(() => {
    const f = () => setNarrow((window.innerWidth - 24) * 0.85 < 980);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  useEffect(() => { const t = setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 120); return () => clearTimeout(t); }, [narrow]);

  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const lgRef = useRef(null);
  const LRef = useRef(null);
  const hiRef = useRef(null);
  const stopMarkers = useRef([]);
  const [mapReady, setMapReady] = useState(false);

  // Khởi tạo bản đồ (Leaflet chỉ chạy trên trình duyệt -> import động)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      const L = mod.default || mod;
      let maplibreGL = null;
      try {
        const hasWebGL = !!document.createElement("canvas").getContext("webgl");
        if (hasWebGL) {
          // Worker xử lý tile vector: dùng file tách riêng trong public/ (worker nhúng sẵn bị lỗi khi đóng gói bằng Next.js)
          const ml = await import("maplibre-gl");
          (ml.default || ml).setWorkerUrl("/maplibre-gl-csp-worker.js");
          maplibreGL = (await import("@maplibre/maplibre-gl-leaflet")).maplibreGL;
        }
      } catch (e) {
        maplibreGL = null;
      }
      if (cancelled || !mapEl.current) return;
      LRef.current = L;
      const map = L.map(mapEl.current, { preferCanvas: true }).setView([10.78, 106.7], 12);
      const light = L.layerGroup([
        L.tileLayer(LIGHT_URL, { maxZoom: 19, maxNativeZoom: 16, attribution: "Tiles © Esri" }),
        L.tileLayer(LIGHT_REF_URL, { maxZoom: 19, maxNativeZoom: 16 }),
      ]);
      const street = L.tileLayer(STREET_URL, { maxZoom: 19, attribution: "Tiles © Esri" });
      const osm = L.tileLayer(OSM_URL, { maxZoom: 19, subdomains: "abc", attribution: "© OpenStreetMap contributors" });
      const sat = L.tileLayer(SAT_URL, { maxZoom: 19, attribution: "Tiles © Esri" });
      const bases = {};
      let first = light;
      if (maplibreGL) {
        const gl = maplibreGL({ style: GOOGLE_STYLE_URL, attribution: "© OpenStreetMap contributors · OpenFreeMap" });
        bases["Ban ngày (kiểu Google)"] = gl;
        first = gl;
      }
      Object.assign(bases, { "Nền xám nhạt": light, "Đường phố (Esri)": street, "OpenStreetMap": osm, "Vệ tinh": sat });
      first.addTo(map);
      L.control.layers(bases).addTo(map);
      lgRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);
      setTimeout(() => map.invalidateSize(), 200);
    })();
    const onResize = () => mapRef.current && mapRef.current.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function load(f = from, t = to) {
    setLoading(true);
    setError("");
    getGpsRoute(device.imei, f, t)
      .then((res) => { setData(res); setSel(null); })
      .catch((e) => { setError(e.message); setData(null); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function quick(f, t) {
    setFrom(f);
    setTo(t);
    load(f, t);
  }

  // Vẽ lộ trình mỗi khi có dữ liệu mới
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const lg = lgRef.current;
    if (!mapReady || !L || !map || !lg) return;
    lg.clearLayers();
    stopMarkers.current = [];
    hiRef.current = null;
    if (!data) return;
    const pts = data.points || [];
    const bounds = [];
    const renderer = L.canvas({ padding: 0.5 });

    if (pts.length > 1) {
      // viền trắng dày bên dưới để lộ trình nổi bật trên mọi nền bản đồ
      L.polyline(pts.map((p) => [p.lat, p.lng]), { color: "#fff", weight: 9, opacity: 0.95, renderer }).addTo(lg);
      let cur = speedColor(pts[1].speed);
      let run = [pts[0]];
      const flush = () => {
        if (run.length > 1) L.polyline(run.map((p) => [p.lat, p.lng]), { color: cur, weight: 5, opacity: 1, renderer }).addTo(lg);
      };
      for (let i = 1; i < pts.length; i++) {
        const c = speedColor(pts[i].speed);
        if (c !== cur) {
          flush();
          run = [pts[i - 1]];
          cur = c;
        }
        run.push(pts[i]);
      }
      flush();
    }
    pts.forEach((p) => bounds.push([p.lat, p.lng]));

    (data.stops || []).forEach((s, i) => {
      const m = L.circleMarker([s.lat, s.lng], { radius: 8, color: "#fff", weight: 2, fillColor: "#E8590C", fillOpacity: 1 }).addTo(lg);
      m.bindTooltip(`Dừng ${i + 1}`);
      m.bindPopup(
        `<b>Điểm dừng ${i + 1}</b><br/>${esc(fmtT(s.start))} → ${esc(fmtT(s.end))}<br/>Thời gian dừng: <b>${esc(fmtDur(s.duration))}</b><br/>${esc(s.address || "")}`
      );
      stopMarkers.current.push(m);
      bounds.push([s.lat, s.lng]);
    });

    if (pts.length) {
      const a = pts[0];
      const b = pts[pts.length - 1];
      L.circleMarker([a.lat, a.lng], { radius: 10, color: "#fff", weight: 3, fillColor: "#2E9E4F", fillOpacity: 1 }).bindTooltip(`Bắt đầu ${fmtT(a.t)}`, { permanent: false }).addTo(lg);
      L.circleMarker([b.lat, b.lng], { radius: 10, color: "#fff", weight: 3, fillColor: "#D6342C", fillOpacity: 1 }).bindTooltip(`Cuối ${fmtT(b.t)}`, { permanent: false }).addTo(lg);
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    setTimeout(() => map.invalidateSize(), 100);
  }, [data, mapReady]);

  function focusPoint(i) {
    const L = LRef.current;
    const map = mapRef.current;
    const lg = lgRef.current;
    const p = data?.points?.[i];
    if (!L || !map || !p) return;
    setSel(i);
    if (hiRef.current) lg.removeLayer(hiRef.current);
    hiRef.current = L.circleMarker([p.lat, p.lng], { radius: 12, color: "#111", weight: 3, fillColor: "#FFD400", fillOpacity: 1 }).addTo(lg);
    hiRef.current.bindPopup(`<b>${esc(fmtT(p.t))}</b><br/>Tốc độ: <b>${esc(p.speed)} km/h</b>`).openPopup();
    map.setView([p.lat, p.lng], Math.max(map.getZoom(), 16));
  }

  function focusStop(i) {
    const map = mapRef.current;
    const m = stopMarkers.current[i];
    if (!map || !m) return;
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 16));
    m.openPopup();
  }

  const pts = data?.points || [];
  const stops = data?.stops || [];
  const maxSpeed = pts.reduce((mx, p) => Math.max(mx, p.speed || 0), 0);
  const today = todayVn();

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--surface, #fff)", borderRadius: 12, width: "calc((100vw - 24px) * 0.85)", height: "calc((100vh - 24px) * 0.85)", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.35)", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Thanh tiêu đề + chọn ngày */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, marginRight: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-900)" }}>Lịch sử hành trình — {device.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-400)" }}>{device.imei} · dữ liệu lấy trực tiếp từ gpsthanhnam.com</div>
          </div>
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            Từ
            <input type="date" className="finput" value={from} max={today} onChange={(e) => setFrom(e.target.value)} style={{ padding: "6px 8px" }} />
          </label>
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            Đến
            <input type="date" className="finput" value={to} max={today} onChange={(e) => setTo(e.target.value)} style={{ padding: "6px 8px" }} />
          </label>
          <button className="fbtn" disabled={loading || !from || !to} onClick={() => load()}>{loading ? "Đang tải..." : "🔍 Xem"}</button>
          <button className="fbtn" disabled={loading} onClick={() => quick(today, today)}>Hôm nay</button>
          <button className="fbtn" disabled={loading} onClick={() => quick(addDays(today, -1), addDays(today, -1))}>Hôm qua</button>
          <button className="fbtn" disabled={loading} onClick={() => quick(addDays(today, -6), today)}>7 ngày</button>
          <button className="fbtn" onClick={onClose}>✕ Đóng</button>
        </div>

        {/* Thống kê nhanh */}
        <div style={{ padding: "7px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13.5, alignItems: "center" }}>
          {error && <span style={{ color: "var(--danger)", fontWeight: 700 }}>✗ {error}</span>}
          {!error && data && (
            <>
              <span>Tổng quãng đường: <b>{data.total_distance != null ? `${data.total_distance} km` : "—"}</b></span>
              <span>Số điểm: <b>{pts.length}</b></span>
              <span>Số lần dừng: <b>{stops.length}</b></span>
              <span>Tốc độ cao nhất: <b>{maxSpeed} km/h</b></span>
              {pts.length > 0 && <span>Từ <b>{fmtT(pts[0].t)}</b> đến <b>{fmtT(pts[pts.length - 1].t)}</b></span>}
            </>
          )}
          {!error && !data && loading && <span>Đang tải dữ liệu hành trình...</span>}
          <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", fontSize: 12.5, color: "var(--text-600)" }}>
            {SPEED_LEGEND.map(([c, l]) => (
              <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 16, height: 4, borderRadius: 2, background: c, display: "inline-block" }} />{l}
              </span>
            ))}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: "#E8590C", display: "inline-block" }} />Điểm dừng
            </span>
          </span>
        </div>

        {/* Bản đồ + danh sách */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: narrow ? "column" : "row" }}>
          <div style={{ flex: narrow ? "1 1 50%" : "1 1 0", minHeight: 0, minWidth: 0, position: "relative" }}>
            <div ref={mapEl} style={{ position: "absolute", inset: 0 }} />
            {!loading && !error && data && pts.length === 0 && stops.length === 0 && (
              <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 500, background: "#fff", padding: "8px 16px", borderRadius: 8, boxShadow: "0 2px 10px rgba(0,0,0,0.25)", fontSize: 14 }}>
                Không có dữ liệu hành trình trong khoảng ngày này.
              </div>
            )}
          </div>

          <div style={narrow ? { flex: "1 1 50%", minHeight: 0, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", minWidth: 0 } : { flex: "0 0 400px", minHeight: 0, borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
              {[["stops", `Điểm dừng (${stops.length})`], ["points", `Lộ trình (${pts.length} điểm)`]].map(([k, l]) => (
                <div
                  key={k} onClick={() => setTab(k)}
                  style={{ flex: 1, textAlign: "center", padding: "9px 6px", cursor: "pointer", fontSize: 13.5, fontWeight: 700, color: tab === k ? "#1C64B4" : "var(--text-600)", borderBottom: tab === k ? "2px solid #1C64B4" : "2px solid transparent" }}
                >
                  {l}
                </div>
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
              {tab === "stops" && (
                stops.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 13.5, color: "var(--text-400)" }}>{data ? "Không có điểm dừng." : ""}</div>
                ) : (
                  stops.map((s, i) => (
                    <div key={i} onClick={() => focusStop(i)} style={{ padding: "9px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer", fontSize: 13 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <b style={{ color: "#E8590C" }}>Dừng {i + 1}</b>
                        <span style={{ fontWeight: 700 }}>{fmtDur(s.duration)}</span>
                      </div>
                      <div style={{ color: "var(--text-600)" }}>{fmtT(s.start)} → {fmtT(s.end)}</div>
                      <div style={{ color: "var(--text-400)", fontSize: 12.5 }}>{s.address || "—"}</div>
                    </div>
                  ))
                )
              )}
              {tab === "points" && (
                pts.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 13.5, color: "var(--text-400)" }}>{data ? "Không có điểm nào." : ""}</div>
                ) : (
                  <table style={{ width: "100%", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ position: "sticky", top: 0, background: "var(--surface, #fff)" }}>
                        <th style={{ padding: "6px 8px", textAlign: "left" }}>Thời gian</th>
                        <th style={{ padding: "6px 8px" }}>Tốc độ (km/h)</th>
                        <th style={{ padding: "6px 8px" }}>Km</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pts.slice(0, MAX_ROWS).map((p, i) => (
                        <tr key={i} onClick={() => focusPoint(i)} style={{ cursor: "pointer", background: sel === i ? "#FFF6C2" : undefined }}>
                          <td style={{ padding: "5px 8px" }}>{fmtT(p.t)}</td>
                          <td className="num" style={{ padding: "5px 8px", textAlign: "center", color: speedColor(p.speed), fontWeight: 700 }}>{p.speed}</td>
                          <td className="num" style={{ padding: "5px 8px", textAlign: "center" }}>{p.km ?? "—"}</td>
                        </tr>
                      ))}
                      {pts.length > MAX_ROWS && (
                        <tr><td colSpan={3} style={{ padding: 8, textAlign: "center", color: "var(--text-400)" }}>Chỉ hiện {MAX_ROWS}/{pts.length} điểm đầu — vẫn vẽ đủ trên bản đồ.</td></tr>
                      )}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
