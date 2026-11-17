import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { getUser, getGpsLatest, saveGpsConfig, deleteGpsConfig, syncGpsNow } from "../lib/api";

const thStyle = { textAlign: "center", padding: "8px 10px", fontSize: 11.5, whiteSpace: "nowrap" };
const tdStyle = { textAlign: "center", padding: "7px 10px", fontSize: 12 };

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const COUNT_TILES = [
  ["allVehicleCount", "Tổng thiết bị", "var(--text-900)"],
  ["runningVehicleCount", "Đang chạy", "#3E7A2A"],
  ["stoppingVehicleCount", "Đang dừng", "#1C64B4"],
  ["stopWithAccOnVehicleCount", "Dừng nổ máy", "#E8590C"],
  ["noSignalVehicleCount", "Mất tín hiệu", "var(--danger)"],
  ["expiredVehicleCount", "Hết hạn", "var(--danger)"],
];

export default function GiamSatGpsPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ username: "", password: "", enabled: true, interval_minutes: 10 });
  const formInit = useRef(false);

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "super_admin") {
      router.replace("/");
      return;
    }
    setChecked(true);
  }, []);

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

  return (
    <Layout crumb="Giám sát GPS">
      <div className="page-head">
        <h1>Giám sát GPS</h1>
        <p>Hệ thống tự đăng nhập gpsthanhnam.com và quét vị trí / trạng thái xe theo chu kỳ, lưu lại để xem lịch sử.</p>
      </div>

      <div className="card">
        <div className="card-head"><h3>Tài khoản GPS & quét tự động</h3><span className="note">Chỉ super_admin thấy</span></div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>Tên đăng nhập GPS</div>
              <input className="finput" value={form.username} autoComplete="off" onChange={(e) => setForm({ ...form, username: e.target.value })} style={{ width: 200 }} />
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>Mật khẩu</div>
              <input
                className="finput" type="password" autoComplete="new-password" value={form.password}
                placeholder={cfg?.configured ? "•••••• (đã lưu — để trống nếu không đổi)" : "Nhập mật khẩu"}
                onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ width: 260 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>Quét mỗi (phút)</div>
              <input className="finput" type="number" min={5} max={120} value={form.interval_minutes} onChange={(e) => setForm({ ...form, interval_minutes: e.target.value })} style={{ width: 90 }} />
            </div>
            <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", paddingBottom: 10 }}>
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

          {msg && <div style={{ marginTop: 10, fontSize: 12.5, color: "#3E7A2A" }}>{msg}</div>}
          {error && <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--danger)" }}>{error}</div>}

          {cfg && (
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-600)", lineHeight: 1.7 }}>
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
              <div style={{ fontSize: 11, color: "var(--text-400)" }}>
                Mật khẩu lưu mã hoá trong cơ sở dữ liệu của hệ thống, không hiển thị lại. Dữ liệu quét giữ 90 ngày.
              </div>
            </div>
          )}
        </div>
      </div>

      {Object.keys(counts).length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          {COUNT_TILES.filter(([k]) => counts[k] !== undefined).map(([k, label, color]) => (
            <div key={k} className="card" style={{ margin: 0, padding: "10px 16px", minWidth: 120 }}>
              <div style={{ fontSize: 11.5, color: "var(--text-600)" }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{counts[k]}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-head"><h3>Thiết bị ({items.length})</h3><span className="note">Dữ liệu mới nhất, tự làm mới mỗi phút</span></div>
        <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
          {items.length === 0 ? (
            <div className="placeholder-box">Chưa có dữ liệu — nhập tài khoản GPS rồi bấm "Quét ngay".</div>
          ) : (
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left" }}>Tên / biển số</th>
                  <th style={thStyle}>Trạng thái</th>
                  <th style={thStyle}>Tốc độ</th>
                  <th style={thStyle}>Km hôm nay</th>
                  <th style={thStyle}>Dừng hôm nay</th>
                  <th style={{ ...thStyle, textAlign: "left" }}>Địa chỉ</th>
                  <th style={thStyle}>Giờ GPS</th>
                  <th style={thStyle}>Bản đồ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.imei} style={r.is_expired ? { background: "#FDEAEA" } : undefined}>
                    <td style={{ ...tdStyle, textAlign: "left" }}>
                      <div style={{ fontWeight: 700, color: "var(--text-900)" }}>{r.driver_name || r.plate_number || "(không tên)"}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-400)" }}>{r.imei}{r.group_name ? ` · ${r.group_name}` : ""}</div>
                    </td>
                    <td style={tdStyle}>{r.state || "—"}{r.ignition ? ` / ${r.ignition}` : ""}</td>
                    <td className="num" style={tdStyle}>{r.speed ?? "—"}</td>
                    <td className="num" style={tdStyle}>{r.total_distance_day ?? "—"}</td>
                    <td className="num" style={tdStyle}>{r.total_stop_duration || "—"}{r.total_stop_times ? ` (${r.total_stop_times} lần)` : ""}</td>
                    <td style={{ ...tdStyle, textAlign: "left", maxWidth: 320 }}>{r.address || "—"}</td>
                    <td className="num" style={tdStyle}>{fmtDateTime(r.gps_time)}</td>
                    <td style={tdStyle}>
                      {r.lat != null && r.lng != null ? (
                        <a href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noreferrer">Xem</a>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}
