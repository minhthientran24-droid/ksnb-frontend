import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { getUser, xknkEhoMonths, xknkEhoFilters, xknkEhoRows, xknkEhoIngest, xknkEhoFinalize, xknkEhoSourceTypes, xknkEhoExportStart, xknkEhoExportStatus, xknkEhoExportDownload } from "../lib/api";

// Loại yêu cầu EHO (mã -> tên). Tên chưa biết sẽ tự cập nhật theo dữ liệu đã kéo (/source-types).
const SOURCE_BASE = {
  3: "Xuất thanh lý", 4: "Xử lý kiểm kê tự động", 6: "Xuất khác từ kho hành chính", 7: "Xuất sử dụng", 9: "Xử lý kiểm kê allshop",
  10: "Điều chỉnh quy cách ngành hàng", 11: "Xử lý được confirm từ marketing", 12: "Xử lý bồi thường Nhà vận chuyển", 13: "Xử lý không truy thu",
  14: "Xử lý khác", 15: "Kiểm kê cận date", 16: "Hủy đa liều", 17: "Xuất khác dung môi", 18: "Điều chỉnh chênh lệch từ trả hàng NCC",
  21: "Xuất hàng tặng", 22: "Hàng khuyến mãi Vacxin",
};
const SOURCE_IDS = Object.keys(SOURCE_BASE).map(Number);

