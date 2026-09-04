import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { getUser, listKiemKeStaff, getLlvThongKeThang, downloadLlvThongKeThang, leaveDaysByDate } from "../lib/api";
import { useAllowedKeys } from "../lib/permissions";
import {
  llv2BridgeLogin,
  llv2GetShops, llv2GetCandidates, llv2GetScheduledToday,
  llv2Schedule, llv2SetClass, llv2DeleteCycle,
  llv2UploadQuota,
  llv2BulkCreateTickets, llv2CreateDanhSachChia, llv2EhoAllShopAuditUrl,
  llv2ManualConfirmTicket,
} from "../lib/llv2Api";

const ADMIN_ROLES = ["admin", "super_admin"];
// Tab "Thống kê" (chốt 27/08) — mở thêm cho "editor", KHÔNG qua bridge
// app1_ (chỉ admin/super_admin bridge được, xem llv2Api.js) nên các tab
// còn lại (Danh sách shop/Cần chia lịch/Shop được chia) vẫn CHỈ admin.
const THONG_KE_ROLES = ["admin", "super_admin", "editor"];

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const PHAN_LOAI_PILL = {
  "Xin kiểm kê": "danger",
  "Đóng cửa": "warn",
  "Vi phạm": "danger",
  "Shop mới": "ok",
  "Định kỳ": "ok",
  "Dời lịch": "warn", // tự động gán sau khi bấm "Dời lịch" — không chọn tay được ở form Cập nhật phân loại
};
const CLASS_OPTIONS = ["Xin kiểm kê", "Đóng cửa", "Vi phạm", "Shop mới", "Định kỳ"];
const REQUEST_REASONS = ["Rà soát hàng hóa", "Luân chuyển nhân sự", "Nhân sự nghỉ việc"];
const METHODS = ["Online", "Trực tiếp", "Thanh lý"];
const STATUS_LABELS = {
  cho_chia: "Chờ chia lịch", cho_den_han: "Chờ đến kỳ", qua_han_chia: "Quá hạn chia lịch",
  sap_kiem: "Chuẩn bị kiểm kê", dang_kiem: "Đang trong kỳ kiểm", da_doi_lich: "Đã dời lịch",
  cho_xac_nhan_doi_lich: "Chờ chia lại (đã dời lịch)", cho_chia_lai: "Chờ chia lại",
  ngung_theo_doi: "Ngừng theo dõi", da_kiem: "Đã kiểm", da_kiem_lich_su: "Đã kiểm (lịch sử)",
  da_chia: "Đã chia lịch", da_huy: "Đã huỷ",
};
const statusLabel = (code) => STATUS_LABELS[code] || code || "—";

const JOB_STATUS_LABELS = {
  "": "Chưa tạo", cho_tao: "Đang chờ tạo", da_tao: "Đã tạo",
  loi: "Lỗi — cần kiểm tra", can_xac_minh: "Cần xác minh", da_huy: "Đã huỷ",
};
const JOB_STATUS_PILL = { da_tao: "ok", loi: "danger", can_xac_minh: "warn", cho_tao: "warn" };
// `onClickCanXacMinh` (chốt 04/09) — chỉ truyền ở đúng chỗ cần bấm được
// (bảng chính "Shop được chia"), bấm vào khi trạng thái "Cần xác minh" mở
// popup dán link ticket thật đã tự kiểm tra trên SSC.
function JobStatusBadge({ status, url, onClickCanXacMinh }) {
  const s = status || "";
  const kind = JOB_STATUS_PILL[s];
  const label = JOB_STATUS_LABELS[s] || s;
  if (url) return <a href={url} target="_blank" rel="noreferrer"><Pill kind={kind}>{label}</Pill></a>;
  if (s === "can_xac_minh" && onClickCanXacMinh) {
    return (
      <span onClick={onClickCanXacMinh} style={{ cursor: "pointer" }} title="Bấm để dán link ticket thật (nếu đã tự kiểm tra trên SSC)">
        <Pill kind={kind}>{label} ✏️</Pill>
      </span>
    );
  }
  return <Pill kind={kind}>{label}</Pill>;
}

// Màu riêng cho 3 nút thao tác ở tab "Shop được chia - Chuẩn bị kiểm kê" —
// cùng tông với .pill (nền nhạt + chữ đậm màu), khác nhau để dễ phân biệt
// nhanh: xanh dương = ticket SSC, cam = phiếu EHO, xanh lá = danh sách chia.
const ACTION_BTN_STYLES = {
  blue: { background: "#EAF1FB", borderColor: "var(--blue-accent)", color: "var(--navy-800)" },
  orange: { background: "#FFF1E1", borderColor: "var(--orange)", color: "var(--orange)" },
  green: { background: "#EAF6E5", borderColor: "#4C9A2A", color: "#3E7A2A" },
};

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

