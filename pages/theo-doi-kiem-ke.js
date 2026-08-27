import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import {
  getKiemKePeriods, listKiemKe, updateKiemKeGhiChu,
  getShopChiaHomNay, getDangKiem, doiLichShopChiaHomNay, huyDangKiem, getUser,
  downloadKetQuaKiemKeGuiMail, getKetQuaKiemKeGuiMailMonths,
  downloadKetQuaKiemKeGuiMailVaccine, getKetQuaKiemKeGuiMailVaccineMonths,
  downloadLcnbThanhLyHni, downloadLcnbThanhLyHcm, getLcnbThanhLyMonths,
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
function LlvRowsTable({ title, data, isAdmin, searchQuery, showDoiLich, canReschedule, onOpenReschedule, showHuy, onOpenHuy, emptyText, showSoNgayKiem, showTicket }) {
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

  const colCount = 7 + (showSoNgayKiem ? 1 : 0) + (showTicket ? 1 : 0) + (showDoiLich ? 1 : 0) + (showHuy ? 1 : 0);

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
              <th>Hình thức</th><th>Trạng thái</th>{showTicket && <th>Ticket thông báo</th>}{showDoiLich && <th></th>}{showHuy && <th></th>}
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
                  {showHuy && (
                    <td>
                      <button className="fbtn" style={{ color: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => onOpenHuy(r)}>Hủy</button>
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
  const [loai, setLoai] = useState("shop_chia_hom_nay"); // "shop_chia_hom_nay" | "dang_kiem" | "da_kiem" — mặc định vào là tab "Shop được chia - Chuẩn bị kiểm kê" (chốt 22/08)
  // Tab "Đã kiểm" — tách riêng Long Châu/Vaccine (chốt 26/08 lần 12), nút
  // chọn loại trừ lẫn nhau (không cho chọn đồng thời cả 2). Chỉ áp dụng
  // cho "da_kiem" — "dang_kiem"/"shop_chia_hom_nay" không đụng tới.
  const [nhom, setNhom] = useState("long_chau"); // "long_chau" | "vaccine"
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
  // LCNB Thanh Lý HCM/HNI — chốt 26/08 lần 9: mở thêm cho role "editor"
  // (không phải editor_base) được XEM + TẢI, các nút "Tải file kết quả
  // kiểm kê (gửi mail)" Long Châu/Vaccine vẫn CHỈ admin/super_admin như cũ.
  const isEditor = me?.role === "editor";
  const canLcnb = isAdmin || isEditor;
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

  // Huỷ kiểm kê (tab "Đang kiểm", chốt 25/08) — CHỈ admin, bắt buộc nhập
  // lý do + ngày dời lịch. Nút chỉ hiện với admin nên không cần check
  // quyền theo dòng như canReschedule.
  const [huyRow, setHuyRow] = useState(null); // row đang huỷ
  const [huyForm, setHuyForm] = useState({ ngay_can_kiem: "", ly_do: "" });
  const [huyBusy, setHuyBusy] = useState(false);
  const [huyMsg, setHuyMsg] = useState("");

  function openHuy(row) {
    setHuyRow(row);
    setHuyForm({ ngay_can_kiem: "", ly_do: "" });
    setHuyMsg("");
  }

  async function submitHuy() {
    if (!huyForm.ngay_can_kiem || !huyForm.ly_do.trim()) {
      setHuyMsg("❌ Vui lòng nhập đủ ngày dời lịch và lý do.");
      return;
    }
    setHuyBusy(true);
    setHuyMsg("");
    try {
      const r = await huyDangKiem(huyRow.id, huyForm.ngay_can_kiem, huyForm.ly_do);
      setHuyRow(null);
      getDangKiem().then(setDangKiemData).catch((err) => setError(err.message));
      alert(`✅ Đã huỷ kiểm kê shop ${r.ma_shop} — dời sang ngày ${huyForm.ngay_can_kiem}.`);
    } catch (err) {
      setHuyMsg("❌ " + err.message);
    } finally {
      setHuyBusy(false);
    }
  }

  // Tải file log kết quả kiểm kê ghi liên tục mỗi lần gửi mail BCKS (tab
  // "Đã kiểm", chỉ admin) — chốt 21/08, lưu theo tháng + có bộ chọn tháng
  // từ 25/08.
  const [ketQuaLogMonths, setKetQuaLogMonths] = useState([]);
  const [ketQuaLogThang, setKetQuaLogThang] = useState("");
  const [ketQuaLogBusy, setKetQuaLogBusy] = useState(false);
  const [ketQuaLogMsg, setKetQuaLogMsg] = useState("");

  useEffect(() => {
    if (!isAdmin || loai !== "da_kiem") return;
    getKetQuaKiemKeGuiMailMonths()
      .then(({ months }) => {
        setKetQuaLogMonths(months);
        setKetQuaLogThang((t) => (t ? t : months[0] || ""));
      })
      .catch(() => {});
  }, [isAdmin, loai]);

  async function handleDownloadKetQuaLog() {
    setKetQuaLogBusy(true);
    setKetQuaLogMsg("");
    try {
      await downloadKetQuaKiemKeGuiMail(ketQuaLogThang || undefined);
      getKetQuaKiemKeGuiMailMonths().then(({ months }) => setKetQuaLogMonths(months)).catch(() => {});
    } catch (e) {
      setKetQuaLogMsg("❌ " + e.message);
    } finally {
      setKetQuaLogBusy(false);
    }
  }

  // Tải file log kết quả kiểm kê Vaccine, bản song song riêng (tab "Đã
  // kiểm", chỉ admin) — chốt 26/08 lần 7, 4 sheet (Thống kê tổng hợp báo
  // cáo + Kiểm Kê VPKM/VTYT/VX), nút riêng với bản Long Châu ở trên.
  const [ketQuaLogVacMonths, setKetQuaLogVacMonths] = useState([]);
  const [ketQuaLogVacThang, setKetQuaLogVacThang] = useState("");
  const [ketQuaLogVacBusy, setKetQuaLogVacBusy] = useState(false);
  const [ketQuaLogVacMsg, setKetQuaLogVacMsg] = useState("");

  useEffect(() => {
    if (!isAdmin || loai !== "da_kiem") return;
    getKetQuaKiemKeGuiMailVaccineMonths()
      .then(({ months }) => {
        setKetQuaLogVacMonths(months);
        setKetQuaLogVacThang((t) => (t ? t : months[0] || ""));
      })
      .catch(() => {});
  }, [isAdmin, loai]);

  async function handleDownloadKetQuaLogVaccine() {
    setKetQuaLogVacBusy(true);
    setKetQuaLogVacMsg("");
    try {
      await downloadKetQuaKiemKeGuiMailVaccine(ketQuaLogVacThang || undefined);
      getKetQuaKiemKeGuiMailVaccineMonths().then(({ months }) => setKetQuaLogVacMonths(months)).catch(() => {});
    } catch (e) {
      setKetQuaLogVacMsg("❌ " + e.message);
    } finally {
      setKetQuaLogVacBusy(false);
    }
  }

  // "LCNB Thanh Lý về Kho Tổng" (24/08, lưu theo tháng + cắt file >500
  // dòng từ 25/08) — 2 file riêng theo kho nhận, mỗi kho lưu luỹ kế riêng
  // theo tháng, chỉ admin ở tab "Đã kiểm". Mặc định chọn tháng gần nhất có
  // dữ liệu (hoặc để trống = tháng hiện tại nếu chưa có tháng nào).
  const [lcnbMonths, setLcnbMonths] = useState({ hni: [], hcm: [] });
  const [lcnbThang, setLcnbThang] = useState({ hni: "", hcm: "" });
  const [lcnbBusy, setLcnbBusy] = useState({ hni: false, hcm: false });
  const [lcnbMsg, setLcnbMsg] = useState({ hni: "", hcm: "" });

  useEffect(() => {
    if (!canLcnb || loai !== "da_kiem") return;
    ["hni", "hcm"].forEach((kho) => {
      getLcnbThanhLyMonths(kho)
        .then(({ months }) => {
          setLcnbMonths((s) => ({ ...s, [kho]: months }));
          setLcnbThang((s) => (s[kho] ? s : { ...s, [kho]: months[0] || "" }));
        })
        .catch(() => {});
    });
  }, [canLcnb, loai]);

  async function handleDownloadLcnb(kho) {
    setLcnbBusy((s) => ({ ...s, [kho]: true }));
    setLcnbMsg((s) => ({ ...s, [kho]: "" }));
    try {
      const fn = kho === "hni" ? downloadLcnbThanhLyHni : downloadLcnbThanhLyHcm;
      const { soDong, soPhan, chuaXacDinh } = await fn(lcnbThang[kho] || undefined);
      let msg = `✅ Đã tải ${soDong} dòng` + (soPhan > 1 ? ` (cắt thành ${soPhan} file, gộp .zip)` : "") + ".";
      if (chuaXacDinh > 0) {
        msg += ` ⚠️ ${chuaXacDinh} dòng chưa xác định được Mã kho nhận (thiếu dữ liệu Tỉnh/ShopInfo) — không nằm trong file tháng nào.`;
      }
      setLcnbMsg((s) => ({ ...s, [kho]: msg }));
      // Tải xong lần đầu trong tháng hiện tại có thể vừa tạo tháng mới -> nạp lại danh sách tháng
      getLcnbThanhLyMonths(kho).then(({ months }) => setLcnbMonths((s) => ({ ...s, [kho]: months }))).catch(() => {});
    } catch (e) {
      setLcnbMsg((s) => ({ ...s, [kho]: "❌ " + e.message }));
    } finally {
      setLcnbBusy((s) => ({ ...s, [kho]: false }));
    }
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

  // Tab Đã kiểm -> nạp danh sách kỳ (tháng) như cũ — kèm nhom khi loai=da_kiem
  useEffect(() => {
    if (isLlvTab) {
      setPeriods([]);
      setPeriod(null);
      return;
    }
    getKiemKePeriods(loai, loai === "da_kiem" ? nhom : undefined)
      .then((list) => {
        setPeriods(list);
        setPeriod(list.length > 0 ? list[0] : null);
        setRows([]);
      })
      .catch((err) => setError(err.message));
  }, [loai, nhom]);

  useEffect(() => {
    if (!period || isLlvTab) return;
    listKiemKe(period, loai, loai === "da_kiem" ? nhom : undefined).then(setRows).catch((err) => setError(err.message));
  }, [period, loai, nhom]);

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
    .sort((a, b) =>
      (Math.abs(b.gia_tri_non_cl || 0) + Math.abs(b.gia_tri_cat_lieu || 0)) -
      (Math.abs(a.gia_tri_non_cl || 0) + Math.abs(a.gia_tri_cat_lieu || 0))
    );

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
        {canLcnb && loai === "da_kiem" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            {isAdmin && (
              <>
                {/* Line 1: chọn tháng - Tải file kết quả kiểm kê */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                  <select
                    className="month-select"
                    value={ketQuaLogThang} onChange={(e) => setKetQuaLogThang(e.target.value)}
                    title="Chọn tháng file kết quả kiểm kê"
                  >
                    {ketQuaLogMonths.length === 0 && <option value="">Tháng này (chưa có dữ liệu)</option>}
                    {ketQuaLogMonths.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button
                    className="fbtn" disabled={ketQuaLogBusy} onClick={handleDownloadKetQuaLog}
                    style={{ background: "#FFF1E1", borderColor: "var(--orange)", color: "var(--orange)" }}
                  >
                    {ketQuaLogBusy ? "Đang tải..." : "📥 Tải file kết quả kiểm kê (gửi mail)"}
                  </button>
                  {ketQuaLogMsg && <div style={{ fontSize: 12, color: "var(--danger)" }}>{ketQuaLogMsg}</div>}
                </div>

                {/* Line 1b: chọn tháng - Tải file kết quả kiểm kê Vaccine (chốt 26/08 lần 7) */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                  <select
                    className="month-select"
                    value={ketQuaLogVacThang} onChange={(e) => setKetQuaLogVacThang(e.target.value)}
                    title="Chọn tháng file kết quả kiểm kê Vaccine"
                  >
                    {ketQuaLogVacMonths.length === 0 && <option value="">Tháng này (chưa có dữ liệu)</option>}
                    {ketQuaLogVacMonths.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button
                    className="fbtn" disabled={ketQuaLogVacBusy} onClick={handleDownloadKetQuaLogVaccine}
                    style={{ background: "#E8F3FF", borderColor: "var(--blue, #1976d2)", color: "var(--blue, #1976d2)" }}
                  >
                    {ketQuaLogVacBusy ? "Đang tải..." : "📥 Tải file kết quả kiểm kê Vaccine (gửi mail)"}
                  </button>
                  {ketQuaLogVacMsg && <div style={{ fontSize: 12, color: "var(--danger)" }}>{ketQuaLogVacMsg}</div>}
                </div>
              </>
            )}

            {/* Line 2: chọn tháng - LCNB Thanh Lý HCM (admin + editor, chốt 26/08 lần 9) */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
              <select
                className="month-select"
                value={lcnbThang.hcm} onChange={(e) => setLcnbThang((s) => ({ ...s, hcm: e.target.value }))}
                title="Chọn tháng LCNB Thanh Lý HCM"
              >
                {lcnbMonths.hcm.length === 0 && <option value="">Tháng này (chưa có dữ liệu)</option>}
                {lcnbMonths.hcm.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button
                className="fbtn" disabled={lcnbBusy.hcm} onClick={() => handleDownloadLcnb("hcm")}
                style={{ background: "#FFF1E1", borderColor: "var(--orange)", color: "var(--orange)" }}
              >
                {lcnbBusy.hcm ? "Đang tải..." : "📥 LCNB Thanh Lý HCM"}
              </button>
              {lcnbMsg.hcm && <div style={{ fontSize: 12, color: lcnbMsg.hcm.startsWith("❌") ? "var(--danger)" : "var(--text-600)" }}>{lcnbMsg.hcm}</div>}
            </div>

            {/* Line 3: chọn tháng - LCNB Thanh Lý HNI */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
              <select
                className="month-select"
                value={lcnbThang.hni} onChange={(e) => setLcnbThang((s) => ({ ...s, hni: e.target.value }))}
                title="Chọn tháng LCNB Thanh Lý HNI"
              >
                {lcnbMonths.hni.length === 0 && <option value="">Tháng này (chưa có dữ liệu)</option>}
                {lcnbMonths.hni.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button
                className="fbtn" disabled={lcnbBusy.hni} onClick={() => handleDownloadLcnb("hni")}
                style={{ background: "#FFF1E1", borderColor: "var(--orange)", color: "var(--orange)" }}
              >
                {lcnbBusy.hni ? "Đang tải..." : "📥 LCNB Thanh Lý HNI"}
              </button>
              {lcnbMsg.hni && <div style={{ fontSize: 12, color: lcnbMsg.hni.startsWith("❌") ? "var(--danger)" : "var(--text-600)" }}>{lcnbMsg.hni}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Tab chọn Shop được chia hôm nay / Đang kiểm / Đã kiểm (chốt 22/08) */}
      <div className="month-tabs">
        <div className={`month-tab ${loai === "shop_chia_hom_nay" ? "active" : ""}`} onClick={() => setLoai("shop_chia_hom_nay")}>
          📌 Shop được chia - Chuẩn bị kiểm kê
        </div>
        <div className={`month-tab ${loai === "dang_kiem" ? "active" : ""}`} onClick={() => setLoai("dang_kiem")}>
          ⏳ Đang kiểm
        </div>
        <div className={`month-tab ${loai === "da_kiem" ? "active" : ""}`} onClick={() => setLoai("da_kiem")}>
          ✅ Đã kiểm
        </div>
      </div>

      {/* Tab "Đã kiểm" — tách riêng Long Châu/Vaccine (chốt 26/08 lần 12),
          2 nút loại trừ lẫn nhau, không cho chọn đồng thời cả 2. */}
      {loai === "da_kiem" && (
        <div className="month-tabs">
          <div className={`month-tab ${nhom === "long_chau" ? "active" : ""}`} onClick={() => setNhom("long_chau")}>
            🏥 Long Châu
          </div>
          <div className={`month-tab ${nhom === "vaccine" ? "active" : ""}`} onClick={() => setNhom("vaccine")}>
            💉 Vaccine
          </div>
        </div>
      )}

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
        <div className="placeholder-box">
          Chưa có shop {nhom === "vaccine" ? "Vaccine" : "Long Châu"} nào được chuyển sang "Đã kiểm".
        </div>
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
          showHuy={isAdmin}
          onOpenHuy={openHuy}
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

      {huyRow && (
        <Modal
          title={`Huỷ kiểm kê — shop ${huyRow.ma_shop}`}
          subtitle={`${huyRow.ten_shop || ""}${huyRow.ngay_kiem ? ` · Ngày kiểm hiện tại: ${huyRow.ngay_kiem}` : ""}`}
          onClose={() => setHuyRow(null)}
        >
          <div className="field">
            <label className="flabel">Ngày dời lịch</label>
            <input type="date" className="finput" style={{ width: "100%" }}
              value={huyForm.ngay_can_kiem}
              onChange={(e) => setHuyForm({ ...huyForm, ngay_can_kiem: e.target.value })} />
          </div>
          <div className="field">
            <label className="flabel">Lý do huỷ</label>
            <input className="finput" style={{ width: "100%" }}
              value={huyForm.ly_do}
              onChange={(e) => setHuyForm({ ...huyForm, ly_do: e.target.value })} />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-600)", marginBottom: 12 }}>
            Shop sẽ rời khỏi danh sách "Đang kiểm", chuyển về "Chờ chia lịch" với ngày cần kiểm mới là ngày dời lịch nhập ở trên.
          </div>
          {huyMsg && <div style={{ fontSize: 12.5, marginBottom: 12, color: "var(--danger)" }}>{huyMsg}</div>}
          <div className="llv-modal-actions">
            <button className="login-btn" style={{ width: "auto", padding: "9px 20px", background: "var(--danger)" }} disabled={huyBusy} onClick={submitHuy}>
              {huyBusy ? "Đang lưu..." : "Xác nhận huỷ"}
            </button>
            <button className="fbtn" onClick={() => setHuyRow(null)}>Đóng</button>
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
              {" · sắp xếp theo giá trị kiểm kê (lệch nhiều nhất lên đầu)"}
            </span>
          </div>
          <div className="card-body">
            <table>
              <thead>
                <tr>
                  <th>Vùng</th><th>Tên shop</th><th>Ngày kiểm kê</th>
                  <th>Giá trị kiểm kê - Non CL</th><th>Cân tồn - Non CL</th>
                  <th>Kiểm kê - Cắt liều</th><th>Cân tồn - Cắt liều</th>
                  <th>Lũy Kế</th><th>Ước tính truy thu</th><th>Truy thu thanh lý</th>
                  <th>NV kiểm kê</th><th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ textAlign: "left" }}>{r.vung}</td>
                    <td style={{ textAlign: "left" }}>{r.ma_shop}{r.ten_shop ? ` - ${r.ten_shop}` : ""}</td>
                    <td>{r.ngay_kiem_ke || "-"}</td>
                    <td className="num neg">{fmtMoney(r.gia_tri_non_cl)}</td>
                    <td className="num">-</td>
                    <td className="num neg">{fmtMoney(r.gia_tri_cat_lieu)}</td>
                    <td className="num">-</td>
                    <td className="num">-</td>
                    <td className="num">-</td>
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
                  <tr><td colSpan={12} style={{ textAlign: "center", color: "var(--text-400)" }}>
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