// Menu "Xuất Khác - Nhập Khác EHO" (chốt 26/10) — CHỈ super_admin, để test. Toàn bộ giao dịch Nhập khác / Xuất khác kéo từ EHO
// về theo tháng. Nút đồng bộ nằm ngay trong menu: chọn khoảng thời gian kéo (mặc định cả 1 tháng), đăng nhập EHO qua EHO Agent
// chạy trên chính PC này (xem ksnb-backend/tools/eho_agent), web đẩy từng đợt dữ liệu lên hệ thống.
const AGENT = "http://127.0.0.1:8765";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function agentCall(path, { method = "GET", body, timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(AGENT + path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const pad = (n) => String(n).padStart(2, "0");
function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}
function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function fmtDT(iso) {
  if (!iso) return "-";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : iso;
}
function fmtNum(n) {
  return n === null || n === undefined ? "-" : Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}
function fmtMs(sec) {
  return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
}

const STATUS_COLOR = { "Hoàn tất": ["#E6F6E1", "#2f6b1a"], "Đã hủy": ["#FDE8E8", "#B42318"], "Chờ kiểm": ["#FFF4D6", "#8a5a00"] };

export default function XknkEhoPage() {
  const [checked, setChecked] = useState(false);

  // ---- Đồng bộ ----
  const [agent, setAgent] = useState("checking"); // checking | ok | missing
  const [login, setLogin] = useState({ driver: false, logged_in: false });
  const [ym, setYm] = useState(currentYm());
  const [from, setFrom] = useState(monthRange(currentYm()).from);
  const [to, setTo] = useState(monthRange(currentYm()).to);
  const [syncing, setSyncing] = useState(false);
  const [prog, setProg] = useState(null);
  const [syncMsg, setSyncMsg] = useState(null);
  const [opening, setOpening] = useState(false);
  const [srcNames, setSrcNames] = useState(SOURCE_BASE);
  const [srcSel, setSrcSel] = useState(() => new Set(SOURCE_IDS)); // mặc định tick tất cả
  const [agentVer, setAgentVer] = useState("");
  const cancelRef = useRef(false);
  const alive = useRef(true);

  // ---- Xem dữ liệu ----
  const [months, setMonths] = useState([]);
  const [month, setMonth] = useState("");
  const [opts, setOpts] = useState({ loai_yeu_cau: [], trang_thai: [] });
  const [f, setF] = useState({ q: "", shop: "", gri_type: 0, source_type: 0, status: "" });
  const [qInput, setQInput] = useState("");
  const [shopInput, setShopInput] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [data, setData] = useState({ total: 0, rows: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [gotoInput, setGotoInput] = useState("");
  const [exp, setExp] = useState(null); // {phase, done, total} khi đang tạo file Excel
  const [expMsg, setExpMsg] = useState(null);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "super_admin") {
      window.location.replace("/");
      return;
    }
    setChecked(true);
    loadMonths(true);
    xknkEhoSourceTypes()
      .then((r) => {
        const names = { ...SOURCE_BASE };
        const sel = new Set(SOURCE_IDS);
        (r.loai_yeu_cau || []).forEach((x) => { if (x.ten) names[x.ma] = x.ten; else if (!(x.ma in names)) names[x.ma] = ""; sel.add(x.ma); });
        setSrcNames(names);
        setSrcSel(sel);
      })
      .catch(() => {});
  }, []);

  const srcIds = Object.keys(srcNames).map(Number).sort((a, b) => a - b);
  const srcLabel = (id) => srcNames[id] || `Loại yêu cầu ${id}`;
  const [srcOpen, setSrcOpen] = useState(false);
  const srcBox = useRef(null);
  useEffect(() => {
    const close = (e) => { if (srcBox.current && !srcBox.current.contains(e.target)) setSrcOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const nSel = srcIds.filter((id) => srcSel.has(id)).length;
  const srcText = nSel === srcIds.length ? "Tất cả loại yêu cầu" : nSel === 0 ? "Chưa chọn loại yêu cầu" : nSel === 1 ? srcLabel(srcIds.find((id) => srcSel.has(id))) : `Đã chọn ${nSel}/${srcIds.length} loại yêu cầu`;
  function toggleSrc(id) {
    setSrcSel((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function loadMonths(selectFirst) {
    xknkEhoMonths()
      .then((r) => {
        setMonths(r.months || []);
        if (selectFirst) setMonth((r.months && r.months[0] && r.months[0].thang) || currentYm());
      })
      .catch((err) => setError(err.message));
  }

  // Theo dõi EHO Agent + trạng thái đăng nhập EHO (chỉ khi mở trang)
  useEffect(() => {
    alive.current = true;
    let timer;
    async function tick() {
      try {
        const p = await agentCall("/ping", { timeoutMs: 4000 });
        if (!alive.current) return;
        if (p && p.ok) {
          setAgent("ok");
          setAgentVer(String(p.version || ""));
          if (!syncing) setLogin(await agentCall("/status", { timeoutMs: 8000 }));
        } else setAgent("missing");
      } catch (e) {
        if (alive.current) setAgent("missing");
      }
      if (alive.current) timer = setTimeout(tick, 3000);
    }
    if (checked) tick();
    return () => { alive.current = false; clearTimeout(timer); };
  }, [checked, syncing]);

  useEffect(() => {
    if (!month) return;
    xknkEhoFilters(month).then(setOpts).catch(() => {});
  }, [month]);

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    setError("");
    xknkEhoRows({ month, ...f, page, page_size: pageSize })
      .then(setData)
      .catch((err) => { setError(err.message); setData({ total: 0, rows: [] }); })
      .finally(() => setLoading(false));
  }, [month, f, page, pageSize]);

  // gõ tìm kiếm -> áp dụng sau 400ms
  useEffect(() => {
    const t = setTimeout(() => { setF((o) => (o.q === qInput.trim() && o.shop === shopInput.trim() ? o : { ...o, q: qInput.trim(), shop: shopInput.trim() })); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [qInput, shopInput]);

  // Xuất Excel đúng tháng đang xem (kèm bộ lọc đang áp dụng)
  async function exportExcel() {
    if (!month || exp) return;
    setExpMsg(null);
    setExp({ phase: "building", done: 0, total: data.total || 0 });
    try {
      const { job_id } = await xknkEhoExportStart({ month, ...f });
      while (true) {
        await sleep(2000);
        const st = await xknkEhoExportStatus(job_id);
        if (st.status === "error") throw new Error(st.error || "Tạo file Excel thất bại");
        setExp({ phase: st.phase, done: st.done, total: st.total });
        if (st.status === "done") break;
      }
      setExp((o) => ({ ...o, phase: "downloading" }));
      await xknkEhoExportDownload(job_id);
      setExpMsg({ type: "ok", text: `✅ Đã xuất Excel tháng ${month.split("-").reverse().join("/")}.` });
    } catch (e) {
      setExpMsg({ type: "err", text: e.message || "Xuất Excel thất bại" });
    } finally {
      setExp(null);
    }
  }

  function pickMonth(v) {
    setYm(v);
    if (/^\d{4}-\d{2}$/.test(v)) {
      const r = monthRange(v);
      setFrom(r.from);
      setTo(r.to);
    }
  }

  async function openEho() {
    setOpening(true);
    setSyncMsg(null);
    try {
      await agentCall("/open", { method: "POST", timeoutMs: 90000 });
      setSyncMsg({ type: "ok", text: "Đã mở cửa sổ EHO. Hãy đăng nhập trong cửa sổ đó (tài khoản, mật khẩu, OTP) — xong trạng thái ở đây tự chuyển sang \"Đã đăng nhập\"." });
    } catch (e) {
      setSyncMsg({ type: "err", text: "Không mở được cửa sổ EHO: " + (e.message || "lỗi không rõ") });
    } finally {
      setOpening(false);
    }
  }

  async function runSync() {
    if (!from || !to || from > to) {
      setSyncMsg({ type: "err", text: "Khoảng thời gian không hợp lệ (Từ ngày phải trước hoặc bằng Đến ngày)." });
      return;
    }
    const picked = srcIds.filter((id) => srcSel.has(id));
    if (!picked.length) {
      setSyncMsg({ type: "err", text: "Hãy tick chọn ít nhất 1 Loại yêu cầu để đồng bộ." });
      return;
    }
    const allPicked = picked.length === srcIds.length;
    if (!allPicked && parseFloat(agentVer) < 1.2) {
      setSyncMsg({ type: "err", text: "EHO Agent trên máy là bản cũ (chưa hỗ trợ chọn Loại yêu cầu). Hãy tắt cửa sổ EHO Agent rồi mở lại Chay-EHO-Agent.bat để dùng bản mới." });
      return;
    }
    const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    if (days > 93 && !confirm(`Khoảng kéo ${days} ngày, rất nhiều dữ liệu và sẽ chạy lâu. Vẫn tiếp tục?`)) return;
    setSyncing(true);
    setSyncMsg(null);
    setProg({ lines: 0, saved: 0, queries: 0, queued: 0, elapsedSec: 0 });
    cancelRef.current = false;
    const batch = `xk-${Date.now()}`;
    let saved = 0, last = null;
    try {
      const st = await agentCall("/xknk/start", { method: "POST", body: { from_date: from, to_date: to, source_types: allPicked ? [] : picked }, timeoutMs: 30000 });
      if (!st || st.error) {
        throw new Error(st && st.error === "not_logged_in" ? "Chưa đăng nhập EHO — bấm \"Mở EHO & đăng nhập\" trước."
          : st && st.error === "no_browser" ? "Chưa mở cửa sổ EHO — bấm \"Mở EHO & đăng nhập\" trước."
            : st && st.error === "dang_chay" ? "Đang có một lần kéo dữ liệu chạy sẵn trong cửa sổ EHO — chờ xong hoặc mở lại cửa sổ EHO."
              : `Không bắt đầu được (${st && st.error})`);
      }
      while (true) {
        const t = await agentCall("/xknk/take?n=3000", { timeoutMs: 60000 });
        if (t.error) throw new Error(t.error === "no_job" ? "Cửa sổ EHO đã bị tải lại/đóng giữa chừng — bấm Đồng bộ lại." : `Agent báo lỗi (${t.error})`);
        last = t;
        if (t.rows && t.rows.length) {
          for (let i = 0; i < t.rows.length; i += 3000) {
            const r = await xknkEhoIngest(batch, t.rows.slice(i, i + 3000));
            saved += r.nhan;
          }
        }
        setProg({ ...t, rows: undefined, saved });
        if (cancelRef.current && t.running) await agentCall("/xknk/cancel", { method: "POST" }).catch(() => {});
        if (!t.running && t.buffered === 0) break;
        if (!t.rows || !t.rows.length) await sleep(1000);
      }
      if (last.error) {
        throw new Error(last.error === "not_logged_in" ? "Phiên đăng nhập EHO đã hết hạn giữa chừng — đăng nhập lại rồi đồng bộ lại (dữ liệu đã lưu được giữ nguyên)." : `EHO báo lỗi (${last.error}).`);
      }
      if (last.cancelled || cancelRef.current) {
        setSyncMsg({ type: "err", text: `Đã dừng. Đã lưu ${saved.toLocaleString("vi-VN")} dòng (chưa dọn dòng cũ).` });
      } else {
        const fin = await xknkEhoFinalize({ batch, from_time: `${from}T00:00:00`, to_time: `${to}T23:59:59.999999`, so_dong_da_luu: saved, source_types: allPicked ? null : picked });
        setSyncMsg({
          type: last.capped > 0 ? "warn" : "ok",
          text: `✅ Đồng bộ xong ${from.split("-").reverse().join("/")} → ${to.split("-").reverse().join("/")}: ${allPicked ? "" : `(${picked.length}/${srcIds.length} loại yêu cầu) `}lưu ${saved.toLocaleString("vi-VN")} dòng giao dịch (${last.queries.toLocaleString("vi-VN")} lượt gọi EHO, ${fmtMs(last.elapsedSec)})`
            + (fin.da_xoa ? `, dọn ${fin.da_xoa.toLocaleString("vi-VN")} dòng cũ không còn trên EHO` : "")
            + (last.capped > 0 ? `. ⚠️ ${last.capped} cửa sổ giây vẫn chạm trần 500 phiếu nên có thể thiếu một ít dòng.` : "."),
        });
        loadMonths(false);
        setMonth(from.slice(0, 7));
        setPage(1);
        xknkEhoFilters(from.slice(0, 7)).then(setOpts).catch(() => {});
        setF((o) => ({ ...o }));
      }
    } catch (e) {
      setSyncMsg({ type: "err", text: e.name === "AbortError" ? "Agent không phản hồi (quá thời gian chờ)." : (e.message || "Đồng bộ thất bại") });
    } finally {
      setSyncing(false);
    }
  }

  if (!checked) return null;
  const totalPages = Math.max(1, Math.ceil((data.total || 0) / pageSize));
  const pageNums = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) pageNums.push(p);

  return (
    <Layout crumb="Xuất Khác - Nhập Khác EHO">
      <div className="page-head">
        <h1>🧾 Xuất Khác - Nhập Khác EHO</h1>
        <p>Toàn bộ giao dịch Nhập khác / Xuất khác kéo từ EHO về theo tháng (menu thử nghiệm — chỉ Super Admin).</p>
      </div>

      {/* ------- Đồng bộ ------- */}
      <div className="card" style={{ overflow: "visible" }}>
        <div className="card-head">
          <h3>🔄 Đồng bộ dữ liệu từ EHO</h3>
          <span className="note">
            {agent === "checking" ? "Đang kiểm tra EHO Agent..." : agent === "ok" ? (login.logged_in ? "✅ Đã đăng nhập EHO" : "EHO Agent sẵn sàng — chưa đăng nhập EHO") : "Chưa thấy EHO Agent"}
          </span>
        </div>
        <div className="card-body" style={{ padding: "14px 20px" }}>
          {agent === "missing" && (
            <div style={{ border: "1px solid var(--danger)", borderRadius: 8, padding: "10px 12px", color: "var(--danger)", fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
              <b>Chưa thấy EHO Agent trên máy này.</b> Mở file <code>Chay-EHO-Agent.bat</code> (thư mục <code>C:\Tool EHO</code>), giữ cửa sổ đen đó mở. Nếu
              trình duyệt hỏi quyền truy cập thiết bị trong mạng nội bộ, chọn <b>Cho phép</b>.
              <div>
                <a className="fbtn" href="/downloads/EHO-Agent-Setup.zip" download style={{ display: "inline-block", marginTop: 8, textDecoration: "none", color: "var(--navy-800)", fontWeight: 700 }}>⬇️ Tải file cài EHO Agent</a>
                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-600)" }}>Máy chưa cài: tải về, giải nén rồi bấm đúp <code>Cai-dat-EHO-Agent.bat</code>.</span>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={lbl}>Bước 1</label>
              <button className="fbtn" disabled={agent !== "ok" || opening || syncing} onClick={openEho}>
                {opening ? "Đang mở..." : login.logged_in ? "Mở lại cửa sổ EHO" : "Mở EHO & đăng nhập"}
              </button>
            </div>
            <div>
              <label style={lbl}>Bước 2 — Tháng kéo dữ liệu</label>
              <input type="month" className="finput" value={ym} onChange={(e) => pickMonth(e.target.value)} disabled={syncing} style={{ width: 150 }} />
            </div>
            <div>
              <label style={lbl}>Từ ngày</label>
              <input type="date" className="finput" value={from} onChange={(e) => setFrom(e.target.value)} disabled={syncing} />
            </div>
            <div>
              <label style={lbl}>Đến ngày</label>
              <input type="date" className="finput" value={to} onChange={(e) => setTo(e.target.value)} disabled={syncing} />
            </div>
            <div ref={srcBox} style={{ position: "relative" }}>
              <label style={lbl}>Loại yêu cầu</label>
              <button type="button" className="finput" disabled={syncing} onClick={() => setSrcOpen((o) => !o)}
                style={{ width: 270, textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: syncing ? "default" : "pointer", background: "var(--card)" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{srcText}</span>
                <span style={{ fontSize: 10, marginLeft: 8, color: "var(--text-400)" }}>▼</span>
              </button>
              {srcOpen && !syncing && (
                <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 30, width: 330, maxHeight: 340, overflowY: "auto", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.15)", padding: "4px 0" }}>
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
            </div>
            <button className="login-btn" style={{ width: "auto", padding: "9px 24px", opacity: login.logged_in && !syncing ? 1 : 0.5 }} disabled={!login.logged_in || syncing} onClick={runSync}>
              {syncing ? "Đang đồng bộ..." : "Đồng bộ"}
            </button>
            {syncing && <button className="fbtn" style={{ color: "var(--danger)" }} onClick={() => { cancelRef.current = true; }}>Dừng</button>}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-400)", marginTop: 8 }}>
            Chọn tháng sẽ tự điền Từ ngày/Đến ngày của cả tháng (VD 01/10–31/10); có thể sửa tay để kéo khoảng khác. Mỗi lần đồng bộ chỉ ghi đè lại đúng khoảng ngày và đúng các Loại yêu cầu đã tick (loại không tick thì giữ nguyên dữ liệu cũ).
            Một tháng có thể hơn 500.000 dòng nên chạy vài phút — giữ nguyên trang này và cửa sổ EHO trong lúc kéo.
          </div>

          {prog && syncing && (
            <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7 }}>
              <div style={{ height: 8, background: "var(--bg)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
                <div style={{ width: `${Math.min(100, prog.windowsDone ? (prog.windowsDone / (prog.windowsDone + (prog.queued || 0) + (prog.inflight || 0))) * 100 : 3)}%`, height: "100%", background: "#2F6FED", transition: "width .4s" }} />
              </div>
              Đã kéo <b>{(prog.lines || 0).toLocaleString("vi-VN")}</b> dòng · đã lưu <b>{(prog.saved || 0).toLocaleString("vi-VN")}</b> · {(prog.queries || 0).toLocaleString("vi-VN")} lượt gọi EHO · còn {(prog.queued || 0).toLocaleString("vi-VN")} khoảng chờ · {fmtMs(prog.elapsedSec || 0)}
              {prog.retried > 0 && <span style={{ color: "var(--text-400)" }}> · thử lại {prog.retried} lần</span>}
            </div>
          )}
          {syncMsg && (
            <div style={{ marginTop: 12, border: "1px solid", borderColor: syncMsg.type === "ok" ? "#4C9A2A" : syncMsg.type === "warn" ? "#E0A100" : "var(--danger)", color: syncMsg.type === "ok" ? "#2f6b1a" : syncMsg.type === "warn" ? "#8a5a00" : "var(--danger)", borderRadius: 8, padding: "10px 12px", fontSize: 13, lineHeight: 1.6 }}>
              {syncMsg.text}
            </div>
          )}
        </div>
      </div>

      {/* ------- Dữ liệu ------- */}
      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
          <h3>Dữ liệu theo tháng</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {months.length === 0 && <span className="note">Chưa có dữ liệu — bấm Đồng bộ ở trên.</span>}
            {months.map((m) => (
              <div key={m.thang} className={`month-tab ${m.thang === month ? "active" : ""}`} onClick={() => { setMonth(m.thang); setPage(1); }} title={`${m.so_dong.toLocaleString("vi-VN")} dòng · ${m.so_phieu.toLocaleString("vi-VN")} phiếu`}>
                {m.thang.split("-").reverse().join("/")} ({m.so_dong.toLocaleString("vi-VN")})
              </div>
            ))}
          </div>
        </div>
        <div className="card-body" style={{ padding: "12px 16px" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <input className="finput" placeholder="Mã phiếu / SKU / Tên SP" value={qInput} onChange={(e) => setQInput(e.target.value)} style={{ width: 260 }} />
            <input className="finput" placeholder="Mã shop / Tên shop" value={shopInput} onChange={(e) => setShopInput(e.target.value)} style={{ width: 200 }} />
            <select className="finput" value={f.gri_type} onChange={(e) => { setF({ ...f, gri_type: Number(e.target.value) }); setPage(1); }} style={{ width: 140 }}>
              <option value={0}>Tất cả loại phiếu</option>
              <option value={1}>Nhập khác</option>
              <option value={2}>Xuất khác</option>
            </select>
            <select className="finput" value={f.source_type} onChange={(e) => { setF({ ...f, source_type: Number(e.target.value) }); setPage(1); }} style={{ width: 230 }}>
              <option value={0}>Tất cả loại yêu cầu</option>
              {opts.loai_yeu_cau.map((o) => <option key={o.ma} value={o.ma}>{o.ten} ({o.so_dong.toLocaleString("vi-VN")})</option>)}
            </select>
            <select className="finput" value={f.status} onChange={(e) => { setF({ ...f, status: e.target.value }); setPage(1); }} style={{ width: 150 }}>
              <option value="">Tất cả trạng thái</option>
              {opts.trang_thai.map((o) => <option key={o.ten} value={o.ten}>{o.ten} ({o.so_dong.toLocaleString("vi-VN")})</option>)}
            </select>
            <span style={{ alignSelf: "center", fontSize: 12.5, color: "var(--text-600)" }}>{loading ? "Đang tải..." : `${(data.total || 0).toLocaleString("vi-VN")} dòng`}</span>
            <button className="fbtn" style={{ marginLeft: "auto" }} disabled={!!exp || !month || !(data.total > 0)} onClick={exportExcel}
              title="Xuất toàn bộ dữ liệu của tháng đang xem (theo bộ lọc hiện tại) ra file Excel">
              {exp ? (exp.phase === "saving" ? "Đang đóng gói file..." : exp.phase === "downloading" ? "Đang tải về..." : `Đang tạo file... ${(exp.done || 0).toLocaleString("vi-VN")}/${(exp.total || 0).toLocaleString("vi-VN")}`) : "📥 Xuất Excel"}
            </button>
          </div>

          {expMsg && (
            <div style={{ marginBottom: 10, border: "1px solid", borderColor: expMsg.type === "ok" ? "#4C9A2A" : "var(--danger)", color: expMsg.type === "ok" ? "#2f6b1a" : "var(--danger)", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>{expMsg.text}</div>
          )}
          {error && <div className="placeholder-box" style={{ color: "var(--danger)" }}>{error}</div>}

          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 1700, fontSize: 12.5 }}>
              <thead>
                <tr>
                  {["STT", "Trạng thái", "Mã phiếu", "Loại phiếu", "Loại yêu cầu", "Shop", "Kho", "Sản phẩm", "Giá trị", "Số lô - HSD", "Số lượng", "Đơn vị tính", "Ngày tạo phiếu", "Người tạo phiếu", "Ghi chú"].map((h) => (
                    <th key={h} style={{ fontSize: 10.5, padding: "8px 8px", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && !loading && (
                  <tr><td colSpan={16} style={{ textAlign: "center", color: "var(--text-400)" }}>{month ? "Không có dòng nào khớp." : "Chưa có dữ liệu."}</td></tr>
                )}
                {data.rows.map((r, i) => {
                  const sc = STATUS_COLOR[r.status_name] || ["#EEF1F6", "#44506b"];
                  return (
                    <tr key={r.item_id}>
                      <td>{(page - 1) * pageSize + i + 1}</td>
                      <td><span style={{ background: sc[0], color: sc[1], borderRadius: 10, padding: "2px 9px", fontWeight: 600, whiteSpace: "nowrap" }}>{r.status_name || "-"}</span></td>
                      <td style={{ whiteSpace: "nowrap", color: "var(--blue-accent, #2F6FED)", fontWeight: 600 }}>{r.code}</td>
                      <td><span style={{ background: r.gri_type === 2 ? "#FDE8E8" : "#E3F0FF", color: r.gri_type === 2 ? "#B42318" : "#1B5FB5", borderRadius: 10, padding: "2px 9px", fontWeight: 600, whiteSpace: "nowrap" }}>{r.gri_type_name || "-"}</span></td>
                      <td style={{ textAlign: "left" }}>{r.source_type_name || "-"}</td>
                      <td style={{ textAlign: "left" }}>{r.shop_code}{r.shop_name ? ` - ${r.shop_name}` : ""}</td>
                      <td style={{ textAlign: "left" }}>{r.whs_code}{r.whs_name ? ` - ${r.whs_name}` : ""}</td>
                      <td style={{ textAlign: "left" }}>{r.sku}{r.sku_name ? ` - ${r.sku_name}` : ""}</td>
                      <td style={{ textAlign: "right" }}>{fmtNum(r.price)}</td>
                      <td>{[r.lot_number, r.expire_date ? String(r.expire_date).slice(0, 10) : ""].filter(Boolean).join(" - ") || "-"}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtNum(r.quantity)}</td>
                      <td>{r.unit_name || "-"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtDT(r.creation_time)}</td>
                      <td style={{ textAlign: "left" }}>{r.created_by_name || "-"}</td>
                      <td style={{ textAlign: "left" }}>{r.description || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", marginTop: 12, fontSize: 12.5 }}>
            <span>Số dòng/trang</span>
            <select className="finput" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ width: 80 }}>
              {[20, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="fbtn" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
            {pageNums[0] > 1 && <span>…</span>}
            {pageNums.map((p) => (
              <button key={p} className="fbtn" style={p === page ? { background: "var(--navy-800)", color: "#fff" } : undefined} onClick={() => setPage(p)}>{p}</button>
            ))}
            {pageNums[pageNums.length - 1] < totalPages && <span>… {totalPages.toLocaleString("vi-VN")}</span>}
            <button className="fbtn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
            <span>Đi đến trang</span>
            <input className="finput" value={gotoInput} onChange={(e) => setGotoInput(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter" && gotoInput) { setPage(Math.min(totalPages, Math.max(1, Number(gotoInput)))); setGotoInput(""); } }} style={{ width: 60 }} />
          </div>
        </div>
      </div>
    </Layout>
  );
}

const lbl = { fontSize: 11.5, fontWeight: 600, color: "var(--text-600)", display: "block", marginBottom: 5 };