// `sortCol` (chốt 28/08) — thêm bấm-tiêu-đề-để-sắp-xếp CHO cột này bên
// cạnh ô lọc có sẵn, dùng chung state với `sortState`/`onSort` (xem
// useSort() bên dưới). Cột nào KHÔNG truyền sortCol thì không đổi gì
// (dùng lại cho 2 bảng "Cần chia lịch"/"Shop được chia hôm nay", chỉ tab
// "Danh sách shop" mới truyền các prop này).
function FilterTh({ label, value, onChange, align, minWidth, sortCol, sortState, onSort }) {
  const active = sortCol && sortState && sortState.key === sortCol;
  return (
    <th style={{ textAlign: align || "center", minWidth }}>
      <div
        style={{
          marginBottom: 5, cursor: sortCol ? "pointer" : undefined, userSelect: "none",
          display: "inline-block", padding: active ? "1px 6px" : undefined, borderRadius: active ? 4 : undefined,
          background: active ? (sortState.dir === "asc" ? "#EAF6E5" : "#FFF1E1") : undefined,
        }}
        onClick={sortCol ? () => onSort(sortCol) : undefined}
        title={sortCol ? "Bấm để sắp xếp" : undefined}
      >
        {label}
        {sortCol && (
          <span style={{ marginLeft: 4, fontSize: 10, opacity: active ? 1 : 0.5 }}>
            {active ? (sortState.dir === "asc" ? "▲" : "▼") : "⇅"}
          </span>
        )}
      </div>
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

// Bấm-tiêu-đề-để-sắp-xếp cho bảng KHÔNG có ô lọc (2 bảng ở tab "Thống
// kê") — cùng quy ước màu với FilterTh ở trên (xanh lá = A→Z/tăng dần,
// cam = Z→A/giảm dần).
function SortTh({ label, sortCol, sortState, onSort, align }) {
  const active = sortState.key === sortCol;
  return (
    <th
      onClick={() => onSort(sortCol)}
      style={{
        textAlign: align || "center", cursor: "pointer", userSelect: "none",
        background: active ? (sortState.dir === "asc" ? "#EAF6E5" : "#FFF1E1") : undefined,
      }}
      title="Bấm để sắp xếp"
    >
      {label}
      <span style={{ marginLeft: 4, fontSize: 10, opacity: active ? 1 : 0.5 }}>
        {active ? (sortState.dir === "asc" ? "▲" : "▼") : "⇅"}
      </span>
    </th>
  );
}

function useSort(defaultKey = null, defaultDir = "asc") {
  const [key, setKey] = useState(defaultKey);
  const [dir, setDir] = useState(defaultDir);
  function onSort(col) {
    if (key === col) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setKey(col); setDir("asc"); }
  }
  return { state: { key, dir }, onSort };
}

// So sánh chung — tự nhận biết số so số, còn lại so chuỗi (đủ dùng cho cả
// ngày dạng "YYYY-MM-DD", vì so chuỗi kiểu này vẫn đúng thứ tự thời gian).
function applySort(rows, sortState, getters) {
  const { key, dir } = sortState;
  if (!key) return rows;
  const getter = (getters && getters[key]) || ((r) => r[key]);
  const mul = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = getter(a);
    const vb = getter(b);
    const na = typeof va === "number" ? va : parseFloat(va);
    const nb = typeof vb === "number" ? vb : parseFloat(vb);
    const numeric = va !== "" && va != null && vb !== "" && vb != null && !isNaN(na) && !isNaN(nb);
    if (numeric) return (na - nb) * mul;
    return String(va ?? "").localeCompare(String(vb ?? ""), "vi") * mul;
  });
}

