import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import {
  getKiemKePeriods, listKiemKe, updateKiemKeGhiChu,
  getShopChiaHomNay, getDangKiem, doiLichShopChiaHomNay, getUser,
} from "../lib/api";

function normName(s) {
  return String(s == null ? "" : s).toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/\s+/g, " ");
}

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

function fmtMoney(n) {
  if (n === undefined || n === null) return "-";
  return n.toLocaleString("vi-VN");
}

const STATUS_LABELS = {
  cho_chia: "Chờ chia lịch", cho_den_han: "Chờ đến kỳ", qua_han_chia: "Quá hạn chia lịch",
  sap_kiem: "Chuẩn bị kiểm kê", dang_kiem: "Đang kiểm kê", da_doi_lich: "Đã dời lịch",
  cho_xac_nhan_doi_lich: "Chờ chia lại (đã dời lịch)", cho_chia_lai: "Chờ chia lại",
  ngung_theo_doi: "Ngừng theo dõi", da_kiem: "Đã kiểm", da_kiem_lich_su: "Đã kiểm (lịch sử)",
  da_chia: "Đã chia lịch", da_huy: "Đã huỷ",
};
const statusLabel = (code) => STATUS_LABELS[code] || code || "—";

// Số ngày kiểm = Hôm nay - Ngày kiểm (ngày dương lịch, không phụ thuộc giờ).
function daysBetween(todayStr, dateStr) {
  if (!todayStr || !dateStr) return null;
  const a = new Date(`${todayStr}T00:00:00`);
  const b = new Date(`${dateStr}T00:00:00`);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

// Badge trạng thái ticket thông báo SSC — giống hệt bên trang Phân công
// KSNB kiểm kê (lich-lam-viec-v2.js), lặp lại ở đây vì 2 trang khác nhau
// không share component, chỉ share class .pill định nghĩa ở globals.css.
const JOB_STATUS_LABELS = {
  "": "Chưa tạo", cho_tao: "Đang chờ tạo", da_tao: "Đã tạo",
  loi: "Lỗi — cần kiểm tra", can_xac_minh: "Cần xác minh", da_huy: "Đã huỷ",
};
const JOB_STATUS_PILL = { da_tao: "ok", loi: "danger", can_xac_minh: "warn", cho_tao: "warn" };
function JobStatusBadge({ status, url }) {
  const s = status || "";
  const kind = JOB_STATUS_PILL[s] || "";
  const label = JOB_STATUS_LABELS[s] || s;
  const badge = <span className={`pill ${kind}`}>{label}</span>;
  return url ? <a href={url} target="_blank" rel="noreferrer">{badge}</a> : badge;
}

// Bảng dùng chung cho 2 tab lấy dữ liệu từ Phân công KSNB kiểm kê (LLV v2):
// "Shop được chia - Chuẩn bị kiểm kê" (có nút Dời lịch) và "Đang kiểm" (chỉ
// xem, có thêm cột Số ngày kiểm + cảnh báo trễ hạn, sắp theo số ngày giảm dần).
function LlvRowsTable({ title, data, isAdmin, searchQuery, showDoiLich, canReschedule, onOpenReschedule, emptyText, showSoNgayKiem, showTicket }) {
  let rows = (data?.rows || []).filter((r) => {
    if (!searchQuery) return true;
    return (
      (r.ma_shop || "").toLowerCase().includes(searchQuery) ||
      (r.ten_shop || "").toLowerCase().includes(searchQuery)
    );
  });

  if (showSoNgayKiem) {
    rows = rows
      .map((r) => ({ ...r, _soNgayKiem: daysBetween(data.date, r.ngay_kiem) }))
      .sort((a, b) => (b._soNgayKiem ?? -Infinity) - (a._soNgayKiem ?? -Infinity));
  }

  const colCount = 7 + (showSoNgayKiem ? 1 : 0) + (showTicket ? 1 : 0) + (showDoiLich ? 1 : 0);

  return (
    <div className="card">
      <div className="card-head">
        <h3>{title} — {data.date}</h3>
        <span className="note">
          {searchQuery ? `${rows.length}/${data.rows.length} shop (đang lọc)` : `${data.rows.length} shop`}
          {!isAdmin && " · chỉ hiện shop do bạn phụ trách"}
        </span>
      </div>
      <div className="card-body">
        <table>
          <thead>
            <tr>
              <th>Vùng</th><th>Mã shop</th><th>Tên shop</th><th>KSNB phụ trách</th>
              <th>Ngày kiểm</th>{showSoNgayKiem && <th>Số ngày kiểm</th>}
              <th>Hình thức</th><th>Trạng thái</th>{showTicket && <th>Ticket thông báo</th>}{showDoiLich && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // Shop đã dời lịch -> tên đỏ; shop được chia thay thế (có
              // ky_goc_id, tức đứng vào chỗ 1 kỳ đã dời) -> tên xanh dương.
              // Chỉ đổi màu chữ, không đổi màu nền.
              const tenColor = r.display_status === "da_doi_lich"
                ? "var(--danger)"
                : r.ky_goc_id
                  ? "var(--blue-accent)"
                  : undefined;
              const soNgayKiem = showSoNgayKiem ? r._soNgayKiem : null;
              const urgency = soNgayKiem == null ? null
                : soNgayKiem > 5 ? "da_tre_han"
                  : (soNgayKiem === 4 || soNgayKiem === 5) ? "sap_tre_han"
                    : null;
              const statusText = urgency === "da_tre_han" ? "Đã trễ hạn"
                : urgency === "sap_tre_han" ? "Sắp trễ hạn"
                  : statusLabel(r.display_status);
              // Trễ hạn/sắp trễ hạn -> đổi màu đỏ cho toàn bộ dòng (chỉ màu
              // chữ, không đổi nền); "Đã trễ hạn" thêm in đậm cả dòng.
              const rowStyle = urgency
                ? { color: "var(--danger)", fontWeight: urgency === "da_tre_han" ? 700 : undefined }
                : undefined;
              return (
                <tr key={r.id} style={rowStyle}>
                  <td style={{ textAlign: "left" }}>{r.vung || "-"}</td>
                  <td>{r.ma_shop}</td>
                  <td style={{ textAlign: "left", color: urgency ? undefined : tenColor }}>{r.ten_shop || "-"}</td>
                  <td>{r.ksnb || "-"}</td>
                  <td>{r.ngay_kiem || "-"}</td>
                  {showSoNgayKiem && <td>{soNgayKiem ?? "-"}</td>}
                  <td>{r.hinh_thuc || "-"}</td>
                  <td style={{ fontSize: 12 }}>{statusText}</td>
                  {showTicket && <td><JobStatusBadge status={r.ticket_status} url={r.ticket_url} /></td>}
                  {showDoiLich && (
                    <td>
                      {canReschedule(r) && r.display_status !== "da_doi_lich" && (
                        <button className="fbtn" onClick={() => onOpenReschedule(r)}>Dời lịch</button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={colCount} style={{ textAlign: "center", color: "var(--text-400)" }}>
                {searchQuery ? "Không tìm thấy shop nào khớp" : emptyText}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TheoDoiKiemKePage() {
  const [loai, setLoai] = useState("da_kiem"); // "da_kiem" | "dang_kiem" | "shop_chia_hom_nay"
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState(null);
  const [rows, setRows] = useState([]);
  const [shopHomNay, setShopHomNay] = useState(null); // { date, rows }
  const [dangKiemData, setDangKiemData] = useState(null); // { date, rows }
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const me = getUser();
  const isAdmin = ["admin", "super_admin"].includes(me?.role);
  // 2 tab lấy dữ liệu từ Phân công KSNB kiểm kê (LLV v2) — không dùng kỳ/tháng
  const isLlvTab = loai === "shop_chia_hom_nay" || loai === "dang_kiem";

  // Dời lịch tự phục vụ (chỉ ở tab Shop được chia hôm nay) — popup + tự nạp
  // lại danh sách sau khi có shop thay thế
  const [rescheduling, setRescheduling] = useState(null); // row đang dời
  const [rescheduleForm, setRescheduleForm] = useState({ ngay_can_kiem: "", ly_do: "" });
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [rescheduleMsg, setRescheduleMsg] = useState("");

  function canReschedule(row) {
    return isAdmin || normName(row.ksnb) === normName(me?.full_name);
  }

  function openReschedule(row) {
    setRescheduling(row);
    setRescheduleForm({ ngay_can_kiem: "", ly_do: "" });
    setRescheduleMsg("");
  }

  async function submitReschedule() {
    setRescheduleBusy(true);
    setRescheduleMsg("");
    try {
      const r = await doiLichShopChiaHomNay(rescheduling.id, rescheduleForm.ngay_can_kiem, rescheduleForm.ly_do);
      const replacementText = r.replacement
        ? `Đã tự động chọn shop thay thế: ${r.replacement.ma_shop} — ${r.replacement.ten_shop}.`
        : `⚠️ Không tìm được shop thay thế${r.replacement_error ? ` (${r.replacement_error})` : ""}.`;
      setRescheduling(null);
      getShopChiaHomNay().then(setShopHomNay).catch((err) => setError(err.message));
      alert(`✅ Đã dời lịch shop ${r.ma_shop}. ${replacementText}`);
    } catch (err) {
      setRescheduleMsg("❌ " + err.message);
    } finally {
      setRescheduleBusy(false);
    }
  }

  // Tab Đã kiểm -> nạp danh sách kỳ (tháng) như cũ
  useEffect(() => {
    if (isLlvTab) {
      setPeriods([]);
      setPeriod(null);
      return;
    }
    getKiemKePeriods(loai)
      .then((list) => {
        setPeriods(list);
        setPeriod(list.length > 0 ? list[0] : null);
        setRows([]);
      })
      .catch((err) => setError(err.message));
  }, [loai]);

  useEffect(() => {
    if (!period || isLlvTab) return;
    listKiemKe(period, loai).then(setRows).catch((err) => setError(err.message));
  }, [period, loai]);

  // Tab "Shop được chia hôm nay" / "Đang kiểm" — nạp riêng, không theo kỳ tháng
  useEffect(() => {
    if (!isLlvTab) return;
    setError("");
    if (loai === "shop_chia_hom_nay") {
      getShopChiaHomNay().then(setShopHomNay).catch((err) => setError(err.message));
    } else {
      getDangKiem().then(setDangKiemData).catch((err) => setError(err.message));
    }
  }, [loai]);

  function startEditNote(row) {
    setEditingId(row.id);
    setNoteDraft(row.ghi_chu || "");
  }

  async function saveNote(id) {
    try {
      const updated = await updateKiemKeGhiChu(id, noteDraft);
      setRows(rows.map((r) => (r.id === id ? updated : r)));
      setEditingId(null);
    } catch (err) {
      alert(err.message || "Lưu ghi chú thất bại");
    }
  }

  function handleSearch() {
    setSearchQuery(searchInput.trim().toLowerCase());
  }

  function handleClearSearch() {
    setSearchInput("");
    setSearchQuery("");
  }

  // Lọc theo mã shop/tên shop, rồi sắp xếp theo |giá trị thất thoát| giảm dần
  // (dư cũng là nguy cơ, thiếu cũng là nguy cơ — lệch càng nhiều càng lên đầu)
  const displayRows = rows
    .filter((r) => {
      if (!searchQuery) return true;
      return (
        (r.ma_shop || "").toLowerCase().includes(searchQuery) ||
        (r.ten_shop || "").toLowerCase().includes(searchQuery)
      );
    })
    .sort((a, b) => Math.abs(b.gia_tri_that_thoat || 0) - Math.abs(a.gia_tri_that_thoat || 0));

  return (
    <Layout crumb="Theo dõi kiểm kê">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1>Theo dõi kiểm kê</h1>
          <p>
            {loai === "da_kiem"
              ? "Tự động cập nhật khi gửi mail BCKS (shop rời \"Đang kiểm\" chuyển sang đây). Cột Ghi chú do NV KSNB tự cập nhật."
              : "Cột Ghi chú do NV KSNB tự cập nhật."}
          </p>
        </div>
      </div>

      {/* Tab chọn Đã kiểm / Đang kiểm / Shop được chia hôm nay */}
      <div className="month-tabs">
        <div className={`month-tab ${loai === "da_kiem" ? "active" : ""}`} onClick={() => setLoai("da_kiem")}>
          ✅ Đã kiểm
        </div>
        <div className={`month-tab ${loai === "dang_kiem" ? "active" : ""}`} onClick={() => setLoai("dang_kiem")}>
          ⏳ Đang kiểm
        </div>
        <div className={`month-tab ${loai === "shop_chia_hom_nay" ? "active" : ""}`} onClick={() => setLoai("shop_chia_hom_nay")}>
          📌 Shop được chia - Chuẩn bị kiểm kê
        </div>
      </div>

      {!isLlvTab && periods.length > 0 && (
        <div className="month-tabs">
          {periods.map((p) => (
            <div key={p} className={`month-tab ${p === period ? "active" : ""}`} onClick={() => setPeriod(p)}>
              {p}
            </div>
          ))}
        </div>
      )}

      {error && <div className="placeholder-box">Không tải được dữ liệu: {error}</div>}
      {loai === "da_kiem" && !error && periods.length === 0 && (
        <div className="placeholder-box">Chưa có shop nào được chuyển sang "Đã kiểm".</div>
      )}

      {(isLlvTab || periods.length > 0) && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-body" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "14px 18px" }}>
            <input
              type="text"
              placeholder="Mã shop / tên shop..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              style={{ width: "5cm", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13.5 }}
            />
            <button onClick={handleSearch} style={syncBtnStyle}>🔍 Tìm kiếm</button>
            {searchQuery && (
              <button onClick={handleClearSearch} style={{ ...syncBtnStyle, background: "var(--border)", color: "var(--text-900)" }}>
                Xóa lọc
              </button>
            )}
          </div>
        </div>
      )}

      {loai === "shop_chia_hom_nay" && shopHomNay && (
        <LlvRowsTable
          title="Shop được chia - Chuẩn bị kiểm kê"
          data={shopHomNay}
          isAdmin={isAdmin}
          searchQuery={searchQuery}
          showTicket
          showDoiLich
          canReschedule={canReschedule}
          onOpenReschedule={openReschedule}
          emptyText="Chưa có shop nào được chia lịch hôm nay."
        />
      )}

      {loai === "dang_kiem" && dangKiemData && (
        <LlvRowsTable
          title="Shop đang kiểm kê"
          data={dangKiemData}
          isAdmin={isAdmin}
          searchQuery={searchQuery}
          showDoiLich={false}
          showSoNgayKiem
          emptyText="Không có shop nào đang trong kỳ kiểm."
        />
      )}

      {rescheduling && (
        <Modal
          title={`Dời lịch — shop ${rescheduling.ma_shop}`}
          subtitle={`${rescheduling.ten_shop || ""}${rescheduling.ngay_kiem ? ` · Ngày kiểm hiện tại: ${rescheduling.ngay_kiem}` : ""}`}
          onClose={() => setRescheduling(null)}
        >
          <div className="field">
            <label className="flabel">Ngày cần kiểm mới</label>
            <input type="date" className="finput" style={{ width: "100%" }}
              value={rescheduleForm.ngay_can_kiem}
              onChange={(e) => setRescheduleForm({ ...rescheduleForm, ngay_can_kiem: e.target.value })} />
          </div>
          <div className="field">
            <label className="flabel">Lý do</label>
            <input className="finput" style={{ width: "100%" }}
              value={rescheduleForm.ly_do}
              onChange={(e) => setRescheduleForm({ ...rescheduleForm, ly_do: e.target.value })} />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-600)", marginBottom: 12 }}>
            Sau khi dời, hệ thống sẽ tự động chọn 1 shop thay thế cho bạn (cùng ngày kiểm/hình thức) và hiện luôn ở danh sách trên.
          </div>
          {rescheduleMsg && <div style={{ fontSize: 12.5, marginBottom: 12, color: "var(--danger)" }}>{rescheduleMsg}</div>}
          <div className="llv-modal-actions">
            <button className="login-btn" style={{ width: "auto", padding: "9px 20px" }} disabled={rescheduleBusy} onClick={submitReschedule}>
              {rescheduleBusy ? "Đang lưu..." : "Xác nhận dời"}
            </button>
            <button className="fbtn" onClick={() => setRescheduling(null)}>Hủy</button>
          </div>
        </Modal>
      )}

      <style jsx global>{`
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

      {loai === "da_kiem" && period && (
        <div className="card">
          <div className="card-head">
            <h3>Kỳ {period}</h3>
            <span className="note">
              {searchQuery ? `${displayRows.length}/${rows.length} shop (đang lọc)` : `${rows.length} shop`}
              {" · sắp xếp theo giá trị thất thoát (lệch nhiều nhất lên đầu)"}
            </span>
          </div>
          <div className="card-body">
            <table>
              <thead>
                <tr>
                  <th>Vùng</th><th>Mã shop</th><th>Tên shop</th><th>Ngày kiểm kê</th>
                  <th>Giá trị thất thoát</th><th>Truy thu thanh lý</th><th>NV kiểm kê</th><th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ textAlign: "left" }}>{r.vung}</td>
                    <td>{r.ma_shop}</td>
                    <td style={{ textAlign: "left" }}>{r.ten_shop || "-"}</td>
                    <td>{r.ngay_kiem_ke || "-"}</td>
                    <td className="num neg">{fmtMoney(r.gia_tri_that_thoat)}</td>
                    <td className="num">{fmtMoney(r.truy_thu_thanh_ly)}</td>
                    <td>{r.nv_kiem_ke || "-"}</td>
                    <td style={{ minWidth: 200 }}>
                      {editingId === r.id ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            style={{ flex: 1, padding: "6px 8px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12.5 }}
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            autoFocus
                          />
                          <button onClick={() => saveNote(r.id)} style={saveBtnStyle}>Lưu</button>
                        </div>
                      ) : (
                        <div style={{ cursor: "pointer", color: r.ghi_chu ? "var(--text-900)" : "var(--text-400)" }}
                          onClick={() => startEditNote(r)}>
                          {r.ghi_chu || "+ Thêm ghi chú"}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {displayRows.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-400)" }}>
                    {searchQuery ? "Không tìm thấy shop nào khớp" : "Không có shop nào trong tháng này"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}

const saveBtnStyle = {
  padding: "6px 12px", borderRadius: 6, border: "none",
  background: "var(--navy-800)", color: "#fff", fontSize: 12, cursor: "pointer",
};

const syncBtnStyle = {
  padding: "9px 16px", borderRadius: 8, border: "none",
  background: "var(--navy-800)", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
};
