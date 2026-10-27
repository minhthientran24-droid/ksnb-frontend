import { useEffect, useMemo, useRef, useState } from "react";
import { agentCall } from "../lib/ehoAgent";
import { launchEhoAgent } from "../lib/ehoAgentLaunch";
import { llv2CreateDanhSachChia, llv2TicketJobs, llv2TicketResult } from "../lib/llv2Api";

// Popup "Tạo Ticket SSC" (tab Shop được chia - Chuẩn bị kiểm kê) — thay cho script auto_ticket_ssc.py chạy tay.
//   Bước 1: mở SSC bằng Chrome riêng của EHO Agent (trên PC admin) -> admin TỰ đăng nhập SSC.
//   Bước 2: bấm Tạo -> gộp mọi shop đang hiện trong danh sách thành 1 mã phiếu chia, đưa cho agent điền form + bấm Gửi từng shop,
//           web ghi link ticket / lỗi từng shop về hệ thống (ngay khi agent báo).
// Mỗi shop chỉ bấm Gửi đúng một lần; shop đã có ticket bị bỏ qua. Mật khẩu SSC không đi qua web/agent.
const MIN_AGENT = "2.2"; // bản agent tối thiểu: có /ssc/* và tạo ticket bằng API (2.2 đã thêm x-xsrf-token)
const SEEN_KEY = "ssc_posted_run";
const DRY = typeof window !== "undefined" && window.localStorage?.getItem("sscDryRun") === "1"; // chạy thử: điền form, KHÔNG bấm Gửi

// so sánh phiên bản dạng "2.10" > "2.2" (không phải số thập phân)
const verLt = (a, b) => { const x = String(a || "0").split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0; } return false; };
const fmtSec = (s) => (s >= 60 ? `${Math.floor(s / 60)} phút ${s % 60} giây` : `${s} giây`);
const STATUS_TXT = { da_tao: "Đã tạo", can_xac_minh: "Cần xác minh", loi: "Lỗi", bo_qua: "Bỏ qua", dry_run: "Điền thử OK" };

const vi = (a, b) => String(a || "").localeCompare(String(b || ""), "vi");
// Thứ tự hình thức kiểm: Trực tiếp lên trên, Online xuống dưới (hình thức khác nằm cuối)
const HT_RANK = { "trực tiếp": 0, online: 1 };
const htRank = (v) => { const r = HT_RANK[String(v || "").trim().toLowerCase()]; return r === undefined ? 2 : r; };
// Shop không tạo được ticket: đã có ticket (da_tao) hoặc hình thức Thanh lý (backend cũng bỏ qua 2 loại này)
const skipReason = (r) => (r.hinh_thuc === "Thanh lý" ? "Thanh lý — không tạo" : r.ticket_status === "da_tao" ? "Đã có ticket" : "");

