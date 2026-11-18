import { useEffect, useRef, useState } from "react";
import FilterHeaderTh from "../components/FilterHeaderTh";
import GpsRouteModal from "../components/GpsRouteModal";
import { useMultiColFilters } from "../lib/useMultiColFilters";
import { getGpsLatest, saveGpsConfig, deleteGpsConfig, syncGpsNow } from "../lib/api";

const thStyle = { textAlign: "center", padding: "8px 10px", fontSize: 12.5, whiteSpace: "nowrap" };
const tdStyle = { textAlign: "center", padding: "7px 10px", fontSize: 13 };

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Mã trạng thái GPS Thanh Nam trả về (chốt 18/11, đối chiếu số xe theo từng mã với các số đếm GPS trả sẵn): 3 chạy, 4 dừng, 5 mất tín hiệu, 9 dừng nổ máy
const STATE_LABELS = { "3": "Đang chạy", "4": "Đang dừng", "5": "Mất tín hiệu", "9": "Dừng nổ máy" };
const STATE_COLORS = { "Đang chạy": "#3E7A2A", "Đang dừng": "#1C64B4", "Dừng nổ máy": "#E8590C", "Mất tín hiệu": "#C0392B", "Hết hạn": "#C0392B" };

function stateLabel(r) {
  if (r.is_expired) return "Hết hạn";
  const s = r.state == null ? "" : String(r.state);
  if (STATE_LABELS[s]) return STATE_LABELS[s];
  if (r.speed > 0) return "Đang chạy";
  return s ? `Trạng thái ${s}` : "—";
}

function ignitionLabel(r) {
  return r.ignition == null ? "—" : String(r.ignition).toLowerCase() === "true" ? "Bật" : "Tắt";
}

// "44:8:35" (giờ:phút:giây, giờ có thể > 24) -> số giây để sắp xếp; hiển thị "44:08:35"
function durSeconds(v) {
  if (!v) return null;
  const p = String(v).split(":").map(Number);
  if (p.length !== 3 || p.some((x) => Number.isNaN(x))) return null;
  return p[0] * 3600 + p[1] * 60 + p[2];
}
function fmtDur(v) {
  if (!v) return "—";
  const p = String(v).split(":");
  return p.length === 3 ? `${p[0]}:${p[1].padStart(2, "0")}:${p[2].padStart(2, "0")}` : v;
}

const COUNT_TILES = [
  ["allVehicleCount", "Tổng thiết bị", "var(--text-900)"],
  ["runningVehicleCount", "Đang chạy", "#3E7A2A"],
  ["stoppingVehicleCount", "Đang dừng", "#1C64B4"],
  ["stopWithAccOnVehicleCount", "Dừng nổ máy", "#E8590C"],
  ["noSignalVehicleCount", "Mất tín hiệu", "var(--danger)"],
  ["expiredVehicleCount", "Hết hạn", "var(--danger)"],
];

