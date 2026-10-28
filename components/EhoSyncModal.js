import { useEffect, useRef, useState } from "react";
import { getEhoStatus, ehoIngest, ehoCodIngest, ehoCodPendingPush, ehoCodPushResult, xknkEhoIngest, xknkEhoFinalize, xknkEhoSourceTypes } from "../lib/api";
import { launchEhoAgent } from "../lib/ehoAgentLaunch";

// Popup "Đồng bộ dữ liệu EHO" (chốt 26/10; gộp cả "Xuất Khác - Nhập Khác EHO" 27/10) — chỉ admin/super_admin. Làm việc với EHO Agent chạy
// trên chính PC của admin (xem ksnb-backend/tools/eho_agent): agent mở Chrome riêng để admin TỰ đăng nhập EHO. 1 lần bấm "Đồng bộ" chạy lần lượt:
//   (1) phiếu Kiểm kê All shop - Kho hàng thường - Hoàn tất -> "Ngày duyệt" = Ngày chốt kiểm kê của shop;
//   (2) cảnh báo Đơn Hàng COD chưa tiếp nhận -> tự đăng chủ đề vào Theo dõi chủ đề;
//   (3) đẩy kết quả Có/Không vi phạm (NV KSNB đã Hoàn tất trên web) của chủ đề COD sang EHO;
//   (4) giao dịch Xuất khác / Nhập khác theo Loại yêu cầu đã tick -> menu "Xuất Khác - Nhập Khác EHO".
// Khoảng ngày (Từ ngày / Đến ngày) dùng chung cho (1), (2), (4).
const AGENT = "http://127.0.0.1:8765";
const COD_MIN_AGENT = "2.4"; // bản agent có /cod/fetch (đồng bộ Đơn Hàng COD) + /cod/push (đẩy kết quả Có/Không vi phạm sang EHO)
const AGENT_ZIP = "/downloads/EHO-Agent-Setup-2.4.zip";
// Chạy thử đẩy kết quả (chỉ đọc EHO, không ghi): localStorage.codPushDryRun = "1"
const codPushDry = () => { try { return localStorage.getItem("codPushDryRun") === "1"; } catch (e) { return false; } };
const verLt = (a, b) => { const x = String(a || "0").split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0; } return false; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Loại yêu cầu EHO (mã -> tên). Tên chưa biết sẽ tự cập nhật theo dữ liệu đã kéo (/source-types).
const SOURCE_BASE = {
  3: "Xuất thanh lý", 4: "Xử lý kiểm kê tự động", 6: "Xuất khác từ kho hành chính", 7: "Xuất sử dụng", 9: "Xử lý kiểm kê allshop",
  10: "Điều chỉnh quy cách ngành hàng", 11: "Xử lý được confirm từ marketing", 12: "Xử lý bồi thường Nhà vận chuyển", 13: "Xử lý không truy thu",
  14: "Xử lý khác", 15: "Kiểm kê cận date", 16: "Hủy đa liều", 17: "Xuất khác dung môi", 18: "Điều chỉnh chênh lệch từ trả hàng NCC",
  21: "Xuất hàng tặng", 22: "Hàng khuyến mãi Vacxin",
};
// Loại yêu cầu KHÔNG tự tick khi mở popup (chốt 27/10): Kiểm kê cận date — muốn kéo thì tự tick thêm.
const DEFAULT_OFF = new Set([15]);
const defaultSel = (ids) => new Set(ids.filter((id) => !DEFAULT_OFF.has(id)));

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

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}` };
}
const currentYm = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
// Mặc định (chốt 27/10): Từ ngày = hôm nay - 5 ngày, Đến ngày = cuối tháng hiện tại
function defaultRange() {
  const now = new Date();
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5)), to: monthRange(currentYm()).to };
}
const fmtMs = (sec) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
const vn = (n) => Number(n || 0).toLocaleString("vi-VN");
const LOGIN_EXPIRED = "Phiên đăng nhập EHO đã hết hạn — bấm \"Mở EHO & đăng nhập\" để đăng nhập lại.";

export default function EhoSyncModal({ onClose }) {
  const [agent, setAgent] = useState("checking"); // checking | ok | missing
  const [agentVer, setAgentVer] = useState("");
  const [login, setLogin] = useState({ driver: false, logged_in: false });
  const [ym, setYm] = useState(currentYm());
  const [from, setFrom] = useState(defaultRange().from);
  const [to, setTo] = useState(defaultRange().to);
  const [srcNames, setSrcNames] = useState(SOURCE_BASE);
  const [srcSel, setSrcSel] = useState(() => defaultSel(Object.keys(SOURCE_BASE).map(Number)));
  const [srcOpen, setSrcOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [stage, setStage] = useState("");
  const [prog, setProg] = useState(null);
  const [report, setReport] = useState([]); // [{type: "ok"|"warn"|"err", text}]
  const [info, setInfo] = useState(null);
  const [launching, setLaunching] = useState(false);
  const alive = useRef(true);
  const triedLaunch = useRef(false);
  const cancelRef = useRef(false);

  const srcIds = Object.keys(srcNames).map(Number).sort((a, b) => a - b);
  const srcLabel = (id) => srcNames[id] || `Loại yêu cầu ${id}`;
  const nSel = srcIds.filter((id) => srcSel.has(id)).length;
  const srcText = nSel === srcIds.length ? "Tất cả loại yêu cầu" : nSel === 0 ? "Chưa chọn loại yêu cầu" : nSel === 1 ? srcLabel(srcIds.find((id) => srcSel.has(id))) : `Đã chọn ${nSel}/${srcIds.length} loại yêu cầu`;
  const toggleSrc = (id) => setSrcSel((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  function pickMonth(v) {
    setYm(v);
    if (v) { const r = monthRange(v); setFrom(r.from); setTo(r.to); }
  }

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
    xknkEhoSourceTypes()
      .then((r) => {
        if (!alive.current) return;
        const names = { ...SOURCE_BASE };
        (r.loai_yeu_cau || []).forEach((x) => { if (x.ten) names[x.ma] = x.ten; else if (!(x.ma in names)) names[x.ma] = ""; });
        setSrcNames(names);
        setSrcSel(defaultSel(Object.keys(names).map(Number)));
      })
      .catch(() => {});
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
    setReport([]);
    try {
      await agentCall("/open", { method: "POST", timeoutMs: 90000 });
      setReport([{ type: "ok", text: "Đã mở cửa sổ EHO. Hãy đăng nhập trong cửa sổ đó (tài khoản, mật khẩu, mã OTP). Xong quay lại đây, trạng thái sẽ tự chuyển sang \"Đã đăng nhập\"." }]);
    } catch (e) {
      setReport([{ type: "err", text: "Không mở được cửa sổ EHO: " + (e.message || "lỗi không rõ") }]);
    } finally {
      setBusy("");
    }
  }

  // ---- Từng phần của 1 lần đồng bộ; mỗi phần trả về {type, text}, ném lỗi "login" khi phiên EHO hết hạn ----
  async function stepKiemKe(fromIso, toIso) {
    const res = await agentCall("/sync", { method: "POST", body: { from_date: fromIso, to_date: toIso }, timeoutMs: 15 * 60 * 1000 });
    if (!res || !res.ok) {
      const e = res && res.error;
      if (e === "not_logged_in" || e === "no_browser") throw new Error("login");
      throw new Error(`EHO trả lỗi (${e || "không rõ"})`);
    }
    const rows = res.rows || [];
    let nhan = 0, moi = 0;
    const shops = new Set();
    for (let i = 0; i < rows.length || i === 0; i += 4000) { // luôn gọi ít nhất 1 lần (kể cả 0 phiếu) để ghi nhận thời điểm + người đồng bộ
      const r = await ehoIngest(rows.slice(i, i + 4000));
      nhan += r.nhan;
      moi += r.moi || 0;
    }
    rows.forEach((x) => shops.add(x.shopCode));
    loadInfo();
    return { type: "ok", text: `Kiểm kê: lấy ${vn(res.fetched)} phiếu Hoàn tất, có ${vn(nhan)} phiếu "Kho hàng thường" của ${vn(shops.size)} shop: thêm mới ${vn(moi)} phiếu, ${vn(nhan - moi)} phiếu đã có từ trước được giữ nguyên (không ghi đè).` };
  }

  async function stepCod(fromIso, toIso) {
    if (verLt(agentVer, COD_MIN_AGENT)) {
      return { type: "warn", text: `Chưa đồng bộ Đơn Hàng COD: EHO Agent trên máy này là bản ${agentVer || "cũ"}, cần bản ${COD_MIN_AGENT} trở lên (tải file cài bên dưới).` };
    }
    const cod = await agentCall("/cod/fetch", { method: "POST", body: { from_date: fromIso, to_date: toIso }, timeoutMs: 15 * 60 * 1000 });
    if (!cod || !cod.ok) {
      if (cod && cod.error === "not_logged_in") throw new Error("login");
      throw new Error(`EHO trả lỗi (${(cod && cod.error) || "không rõ"})`);
    }
    let cNhan = 0, cMoi = 0;
    const items = cod.items || [];
    for (let i = 0; i < items.length; i += 100) {
      const r = await ehoCodIngest(items.slice(i, i + 100));
      cNhan += r.nhan;
      cMoi += r.moi;
    }
    return { type: cod.failed ? "warn" : "ok", text: `Đơn Hàng COD: có ${vn(cNhan)} cảnh báo "Chưa tiếp nhận", đã đăng ${vn(cMoi)} chủ đề mới vào Theo dõi chủ đề${cNhan - cMoi ? `, ${vn(cNhan - cMoi)} cảnh báo đã có từ trước được giữ nguyên` : ""}${cod.failed ? ` (⚠️ ${cod.failed} cảnh báo không đọc được chi tiết, lần đồng bộ sau sẽ lấy lại)` : ""}.` };
  }

  // Đẩy kết quả NV KSNB đã Hoàn tất trên web (Có/Không vi phạm) sang EHO
  async function stepCodPush() {
    if (verLt(agentVer, COD_MIN_AGENT)) return null;
    const dry = codPushDry();
    const pend = (await ehoCodPendingPush()).items || [];
    if (!pend.length) return { type: "ok", text: "Đẩy kết quả COD sang EHO: chưa có phiếu nào cần đẩy." };
    const pr = await agentCall("/cod/push", { method: "POST", body: { items: pend, dry_run: dry }, timeoutMs: 15 * 60 * 1000 });
    if (!pr || !pr.ok) {
      if (pr && pr.error === "not_logged_in") throw new Error("login");
      throw new Error(`EHO trả lỗi (${(pr && pr.error) || "không rõ"})`);
    }
    const rs = pr.results || [];
    const okN = rs.filter((r) => r.ok).length;
    const skipN = rs.filter((r) => r.skipped).length;
    const errs = rs.filter((r) => !r.ok);
    if (!dry) await ehoCodPushResult(rs.map((r) => ({ job_id: r.job_id, ok: !!r.ok, sent: r.sent, error: r.error })));
    if (dry) return { type: "warn", text: `🧪 Chạy thử đẩy kết quả COD sang EHO (không ghi): ${rs.length} phiếu đủ điều kiện, ${okN} đọc được trên EHO.` };
    return { type: errs.length ? "warn" : "ok", text: `Đẩy kết quả COD sang EHO: ${vn(okN - skipN)} phiếu đã cập nhật "Đã xử lý"${skipN ? `, ${skipN} phiếu EHO đã xử lý từ trước (giữ nguyên)` : ""}${errs.length ? `, ⚠️ ${errs.length} phiếu lỗi (${errs[0].error || "không rõ"}) — lần đồng bộ sau sẽ thử lại` : ""}.` };
  }

  // Giao dịch Xuất khác / Nhập khác (menu "Xuất Khác - Nhập Khác EHO"): agent kéo ngầm, web nhận từng đợt rồi lưu lên hệ thống
  async function stepXknk(picked) {
    const allPicked = picked.length === srcIds.length;
    if (!allPicked && verLt(agentVer, "1.2")) throw new Error("EHO Agent trên máy là bản cũ (chưa hỗ trợ chọn Loại yêu cầu) — tải file cài bản mới bên dưới.");
    const batch = `xk-${Date.now()}`;
    let saved = 0, moi = 0, last = null;
    setProg({ lines: 0, saved: 0, queries: 0, queued: 0, elapsedSec: 0 });
    const st = await agentCall("/xknk/start", { method: "POST", body: { from_date: from, to_date: to, source_types: allPicked ? [] : picked }, timeoutMs: 30000 });
    if (!st || st.error) {
      if (st && (st.error === "not_logged_in" || st.error === "no_browser")) throw new Error("login");
      throw new Error(st && st.error === "dang_chay" ? "Đang có một lần kéo Xuất khác - Nhập khác chạy sẵn trong cửa sổ EHO — chờ xong hoặc mở lại cửa sổ EHO." : `Không bắt đầu được (${st && st.error})`);
    }
    while (true) {
      const t = await agentCall("/xknk/take?n=3000", { timeoutMs: 60000 });
      if (t.error) throw new Error(t.error === "no_job" ? "Cửa sổ EHO đã bị tải lại/đóng giữa chừng — bấm Đồng bộ lại." : `Agent báo lỗi (${t.error})`);
      last = t;
      if (t.rows && t.rows.length) {
        for (let i = 0; i < t.rows.length; i += 3000) {
          const r = await xknkEhoIngest(batch, t.rows.slice(i, i + 3000));
          saved += r.nhan;
          moi += r.moi || 0;
        }
      }
      setProg({ ...t, rows: undefined, saved });
      if (cancelRef.current && t.running) await agentCall("/xknk/cancel", { method: "POST" }).catch(() => {});
      if (!t.running && t.buffered === 0) break;
      if (!t.rows || !t.rows.length) await sleep(1000);
    }
    if (last.error) {
      if (last.error === "not_logged_in") throw new Error("login");
      throw new Error(`EHO báo lỗi (${last.error}).`);
    }
    if (last.cancelled || cancelRef.current) {
      return { type: "err", text: `Xuất khác - Nhập khác: đã dừng. Đã lưu ${vn(saved)} dòng (${vn(moi)} dòng thêm mới); dữ liệu cũ được giữ nguyên.` };
    }
    await xknkEhoFinalize({ batch, from_time: `${from}T00:00:00`, to_time: `${to}T23:59:59.999999`, so_dong_da_luu: saved, source_types: allPicked ? null : picked });
    return {
      type: last.capped > 0 ? "warn" : "ok",
      text: `Xuất khác - Nhập khác: ${allPicked ? "" : `(${picked.length}/${srcIds.length} loại yêu cầu) `}kéo được ${vn(saved)} dòng giao dịch: thêm mới ${vn(moi)} dòng, cập nhật ${vn(saved - moi)} dòng đã có (${vn(last.queries)} lượt gọi EHO, ${fmtMs(last.elapsedSec)}). Dữ liệu cũ không bị xoá`
        + (last.capped > 0 ? `. ⚠️ ${last.capped} cửa sổ giây vẫn chạm trần 500 phiếu nên có thể thiếu một ít dòng.` : "."),
    };
  }

  async function handleSync() {
    if (!from || !to || from > to) {
      setReport([{ type: "err", text: "Khoảng thời gian không hợp lệ (Từ ngày phải trước hoặc bằng Đến ngày)." }]);
      return;
    }
    const picked = srcIds.filter((id) => srcSel.has(id));
    if (!picked.length) {
      setReport([{ type: "err", text: "Hãy tick chọn ít nhất 1 Loại yêu cầu để đồng bộ." }]);
      return;
    }
    const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    if (days > 93 && !confirm(`Khoảng kéo ${days} ngày, rất nhiều dữ liệu và sẽ chạy lâu. Vẫn tiếp tục?`)) return;
    setBusy("sync");
    setReport([]);
    setProg(null);
    cancelRef.current = false;
    const fromIso = `${from}T00:00:00`, toIso = `${to}T23:59:59`;
    const out = [];
    const push = (r) => { if (r) { out.push(r); if (alive.current) setReport([...out]); } };
    const steps = [
      ["Kiểm kê (1/4)", () => stepKiemKe(fromIso, toIso)],
      ["Đơn Hàng COD (2/4)", () => stepCod(fromIso, toIso)],
      ["Đẩy kết quả COD sang EHO (3/4)", () => stepCodPush()],
      ["Xuất khác - Nhập khác (4/4)", () => stepXknk(picked)],
    ];
    try {
      for (const [name, fn] of steps) {
        if (!alive.current) break;
        setStage(name);
        try {
          push(await fn());
        } catch (e) {
          if (e.message === "login") { push({ type: "err", text: LOGIN_EXPIRED + " Các phần còn lại chưa chạy." }); break; }
          push({ type: "err", text: `${name.replace(/ \(\d\/4\)/, "")}: ${e.name === "AbortError" ? "quá thời gian chờ" : (e.message || "lỗi không rõ")}.` });
        }
      }
    } finally {
      setBusy("");
      setStage("");
      setProg(null);
    }
  }

  async function handleCloseBrowser() {
    try { await agentCall("/close", { method: "POST" }); } catch (e) { /* bỏ qua */ }
    setLogin({ driver: false, logged_in: false });
    setReport([{ type: "ok", text: "Đã đóng cửa sổ EHO." }]);
  }

  const step = (n, ok) => (
    <span style={{ display: "inline-block", width: 22, height: 22, borderRadius: "50%", textAlign: "center", lineHeight: "22px", fontSize: 12, fontWeight: 700, marginRight: 8, background: ok ? "#4C9A2A" : "var(--navy-800)", color: "#fff" }}>{ok ? "✓" : n}</span>
  );
  const syncing = busy === "sync";
  const close = () => { if (!syncing) onClose(); };

  return (
    <div style={overlay} onClick={close}>
      <div style={box} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: "var(--navy-900)", marginBottom: 4 }}>🔄 Đồng bộ dữ liệu EHO</h3>

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
              <button className="fbtn" disabled={!!busy} onClick={handleOpen} style={login.logged_in ? undefined : { background: "#FFE6CC", borderColor: "#F2B27A", color: "#8A4B0F", fontWeight: 700 }}>{busy === "open" ? "Đang mở..." : login.driver ? "Mở lại cửa sổ EHO" : "Mở EHO & đăng nhập"}</button>
              <span style={{ fontSize: 12.5, color: login.logged_in ? "#4C9A2A" : "var(--text-600)", fontWeight: login.logged_in ? 700 : 400 }}>
                {login.logged_in ? "✅ Đã đăng nhập EHO" : login.driver ? "Chờ anh/chị đăng nhập trong cửa sổ EHO..." : "Chưa mở EHO"}
              </span>
              {login.driver && <button className="fbtn" disabled={!!busy} onClick={handleCloseBrowser}>Đóng cửa sổ EHO</button>}
            </div>
            <div style={{ ...row, alignItems: "flex-end" }}>
              {step(2, false)}
              <div>
                <label style={lbl}>Tháng</label>
                <input type="month" className="finput" value={ym} onChange={(e) => pickMonth(e.target.value)} disabled={syncing} style={{ width: 140 }} />
              </div>
              <div>
                <label style={lbl}>Từ ngày</label>
                <input type="date" className="finput" value={from} onChange={(e) => setFrom(e.target.value)} disabled={syncing} />
              </div>
              <div>
                <label style={lbl}>Đến ngày</label>
                <input type="date" className="finput" value={to} onChange={(e) => setTo(e.target.value)} disabled={syncing} />
              </div>
              <div>
                <label style={lbl}>Loại yêu cầu (Xuất khác - Nhập khác)</label>
                <button type="button" className="finput" disabled={syncing} onClick={() => setSrcOpen((o) => !o)}
                  style={{ width: 290, textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: syncing ? "default" : "pointer", background: "var(--card)" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{srcText}</span>
                  <span style={{ fontSize: 10, marginLeft: 8, color: "var(--text-400)" }}>{srcOpen ? "▲" : "▼"}</span>
                </button>
              </div>
            </div>
            {srcOpen && !syncing && (
              <div style={{ margin: "-4px 0 12px 30px", maxHeight: 230, overflowY: "auto", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 0" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
                  <input type="checkbox" checked={nSel === srcIds.length} ref={(el) => { if (el) el.indeterminate = nSel > 0 && nSel < srcIds.length; }}
                    onChange={() => setSrcSel(nSel === srcIds.length ? new Set() : new Set(srcIds))} />
                  Tất cả loại yêu cầu
                </label>
                {srcIds.map((id) => (
                  <label key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", cursor: "pointer", fontSize: 13, background: srcSel.has(id) ? "#EEF4FF" : "transparent" }}>
                    <input type="checkbox" checked={srcSel.has(id)} onChange={() => toggleSrc(id)} />
                    {srcLabel(id)}
                  </label>
                ))}
              </div>
            )}
            <div style={row}>
              {step(3, false)}
              <button className="login-btn" style={{ width: "auto", padding: "8px 22px", opacity: login.logged_in && !busy ? 1 : 0.5 }} disabled={!login.logged_in || !!busy} onClick={handleSync}>
                {syncing ? `Đang đồng bộ: ${stage}...` : "Đồng bộ"}
              </button>
              {syncing && <button className="fbtn" style={{ color: "var(--danger)" }} onClick={() => { cancelRef.current = true; }} title="Dừng phần kéo Xuất khác - Nhập khác (dữ liệu đã lưu được giữ nguyên)">Dừng</button>}
            </div>
          </>
        )}

        {agent === "ok" && verLt(agentVer, COD_MIN_AGENT) && (
          <div style={{ ...note, marginTop: 4, marginBottom: 12, borderColor: "var(--danger)", color: "var(--danger)", background: "#FFF6F5" }}>
            <b>⚠️ EHO Agent trên máy này là bản {agentVer || "cũ"} — cần bản {COD_MIN_AGENT} trở lên để đồng bộ Đơn Hàng COD và đẩy kết quả sang EHO.</b> Các phần còn lại vẫn đồng bộ được. Tải file cài, giải nén, bấm đúp <code>Cai-dat-EHO-Agent.bat</code> (cài đè, giữ nguyên đăng nhập EHO).
            <div style={{ marginTop: 8 }}>
              <a className="login-btn" href={AGENT_ZIP} download style={{ display: "inline-block", width: "auto", padding: "8px 18px", textDecoration: "none", textAlign: "center" }}>⬇️ Tải file cài EHO Agent 2.4</a>
            </div>
          </div>
        )}

        {prog && syncing && (
          <div style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            <div style={{ height: 8, background: "var(--bg)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
              <div style={{ width: `${Math.min(100, prog.windowsDone ? (prog.windowsDone / (prog.windowsDone + (prog.queued || 0) + (prog.inflight || 0))) * 100 : 3)}%`, height: "100%", background: "#2F6FED", transition: "width .4s" }} />
            </div>
            Xuất khác - Nhập khác: đã kéo <b>{vn(prog.lines)}</b> dòng · đã lưu <b>{vn(prog.saved)}</b> · {vn(prog.queries)} lượt gọi EHO · còn {vn(prog.queued)} khoảng chờ · {fmtMs(prog.elapsedSec || 0)}
            {prog.retried > 0 && <span style={{ color: "var(--text-400)" }}> · thử lại {prog.retried} lần</span>}
          </div>
        )}
        {report.map((m, i) => {
          const c = m.type === "ok" ? ["#4C9A2A", "#2f6b1a", "✅"] : m.type === "warn" ? ["#E0A100", "#8a5a00", "⚠️"] : ["var(--danger)", "var(--danger)", "❌"];
          return <div key={i} style={{ ...note, marginTop: i ? 8 : 12, borderColor: c[0], color: c[1] }}>{c[2]} {m.text}</div>;
        })}

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-600)", lineHeight: 1.7 }}>
          {info && info.so_phieu > 0 ? (
            <>Dữ liệu kiểm kê đã đồng bộ: <b>{vn(info.so_phieu)}</b> phiếu của <b>{vn(info.so_shop)}</b> shop · Ngày duyệt mới nhất: <b>{fmtDateTime(info.ngay_duyet_moi_nhat)}</b> · Đồng bộ lần cuối: <b>{fmtDateTime(info.dong_bo_lan_cuoi)}</b>{info.dong_bo_boi && <> · Người đồng bộ: <b>{info.dong_bo_boi}</b></>}</>
          ) : <>Chưa có dữ liệu EHO nào được đồng bộ.</>}
        </div>

        <div style={{ marginTop: 14, textAlign: "right" }}>
          <button className="fbtn" onClick={close} disabled={syncing} title={syncing ? "Đang đồng bộ — chờ xong hoặc bấm Dừng" : undefined}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const box = { background: "#fff", borderRadius: 12, padding: "22px 24px", width: "min(780px, 100%)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" };
const row = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 };
const note = { border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 13, lineHeight: 1.6 };
const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--text-600)", marginBottom: 3 };