export default function SscTicketModal({ rows = [], group, onClose, onDone }) {
  const [agent, setAgent] = useState("checking"); // checking | ok | old | missing
  const [agentVer, setAgentVer] = useState("");
  const [ssc, setSsc] = useState({ driver: false, logged_in: false, running: false });
  const [opening, setOpening] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | preparing | running | done
  const [prog, setProg] = useState(null);
  const [fails, setFails] = useState([]); // kết quả lỗi / cần xác minh / bỏ qua để hiện
  const [msg, setMsg] = useState(null); // {type, text}
  const [okCount, setOkCount] = useState(0);
  const [off, setOff] = useState(() => new Set()); // shop bị bỏ tick (mặc định tick tất cả shop tạo được)
  const alive = useRef(true);
  const cursor = useRef(0);
  const phaseRef = useRef("idle");
  const setPh = (p) => { phaseRef.current = p; setPhase(p); };

  // Danh sách shop: sắp theo Hình thức kiểm -> Loại shop -> Thời gian kiểm (ngày kiểm) -> Mã shop
  const sorted = useMemo(() => [...rows].sort((a, b) => (htRank(a.hinh_thuc) - htRank(b.hinh_thuc)) || vi(a.hinh_thuc, b.hinh_thuc) || vi(a.loai_shop, b.loai_shop) || vi(a.ngay_kiem, b.ngay_kiem) || vi(a.ma_shop, b.ma_shop)), [rows]);
  const eligible = sorted.filter((r) => !skipReason(r));
  const picked = eligible.filter((r) => !off.has(r.id));
  const ids = picked.map((r) => r.id);
  const allOn = eligible.length > 0 && picked.length === eligible.length;
  const toggleOne = (id) => setOff((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setOff(allOn ? new Set(eligible.map((r) => r.id)) : new Set());

  function startAgent() {
    launchEhoAgent();
    setLaunching(true);
    setTimeout(() => alive.current && setLaunching(false), 15000);
  }

  // Ghi từng kết quả agent trả về lên backend. Chỉ nhích con trỏ khi ghi thành công -> lỗi mạng thì lần sau ghi lại (backend idempotent).
  async function postNew(p) {
    let n = 0;
    for (const r of p.results || []) {
      if (DRY || r.status === "bo_qua" || r.status === "dry_run") { cursor.current += 1; n += 1; if (r.status !== "dry_run") setFails((f) => [...f, r]); continue; }
      await llv2TicketResult({ lichlamviec_id: r.lichlamviec_id, status: r.status, ticket_url: r.ticket_url, error_message: r.error_message });
      cursor.current += 1;
      n += 1;
      if (r.status === "da_tao") setOkCount((c) => c + 1);
      else setFails((f) => [...f, r]);
    }
    return n;
  }

  async function pollLoop() {
    while (alive.current) {
      let p;
      try {
        p = await agentCall(`/ssc/progress?since=${cursor.current}`, { timeoutMs: 8000 });
      } catch (e) {
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      setProg(p);
      try {
        await postNew(p);
      } catch (e) {
        setMsg({ type: "err", text: "Chưa ghi được kết quả lên hệ thống (" + (e.message || "lỗi mạng") + ") — sẽ tự thử lại." });
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      if (p.done && !p.running && cursor.current >= (p.next || 0)) {
        try { window.localStorage.setItem(SEEN_KEY, String(p.started)); } catch (e) { /* bỏ qua */ }
        setPh("done");
        setMsg(p.error ? { type: "err", text: p.error } : null);
        onDone && onDone();
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Theo dõi agent + trạng thái đăng nhập SSC; gặp lượt tạo đang chạy dở (đóng popup giữa chừng) thì nối lại
  useEffect(() => {
    alive.current = true;
    let timer;
    async function tick() {
      if (phaseRef.current === "running" || phaseRef.current === "preparing") { timer = setTimeout(tick, 3000); return; }
      try {
        const pg = await agentCall("/ping", { timeoutMs: 4000 });
        if (!alive.current) return;
        if (pg && pg.ok) {
          if (verLt(pg.version, MIN_AGENT)) { setAgentVer(String(pg.version || "")); setAgent("old"); }
          else {
            setAgent("ok");
            setLaunching(false);
            const s = await agentCall("/ssc/status", { timeoutMs: 15000 });
            if (!alive.current) return;
            setSsc(s);
            if (s.running && phaseRef.current === "idle") { cursor.current = 0; setPh("running"); pollLoop(); }
            else if (phaseRef.current === "idle" && !s.running) {
              const p = await agentCall("/ssc/progress?since=0", { timeoutMs: 8000 });
              let seen = "";
              try { seen = window.localStorage.getItem(SEEN_KEY) || ""; } catch (e) { /* bỏ qua */ }
              if (p && p.done && p.total && !p.dry_run && String(p.started) !== seen) { cursor.current = 0; setPh("running"); pollLoop(); }
            }
          }
        } else setAgent("missing");
      } catch (e) {
        if (alive.current) setAgent("missing");
      }
      if (alive.current) timer = setTimeout(tick, 3000);
    }
    tick();
    return () => { alive.current = false; clearTimeout(timer); };
  }, []);

  async function openSsc() {
    setOpening(true);
    setMsg(null);
    try {
      await agentCall("/ssc/open", { method: "POST", timeoutMs: 90000 });
      setMsg({ type: "ok", text: "Đã mở cửa sổ SSC. Hãy đăng nhập trong cửa sổ đó — xong trạng thái ở đây tự chuyển sang \"Đã đăng nhập\"." });
    } catch (e) {
      setMsg({ type: "err", text: "Không mở được cửa sổ SSC: " + (e.message || "lỗi không rõ") });
    } finally {
      setOpening(false);
    }
  }

  async function runCreate() {
    setMsg(null);
    setFails([]);
    setOkCount(0);
    setProg(null);
    cursor.current = 0;
    setPh("preparing");
    try {
      const d = await llv2CreateDanhSachChia(ids, group);
      if (!d.included_count) {
        setPh("idle");
        setMsg({ type: "ok", text: `Không có shop nào cần tạo ticket${d.already_done_count ? ` — ${d.already_done_count} shop đã có ticket từ trước` : ""}${d.skipped_count ? `, ${d.skipped_count} shop Thanh lý được bỏ qua` : ""}.` });
        return;
      }
      const j = await llv2TicketJobs(d.ma_phieu_chia);
      // Chỉ tạo đúng các shop đang tick, theo đúng thứ tự đang hiển thị
      const order = new Map(ids.map((id, i) => [id, i]));
      const jobRows = (j.rows || []).filter((r) => order.has(r.id)).sort((a, b) => order.get(a.id) - order.get(b.id));
      if (!jobRows.length) throw new Error("Không lấy được danh sách shop của mã " + d.ma_phieu_chia);
      const st = await agentCall("/ssc/start", { method: "POST", body: { rows: jobRows, dry_run: DRY }, timeoutMs: 30000 });
      if (st.error) throw new Error(st.error === "no_browser" ? "Chưa mở SSC — làm Bước 1 trước." : st.error === "dang_chay" ? "Agent đang tạo ticket dở — chờ xong." : st.error);
      setMsg({ type: "ok", text: `Mã phiếu chia ${d.ma_phieu_chia} — ${jobRows.length} shop${d.already_done_count ? ` (${d.already_done_count} shop đã có ticket từ trước, không tạo lại)` : ""}${d.skipped_count ? ` (${d.skipped_count} shop Thanh lý bỏ qua)` : ""}.` });
      setPh("running");
      pollLoop();
    } catch (e) {
      setPh("idle");
      setMsg({ type: "err", text: e.message || "Không bắt đầu được" });
    }
  }

  async function stop() {
    try { await agentCall("/ssc/cancel", { method: "POST" }); } catch (e) { /* bỏ qua */ }
  }

  function close() {
    if (phase === "running" && !window.confirm("Agent vẫn đang tạo ticket. Đóng cửa sổ này thì link ticket chưa được ghi lên hệ thống cho tới khi mở lại popup. Vẫn đóng?")) return;
    onDone && onDone();
    onClose();
  }

  const loggedIn = agent === "ok" && ssc.logged_in;
  const total = prog?.total || 0;
  const done = Math.min(total, (prog?.created || 0) + (prog?.failed || 0) + (prog?.verify || 0) + (prog?.skipped || 0));
  const busy = phase === "preparing" || phase === "running";

  return (
    <div style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: "var(--navy-900)", margin: 0 }}>🎫 Tạo Ticket SSC — Thông báo kiểm soát</h3>
          <button className="fbtn" onClick={close}>✕ Đóng</button>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 12 }}>
          Chọn shop cần tạo ticket (mặc định chọn tất cả). Shop đã có ticket và shop Thanh lý không tạo lại.
        </div>

        {DRY && <div style={{ border: "1px solid #E0A100", color: "#8a5a00", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, marginBottom: 10 }}>⚠️ CHẾ ĐỘ CHẠY THỬ: chỉ điền form, KHÔNG bấm Gửi, không ghi kết quả.</div>}

        {agent === "checking" && <div style={{ padding: 10, color: "var(--text-400)" }}>Đang kiểm tra EHO Agent...</div>}
        {(agent === "missing" || agent === "old") && (
          <div style={{ border: "2px solid", borderColor: launching ? "var(--border)" : "var(--danger)", borderRadius: 10, padding: "12px 14px", color: "var(--text-900, #1f2a44)", fontSize: 13, lineHeight: 1.65, marginBottom: 14, background: launching ? "transparent" : "#FFF6F5" }}>
            {launching ? (
              <><b>Đang khởi động EHO Agent...</b> Nếu trình duyệt hỏi "Mở EHO Agent?" hãy bấm <b>Mở</b> (tick "Luôn cho phép" để lần sau tự mở).</>
            ) : (
              <>
                <div style={{ fontWeight: 800, color: "var(--danger)", marginBottom: 4 }}>
                  {agent === "old" ? `⚠️ Máy này đang chạy EHO Agent bản ${agentVer || "cũ"} — cần bản 2.2 trở lên để tạo ticket SSC.` : "⚠️ Máy này chưa có EHO Agent 2.2 — cần cài để tạo ticket SSC."}
                </div>
                <div>Tải file cài bên dưới (luôn là bản mới nhất), giải nén, bấm đúp <code>Cai-dat-EHO-Agent.bat</code> (chỉ cài 1 lần{agent === "old" ? ", cài đè bản cũ" : ""}). Sau đó EHO Agent <b>tự chạy ngầm cùng Windows</b>, không hiện cửa sổ nào — popup này sẽ tự nhận ra khi cài xong.</div>
              </>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <a className="login-btn" href="/downloads/EHO-Agent-Setup-2.2.zip" download style={{ display: "inline-block", width: "auto", padding: "8px 18px", textDecoration: "none", textAlign: "center" }}>⬇️ Tải file cài EHO Agent 2.2</a>
              {agent === "missing" && <button className="fbtn" onClick={startAgent} disabled={launching} style={{ fontWeight: 700 }}>▶️ Đã cài rồi — khởi động EHO Agent</button>}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-600)" }}>
              Cần Windows có Python 3 và Google Chrome (bộ cài sẽ báo nếu thiếu). Mật khẩu SSC/EHO không đi qua agent — anh/chị tự đăng nhập trong cửa sổ Chrome do agent mở.
            </div>
          </div>
        )}

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: busy ? "default" : "pointer", fontWeight: 700 }}>
              <input type="checkbox" disabled={busy || !eligible.length} checked={allOn} ref={(el) => { if (el) el.indeterminate = picked.length > 0 && !allOn; }} onChange={toggleAll} />
              Chọn tất cả
            </label>
            <span style={{ color: "var(--text-600)" }}>Đã chọn <b>{picked.length}</b>/{eligible.length} shop có thể tạo{rows.length > eligible.length ? ` · ${rows.length - eligible.length} shop không tạo (đã có ticket / Thanh lý)` : ""}</span>
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-400)" }}>Sắp theo: Hình thức kiểm → Loại shop → Thời gian kiểm</span>
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            <table style={{ fontSize: 12.5, width: "100%" }}>
              <thead>
                <tr>{["", "Mã shop", "Hình thức kiểm", "Loại shop", "Thời gian kiểm", "KSNB phụ trách"].map((h, i) => <th key={i} style={{ fontSize: 10.5, padding: "6px 8px", position: "sticky", top: 0, background: "var(--card, #fff)", textAlign: i === 1 || i === 5 ? "left" : "center" }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const why = skipReason(r);
                  const on = !why && !off.has(r.id);
                  return (
                    <tr key={r.id} style={{ opacity: why ? 0.5 : 1, cursor: why || busy ? "default" : "pointer" }} onClick={() => { if (!why && !busy) toggleOne(r.id); }}>
                      <td style={{ width: 30, textAlign: "center" }}><input type="checkbox" checked={on} disabled={!!why || busy} onChange={() => toggleOne(r.id)} onClick={(e) => e.stopPropagation()} /></td>
                      <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{r.ma_shop} — {r.ten_shop}{why && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-400)" }}>({why})</span>}</td>
                      <td>{r.hinh_thuc || "—"}</td>
                      <td>{r.loai_shop || "—"}</td>
                      <td>{r.ngay_kiem || "—"}</td>
                      <td style={{ textAlign: "left" }}>{r.ksnb || "—"}</td>
                    </tr>
                  );
                })}
                {!sorted.length && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-400)", padding: 12 }}>Chưa có shop nào trong danh sách.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={lbl}>Bước 1 — Đăng nhập SSC</div>
            <button className="fbtn" disabled={agent !== "ok" || opening || busy} onClick={openSsc}>
              {opening ? "Đang mở..." : loggedIn ? "Mở lại cửa sổ SSC" : "Mở SSC & đăng nhập"}
            </button>
            <div style={{ fontSize: 12.5, marginTop: 6, color: loggedIn ? "#2f6b1a" : "var(--text-600)" }}>
              {agent !== "ok" ? "Chờ EHO Agent..." : loggedIn ? "✅ Đã đăng nhập SSC" : ssc.driver ? "Chờ anh/chị đăng nhập trong cửa sổ SSC..." : "Chưa mở SSC"}
            </div>
          </div>
          <div>
            <div style={lbl}>Bước 2 — Tạo ticket</div>
            <button className="login-btn" style={{ width: "auto", padding: "9px 22px", opacity: loggedIn && !busy && ids.length ? 1 : 0.5 }} disabled={!loggedIn || busy || !ids.length} onClick={runCreate}>
              {phase === "preparing" ? "Đang chuẩn bị..." : phase === "running" ? "Đang tạo..." : `🎫 Tạo ticket cho ${ids.length} shop đã chọn`}
            </button>
            {phase === "running" && <button className="fbtn" style={{ marginLeft: 8, color: "var(--danger)" }} onClick={stop}>Dừng</button>}
          </div>
        </div>

        {msg && (
          <div style={{ marginTop: 12, border: "1px solid", borderColor: msg.type === "ok" ? "#4C9A2A" : "var(--danger)", color: msg.type === "ok" ? "#2f6b1a" : "var(--danger)", borderRadius: 8, padding: "8px 12px", fontSize: 13, lineHeight: 1.6 }}>{msg.text}</div>
        )}

        {prog && total > 0 && (
          <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.7 }}>
            <div style={{ height: 8, background: "var(--bg)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
              <div style={{ width: `${Math.min(100, (done / total) * 100)}%`, height: "100%", background: "#2F6FED", transition: "width .4s" }} />
            </div>
            <div>
              {phase === "done" ? <b>{prog.cancelled ? "Đã dừng." : "Hoàn tất."}</b> : <>Đang xử lý shop <b>{prog.current || "..."}</b> ({prog.index || 0}/{total})</>}
              {" · "}Đã tạo <b>{(prog.created || 0).toLocaleString("vi-VN")}</b>
              {prog.failed > 0 && <> · Lỗi <b style={{ color: "var(--danger)" }}>{prog.failed}</b></>}
              {prog.verify > 0 && <> · Cần xác minh <b style={{ color: "#8a5a00" }}>{prog.verify}</b></>}
              {prog.skipped > 0 && <> · Bỏ qua {prog.skipped}</>}
              {" · "}{fmtSec(prog.elapsedSec || 0)}
            </div>
            {phase === "running" && <div style={{ fontSize: 12, color: "var(--text-400)" }}>Giữ nguyên popup này và cửa sổ SSC trong lúc tạo (agent gọi thẳng API của SSC, khoảng vài giây mỗi shop).</div>}
          </div>
        )}

        {fails.length > 0 && (
          <div style={{ marginTop: 12, maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
            <table style={{ fontSize: 12.5, width: "100%" }}>
              <thead><tr><th>Shop</th><th>Kết quả</th><th style={{ textAlign: "left" }}>Chi tiết</th></tr></thead>
              <tbody>
                {fails.map((r, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: "nowrap" }}>{r.ma_shop}</td>
                    <td style={{ whiteSpace: "nowrap", color: r.status === "loi" ? "var(--danger)" : "#8a5a00" }}>{STATUS_TXT[r.status] || r.status}</td>
                    <td style={{ textAlign: "left" }}>{r.error_message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 12, color: "var(--text-600)", padding: "6px 10px" }}>
              Shop <b>Lỗi</b>: bấm Tạo ticket lần nữa để chạy lại. Shop <b>Cần xác minh</b>: ticket có thể đã tạo trên SSC — kiểm tra rồi dán link ở cột Ticket thông báo (không tự tạo lại để tránh trùng).
            </div>
          </div>
        )}
        {phase === "done" && okCount > 0 && <div style={{ marginTop: 10, color: "#2f6b1a", fontSize: 13 }}>✅ Đã ghi link {okCount} ticket lên hệ thống.</div>}
      </div>
    </div>
  );
}

const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-600)", marginBottom: 6, textTransform: "uppercase" };
const overlay = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px 16px", overflowY: "auto" };
const box = { background: "var(--card, #fff)", borderRadius: 12, padding: "18px 20px", width: "min(980px, 100%)", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" };