export default function GpsMonitorTab() {
  const checked = true; // trang LAB HOUSE đã kiểm tra super_admin
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ username: "", password: "", enabled: true, interval_minutes: 10 });
  const formInit = useRef(false);
  const [showSettings, setShowSettings] = useState(false);
  const [routeDevice, setRouteDevice] = useState(null); // bấm tên xe -> popup lịch sử hành trình + bản đồ
  const mcf = useMultiColFilters();
  const [sort, setSort] = useState({ key: "state", dir: "asc" });
  const onSort = (key) => setSort((o) => (o.key === key ? { key, dir: o.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  function load() {
    return getGpsLatest()
      .then((res) => {
        setData(res);
        setError("");
        if (!formInit.current) {
          formInit.current = true;
          setForm((f) => ({ ...f, username: res.config.username || "", enabled: res.config.enabled, interval_minutes: res.config.interval_minutes || 10 }));
        }
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    if (!checked) return;
    load();
    const t = setInterval(load, 60000); // làm mới bảng mỗi phút (backend quét theo chu kỳ riêng)
    return () => clearInterval(t);
  }, [checked]);

  async function handleSave() {
    setBusy("save");
    setMsg("");
    setError("");
    try {
      await saveGpsConfig({ username: form.username, password: form.password || null, enabled: form.enabled, interval_minutes: Number(form.interval_minutes) });
      setForm((f) => ({ ...f, password: "" }));
      setMsg("Đã lưu tài khoản GPS (mật khẩu được mã hoá, không hiển thị lại). Bấm \"Quét ngay\" để thử.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function handleSync() {
    setBusy("sync");
    setMsg("");
    setError("");
    try {
      const r = await syncGpsNow();
      setMsg(`Quét thành công: ${r.count} thiết bị.`);
    } catch (e) {
      setError(e.message);
    } finally {
      await load();
      setBusy("");
    }
  }

  async function handleDelete() {
    if (!window.confirm("Xoá tài khoản GPS đã lưu và dừng quét tự động? (Dữ liệu đã quét vẫn được giữ.)")) return;
    setBusy("del");
    setMsg("");
    setError("");
    try {
      await deleteGpsConfig();
      setForm({ username: "", password: "", enabled: false, interval_minutes: 10 });
      setMsg("Đã xoá tài khoản GPS.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  if (!checked) return null;
  const cfg = data?.config;
  const items = data?.items || [];
  const counts = cfg?.counts || {};

  // Cột lọc (tick nhiều giá trị, giống các bảng khác) + sắp xếp theo cột. get = chữ đang hiển thị; sortVal = giá trị so sánh
  const colDefs = [
    { key: "name", get: (r) => r.driver_name || r.plate_number || "(không tên)", sortVal: (r) => r.driver_name || r.plate_number || "", menu: 280 },
    { key: "state", get: (r) => stateLabel(r), sortVal: (r) => stateLabel(r) },
    { key: "ignition", get: (r) => ignitionLabel(r), sortVal: (r) => ignitionLabel(r) },
    { key: "speed", get: (r) => (r.speed == null ? "—" : `${r.speed} km/h`), rank: (r) => r.speed ?? -1, sortVal: (r) => r.speed, desc: true },
    { key: "km", get: (r) => (r.total_distance_day == null ? "—" : String(r.total_distance_day)), rank: (r) => r.total_distance_day ?? -1, sortVal: (r) => r.total_distance_day, desc: true },
    { key: "stop", get: (r) => fmtDur(r.total_stop_duration), rank: (r) => durSeconds(r.total_stop_duration) ?? -1, sortVal: (r) => durSeconds(r.total_stop_duration), desc: true, menu: 200 },
    { key: "address", get: (r) => r.address || "—", sortVal: (r) => r.address || "", menu: 420 },
    { key: "gps_time", get: (r) => fmtDateTime(r.gps_time), rank: (r) => r.gps_time || "", sortVal: (r) => r.gps_time || "", desc: true, menu: 220 },
  ];
  const fb = (key) => mcf.button(colDefs, items, key);
  const sortCol = colDefs.find((c) => c.key === sort.key);
  const shown = mcf.filterRows(colDefs, items).slice().sort((a, b) => {
    const av = sortCol.sortVal(a);
    const bv = sortCol.sortVal(b);
    const blank = (v) => v == null || v === "";
    if (blank(av) || blank(bv)) return blank(av) && blank(bv) ? 0 : blank(av) ? 1 : -1; // ô trống luôn xếp cuối
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "vi");
    if (cmp !== 0) return sort.dir === "asc" ? cmp : -cmp;
    return String(a.driver_name || a.plate_number || "").localeCompare(String(b.driver_name || b.plate_number || ""), "vi"); // cùng giá trị: xếp theo tên để thứ tự ổn định
  });
  const th = (key, label, align) => (
    <FilterHeaderTh label={label} align={align} filter={fb(key)} onClick={() => onSort(key)} sortActive={sort.key === key} sortDir={sort.dir} />
  );

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Giám sát GPS</h2>
          <button
            onClick={() => { setMsg(""); setError(""); setShowSettings(true); }}
            style={{ background: "#E3F0FF", color: "#1C64B4", border: "1px solid #BBD7F5", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            ⚙️ Cài đặt
          </button>
        </div>
      </div>

      {cfg && (
        <div style={{ fontSize: 13, color: "var(--text-600)", marginBottom: 14 }}>
          {!cfg.configured ? (
            <span>Chưa có tài khoản GPS — bấm <b>Cài đặt</b> để nhập.</span>
          ) : (
            <>
              Quét gần nhất: <b>{fmtDateTime(cfg.last_run_at)}</b>{" "}
              {cfg.last_status === "ok" && <span style={{ color: "#3E7A2A", fontWeight: 700 }}>✓ thành công ({cfg.last_count} thiết bị)</span>}
              {cfg.last_status === "error" && <span style={{ color: "var(--danger)", fontWeight: 700 }}>✗ lỗi: {cfg.last_error}</span>}
              {!cfg.last_status && <span>(chưa quét lần nào)</span>}
              {" · "}Quét tự động: <b>{cfg.enabled ? `bật, mỗi ${cfg.interval_minutes} phút` : "tắt"}</b>
            </>
          )}
        </div>
      )}

      {routeDevice && <GpsRouteModal device={routeDevice} onClose={() => setRouteDevice(null)} />}

      {showSettings && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setShowSettings(false)}
        >
          <div
            style={{ background: "var(--surface, #fff)", borderRadius: 12, width: "100%", maxWidth: 640, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-900)" }}>Cài đặt tài khoản GPS & quét tự động</div>
                <div style={{ fontSize: 12.5, color: "var(--text-400)" }}>Chỉ super_admin thấy</div>
              </div>
              <button className="fbtn" onClick={() => setShowSettings(false)}>Đóng</button>
            </div>
            <div style={{ padding: "16px 18px", overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Tên đăng nhập GPS</div>
              <input className="finput" value={form.username} autoComplete="off" onChange={(e) => setForm({ ...form, username: e.target.value })} style={{ width: 200 }} />
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Mật khẩu</div>
              <input
                className="finput" type="password" autoComplete="new-password" value={form.password}
                placeholder={cfg?.configured ? "•••••• (đã lưu — để trống nếu không đổi)" : "Nhập mật khẩu"}
                onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ width: 260 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Quét mỗi (phút)</div>
              <input className="finput" type="number" min={5} max={120} value={form.interval_minutes} onChange={(e) => setForm({ ...form, interval_minutes: e.target.value })} style={{ width: 90 }} />
            </div>
            <label style={{ fontSize: 13.5, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", paddingBottom: 10 }}>
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              Bật quét tự động
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button className="fbtn" disabled={!!busy || !form.username.trim() || (!cfg?.configured && !form.password)} onClick={handleSave}>
              {busy === "save" ? "Đang lưu..." : "💾 Lưu"}
            </button>
            <button className="fbtn" disabled={!!busy || !cfg?.configured} onClick={handleSync}>
              {busy === "sync" ? "Đang quét..." : "🔄 Quét ngay"}
            </button>
            <button className="fbtn danger" disabled={!!busy || !cfg?.configured} onClick={handleDelete}>Xoá tài khoản đã lưu</button>
          </div>

          {msg && <div style={{ marginTop: 10, fontSize: 13.5, color: "#3E7A2A" }}>{msg}</div>}
          {error && <div style={{ marginTop: 10, fontSize: 13.5, color: "var(--danger)" }}>{error}</div>}

          {cfg && (
            <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-600)", lineHeight: 1.7 }}>
              {!cfg.configured && <div>Chưa có tài khoản GPS — nhập ở trên rồi bấm Lưu.</div>}
              {cfg.configured && (
                <>
                  <div>Quét tự động: <b>{cfg.enabled ? `bật, mỗi ${cfg.interval_minutes} phút` : "tắt"}</b></div>
                  <div>
                    Lần quét gần nhất: <b>{fmtDateTime(cfg.last_run_at)}</b>{" "}
                    {cfg.last_status === "ok" && <span style={{ color: "#3E7A2A", fontWeight: 700 }}>✓ thành công ({cfg.last_count} thiết bị)</span>}
                    {cfg.last_status === "error" && <span style={{ color: "var(--danger)", fontWeight: 700 }}>✗ lỗi: {cfg.last_error}</span>}
                    {!cfg.last_status && <span>(chưa quét lần nào)</span>}
                  </div>
                  {cfg.last_status === "error" && cfg.last_success_at && <div>Lần thành công gần nhất: {fmtDateTime(cfg.last_success_at)}</div>}
                </>
              )}
              <div style={{ fontSize: 12, color: "var(--text-400)" }}>
                Mật khẩu lưu mã hoá trong cơ sở dữ liệu của hệ thống, không hiển thị lại. Dữ liệu quét giữ 90 ngày.
              </div>
            </div>
          )}
            </div>
          </div>
        </div>
      )}

      {Object.keys(counts).length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          {COUNT_TILES.filter(([k]) => counts[k] !== undefined).map(([k, label, color]) => (
            <div key={k} className="card" style={{ margin: 0, padding: "10px 16px", minWidth: 120 }}>
              <div style={{ fontSize: 12.5, color: "var(--text-600)" }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color }}>{counts[k]}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3>Thiết bị ({mcf.active ? `${shown.length}/${items.length}` : items.length})</h3>
          <span className="note">
            Dữ liệu mới nhất, tự làm mới mỗi phút
            {mcf.active && <button className="fbtn" style={{ marginLeft: 8 }} onClick={mcf.clear}>✕ Bỏ lọc cột</button>}
          </span>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
          {items.length === 0 ? (
            <div className="placeholder-box">Chưa có dữ liệu — nhập tài khoản GPS rồi bấm "Quét ngay".</div>
          ) : (
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  {th("name", "Tên / biển số", "left")}
                  {th("state", "Trạng thái")}
                  {th("ignition", "Nổ máy")}
                  {th("speed", "Tốc độ")}
                  {th("km", "Km hôm nay")}
                  {th("stop", "Thời gian dừng")}
                  {th("address", "Địa chỉ", "left")}
                  {th("gps_time", "Giờ GPS")}
                  <th style={thStyle}>Bản đồ</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr><td colSpan={9} style={{ ...tdStyle, color: "var(--text-400)", padding: 20 }}>Không có thiết bị nào khớp bộ lọc.</td></tr>
                )}
                {shown.map((r) => {
                  const st = stateLabel(r);
                  return (
                    <tr key={r.imei} style={r.is_expired ? { background: "#FDEAEA" } : undefined}>
                      <td style={{ ...tdStyle, textAlign: "left" }}>
                        <div
                          onClick={() => setRouteDevice({ imei: r.imei, name: r.driver_name || r.plate_number || "(không tên)" })}
                          title="Bấm để xem lịch sử hành trình trên bản đồ"
                          style={{ fontWeight: 700, color: "#1C64B4", cursor: "pointer" }}
                        >
                          {r.driver_name || r.plate_number || "(không tên)"}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--text-400)" }}>{r.imei}{r.group_name ? ` · ${r.group_name}` : ""}</div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ background: STATE_COLORS[st] || "#6B7280", color: "#fff", fontWeight: 700, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap", fontSize: 12.5 }}>{st}</span>
                      </td>
                      <td style={tdStyle}>{ignitionLabel(r)}</td>
                      <td className="num" style={tdStyle}>{r.speed == null ? "—" : `${r.speed} km/h`}</td>
                      <td className="num" style={tdStyle}>{r.total_distance_day ?? "—"}</td>
                      <td className="num" style={tdStyle}>{fmtDur(r.total_stop_duration)}</td>
                      <td style={{ ...tdStyle, textAlign: "left", maxWidth: 320 }}>{r.address || "—"}</td>
                      <td className="num" style={tdStyle}>{fmtDateTime(r.gps_time)}</td>
                      <td style={tdStyle}>
                        {r.lat != null && r.lng != null ? (
                          <a href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noreferrer">Xem</a>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