export default function LichLamViecPage() {
  const router = useRouter();
  const { can } = useAllowedKeys();
  const [checked, setChecked] = useState(false);
  const [bridgeError, setBridgeError] = useState("");
  const [myRole, setMyRole] = useState(null);
  const isAdminRole = ADMIN_ROLES.includes(myRole);

  const [group, setGroup] = useState("long_chau");
  const [view, setView] = useState("schedule"); // thong_ke | list | schedule | today
  const [shops, setShops] = useState(null);
  const [candidates, setCandidates] = useState(null);
  const [scheduledToday, setScheduledToday] = useState(null);
  const [thongKeMonth, setThongKeMonth] = useState(currentMonthStr());
  const [thongKeData, setThongKeData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Không tự đăng nhập riêng — dùng chung phiên web. CHỐT 27/08: tab
  // "Thống kê" mở thêm cho "editor" nhưng KHÔNG bridge sang app1_ (chỉ
  // admin/super_admin bridge được — bridge tạo AppUser role="admin" tức
  // toàn quyền hệ Phân công & Quản lý, cấp cho editor là sai hẳn ý định
  // "chỉ xem 1 tab thống kê"). Editor bỏ qua bridge, chỉ dùng được tab
  // "Thống kê" (gọi thẳng JWT web, xem getLlvThongKeThang).
  useEffect(() => {
    const me = getUser();
    if (!me || !THONG_KE_ROLES.includes(me.role)) {
      router.replace("/");
      return;
    }
    setMyRole(me.role);
    if (!ADMIN_ROLES.includes(me.role)) {
      setView("thong_ke");
      setChecked(true);
      return;
    }
    llv2BridgeLogin()
      .then(() => setChecked(true))
      .catch((e) => setBridgeError(e.message || "Không kết nối được chức năng Phân công KSNB kiểm kê"));
  }, []);

  useEffect(() => {
    if (checked) reload();
  }, [checked, group, view, thongKeMonth]);

  function reload() {
    setLoading(true);
    setError("");
    const done = () => setLoading(false);
    if (view === "thong_ke") {
      getLlvThongKeThang(group, thongKeMonth).then(setThongKeData).catch((e) => setError(e.message)).finally(done);
    } else if (view === "list") {
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
        </div>

        <div className="month-tabs">
          <div className={`month-tab ${group === "long_chau" ? "active" : ""}`} onClick={() => setGroup("long_chau")}>Long Châu</div>
          <div className={`month-tab ${group === "vaccine" ? "active" : ""}`} onClick={() => setGroup("vaccine")}>Vaccine</div>
        </div>

        <div className="month-tabs">
          {can("/lich-lam-viec::thong_ke") && (
            <div className={`month-tab ${view === "thong_ke" ? "active" : ""}`} onClick={() => setView("thong_ke")}>📊 Thống kê</div>
          )}
          {isAdminRole && (
            <>
              {can("/lich-lam-viec::list") && (
                <div className={`month-tab ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}>📋 Danh sách shop</div>
              )}
              {can("/lich-lam-viec::schedule") && (
                <div className={`month-tab ${view === "schedule" ? "active" : ""}`} onClick={() => setView("schedule")}>🗓️ Cần chia lịch</div>
              )}
              {can("/lich-lam-viec::today") && (
                <div className={`month-tab ${view === "today" ? "active" : ""}`} onClick={() => setView("today")}>📌 Shop được chia - Chuẩn bị kiểm kê</div>
              )}
            </>
          )}
        </div>
        {!can(`/lich-lam-viec::${view}`) && (
          <div className="placeholder-box" style={{ marginBottom: 16 }}>Bạn không có quyền xem tab này — chọn 1 tab khác ở trên.</div>
        )}

        {error && <div className="placeholder-box" style={{ marginBottom: 16 }}>Lỗi: {error}</div>}
        {loading && <div style={{ fontSize: 13, color: "var(--text-600)", marginBottom: 12 }}><span className="tiny-spinner" /> Đang tải...</div>}

        {view === "thong_ke" && can("/lich-lam-viec::thong_ke") && (
          <ThongKeThangView data={thongKeData} month={thongKeMonth} onMonthChange={setThongKeMonth} group={group} />
        )}
        {view === "list" && shops && can("/lich-lam-viec::list") && <ShopListView data={shops} onReload={reload} />}
        {view === "schedule" && candidates && can("/lich-lam-viec::schedule") && <ScheduleView data={candidates} group={group} onDone={reload} />}
        {view === "today" && scheduledToday && can("/lich-lam-viec::today") && <TodayScheduledView data={scheduledToday} group={group} onDone={reload} />}

        <style jsx global>{`
          .llv-page .llv-scroll { overflow: auto; }
          .llv-page .llv-scroll table thead th {
            position: sticky;
            top: 0;
            z-index: 3;
            background: #eaf1fc;
          }
          .llv-modal-overlay {
            position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5);
            display: flex; align-items: center; justify-content: center;
            z-index: 100; padding: 20px;
          }
          .llv-modal-card {
            background: var(--card); border-radius: var(--radius);
            width: 100%; max-width: 460px; max-height: 90vh; overflow-y: auto;
            box-shadow: 0 24px 60px rgba(10, 25, 55, 0.35);
          }
          .llv-modal-head {
            padding: 18px 22px; border-bottom: 1px solid var(--border);
            display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
          }
          .llv-modal-head h3 { font-size: 15px; font-weight: 800; color: var(--navy-900); }
          .llv-modal-subtitle { font-size: 12.5px; color: var(--text-600); margin-top: 4px; }
          .llv-modal-close {
            background: none; border: none; font-size: 15px; cursor: pointer;
            color: var(--text-400); line-height: 1; flex-shrink: 0;
          }
          .llv-modal-close:hover { color: var(--text-900); }
          .llv-modal-body { padding: 20px 22px; }
          .llv-modal-body .field { margin-bottom: 16px; }
          .llv-modal-actions { display: flex; gap: 10px; margin-top: 4px; }
        `}</style>
      </div>
    </Layout>
  );
}

function Pill({ children, kind }) {
  return <span className={`pill ${kind || ""}`}>{children}</span>;
}

// Popup dùng chung cho mọi form chỉnh sửa (Cập nhật phân loại, Dời lịch...)
// — luôn hiện đè giữa màn hình kèm tên/mã shop đang thao tác, tránh tình
// trạng form nằm khuất phía dưới cùng trang khiến không rõ đang sửa shop nào.
function Modal({ title, subtitle, onClose, children }) {
  return (
    <div className="llv-modal-overlay" onClick={onClose}>
      <div className="llv-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="llv-modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <div className="llv-modal-subtitle">{subtitle}</div>}
          </div>
          <button className="llv-modal-close" onClick={onClose} aria-label="Đóng">✕</button>
        </div>
        <div className="llv-modal-body">{children}</div>
      </div>
    </div>
  );
}

// Tab "Thống kê" (chốt 27/08) — tổng hợp theo Vùng số shop cần kiểm/đã
// kiểm/đã chia lịch+đang kiểm/còn lại trong 1 tháng bất kỳ (quá khứ/hiện
// tại/tương lai), theo đúng "Mẫu thống kê.xlsx" anh Thiện gửi. Xem cả
// admin/super_admin/editor (tab duy nhất Editor xem được ở menu này).
// 4 ô KPI phía trên "Thống kê chi tiết shop" bấm được để lọc (chốt 27/08
// lần 3) — mỗi ô ứng đúng 1 cờ is_* đã tính sẵn ở backend (khớp 100% với
// số đang hiển thị ở bảng theo Vùng, xem api_llv_v2_thong_ke_thang). Bấm
// lại ô đang chọn -> bỏ lọc, về lại xem tất cả shop.
const KPI_FILTER_FLAG = {
  can_kiem: "is_can_kiem",
  da_kiem: "is_da_kiem",
  da_chia_dang_kiem: "is_da_chia_dang_kiem",
  con_lai: "is_con_lai",
};
const KPI_FILTER_LABEL = {
  can_kiem: "SL Shop cần kiểm trong tháng",
  da_kiem: "SL shop đã kiểm",
  da_chia_dang_kiem: "SL shop đã chia lịch + đang kiểm",
  con_lai: "SL shop còn lại",
};

function ThongKeThangView({ data, month, onMonthChange, group }) {
  const rows = data?.rows || [];
  const allDetailRows = data?.detail_rows || [];
  const total = data?.total || { can_kiem: 0, da_kiem: 0, da_chia_dang_kiem: 0, con_lai: 0 };
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [activeFilter, setActiveFilter] = useState(null); // null | "can_kiem" | "da_kiem" | "da_chia_dang_kiem" | "con_lai"

  // Đổi tháng/nhóm -> về lại xem tất cả shop, tránh giữ lọc cũ nhìn nhầm
  // sang dữ liệu tháng khác.
  useEffect(() => {
    setActiveFilter(null);
  }, [data]);

  const filteredDetailRows = activeFilter
    ? allDetailRows.filter((r) => r[KPI_FILTER_FLAG[activeFilter]])
    : allDetailRows;

  // Bấm-tiêu-đề-để-sắp-xếp (chốt 28/08) — riêng state cho từng bảng.
  const vungSort = useSort();
  const detailSort = useSort();
  const sortedRows = applySort(rows, vungSort.state);
  const detailRows = applySort(filteredDetailRows, detailSort.state);

  function toggleFilter(key) {
    setActiveFilter((cur) => (cur === key ? null : key));
  }

  async function handleDownload() {
    setDownloading(true);
    setDownloadError("");
    try {
      await downloadLlvThongKeThang(group, month);
    } catch (e) {
      setDownloadError(e.message || "Tải file thất bại");
    } finally {
      setDownloading(false);
    }
  }

  function kpiStyle(key) {
    return activeFilter === key
      ? { cursor: "pointer", background: "#E8F3FF", borderColor: "var(--blue-accent, #1976d2)" }
      : { cursor: "pointer" };
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "14px 18px" }}>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-600)" }}>Chọn tháng:</label>
          <input
            type="month"
            value={month}
            onChange={(e) => onMonthChange(e.target.value)}
            style={{ padding: "7px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13.5 }}
          />
          <button
            className="fbtn" disabled={downloading} onClick={handleDownload}
            style={{ background: "#EAF6E5", borderColor: "#4C9A2A", color: "#3E7A2A" }}
          >
            {downloading ? "Đang tải..." : "📥 Tải về (2 sheet)"}
          </button>
          {downloadError && <div style={{ fontSize: 12, color: "var(--danger)" }}>{downloadError}</div>}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card" style={kpiStyle("can_kiem")} onClick={() => toggleFilter("can_kiem")}>
          <div className="accent b" /><span className="tag">SL Shop cần kiểm trong tháng</span><div className="val">{total.can_kiem}</div>
        </div>
        <div className="kpi-card" style={kpiStyle("da_kiem")} onClick={() => toggleFilter("da_kiem")}>
          <div className="accent g" /><span className="tag">SL shop đã kiểm</span><div className="val">{total.da_kiem}</div>
        </div>
        <div className="kpi-card" style={kpiStyle("da_chia_dang_kiem")} onClick={() => toggleFilter("da_chia_dang_kiem")}>
          <div className="accent o" /><span className="tag">SL shop đã chia lịch + đang kiểm</span><div className="val">{total.da_chia_dang_kiem}</div>
        </div>
        <div className="kpi-card" style={kpiStyle("con_lai")} onClick={() => toggleFilter("con_lai")}>
          <div className="accent r" /><span className="tag">SL shop còn lại</span><div className="val">{total.con_lai}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h3>Thống kê theo Vùng — tháng {month}</h3>
        </div>
        <div className="card-body llv-scroll" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <SortTh label="Vùng" align="left" sortCol="vung" sortState={vungSort.state} onSort={vungSort.onSort} />
                <SortTh label="SL Shop cần kiểm trong tháng" sortCol="can_kiem" sortState={vungSort.state} onSort={vungSort.onSort} />
                <SortTh label="SL shop đã kiểm" sortCol="da_kiem" sortState={vungSort.state} onSort={vungSort.onSort} />
                <SortTh label="SL shop đã chia lịch + đang kiểm" sortCol="da_chia_dang_kiem" sortState={vungSort.state} onSort={vungSort.onSort} />
                <SortTh label="SL shop còn lại" sortCol="con_lai" sortState={vungSort.state} onSort={vungSort.onSort} />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.vung}>
                  <td style={{ textAlign: "left" }}>{r.vung}</td>
                  <td>{r.can_kiem}</td>
                  <td>{r.da_kiem}</td>
                  <td>{r.da_chia_dang_kiem}</td>
                  <td style={{ color: r.con_lai < 0 ? "var(--danger)" : undefined, fontWeight: 700 }}>{r.con_lai}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-400)" }}>Chưa có dữ liệu shop cho tháng này.</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td style={{ textAlign: "left" }}>Total</td>
                  <td>{total.can_kiem}</td>
                  <td>{total.da_kiem}</td>
                  <td>{total.da_chia_dang_kiem}</td>
                  <td style={{ color: total.con_lai < 0 ? "var(--danger)" : undefined }}>{total.con_lai}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>
            Thống kê chi tiết shop ({detailRows.length})
            {activeFilter && <span style={{ fontWeight: 400, fontSize: 12.5, color: "var(--blue-accent, #1976d2)", marginLeft: 8 }}>
              — đang lọc: {KPI_FILTER_LABEL[activeFilter]}
            </span>}
          </h3>
          {activeFilter && (
            <button className="fbtn" onClick={() => setActiveFilter(null)}>Xem tất cả shop</button>
          )}
        </div>
        <div className="card-body llv-scroll" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <SortTh label="Vùng" align="left" sortCol="vung" sortState={detailSort.state} onSort={detailSort.onSort} />
                <SortTh label="Mã Shop" sortCol="ma_shop" sortState={detailSort.state} onSort={detailSort.onSort} />
                <SortTh label="Tên Shop" align="left" sortCol="ten_shop" sortState={detailSort.state} onSort={detailSort.onSort} />
                <SortTh label="Ngày cần kiểm" sortCol="ngay_can_kiem" sortState={detailSort.state} onSort={detailSort.onSort} />
                <SortTh label="Ngày thực tế kiểm" sortCol="ngay_thuc_te_kiem" sortState={detailSort.state} onSort={detailSort.onSort} />
                <SortTh label="Ngày gửi mail" sortCol="ngay_gui_mail" sortState={detailSort.state} onSort={detailSort.onSort} />
                <SortTh label="Hình thức kiểm kê" sortCol="hinh_thuc" sortState={detailSort.state} onSort={detailSort.onSort} />
                <SortTh label="KSNB phụ trách" sortCol="ksnb_phu_trach" sortState={detailSort.state} onSort={detailSort.onSort} />
              </tr>
            </thead>
            <tbody>
              {detailRows.map((r) => (
                <tr key={r.ma_shop}>
                  <td style={{ textAlign: "left" }}>{r.vung}</td>
                  <td>{r.ma_shop}</td>
                  <td style={{ textAlign: "left" }}>{r.ten_shop || "-"}</td>
                  <td>{r.ngay_can_kiem || "-"}</td>
                  <td>{r.ngay_thuc_te_kiem || "-"}</td>
                  <td>{r.ngay_gui_mail || "-"}</td>
                  <td>{r.hinh_thuc || "-"}</td>
                  <td>{r.ksnb_phu_trach || "-"}</td>
                </tr>
              ))}
              {detailRows.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-400)" }}>Chưa có dữ liệu shop cho tháng này.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// UploadDanhSachBar (Upload danh sách shop Excel + tải file trạng thái
// hiện tại) đã dời sang menu "Tải lên dữ liệu" (chốt 27/08 lần 21) — xem
// pages/tai-len-du-lieu.js::DanhSachShopUploadBar.

function ShopListView({ data, onReload }) {
  const { filters, setFilter, applyFilters, hasActive, clearFilters } = useColumnFilters();
  const [editing, setEditing] = useState(null); // row (mã + tên shop) đang cập nhật
  const [classForm, setClassForm] = useState({ phan_loai: "Định kỳ", ngay_can_kiem: "", ly_do_xin_kiem_ke: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const filteredRows = applyFilters(data.rows || [], {
    trang_thai: (r) => statusLabel(r.display_status),
    ngay_can_kiem: (r) => r.next_due_date || r.ngay_can_kiem,
    ksnb: (r) => r.last_ksnb || r.ksnb,
  });

  // Bấm-tiêu-đề-để-sắp-xếp (chốt 28/08) — dùng chung getter với bộ lọc ở
  // trên để sort đúng giá trị đang hiển thị (vd "Trạng thái" sort theo
  // nhãn tiếng Việt, không phải mã trạng thái nội bộ).
  const sort = useSort();
  const rows = applySort(filteredRows, sort.state, {
    trang_thai: (r) => statusLabel(r.display_status),
    ngay_can_kiem: (r) => r.next_due_date || r.ngay_can_kiem,
    ksnb: (r) => r.last_ksnb || r.ksnb,
  });

  function openEdit(row) {
    setEditing(row);
    setClassForm({ phan_loai: row.phan_loai || "Định kỳ", ngay_can_kiem: "", ly_do_xin_kiem_ke: "" });
    setMsg("");
  }

  async function submitClass() {
    setBusy(true);
    setMsg("");
    try {
      await llv2SetClass({ ma_shop: editing.ma_shop, ...classForm });
      setMsg("✅ Đã cập nhật");
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
        <div className="card-body llv-scroll" style={{ padding: 0 }}>
          {msg && <div style={{ padding: "8px 20px", fontSize: 12.5 }}>{msg}</div>}
          <table>
            <thead>
              <tr>
                <FilterTh label="Mã shop" align="left" value={filters.ma_shop} onChange={(v) => setFilter("ma_shop", v)} sortCol="ma_shop" sortState={sort.state} onSort={sort.onSort} />
                <FilterTh label="Tên shop" align="left" value={filters.ten_shop} onChange={(v) => setFilter("ten_shop", v)} minWidth={220} sortCol="ten_shop" sortState={sort.state} onSort={sort.onSort} />
                <FilterTh label="Vùng" align="left" value={filters.vung} onChange={(v) => setFilter("vung", v)} sortCol="vung" sortState={sort.state} onSort={sort.onSort} />
                <FilterTh label="Phân loại" value={filters.phan_loai} onChange={(v) => setFilter("phan_loai", v)} sortCol="phan_loai" sortState={sort.state} onSort={sort.onSort} />
                <FilterTh label="Trạng thái" value={filters.trang_thai} onChange={(v) => setFilter("trang_thai", v)} sortCol="trang_thai" sortState={sort.state} onSort={sort.onSort} />
                <FilterTh label="Ngày cần kiểm" value={filters.ngay_can_kiem} onChange={(v) => setFilter("ngay_can_kiem", v)} sortCol="ngay_can_kiem" sortState={sort.state} onSort={sort.onSort} />
                <FilterTh label="KSNB gần nhất" value={filters.ksnb} onChange={(v) => setFilter("ksnb", v)} sortCol="ksnb" sortState={sort.state} onSort={sort.onSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ma_shop}>
                  <td style={{ textAlign: "left", fontVariantNumeric: "tabular-nums" }}>{r.ma_shop}</td>
                  <td style={{ textAlign: "left" }}>{r.ten_shop}</td>
                  <td style={{ textAlign: "left" }}>{r.vung || "—"}</td>
                  <td>
                    <Pill kind={PHAN_LOAI_PILL[r.phan_loai]}>{r.phan_loai || "—"}</Pill>
                    {r.phan_loai === "Xin kiểm kê" && r.ly_do_xin_kiem_ke && (
                      <div style={{ marginTop: 4, fontSize: 11.5, fontWeight: 400 }}>{r.ly_do_xin_kiem_ke}</div>
                    )}
                  </td>
                  <td style={{ fontSize: 11.5 }}>{statusLabel(r.display_status)}</td>
                  <td>{r.next_due_date || r.ngay_can_kiem || "—"}</td>
                  <td>{r.last_ksnb || r.ksnb || "—"}</td>
                  <td>
                    <button className="fbtn" onClick={() => openEdit(r)}>Cập nhật</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title={`Cập nhật shop ${editing.ma_shop}`}
          subtitle={editing.ten_shop}
          onClose={() => setEditing(null)}
        >
          <div className="field">
            <label className="flabel">Phân loại</label>
            <select className="finput" style={{ width: "100%" }} value={classForm.phan_loai} onChange={(e) => setClassForm({ ...classForm, phan_loai: e.target.value })}>
              {CLASS_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {classForm.phan_loai === "Xin kiểm kê" && (
            <div className="field">
              <label className="flabel">Nội dung xin kiểm kê</label>
              <select className="finput" style={{ width: "100%" }} value={classForm.ly_do_xin_kiem_ke} onChange={(e) => setClassForm({ ...classForm, ly_do_xin_kiem_ke: e.target.value })}>
                <option value="">— chọn —</option>
                {REQUEST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label className="flabel">Ngày cần kiểm{classForm.phan_loai === "Định kỳ" ? " (tuỳ chọn)" : ""}</label>
            <input type="date" className="finput" style={{ width: "100%" }} value={classForm.ngay_can_kiem} onChange={(e) => setClassForm({ ...classForm, ngay_can_kiem: e.target.value })} />
            {classForm.phan_loai === "Định kỳ" && (
              <div style={{ fontSize: 11, color: "var(--text-400)", marginTop: 4 }}>
                Để trống thì hệ thống tự tính theo chu kỳ định kỳ như cũ — chỉ nhập khi muốn ấn định đúng 1 ngày cụ thể.
              </div>
            )}
          </div>
          {/* Chốt 28/08 — Chú ý (Xin kiểm kê / Vi phạm / Đóng cửa) vẫn BẮT
              BUỘC nhập "Ngày cần kiểm" (validate ở backend), chỉ riêng
              "Định kỳ" là tuỳ chọn, nên không cần thông báo riêng ở đây. */}
          {msg && <div style={{ fontSize: 12.5, marginBottom: 12, color: msg.startsWith("✅") ? "#3E7A2A" : "var(--danger)" }}>{msg}</div>}
          <div className="llv-modal-actions">
            <button className="login-btn" style={{ width: "auto", padding: "9px 20px" }} disabled={busy} onClick={submitClass}>{busy ? "Đang lưu..." : "Xác nhận"}</button>
            <button className="fbtn" onClick={() => setEditing(null)}>Hủy</button>
          </div>
        </Modal>
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
  // Cảnh báo sớm KSNB đang đăng ký nghỉ đúng "Ngày kiểm" đang chọn — backend
  // vẫn chặn cứng lúc bấm "Chia lịch" (xem err bên dưới), tra trước ở đây
  // chỉ để admin thấy ngay trong lúc điền hạn mức, đỡ phải bấm thử.
  const [offNames, setOffNames] = useState([]);

  useEffect(() => {
    if (!ngayKiem) { setOffNames([]); return; }
    leaveDaysByDate(ngayKiem).then((r) => setOffNames(r.names || [])).catch(() => setOffNames([]));
  }, [ngayKiem]);

  // Chốt 03/09 — BỎ auto-tick "Xin kiểm kê" theo Ngày cần kiểm ở đây: rule
  // "chia đúng ngày cho Xin kiểm kê" giờ do BACKEND tự xử lý thẳng trong
  // thuật toán random-bổ-sung (xem llv_v2_allocate_rows), không cần frontend
  // tự tick sẵn nữa.

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

  // Load thẳng danh sách KSNB đang có Quyền Kiểm Kê (Quản lý tài khoản) —
  // thay cho phải upload Excel. Không kiểm shop nào trong đợt: bấm ✕ xóa
  // dòng, hoặc để Số lượng = 0 (không gửi lên khi Chia lịch).
  async function onLoadKsnbList() {
    setQuotaBusy(true);
    setQuotaMsg("");
    try {
      const staff = await listKiemKeStaff();
      if (!staff.length) {
        setQuotaMsg("⚠️ Chưa có KSNB nào được cấp Quyền Kiểm Kê ở Quản lý tài khoản.");
        return;
      }
      setQuotas(staff.map((s) => ({ ksnb: s.full_name, so_luong: 1 })));
      setQuotaMsg(`✅ Đã tải ${staff.length} KSNB có Quyền Kiểm Kê`);
    } catch (e2) {
      setQuotaMsg("❌ " + e2.message);
    } finally {
      setQuotaBusy(false);
    }
  }

  async function submit() {
    if (ngayKiem === todayIso()) {
      const ok = window.confirm("Ngày bắt đầu kiểm là ngày hôm nay, Admin cần kiểm tra lại.\n\nBấm OK để xác nhận chia lịch, Hủy để quay lại chỉnh sửa.");
      if (!ok) return;
    }
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
        <div className="card-body llv-scroll" style={{ padding: 0 }}>
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
                <tr
                  key={r.ma_shop} onClick={() => toggle(r.ma_shop)}
                  style={{
                    cursor: "pointer",
                    background: selected.has(r.ma_shop) ? "var(--bg)" : "",
                  }}
                >
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
            <label className="flabel" style={{ margin: 0 }}>Hạn mức theo KSNB (tổng {quotaTotal})</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="fbtn" onClick={onLoadKsnbList} disabled={quotaBusy} style={{ fontSize: 11.5 }}>
                {quotaBusy ? "Đang tải..." : "📥 Load danh sách KSNB"}
              </button>
              <label className="upload-btn" style={{ cursor: quotaBusy ? "default" : "pointer", fontSize: 11.5, opacity: quotaBusy ? 0.6 : 1 }}>
                {quotaBusy ? "Đang đọc..." : "⬆️ Upload danh sách KSNB"}
                <input type="file" accept=".xlsx" onChange={onUploadQuota} disabled={quotaBusy} style={{ display: "none" }} />
              </label>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-600)", marginBottom: 8 }}>
            KSNB nào không kiểm trong đợt này: bấm ✕ xóa dòng, hoặc để Số lượng = 0.
          </div>
          {quotaMsg && <div style={{ fontSize: 11.5, marginBottom: 8, color: quotaMsg.startsWith("✅") ? "#3E7A2A" : "var(--danger)" }}>{quotaMsg}</div>}
          {quotas.map((q, i) => {
            const isOff = offNames.includes(q.ksnb.trim());
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="finput" placeholder="Tên KSNB" style={{ flex: 1, borderColor: isOff ? "var(--danger)" : undefined }} value={q.ksnb}
                    onChange={(e) => setQuotas(quotas.map((x, j) => j === i ? { ...x, ksnb: e.target.value } : x))} />
                  <input className="finput" type="number" min="0" style={{ width: 70 }} value={q.so_luong}
                    onChange={(e) => setQuotas(quotas.map((x, j) => j === i ? { ...x, so_luong: e.target.value } : x))} />
                  <button className="fbtn" onClick={() => setQuotas(quotas.filter((_, j) => j !== i))}>✕</button>
                </div>
                {isOff && (
                  <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 3 }}>
                    ⚠️ {q.ksnb} đã đăng ký nghỉ ngày {ngayKiem} — sẽ bị chặn nếu chia
                  </div>
                )}
              </div>
            );
          })}
          <button className="fbtn" onClick={() => setQuotas([...quotas, { ksnb: "", so_luong: 1 }])}>+ Thêm KSNB</button>

          <div style={{ fontSize: 11.5, color: "var(--text-600)", marginTop: 12, lineHeight: 1.5 }}>
            {selected.size === 0
              ? "Chưa tick shop nào → hệ thống tự chọn đủ số lượng trong danh sách \"cần chia lịch\" (ưu tiên shop quá hạn trước, rồi shop Xin kiểm kê đúng ngày kiểm đang chọn, còn lại theo shop gần hạn kiểm kê nhất, chỉ random giữa các shop cùng hạn)."
              : selected.size < quotaTotal
                ? `Đã tick ${selected.size}/${quotaTotal} shop → ${quotaTotal - selected.size} shop còn lại sẽ tự bổ sung (ưu tiên shop quá hạn + gần hạn kiểm kê nhất trước).`
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

function TodayScheduledView({ data, group, onDone }) {
  const { filters, setFilter, applyFilters, hasActive, clearFilters } = useColumnFilters();
  const [cancelling, setCancelling] = useState(null); // row đang hủy (view admin — thay cho Dời lịch)
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false); // đang xếp hàng ticket SSC
  const [bulkMsg, setBulkMsg] = useState("");
  const [proc, setProc] = useState(null); // {ids:Set<number>} — popup đang xử lý ticket SSC
  const [ehoBusy, setEhoBusy] = useState(false); // đang tải file EHO
  const [ehoMsg, setEhoMsg] = useState("");
  // Popup dán link ticket thật khi trạng thái "Cần xác minh" (chốt 04/09)
  // — bấm trực tiếp vào badge ở bảng chính, xem JobStatusBadge.
  const [confirmingTicket, setConfirmingTicket] = useState(null); // row đang xác nhận
  const [confirmUrl, setConfirmUrl] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState("");

  const rows = applyFilters(data.rows || [], {
    trang_thai: (r) => statusLabel(r.display_status),
  });

  // Mã phiếu chia — CHỈ sinh khi Admin chủ động bấm nút "Tạo danh sách chia",
  // không tự quét khi tải trang. Gộp mọi shop đang chờ tạo/lỗi (dù đến từ
  // nhiều lần bấm "Chia lịch" trong ngày, mỗi lần vốn 1 mã đợt khác nhau)
  // thành 1 mã duy nhất — Admin chỉ cần đưa 1 mã cho script tạo ticket SSC.
  const [dsChiaBusy, setDsChiaBusy] = useState(false);
  const [maPhieuChia, setMaPhieuChia] = useState("");
  const [dsChiaMsg, setDsChiaMsg] = useState("");
  const [copiedPhieu, setCopiedPhieu] = useState(false);

  async function onCreateDanhSachChia() {
    const ids = (data.rows || []).map((r) => r.id);
    if (!ids.length) return;
    setDsChiaBusy(true);
    setDsChiaMsg("");
    setMaPhieuChia("");
    try {
      const r = await llv2CreateDanhSachChia(ids, group);
      setMaPhieuChia(r.ma_phieu_chia);
      const parts = [`${r.included_count} shop`];
      if (r.already_done_count) parts.push(`${r.already_done_count} shop đã có ticket từ trước không gộp vào`);
      if (r.skipped_count) parts.push(`${r.skipped_count} shop bỏ qua (Thanh lý)`);
      setDsChiaMsg(`✅ Đã gộp ${parts.join(" — ")}`);
    } catch (e) {
      setDsChiaMsg("❌ " + e.message);
    } finally {
      setDsChiaBusy(false);
    }
  }

  function openConfirmTicket(row) {
    setConfirmingTicket(row);
    setConfirmUrl("");
    setConfirmMsg("");
  }

  async function submitConfirmTicket() {
    if (!confirmUrl.trim()) {
      setConfirmMsg("❌ Cần nhập link ticket");
      return;
    }
    setConfirmBusy(true);
    setConfirmMsg("");
    try {
      await llv2ManualConfirmTicket(confirmingTicket.id, confirmUrl.trim());
      setConfirmingTicket(null);
      onDone();
    } catch (e) {
      setConfirmMsg("❌ " + e.message);
    } finally {
      setConfirmBusy(false);
    }
  }

  function copyPhieu() {
    navigator.clipboard?.writeText(maPhieuChia).then(() => {
      setCopiedPhieu(true);
      setTimeout(() => setCopiedPhieu(false), 1500);
    });
  }

  // Khi popup "Đang xử lý" đang mở, tự làm mới danh sách mỗi 3s để cập nhật
  // trạng thái ticket/phiếu ngay khi chương trình automation (chạy riêng
  // ngoài trình duyệt) xử lý xong từng shop — không có gì tự tạo ticket ở
  // đây, chỉ đang theo dõi kết quả automation ghi về.
  useEffect(() => {
    if (!proc) return;
    const timer = setInterval(() => onDone(), 3000);
    return () => clearInterval(timer);
  }, [proc]);

  const procRows = proc ? (data.rows || []).filter((r) => proc.ids.has(r.id)) : [];
  const procDoneCount = procRows.filter((r) => ["da_tao", "loi", "can_xac_minh"].includes(r.ticket_status)).length;

  function openCancel(row) {
    setCancelling(row);
    setCancelReason("");
    setMsg("");
  }

  // Hủy kỳ đã chia (view admin, thay cho nút Dời lịch) — chỉ xác nhận có
  // chắc chắn hủy không, lý do là tùy chọn (không nhập cũng được).
  async function confirmCancel() {
    setBusy(true);
    try {
      await llv2DeleteCycle({ id: cancelling.id, reason: cancelReason });
      setMsg("✅ Đã hủy");
      setCancelling(null);
      onDone();
    } catch (e) {
      setMsg("❌ " + e.message);
    } finally {
      setBusy(false);
    }
  }

  // Bấm 1 lần cho CẢ danh sách đang hiện trên tab này — đẩy vào hàng đợi,
  // chương trình automation SSC chạy riêng trên máy anh mới thực sự tạo.
  // An toàn bấm lại nhiều lần: shop đã có ticket bị bỏ qua, chỉ shop chưa
  // có hoặc lỗi mới được xếp hàng lại.
  async function runBulkTicket() {
    const ids = (data.rows || []).map((r) => r.id);
    if (!ids.length) return;
    setBulkBusy(true);
    setBulkMsg("");
    try {
      const r = await llv2BulkCreateTickets(ids);
      const parts = [`✅ Đã xếp hàng ${r.queued_count} shop`];
      if (r.already_done_count) parts.push(`${r.already_done_count} shop đã có từ trước`);
      if (r.skipped_count) parts.push(`${r.skipped_count} shop bỏ qua (Thanh lý)`);
      setBulkMsg(parts.join(" — "));
      setProc({ ids: new Set(ids) });
      onDone();
    } catch (e) {
      setBulkMsg("❌ " + e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  // Khác ticket SSC (automation ngoài, không đồng bộ) — file EHO tải NGAY,
  // không có gì để xếp hàng/theo dõi. Dùng fetch+blob thay vì <a href> thẳng
  // để bắt được lỗi (VD danh sách rỗng) và hiện thông báo tử tế thay vì mở
  // tab trống ra JSON lỗi.
  async function onExportEho() {
    const ids = (data.rows || []).map((r) => r.id);
    if (!ids.length) return;
    setEhoBusy(true);
    setEhoMsg("");
    try {
      const res = await fetch(llv2EhoAllShopAuditUrl(ids));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Lỗi ${res.status}`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : "AllShopAudit.xlsx";
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      setEhoMsg(`✅ Đã tải file ${filename}`);
    } catch (e) {
      setEhoMsg("❌ " + e.message);
    } finally {
      setEhoBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Shop được chia - Chuẩn bị kiểm kê ({rows.length}/{data.rows.length}) — {data.date}</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {hasActive && <button className="fbtn" onClick={clearFilters}>Xóa bộ lọc</button>}
          {/* Nút "Tạo ticket thông báo" đã ẩn (chốt 25/08, anh Thiện thấy chưa
              cần dùng) — giữ nguyên hàm runBulkTicket/state bulkBusy phòng khi
              cần bật lại, chỉ bỏ nút khỏi UI. */}
          <button className="fbtn" disabled={ehoBusy} onClick={onExportEho} style={ACTION_BTN_STYLES.orange}>
            {ehoBusy ? "Đang tải..." : "📋 Tạo phiếu kiểm kê"}
          </button>
          <button className="fbtn" disabled={dsChiaBusy} onClick={onCreateDanhSachChia} style={ACTION_BTN_STYLES.green}>
            {dsChiaBusy ? "Đang tạo..." : "🗂️ Tạo danh sách chia"}
          </button>
        </div>
      </div>
      {(maPhieuChia || dsChiaMsg) && (
        <div style={{ padding: "0 20px 14px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {maPhieuChia && (
            <>
              <span style={{ fontSize: 14 }}>Mã phiếu chia (dùng cho script tạo ticket SSC):</span>
              <code
                onClick={copyPhieu}
                title="Bấm để copy"
                style={{ cursor: "pointer", background: "var(--bg)", padding: "5px 14px", borderRadius: 6, fontSize: 16, fontWeight: 600 }}
              >
                {copiedPhieu ? "✅ Đã copy" : maPhieuChia}
              </code>
            </>
          )}
          {dsChiaMsg && <div style={{ fontSize: 14, color: dsChiaMsg.startsWith("✅") ? "#3E7A2A" : "var(--danger)" }}>{dsChiaMsg}</div>}
        </div>
      )}
      <div className="card-body llv-scroll" style={{ padding: 0 }}>
        {msg && <div style={{ padding: "8px 20px", fontSize: 12.5 }}>{msg}</div>}
        {bulkMsg && <div style={{ padding: "8px 20px", fontSize: 12.5, color: bulkMsg.startsWith("✅") ? "#3E7A2A" : "var(--danger)" }}>{bulkMsg}</div>}
        {ehoMsg && <div style={{ padding: "8px 20px", fontSize: 12.5, color: ehoMsg.startsWith("✅") ? "#3E7A2A" : "var(--danger)" }}>{ehoMsg}</div>}
        <table>
          <thead>
            <tr>
              <FilterTh label="Mã shop" align="left" value={filters.ma_shop} onChange={(v) => setFilter("ma_shop", v)} minWidth={200} />
              <FilterTh label="KSNB phụ trách" value={filters.ksnb} onChange={(v) => setFilter("ksnb", v)} />
              <FilterTh label="Ngày kiểm" value={filters.ngay_kiem} onChange={(v) => setFilter("ngay_kiem", v)} />
              <FilterTh label="Hình thức" value={filters.hinh_thuc} onChange={(v) => setFilter("hinh_thuc", v)} />
              <FilterTh label="Trạng thái" value={filters.trang_thai} onChange={(v) => setFilter("trang_thai", v)} />
              <th>Ticket thông báo</th>
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
                <td><JobStatusBadge status={r.ticket_status} url={r.ticket_url} onClickCanXacMinh={() => openConfirmTicket(r)} /></td>
                <td>
                  <button className="fbtn" style={{ color: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => openCancel(r)}>Hủy</button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={7} style={{ color: "var(--text-400)", padding: 24 }}>Chưa có shop nào được chia hôm nay.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {cancelling && (
        <Modal
          title={`Hủy kỳ đã chia — shop ${cancelling.ma_shop}`}
          subtitle={`${cancelling.ten_shop || ""}${cancelling.ngay_kiem ? ` · Ngày kiểm: ${cancelling.ngay_kiem} · KSNB: ${cancelling.ksnb || ""}` : ""}`}
          onClose={() => setCancelling(null)}
        >
          <div style={{ fontSize: 13.5, marginBottom: 14 }}>Bạn có chắc chắn muốn hủy kỳ đã chia này không?</div>
          <div className="field">
            <label className="flabel">Lý do (không bắt buộc)</label>
            <textarea
              className="finput" rows={3} style={{ width: "100%", resize: "vertical" }}
              value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Có thể để trống"
            />
          </div>
          {msg && <div style={{ fontSize: 12.5, marginBottom: 12, color: msg.startsWith("✅") ? "#3E7A2A" : "var(--danger)" }}>{msg}</div>}
          <div className="llv-modal-actions">
            <button
              className="login-btn" style={{ width: "auto", padding: "9px 20px", background: "var(--danger)", borderColor: "var(--danger)" }}
              disabled={busy} onClick={confirmCancel}
            >{busy ? "Đang hủy..." : "Xác nhận hủy"}</button>
            <button className="fbtn" onClick={() => setCancelling(null)}>Đóng</button>
          </div>
        </Modal>
      )}

      {confirmingTicket && (
        <Modal
          title={`Xác nhận ticket — shop ${confirmingTicket.ma_shop}`}
          subtitle={`${confirmingTicket.ten_shop || ""} · KSNB: ${confirmingTicket.ksnb || ""}`}
          onClose={() => setConfirmingTicket(null)}
        >
          <div style={{ fontSize: 13.5, marginBottom: 14 }}>
            Chỉ dùng khi anh/chị đã tự vào SSC kiểm tra và thấy ticket đã tạo thành công (chương trình
            automation báo "Cần xác minh" vì không tự đọc/xác nhận lại được link). Dán đúng link ticket
            thật vào đây — hệ thống sẽ chuyển trạng thái thành "Đã tạo".
          </div>
          <div className="field">
            <label className="flabel">Link ticket SSC *</label>
            <input
              className="finput" style={{ width: "100%" }}
              value={confirmUrl} onChange={(e) => setConfirmUrl(e.target.value)}
              placeholder="https://ssc.fptshop.com.vn/s-pro/workflow/ticket/detail/..."
              autoFocus
            />
          </div>
          {confirmMsg && <div style={{ fontSize: 12.5, marginTop: 10, color: "var(--danger)" }}>{confirmMsg}</div>}
          <div className="llv-modal-actions">
            <button className="login-btn" style={{ width: "auto", padding: "9px 20px" }} disabled={confirmBusy} onClick={submitConfirmTicket}>
              {confirmBusy ? "Đang lưu..." : "Xác nhận"}
            </button>
            <button className="fbtn" onClick={() => setConfirmingTicket(null)}>Đóng</button>
          </div>
        </Modal>
      )}

      {proc && (
        <Modal
          title="Đang xử lý — Tạo ticket thông báo"
          subtitle={`${procDoneCount}/${procRows.length} shop đã có kết quả — tự làm mới mỗi 3 giây`}
          onClose={() => setProc(null)}
        >
          <div style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 10 }}>
            Việc tạo ticket thật do chương trình automation chạy riêng (ngoài trình duyệt) xử lý — màn hình
            này chỉ theo dõi kết quả, có thể đóng lại và mở "Shop được chia - Chuẩn bị kiểm kê" xem sau,
            không cần chờ ở đây.
          </div>
          <div className="llv-scroll" style={{ maxHeight: 320, overflowY: "auto" }}>
            <table>
              <thead>
                <tr><th style={{ textAlign: "left" }}>Mã shop</th><th>Trạng thái</th></tr>
              </thead>
              <tbody>
                {procRows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ textAlign: "left" }}>{r.ma_shop} — {r.ten_shop}</td>
                    <td><JobStatusBadge status={r.ticket_status} url={r.ticket_url} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="llv-modal-actions">
            <button className="fbtn" onClick={() => setProc(null)}>Đóng</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
