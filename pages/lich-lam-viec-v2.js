import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { getUser } from "../lib/api";
import {
  llv2BridgeLogin,
  llv2GetShops, llv2GetCandidates, llv2GetScheduledToday,
  llv2Schedule, llv2Reschedule, llv2SetClass,
  llv2UploadDanhSach, llv2DownloadDanhSachUrl, llv2UploadQuota,
} from "../lib/llv2Api";

const ADMIN_ROLES = ["admin", "super_admin"];

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
const STATUS_LABELS = {
  cho_chia: "Chờ chia lịch", cho_den_han: "Chờ đến kỳ", qua_han_chia: "Quá hạn chia lịch",
  sap_kiem: "Sắp đến kỳ kiểm", dang_kiem: "Đang trong kỳ kiểm", da_doi_lich: "Đã dời lịch",
  cho_xac_nhan_doi_lich: "Chờ chia lại (đã dời lịch)", cho_chia_lai: "Chờ chia lại",
  ngung_theo_doi: "Ngừng theo dõi", da_kiem: "Đã kiểm", da_kiem_lich_su: "Đã kiểm (lịch sử)",
  da_chia: "Đã chia lịch", da_huy: "Đã huỷ",
};
const statusLabel = (code) => STATUS_LABELS[code] || code || "—";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normSearch(s) {
  return String(s == null ? "" : s).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

// Hook filter theo cột dùng chung cho mọi bảng — mỗi field 1 ô lọc nhỏ ngay
// trong header row (chứa text), khớp kiểu "contains", không phân biệt hoa/thường/dấu.
function useColumnFilters() {
  const [filters, setFilters] = useState({});
  const setFilter = (field, value) => setFilters((f) => ({ ...f, [field]: value }));
  const clearFilters = () => setFilters({});
  const applyFilters = (rows, getters) => {
    const active = Object.entries(filters).filter(([, v]) => v && v.trim());
    if (!active.length) return rows;
    return rows.filter((r) => active.every(([field, val]) => {
      const raw = getters[field] ? getters[field](r) : r[field];
      return normSearch(raw).includes(normSearch(val));
    }));
  };
  const hasActive = Object.values(filters).some((v) => v && v.trim());
  return { filters, setFilter, clearFilters, applyFilters, hasActive };
}

function FilterTh({ label, value, onChange, align, minWidth }) {
  return (
    <th style={{ textAlign: align || "center", minWidth }}>
      <div style={{ marginBottom: 5 }}>{label}</div>
      <input
        className="finput"
        style={{ width: "100%", padding: "4px 7px", fontSize: 11, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}
        placeholder="Lọc..."
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </th>
  );
}

export default function LichLamViecV2Page() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [bridgeError, setBridgeError] = useState("");

  const [group, setGroup] = useState("long_chau");
  const [view, setView] = useState("schedule"); // list | schedule | today
  const [shops, setShops] = useState(null);
  const [candidates, setCandidates] = useState(null);
  const [scheduledToday, setScheduledToday] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Không tự đăng nhập riêng — dùng chung phiên web, chỉ admin/super_admin
  // mới được bridge sang tài khoản app1_ nội bộ để gọi API Phân công KSNB kiểm kê.
  useEffect(() => {
    const me = getUser();
    if (!me || !ADMIN_ROLES.includes(me.role)) {
      router.replace("/");
      return;
    }
    llv2BridgeLogin()
      .then(() => setChecked(true))
      .catch((e) => setBridgeError(e.message || "Không kết nối được chức năng Phân công KSNB kiểm kê"));
  }, []);

  useEffect(() => {
    if (checked) reload();
  }, [checked, group, view]);

  function reload() {
    setLoading(true);
    setError("");
    const done = () => setLoading(false);
    if (view === "list") {
      llv2GetShops(group).then(setShops).catch((e) => setError(e.message)).finally(done);
    } else if (view === "schedule") {
      llv2GetCandidates(group).then(setCandidates).catch((e) => setError(e.message)).finally(done);
    } else if (view === "today") {
      llv2GetScheduledToday(group).then(setScheduledToday).catch((e) => setError(e.message)).finally(done);
    }
  }

  if (bridgeError) {
    return (
      <Layout crumb="Phân công KSNB kiểm kê">
        <div className="placeholder-box">Không vào được chức năng này: {bridgeError}</div>
      </Layout>
    );
  }
  if (!checked) return null;

  return (
    <Layout crumb="Phân công KSNB kiểm kê (Phân công & Quản lý)">
      <div className="llv-page">
        <div className="page-head">
          <h1>Phân công KSNB kiểm kê — Chia lịch / Dời lịch / Phân loại shop</h1>
          <p>Đang migrate từ hệ cũ (Cloudflare Worker) — chỉ admin xem được mục này.</p>
        </div>

        <UploadDanhSachBar onDone={reload} />

        <div className="month-tabs">
          <div className={`month-tab ${group === "long_chau" ? "active" : ""}`} onClick={() => setGroup("long_chau")}>Long Châu</div>
          <div className={`month-tab ${group === "vaccine" ? "active" : ""}`} onClick={() => setGroup("vaccine")}>Vaccine</div>
        </div>

        <div className="month-tabs">
          <div className={`month-tab ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}>📋 Danh sách shop</div>
          <div className={`month-tab ${view === "schedule" ? "active" : ""}`} onClick={() => setView("schedule")}>🗓️ Cần chia lịch</div>
          <div className={`month-tab ${view === "today" ? "active" : ""}`} onClick={() => setView("today")}>📌 Shop đã chia hôm nay</div>
        </div>

        {error && <div className="placeholder-box" style={{ marginBottom: 16 }}>Lỗi: {error}</div>}
        {loading && <div style={{ fontSize: 13, color: "var(--text-600)", marginBottom: 12 }}><span className="tiny-spinner" /> Đang tải...</div>}

        {view === "list" && shops && <ShopListView data={shops} onReload={reload} />}
        {view === "schedule" && candidates && <ScheduleView data={candidates} group={group} onDone={reload} />}
        {view === "today" && scheduledToday && <TodayScheduledView data={scheduledToday} onDone={reload} />}

        <style jsx global>{`
          .llv-page .llv-scroll { overflow: auto; }
          .llv-page .llv-scroll table thead th {
            position: sticky;
            top: 0;
            z-index: 3;
            background: #eaf1fc;
          }
        `}</style>
      </div>
    </Layout>
  );
}

function Pill({ children, kind }) {
  return <span className={`pill ${kind || ""}`}>{children}</span>;
}

function UploadDanhSachBar({ onDone }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  async function onPickFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // cho phép chọn lại đúng file lần sau
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await llv2UploadDanhSach(file);
      const skip = r.shop_skipped_missing_open_date
        ? ` ⚠️ Bỏ qua ${r.shop_skipped_missing_open_date} shop thiếu Ngày mở bán (VD: ${r.skipped_shop_codes.slice(0, 10).join(", ")}${r.shop_skipped_missing_open_date > 10 ? "..." : ""}) — bổ sung Ngày mở bán rồi upload lại nếu cần đưa vào hệ thống.`
        : "";
      setMsg({
        ok: true,
        text: `✅ Đã xử lý ${r.total_rows} dòng — thêm mới ${r.shop_added} shop, cập nhật kết quả kiểm gần nhất cho ${r.report_rows_updated} shop. File trạng thái trên server đã được ghi lại.${skip}`,
      });
      onDone && onDone();
    } catch (err) {
      setMsg({ ok: false, text: "❌ " + err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <label className="fbtn" style={{ cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Đang xử lý..." : "⬆️ Upload danh sách shop (Excel)"}
          <input type="file" accept=".xlsx" onChange={onPickFile} disabled={busy} style={{ display: "none" }} />
        </label>
        <a className="fbtn" href={llv2DownloadDanhSachUrl()} target="_blank" rel="noreferrer">⬇️ Tải file trạng thái hiện tại</a>
        <span style={{ fontSize: 12, color: "var(--text-600)" }}>
          Upload lại cùng file mẫu (cột Mã Shop, Tên Shop, Vùng...) để thêm shop mới hoặc cập nhật kết quả kiểm gần nhất — không ảnh hưởng lịch đang chia.
        </span>
        {msg && <div style={{ width: "100%", fontSize: 12.5, color: msg.ok ? "#3E7A2A" : "var(--danger)" }}>{msg.text}</div>}
      </div>
    </div>
  );
}

function ShopListView({ data, onReload }) {
  const { filters, setFilter, applyFilters, hasActive, clearFilters } = useColumnFilters();
  const [editing, setEditing] = useState(null); // ma_shop đang sửa phân loại
  const [classForm, setClassForm] = useState({ phan_loai: "Định kỳ", ngay_can_kiem: "", ly_do_xin_kiem_ke: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const rows = applyFilters(data.rows || [], {
    trang_thai: (r) => statusLabel(r.display_status),
    ngay_can_kiem: (r) => r.next_due_date || r.ngay_can_kiem,
    ksnb: (r) => r.last_ksnb || r.ksnb,
  });

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
          <h3>Danh sách shop ({rows.length}/{(data.rows || []).length})</h3>
          {hasActive && <button className="fbtn" onClick={clearFilters}>Xóa bộ lọc</button>}
        </div>
        <div className="card-body llv-scroll" style={{ padding: 0, maxHeight: 560 }}>
          {msg && <div style={{ padding: "8px 20px", fontSize: 12.5 }}>{msg}</div>}
          <table>
            <thead>
              <tr>
                <FilterTh label="Mã shop" align="left" value={filters.ma_shop} onChange={(v) => setFilter("ma_shop", v)} />
                <FilterTh label="Tên shop" align="left" value={filters.ten_shop} onChange={(v) => setFilter("ten_shop", v)} minWidth={220} />
                <FilterTh label="Phân loại" value={filters.phan_loai} onChange={(v) => setFilter("phan_loai", v)} />
                <FilterTh label="Trạng thái" value={filters.trang_thai} onChange={(v) => setFilter("trang_thai", v)} />
                <FilterTh label="Ngày cần kiểm" value={filters.ngay_can_kiem} onChange={(v) => setFilter("ngay_can_kiem", v)} />
                <FilterTh label="KSNB gần nhất" value={filters.ksnb} onChange={(v) => setFilter("ksnb", v)} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ma_shop}>
                  <td style={{ textAlign: "left", fontVariantNumeric: "tabular-nums" }}>{r.ma_shop}</td>
                  <td style={{ textAlign: "left" }}>{r.ten_shop}</td>
                  <td><Pill kind={PHAN_LOAI_PILL[r.phan_loai]}>{r.phan_loai || "—"}</Pill></td>
                  <td style={{ fontSize: 11.5 }}>{statusLabel(r.display_status)}</td>
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
  const { filters, setFilter, applyFilters, hasActive, clearFilters } = useColumnFilters();
  const [selected, setSelected] = useState(new Set());
  const [quotas, setQuotas] = useState([{ ksnb: "", so_luong: 1 }]);
  const [ngayKiem, setNgayKiem] = useState(todayIso());
  const [hinhThuc, setHinhThuc] = useState("Online");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [quotaBusy, setQuotaBusy] = useState(false);
  const [quotaMsg, setQuotaMsg] = useState("");

  const rows = applyFilters(data.rows || [], {
    qua_han: (r) => (r.is_overdue ? "Quá hạn" : ""),
  });

  const quotaTotal = quotas.reduce((s, q) => s + (Number(q.so_luong) || 0), 0);

  function toggle(ma) {
    const next = new Set(selected);
    next.has(ma) ? next.delete(ma) : next.add(ma);
    setSelected(next);
  }

  async function onUploadQuota(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setQuotaBusy(true);
    setQuotaMsg("");
    try {
      const r = await llv2UploadQuota(file);
      setQuotas(r.quotas.map((q) => ({ ksnb: q.ksnb, so_luong: q.so_luong })));
      setQuotaMsg(`✅ Đã điền ${r.quotas.length} KSNB từ file`);
    } catch (e2) {
      setQuotaMsg("❌ " + e2.message);
    } finally {
      setQuotaBusy(false);
    }
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
        <div className="card-head">
          <h3>Shop chờ chia ({rows.length}/{data.rows.length}) — ngày quét {data.scan_date}</h3>
          {hasActive && <button className="fbtn" onClick={clearFilters}>Xóa bộ lọc</button>}
        </div>
        <div className="card-body llv-scroll" style={{ padding: 0, maxHeight: 500 }}>
          <table>
            <thead>
              <tr>
                <th></th>
                <FilterTh label="Mã shop" align="left" value={filters.ma_shop} onChange={(v) => setFilter("ma_shop", v)} />
                <FilterTh label="Tên shop" align="left" value={filters.ten_shop} onChange={(v) => setFilter("ten_shop", v)} minWidth={200} />
                <FilterTh label="Phân loại" value={filters.phan_loai} onChange={(v) => setFilter("phan_loai", v)} />
                <FilterTh label="Quá hạn" value={filters.qua_han} onChange={(v) => setFilter("qua_han", v)} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
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
        <div className="card-head"><h3>Chia lịch — đã tick đích danh {selected.size} shop</h3></div>
        <div className="card-body">
          <div className="field"><label>Ngày kiểm</label><input type="date" className="finput" style={{ width: "100%" }} value={ngayKiem} onChange={(e) => setNgayKiem(e.target.value)} /></div>
          <div className="field">
            <label>Hình thức</label>
            <select className="finput" style={{ width: "100%" }} value={hinhThuc} onChange={(e) => setHinhThuc(e.target.value)}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label className="flabel" style={{ margin: 0 }}>Hạn mức theo KSNB (tổng {quotaTotal})</label>
            <label className="fbtn" style={{ cursor: quotaBusy ? "default" : "pointer", fontSize: 11.5, opacity: quotaBusy ? 0.6 : 1 }}>
              {quotaBusy ? "Đang đọc..." : "⬆️ Upload danh sách KSNB"}
              <input type="file" accept=".xlsx" onChange={onUploadQuota} disabled={quotaBusy} style={{ display: "none" }} />
            </label>
          </div>
          {quotaMsg && <div style={{ fontSize: 11.5, marginBottom: 8, color: quotaMsg.startsWith("✅") ? "#3E7A2A" : "var(--danger)" }}>{quotaMsg}</div>}
          {quotas.map((q, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input className="finput" placeholder="Tên KSNB" style={{ flex: 1 }} value={q.ksnb}
                onChange={(e) => setQuotas(quotas.map((x, j) => j === i ? { ...x, ksnb: e.target.value } : x))} />
              <input className="finput" type="number" min="0" style={{ width: 70 }} value={q.so_luong}
                onChange={(e) => setQuotas(quotas.map((x, j) => j === i ? { ...x, so_luong: e.target.value } : x))} />
              <button className="fbtn" onClick={() => setQuotas(quotas.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button className="fbtn" onClick={() => setQuotas([...quotas, { ksnb: "", so_luong: 1 }])}>+ Thêm KSNB</button>

          <div style={{ fontSize: 11.5, color: "var(--text-600)", marginTop: 12, lineHeight: 1.5 }}>
            {selected.size === 0
              ? "Chưa tick shop nào → hệ thống tự random chọn đủ số lượng trong danh sách \"cần chia lịch\" (ưu tiên shop Xin kiểm kê/Đóng cửa/Vi phạm trước)."
              : selected.size < quotaTotal
                ? `Đã tick ${selected.size}/${quotaTotal} shop → ${quotaTotal - selected.size} shop còn lại sẽ tự random bổ sung (ưu tiên shop khẩn trước).`
                : "Đã tick đủ/thừa số lượng → chia đúng các shop đã tick."}
          </div>

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

function TodayScheduledView({ data, onDone }) {
  const { filters, setFilter, applyFilters, hasActive, clearFilters } = useColumnFilters();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ngay_can_kiem: "", ly_do: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const rows = applyFilters(data.rows || [], {
    trang_thai: (r) => statusLabel(r.display_status),
  });

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
      <div className="card-head">
        <h3>Shop đã chia hôm nay ({rows.length}/{data.rows.length}) — {data.date}</h3>
        {hasActive && <button className="fbtn" onClick={clearFilters}>Xóa bộ lọc</button>}
      </div>
      <div className="card-body llv-scroll" style={{ padding: 0, maxHeight: 600 }}>
        {msg && <div style={{ padding: "8px 20px", fontSize: 12.5 }}>{msg}</div>}
        <table>
          <thead>
            <tr>
              <FilterTh label="Mã shop" align="left" value={filters.ma_shop} onChange={(v) => setFilter("ma_shop", v)} minWidth={200} />
              <FilterTh label="KSNB phụ trách" value={filters.ksnb} onChange={(v) => setFilter("ksnb", v)} />
              <FilterTh label="Ngày kiểm" value={filters.ngay_kiem} onChange={(v) => setFilter("ngay_kiem", v)} />
              <FilterTh label="Hình thức" value={filters.hinh_thuc} onChange={(v) => setFilter("hinh_thuc", v)} />
              <FilterTh label="Trạng thái" value={filters.trang_thai} onChange={(v) => setFilter("trang_thai", v)} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ textAlign: "left" }}>{r.ma_shop} — {r.ten_shop} {r.replacement_note && <Pill kind="warn">{r.replacement_note}</Pill>}</td>
                <td>{r.ksnb}</td>
                <td>{r.ngay_kiem}</td>
                <td>{r.hinh_thuc}</td>
                <td style={{ fontSize: 11.5 }}>{statusLabel(r.display_status)}</td>
                <td>
                  <button className="fbtn" onClick={() => { setEditing(r.id); setForm({ ngay_can_kiem: "", ly_do: "" }); setMsg(""); }}>Dời lịch</button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} style={{ color: "var(--text-400)", padding: 24 }}>Chưa có shop nào được chia hôm nay.</td></tr>
            )}
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
