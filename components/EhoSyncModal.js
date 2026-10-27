import { useEffect, useRef, useState } from "react";
import { getEhoStatus, ehoIngest } from "../lib/api";

// Popup "Đồng bộ dữ liệu EHO" (chốt 26/10) — chỉ admin/super_admin. Làm việc với EHO Agent chạy trên chính PC của admin
// (xem ksnb-backend/tools/eho_agent): agent mở Chrome riêng để admin TỰ đăng nhập EHO, rồi lấy các phiếu "Kiểm kê All shop -
// Kho hàng thường - Hoàn tất"; web chuyển dữ liệu đó lên hệ thống. "Ngày duyệt" của phiếu = Ngày chốt kiểm kê của shop.
const AGENT = "http://127.0.0.1:8765";
const DAY_OPTIONS = [5, 15, 30];

async function agentCall(path, { method = "GET", body, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(AGENT + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function pad(n) { return String(n).padStart(2, "0"); }
function isoLocal(d, endOfDay) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${endOfDay ? "23:59:59" : "00:00:00"}`;
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function EhoSyncModal({ onClose }) {
  const [agent, setAgent] = useState("checking"); // checking | ok | missing
  const [login, setLogin] = useState({ driver: false, logged_in: false });
  const [days, setDays] = useState(5);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null); // {type: "ok"|"err", text}
  const [info, setInfo] = useState(null);
  const alive = useRef(true);

  function loadInfo() {
    getEhoStatus().then((r) => alive.current && setInfo(r)).catch(() => {});
  }

  useEffect(() => {
    alive.current = true;
    loadInfo();
    let timer;
    async function tick() {
      try {
        const p = await agentCall("/ping", { timeoutMs: 4000 });
        if (!alive.current) return;
        if (p && p.ok) {
          setAgent("ok");
          const s = await agentCall("/status", { timeoutMs: 8000 });
          if (alive.current) setLogin(s);
        } else setAgent("missing");
      } catch (e) {
        if (alive.current) setAgent("missing");
      }
      if (alive.current) timer = setTimeout(tick, 3000);
    }
    tick();
    return () => { alive.current = false; clearTimeout(timer); };
  }, []);

  async function handleOpen() {
    setBusy("open");
    setMsg(null);
    try {
      await agentCall("/open", { method: "POST", timeoutMs: 90000 });
      setMsg({ type: "ok", text: "Đã mở cửa sổ EHO. Hãy đăng nhập trong cửa sổ đó (tài khoản, mật khẩu, mã OTP). Xong quay lại đây, trạng thái sẽ tự chuyển sang \"Đã đăng nhập\"." });
    } catch (e) {
      setMsg({ type: "err", text: "Không mở được cửa sổ EHO: " + (e.message || "lỗi không rõ") });
    } finally {
      setBusy("");
    }
  }

  async function handleSync() {
    setBusy("sync");
    setMsg(null);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - days * 86400000);
      const res = await agentCall("/sync", { method: "POST", body: { from_date: isoLocal(from, false), to_date: isoLocal(to, true) }, timeoutMs: 15 * 60 * 1000 });
      if (!res || !res.ok) {
        const e = res && res.error;
        throw new Error(e === "not_logged_in" ? "Phiên đăng nhập EHO đã hết hạn — bấm \"Mở EHO & đăng nhập\" để đăng nhập lại."
          : e === "no_browser" ? "Chưa mở cửa sổ EHO — bấm \"Mở EHO & đăng nhập\" trước."
            : `EHO trả lỗi (${e || "không rõ"})`);
      }
      const rows = res.rows || [];
      let nhan = 0, moi = 0, shops = new Set();
      for (let i = 0; i < rows.length; i += 4000) {
        const r = await ehoIngest(rows.slice(i, i + 4000));
        nhan += r.nhan;
        moi += r.moi || 0;
      }
      rows.forEach((x) => shops.add(x.shopCode));
      setMsg({ type: "ok", text: `✅ Đồng bộ xong: lấy ${res.fetched?.toLocaleString("vi-VN")} phiếu Hoàn tất của ${days} ngày gần nhất, có ${nhan.toLocaleString("vi-VN")} phiếu "Kho hàng thường" của ${shops.size.toLocaleString("vi-VN")} shop: thêm mới ${moi.toLocaleString("vi-VN")} phiếu, ${(nhan - moi).toLocaleString("vi-VN")} phiếu đã có từ trước được giữ nguyên (không ghi đè). Ngày chốt kiểm kê ở Theo dõi kiểm kê đã dùng dữ liệu mới.` });
      loadInfo();
    } catch (e) {
      setMsg({ type: "err", text: e.name === "AbortError" ? "Quá thời gian chờ đồng bộ." : (e.message || "Đồng bộ thất bại") });
    } finally {
      setBusy("");
    }
  }

  async function handleCloseBrowser() {
    try { await agentCall("/close", { method: "POST" }); } catch (e) { /* bỏ qua */ }
    setLogin({ driver: false, logged_in: false });
    setMsg({ type: "ok", text: "Đã đóng cửa sổ EHO." });
  }

  const step = (n, ok) => (
    <span style={{ display: "inline-block", width: 22, height: 22, borderRadius: "50%", textAlign: "center", lineHeight: "22px", fontSize: 12, fontWeight: 700, marginRight: 8, background: ok ? "#4C9A2A" : "var(--navy-800)", color: "#fff" }}>{ok ? "✓" : n}</span>
  );

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: "var(--navy-900)", marginBottom: 4 }}>🔄 Đồng bộ dữ liệu EHO</h3>
        <p style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 14, lineHeight: 1.6 }}>
          Lấy "Ngày duyệt" của phiếu Kiểm kê All shop - Kho hàng thường (đã Hoàn tất) làm <b>Ngày chốt kiểm kê</b> của từng shop.
        </p>

        {agent === "checking" && <div style={note}>Đang kiểm tra EHO Agent trên máy này...</div>}
        {agent === "missing" && (
          <div style={{ ...note, borderColor: "var(--danger)", color: "var(--danger)" }}>
            <b>Chưa thấy EHO Agent trên máy này.</b> Mở file <code>Chay-EHO-Agent.bat</code> (thư mục <code>C:\Tool EHO</code>), giữ cửa sổ đen đó mở,
            rồi quay lại đây — popup tự nhận. Nếu trình duyệt hỏi quyền truy cập thiết bị trong mạng nội bộ (local network), chọn <b>Cho phép</b>.
            <div>
              <a className="fbtn" href="/downloads/EHO-Agent-Setup.zip" download style={{ display: "inline-block", marginTop: 8, textDecoration: "none", color: "var(--navy-800)", fontWeight: 700 }}>⬇️ Tải file cài EHO Agent</a>
              <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-600)" }}>Máy chưa cài: tải về, giải nén rồi bấm đúp <code>Cai-dat-EHO-Agent.bat</code>.</span>
            </div>
          </div>
        )}

        {agent === "ok" && (
          <>
            <div style={row}>
              {step(1, login.logged_in)}
              <button className="fbtn" disabled={!!busy} onClick={handleOpen}>{busy === "open" ? "Đang mở..." : login.driver ? "Mở lại cửa sổ EHO" : "Mở EHO & đăng nhập"}</button>
              <span style={{ fontSize: 12.5, color: login.logged_in ? "#4C9A2A" : "var(--text-600)", fontWeight: login.logged_in ? 700 : 400 }}>
                {login.logged_in ? "✅ Đã đăng nhập EHO" : login.driver ? "Chờ anh/chị đăng nhập trong cửa sổ EHO..." : "Chưa mở EHO"}
              </span>
            </div>
            <div style={row}>
              {step(2, false)}
              <select className="finput" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 150 }} disabled={!!busy}>
                {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d} ngày gần nhất{d === 5 ? " (mặc định)" : ""}</option>)}
              </select>
              <button className="login-btn" style={{ width: "auto", padding: "8px 22px", opacity: login.logged_in && !busy ? 1 : 0.5 }} disabled={!login.logged_in || !!busy} onClick={handleSync}>
                {busy === "sync" ? "Đang đồng bộ (khoảng 15-60 giây)..." : "Đồng bộ"}
              </button>
              {login.driver && <button className="fbtn" disabled={!!busy} onClick={handleCloseBrowser}>Đóng cửa sổ EHO</button>}
            </div>
          </>
        )}

        {msg && <div style={{ ...note, marginTop: 12, borderColor: msg.type === "ok" ? "#4C9A2A" : "var(--danger)", color: msg.type === "ok" ? "#2f6b1a" : "var(--danger)" }}>{msg.text}</div>}

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-600)", lineHeight: 1.7 }}>
          {info && info.so_phieu > 0 ? (
            <>Dữ liệu đã đồng bộ: <b>{info.so_phieu.toLocaleString("vi-VN")}</b> phiếu của <b>{info.so_shop.toLocaleString("vi-VN")}</b> shop · Ngày duyệt mới nhất: <b>{fmtDateTime(info.ngay_duyet_moi_nhat)}</b> · Đồng bộ lần cuối: <b>{fmtDateTime(info.dong_bo_lan_cuoi)}</b></>
          ) : <>Chưa có dữ liệu EHO nào được đồng bộ.</>}
        </div>

        <div style={{ marginTop: 14, textAlign: "right" }}>
          <button className="fbtn" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const box = { background: "#fff", borderRadius: 12, padding: "22px 24px", width: "min(640px, 100%)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" };
const row = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 };
const note = { border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 13, lineHeight: 1.6 };
