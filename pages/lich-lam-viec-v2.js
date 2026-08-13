import { useEffect, useState } from "react";
import {
  llv2GetToken, llv2GetUser, llv2Login, llv2Logout,
  llv2GetShops, llv2GetCandidates, llv2GetMyShops,
  llv2Schedule, llv2Reschedule, llv2SetClass,
} from "../lib/llv2Api";

const PHAN_LOAI_PILL = {
  "Xin kiểm kê": "danger",
  "Đóng cửa": "warn",
  "Vi phạm": "danger",
  "Shop mới": "ok",
  "Định kỳ": "ok",
};
const CLASS_OPTIONS = ["Xin kiểm kê", "Đóng cửa", "Vi phạm", "Shop mới", "Định kỳ"];
const REQUEST_REASONS = ["Rà soát hàng hóa", "Luân chuyển nhân sự", "Nhân sự nghỉ việc"];
const METHODS = ["Online", "Trực tiếp", "Thanh lý"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function LichLamViecV2Page() {
  const [checked, setChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const [group, setGroup] = useState("long_chau");
  const [view, setView] = useState("schedule"); // list | schedule | myshops — mặc định vào thẳng Chia lịch theo yêu cầu hiện tại
  const [shops, setShops] = useState(null);
  const [candidates, setCandidates] = useState(null);
  const [myShops, setMyShops] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setUser(llv2GetUser());
    setChecked(true);
  }, []);

  useEffect(() => {
    if (user) reload();
  }, [user, group, view]);

  function reload() {
    setLoading(true);
    setError("");
    const done = () => setLoading(false);
    if (view === "list") {
      llv2GetShops(group).then(setShops).catch((e) => setError(e.message)).finally(done);
    } else if (view === "schedule") {
      llv2GetCandidates(group).then(setCandidates).catch((e) => setError(e.message)).finally(done);
    } else if (view === "myshops") {
      llv2GetMyShops().then(setMyShops).catch((e) => setError(e.message)).finally(done);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    try {
      const { user: u } = await llv2Login(loginForm.username, loginForm.password);
      setUser(u);
    } catch (err) {
      setLoginError(err.message || "Đăng nhập thất bại");
    } finally {
      setLoginBusy(false);
    }
  }

  function handleLogout() {
    llv2Logout();
    setUser(null);
  }

  if (!checked) return null;

  if (!user) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-logo"><div className="logo-text">FPT Retail<br /><small style={{ fontWeight: 500, opacity: 0.7 }}>Phân công &amp; Quản lý — Lịch làm việc v2</small></div></div>
          <div className="login-title">Đăng nhập tài khoản App</div>
          <div className="login-sub">Tài khoản app1_ (riêng biệt với web KSNB) — đăng nhập bằng Username, không phải email.</div>
          <form onSubmit={handleLogin}>
            <div className="field">
              <label>Username</label>
              <input value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} placeholder="Admin" />
            </div>
            <div className="field">
              <label>Mật khẩu</label>
              <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
            </div>
            {loginError && <div className="login-error">{loginError}</div>}
            <button className="login-btn" disabled={loginBusy}>{loginBusy ? "Đang đăng nhập..." : "Đăng nhập"}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div className="topbar" style={{ position: "static" }}>
        <div className="crumb-current">Lịch làm việc v2 — Phân công &amp; Quản lý</div>
        <div className="tb-user">
          <div className="avatar">{(user.display_name || user.username || "?").slice(0, 1).toUpperCase()}</div>
          {user.display_name || user.username} ({user.role})
          <button className="logout-btn" onClick={handleLogout}>Đăng xuất</button>
        </div>
      </div>

      <div className="content">
        <div className="page-head">
          <h1>Lịch làm việc — Chia lịch / Dời lịch / Phân loại shop</h1>
          <p>Đang migrate từ hệ cũ (Cloudflare Worker) — dữ liệu vaccine đã nạp thật từ file bàn giao 13/08.</p>
        </div>

        <div className="month-tabs">
          <div className={`month-tab ${group === "long_chau" ? "active" : ""}`} onClick={() => setGroup("long_chau")}>Long Châu</div>
          <div className={`month-tab ${group === "vaccine" ? "active" : ""}`} onClick={() => setGroup("vaccine")}>Vaccine</div>
        </div>

        <div className="month-tabs">
          <div className={`month-tab ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}>📋 Danh sách shop</div>
          <div className={`month-tab ${view === "schedule" ? "active" : ""}`} onClick={() => setView("schedule")}>🗓️ Cần chia lịch</div>
          <div className={`month-tab ${view === "myshops" ? "active" : ""}`} onClick={() => setView("myshops")}>👤 Việc của tôi</div>
        </div>

        {error && <div className="placeholder-box" style={{ marginBottom: 16 }}>Lỗi: {error}</div>}
        {loading && <div style={{ fontSize: 13, color: "var(--text-600)", marginBottom: 12 }}><span className="tiny-spinner" /> Đang tải...</div>}

        {view === "list" && shops && <ShopListView data={shops} onReload={reload} />}
        {view === "schedule" && candidates && <ScheduleView data={candidates} group={group} onDone={reload} />}
        {view === "myshops" && myShops && <MyShopsView data={myShops} onDone={reload} />}
      </div>
    </div>
  );
}

function Pill({ children, kind }) {
  return <span className={`pill ${kind || ""}`}>{children}</span>;
}

function ShopListView({ data, onReload }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // ma_shop đang sửa phân loại
  const [classForm, setClassForm] = useState({ phan_loai: "Định kỳ", ngay_can_kiem: "", ly_do_xin_kiem_ke: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const rows = (data.rows || []).filter((r) =>
    !q || r.ma_shop.includes(q) || (r.ten_shop || "").toLowerCase().includes(q.toLowerCase())
  );

  async function submitClass(maShop) {
    setBusy(true);
    setMsg("");
    try {
      await llv2SetClass({ ma_shop: maShop, ...classForm });
      setMsg("✅ Đã cập nhật phân loại");
      setEditing(null);
      onReload();
    } catch (e) {
      setMsg("❌ " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="accent b" /><span className="tag">Tổng shop</span><div className="val">{data.summary.shop_count}</div></div>
        <div className="kpi-card"><div className="accent g" /><span className="tag">Đang chờ chia</span><div className="val">{(data.rows || []).filter(r => r.display_status === "cho_chia").length}</div></div>
        <div className="kpi-card"><div className="accent o" /><span className="tag">Quá hạn chia</span><div className="val">{(data.rows || []).filter(r => r.display_status === "qua_han_chia").length}</div></div>
        <div className="kpi-card"><div className="accent r" /><span className="tag">Ngừng theo dõi</span><div className="val">{(data.rows || []).filter(r => r.display_status === "ngung_theo_doi").length}</div></div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Danh sách shop ({rows.length})</h3>
          <input className="finput" placeholder="Tìm mã/tên shop..." value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: "auto", maxHeight: 560, overflowY: "auto" }}>
          {msg && <div style={{ padding: "8px 20px", fontSize: 12.5 }}>{msg}</div>}
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Mã shop</th><th style={{ textAlign: "left" }}>Tên shop</th>
                <th>Phân loại</th><th>Trạng thái</th><th>Ngày cần kiểm</th><th>KSNB gần nhất</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ma_shop}>
                  <td style={{ textAlign: "left", fontVariantNumeric: "tabular-nums" }}>{r.ma_shop}</td>
                  <td style={{ textAlign: "left" }}>{r.ten_shop}</td>
                  <td><Pill kind={PHAN_LOAI_PILL[r.phan_loai]}>{r.phan_loai || "—"}</Pill></td>
                  <td style={{ fontSize: 11.5 }}>{r.display_status}</td>
                  <td>{r.next_due_date || r.ngay_can_kiem || "—"}</td>
                  <td>{r.last_ksnb || r.ksnb || "—"}</td>
                  <td>
                    <button className="fbtn" onClick={() => { setEditing(r.ma_shop); setClassForm({ phan_loai: r.phan_loai || "Định kỳ", ngay_can_kiem: "", ly_do_xin_kiem_ke: "" }); setMsg(""); }}>Sửa phân loại</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="card">
          <div className="card-head"><h3>Đổi phân loại — shop {editing}</h3></div>
          <div className="card-body" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label className="flabel">Phân loại</label>
              <select className="finput" value={classForm.phan_loai} onChange={(e) => setClassForm({ ...classForm, phan_loai: e.target.value })}>
                {CLASS_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {classForm.phan_loai === "Xin kiểm kê" && (
              <div>
                <label className="flabel">Nội dung xin kiểm kê</label>
                <select className="finput" value={classForm.ly_do_xin_kiem_ke} onChange={(e) => setClassForm({ ...classForm, ly_do_xin_kiem_ke: e.target.value })}>
                  <option value="">— chọn —</option>
                  {REQUEST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            {classForm.phan_loai !== "Định kỳ" && (
              <div>
                <label className="flabel">Ngày cần kiểm</label>
                <input type="date" className="finput" value={classForm.ngay_can_kiem} onChange={(e) => setClassForm({ ...classForm, ngay_can_kiem: e.target.value })} />
              </div>
            )}
            <button className="login-btn" style={{ width: "auto", padding: "9px 20px" }} disabled={busy} onClick={() => submitClass(editing)}>{busy ? "Đang lưu..." : "Lưu"}</button>
            <button className="fbtn" onClick={() => setEditing(null)}>Hủy</button>
          </div>
        </div>
      )}
    </>
  );
}

function ScheduleView({ data, group, onDone }) {
  const [selected, setSelected] = useState(new Set());
  const [quotas, setQuotas] = useState([{ ksnb: "", so_luong: 1 }]);
  const [ngayKiem, setNgayKiem] = useState(todayIso());
  const [hinhThuc, setHinhThuc] = useState("Online");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  function toggle(ma) {
    const next = new Set(selected);
    next.has(ma) ? next.delete(ma) : next.add(ma);
    setSelected(next);
  }

  async function submit() {
    setBusy(true);
    setErr("");
    setResult(null);
    try {
      const cleanQuotas = quotas.filter((q) => q.ksnb.trim() && Number(q.so_luong) > 0);
      const r = await llv2Schedule({
        shop_group: group,
        ngay_kiem: ngayKiem,
        hinh_thuc: hinhThuc,
        quotas: cleanQuotas,
        selected_shops: [...selected],
        manual_selection: selected.size > 0,
      });
      setResult(r);
      setSelected(new Set());
      onDone();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="two-col">
      <div className="card">
        <div className="card-head"><h3>Shop chờ chia ({data.rows.length}) — ngày quét {data.scan_date}</h3></div>
        <div className="card-body" style={{ padding: 0, maxHeight: 500, overflowY: "auto" }}>
          <table>
            <thead><tr><th></th><th style={{ textAlign: "left" }}>Mã shop</th><th style={{ textAlign: "left" }}>Tên shop</th><th>Phân loại</th><th>Quá hạn</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.ma_shop} onClick={() => toggle(r.ma_shop)} style={{ cursor: "pointer", background: selected.has(r.ma_shop) ? "var(--bg)" : "" }}>
                  <td><input type="checkbox" checked={selected.has(r.ma_shop)} onChange={() => toggle(r.ma_shop)} /></td>
                  <td style={{ textAlign: "left" }}>{r.ma_shop}</td>
                  <td style={{ textAlign: "left" }}>{r.ten_shop}</td>
                  <td><Pill kind={PHAN_LOAI_PILL[r.phan_loai]}>{r.phan_loai}</Pill></td>
                  <td>{r.is_overdue ? <Pill kind="warn">Quá hạn</Pill> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Chia lịch — đã chọn {selected.size} shop</h3></div>
        <div className="card-body">
          <div className="field"><label>Ngày kiểm</label><input type="date" className="finput" style={{ width: "100%" }} value={ngayKiem} onChange={(e) => setNgayKiem(e.target.value)} /></div>
          <div className="field">
            <label>Hình thức</label>
            <select className="finput" style={{ width: "100%" }} value={hinhThuc} onChange={(e) => setHinhThuc(e.target.value)}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <label className="flabel">Hạn mức theo KSNB</label>
          {quotas.map((q, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input className="finput" placeholder="Tên KSNB" style={{ flex: 1 }} value={q.ksnb}
                onChange={(e) => setQuotas(quotas.map((x, j) => j === i ? { ...x, ksnb: e.target.value } : x))} />
              <input className="finput" type="number" min="0" style={{ width: 70 }} value={q.so_luong}
                onChange={(e) => setQuotas(quotas.map((x, j) => j === i ? { ...x, so_luong: e.target.value } : x))} />
            </div>
          ))}
          <button className="fbtn" onClick={() => setQuotas([...quotas, { ksnb: "", so_luong: 1 }])}>+ Thêm KSNB</button>
          <div style={{ marginTop: 16 }}>
            <button className="login-btn" style={{ width: "auto", padding: "10px 24px" }} disabled={busy} onClick={submit}>{busy ? "Đang chia..." : "Chia lịch"}</button>
          </div>
          {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
          {result && <div style={{ color: "#3E7A2A", fontSize: 12.5, marginTop: 10 }}>✅ Đã chia {result.created} shop — đợt {result.batch_id}</div>}
        </div>
      </div>
    </div>
  );
}

function MyShopsView({ data, onDone }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ngay_can_kiem: "", ly_do: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(id) {
    setBusy(true);
    try {
      await llv2Reschedule({ id, ...form });
      setMsg("✅ Đã dời lịch");
      setEditing(null);
      onDone();
    } catch (e) {
      setMsg("❌ " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head"><h3>Kỳ kiểm được giao cho {data.ksnb || "(chưa xác định KSNB)"} — {data.rows.length} kỳ</h3></div>
      <div className="card-body" style={{ padding: 0 }}>
        {msg && <div style={{ padding: "8px 20px", fontSize: 12.5 }}>{msg}</div>}
        <table>
          <thead><tr><th style={{ textAlign: "left" }}>Mã shop</th><th>Ngày kiểm</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td style={{ textAlign: "left" }}>{r.ma_shop} {r.replacement_note && <Pill kind="warn">{r.replacement_note}</Pill>}</td>
                <td>{r.ngay_kiem}</td>
                <td>{r.display_status}</td>
                <td>
                  <button className="fbtn" onClick={() => { setEditing(r.id); setForm({ ngay_can_kiem: "", ly_do: "" }); setMsg(""); }}>Dời lịch</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {editing && (
          <div style={{ padding: 16, borderTop: "1px solid var(--border)", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div><label className="flabel">Ngày cần kiểm mới</label><input type="date" className="finput" value={form.ngay_can_kiem} onChange={(e) => setForm({ ...form, ngay_can_kiem: e.target.value })} /></div>
            <div><label className="flabel">Lý do</label><input className="finput" style={{ width: 260 }} value={form.ly_do} onChange={(e) => setForm({ ...form, ly_do: e.target.value })} /></div>
            <button className="login-btn" style={{ width: "auto", padding: "9px 20px" }} disabled={busy} onClick={() => submit(editing)}>{busy ? "Đang lưu..." : "Xác nhận dời"}</button>
            <button className="fbtn" onClick={() => setEditing(null)}>Hủy</button>
          </div>
        )}
      </div>
    </div>
  );
}
