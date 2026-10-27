import { useEffect, useRef, useState } from "react";
import { getEhoStatus, ehoIngest, ehoCodIngest, ehoCodPendingPush, ehoCodPushResult } from "../lib/api";
import { launchEhoAgent } from "../lib/ehoAgentLaunch";

// Popup "Đồng bộ dữ liệu EHO" (chốt 26/10) — chỉ admin/super_admin. Làm việc với EHO Agent chạy trên chính PC của admin
// (xem ksnb-backend/tools/eho_agent): agent mở Chrome riêng để admin TỰ đăng nhập EHO, rồi lấy các phiếu "Kiểm kê All shop -
// Kho hàng thường - Hoàn tất"; web chuyển dữ liệu đó lên hệ thống. "Ngày duyệt" của phiếu = Ngày chốt kiểm kê của shop.
const AGENT = "http://127.0.0.1:8765";
const DAY_OPTIONS = [5, 15, 30];
const COD_MIN_AGENT = "2.4"; // bản agent có /cod/fetch (đồng bộ Đơn Hàng COD) + /cod/push (đẩy kết quả Có/Không vi phạm sang EHO)
const AGENT_ZIP = "/downloads/EHO-Agent-Setup-2.4.zip";
// Chạy thử đẩy kết quả (chỉ đọc EHO, không ghi): localStorage.codPushDryRun = "1"
const codPushDry = () => { try { return localStorage.getItem("codPushDryRun") === "1"; } catch (e) { return false; } };
const verLt = (a, b) => { const x = String(a || "0").split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0; } return false; };

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
  const [agentVer, setAgentVer] = useState("");
  const [login, setLogin] = useState({ driver: false, logged_in: false });
  const [days, setDays] = useState(5);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null); // {type: "ok"|"err", text}
  const [info, setInfo] = useState(null);
  const [launching, setLaunching] = useState(false);
  const alive = useRef(true);
  const triedLaunch = useRef(false);

  // Bấm "Khởi động EHO Agent" (hoặc tự thử 1 lần khi mở popup mà chưa thấy agent): web gọi ksnb-eho:// để bật agent, rồi chờ agent lên
  function startAgent() {
    launchEhoAgent();
    setLaunching(true);
    setTimeout(() => alive.current && setLaunching(false), 15000);
  }

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
          setAgentVer(String(p.version || ""));
          setLaunching(false);
          const s = await agentCall("/status", { timeoutMs: 8000 });
          if (alive.current) setLogin(s);
        } else setAgent("missing");
      } catch (e) {
        if (alive.current) {
          setAgent("missing");
          if (!triedLaunch.current) { triedLaunch.current = true; startAgent(); }
        }
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
      // Bước 2: Đơn Hàng COD -> Theo dõi chủ đề (cần agent 2.4 trở lên). Lỗi phần này KHÔNG làm hỏng kết quả kiểm kê ở trên.
      let codText = "";
      if (verLt(agentVer, COD_MIN_AGENT)) {
        codText = ` ⚠️ Chưa đồng bộ Đơn Hàng COD: EHO Agent trên máy này là bản ${agentVer || "cũ"}, cần bản ${COD_MIN_AGENT} trở lên (tải file cài bên dưới).`;
      } else {
        try {
          const cod = await agentCall("/cod/fetch", { method: "POST", body: { from_date: isoLocal(from, false), to_date: isoLocal(to, true) }, timeoutMs: 15 * 60 * 1000 });
          if (!cod || !cod.ok) throw new Error(cod && cod.error === "not_logged_in" ? "phiên đăng nhập EHO hết hạn" : `EHO trả lỗi (${(cod && cod.error) || "không rõ"})`);
          let cNhan = 0, cMoi = 0;
          const items = cod.items || [];
          for (let i = 0; i < items.length; i += 100) {
            const r = await ehoCodIngest(items.slice(i, i + 100));
            cNhan += r.nhan;
            cMoi += r.moi;
          }
          codText = ` Đơn Hàng COD: có ${cNhan.toLocaleString("vi-VN")} cảnh báo "Chưa tiếp nhận" trong ${days} ngày gần nhất, đã đăng ${cMoi.toLocaleString("vi-VN")} chủ đề mới vào Theo dõi chủ đề${cNhan - cMoi ? `, ${(cNhan - cMoi).toLocaleString("vi-VN")} cảnh báo đã có từ trước được giữ nguyên` : ""}${cod.failed ? ` (⚠️ ${cod.failed} cảnh báo không đọc được chi tiết, lần đồng bộ sau sẽ lấy lại)` : ""}.`;
        } catch (ce) {
          codText = ` ⚠️ Đồng bộ Đơn Hàng COD lỗi: ${ce.message || "không rõ"}.`;
        }
        // Bước 3: đẩy kết quả NV KSNB đã Hoàn tất trên web (Có/Không vi phạm) sang EHO. Lỗi phần này không ảnh hưởng 2 phần trên.
        try {
          const dry = codPushDry();
          const pend = (await ehoCodPendingPush()).items || [];
          if (pend.length) {
            const pr = await agentCall("/cod/push", { method: "POST", body: { items: pend, dry_run: dry }, timeoutMs: 15 * 60 * 1000 });
            if (!pr || !pr.ok) throw new Error(pr && pr.error === "not_logged_in" ? "phiên đăng nhập EHO hết hạn" : `EHO trả lỗi (${(pr && pr.error) || "không rõ"})`);
            const rs = pr.results || [];
            const okN = rs.filter((r) => r.ok).length;
            const skipN = rs.filter((r) => r.skipped).length;
            const errs = rs.filter((r) => !r.ok);
            if (!dry) await ehoCodPushResult(rs.map((r) => ({ job_id: r.job_id, ok: !!r.ok, sent: r.sent, error: r.error })));
            codText += dry
              ? ` 🧪 Chạy thử đẩy kết quả sang EHO (không ghi): ${rs.length} phiếu đủ điều kiện, ${okN} đọc được trên EHO.`
              : ` Đẩy kết quả sang EHO: ${okN - skipN} phiếu đã cập nhật "Đã xử lý"${skipN ? `, ${skipN} phiếu EHO đã xử lý từ trước (giữ nguyên)` : ""}${errs.length ? `, ⚠️ ${errs.length} phiếu lỗi (${errs[0].error || "không rõ"}) — lần đồng bộ sau sẽ thử lại` : ""}.`;
          } else codText += " Chưa có phiếu COD nào cần đẩy kết quả sang EHO.";
        } catch (pe) {
          codText += ` ⚠️ Đẩy kết quả sang EHO lỗi: ${pe.message || "không rõ"}.`;
        }
      }
      setMsg((m) => (m && m.type === "ok" ? { ...m, text: m.text + codText } : m));
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
          Gồm 3 phần: (1) lấy "Ngày duyệt" của phiếu Kiểm kê All shop - Kho hàng thường (đã Hoàn tất) làm <b>Ngày chốt kiểm kê</b> của từng shop; (2) lấy cảnh báo <b>Đơn Hàng COD</b> chưa tiếp nhận để tự đăng chủ đề vào Theo dõi chủ đề; (3) chủ đề COD mà NV KSNB đã <b>Hoàn tất</b> trên web được đẩy kết quả sang EHO (phiếu chuyển "Đã xử lý", ghi chú "&lt;Tên NV&gt; đã check có/không vi phạm").
        </p>

        {agent === "checking" && <div style={note}>Đang kiểm tra EHO Agent trên máy này...</div>}
        {agent === "missing" && (
          <div style={{ ...note, borderColor: launching ? "var(--border)" : "var(--danger)", color: launching ? "var(--text-600)" : "var(--danger)" }}>
            {launching ? (
              <><b>Đang khởi động EHO Agent...</b> Nếu trình duyệt hỏi "Mở EHO Agent?" hãy bấm <b>Mở</b> (tick "Luôn cho phép" để lần sau tự mở). Nếu trình duyệt hỏi quyền truy cập thiết bị trong mạng nội bộ (local network), chọn <b>Cho phép</b>.</>
            ) : (
              <><b>Chưa thấy EHO Agent trên máy này.</b> Bấm <b>Khởi động EHO Agent</b>. Máy chưa cài lần nào thì tải file cài về (chỉ cần cài 1 lần — sau đó agent tự chạy ngầm cùng Windows).</>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button className="fbtn" onClick={startAgent} disabled={launching} style={{ fontWeight: 700 }}>▶️ Khởi động EHO Agent</button>
              <a className="fbtn" href={AGENT_ZIP} download style={{ display: "inline-block", textDecoration: "none", color: "var(--navy-800)", fontWeight: 700 }}>⬇️ Tải file cài EHO Agent</a>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-600)" }}>Máy chưa cài: tải về, giải nén rồi bấm đúp <code>Cai-dat-EHO-Agent.bat</code>.</div>
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
                {busy === "sync" ? "Đang đồng bộ (khoảng 15-90 giây)..." : "Đồng bộ"}
              </button>
              {login.driver && <button className="fbtn" disabled={!!busy} onClick={handleCloseBrowser}>Đóng cửa sổ EHO</button>}
            </div>
          </>
        )}

        {agent === "ok" && verLt(agentVer, COD_MIN_AGENT) && (
          <div style={{ ...note, marginTop: 4, marginBottom: 12, borderColor: "var(--danger)", color: "var(--danger)", background: "#FFF6F5" }}>
            <b>⚠️ EHO Agent trên máy này là bản {agentVer || "cũ"} — cần bản {COD_MIN_AGENT} trở lên để đồng bộ Đơn Hàng COD.</b> Phần Kiểm kê vẫn đồng bộ được. Tải file cài, giải nén, bấm đúp <code>Cai-dat-EHO-Agent.bat</code> (cài đè, giữ nguyên đăng nhập EHO).
            <div style={{ marginTop: 8 }}>
              <a className="login-btn" href={AGENT_ZIP} download style={{ display: "inline-block", width: "auto", padding: "8px 18px", textDecoration: "none", textAlign: "center" }}>⬇️ Tải file cài EHO Agent 2.4</a>
            </div>
          </div>
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
