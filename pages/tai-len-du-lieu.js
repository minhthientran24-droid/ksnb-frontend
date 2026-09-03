import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import ReferenceFilesPanel, { REFERENCE_ITEMS } from "../components/ReferenceFilesPanel";
import { useAllowedKeys } from "../lib/permissions";
import {
  listPendingUploads, uploadPendingFile, deletePendingUpload, uploadKiemKeThangReport, getUser,
  getLuyKeStatus, uploadLuyKe, getXknkCanTonMonths, uploadXknkCanTon, downloadReferenceFilesTemplate,
  downloadDanhSachShopTemplate,
} from "../lib/api";
import { llv2BridgeLogin, llv2UploadDanhSach, llv2DownloadDanhSachUrl } from "../lib/llv2Api";

const ADMIN_ROLES = ["admin", "super_admin"];

// Dữ liệu tham chiếu riêng cho "Gửi mail BCKS" (chốt 27/08 lần 19, dời từ
// trang đó sang đây) — Giá bán/Danh sách nhân viên/DM cắt liều không cần
// ở đây (Giá bán không cần nữa; Danh sách nhân viên dùng chung với Hỗ Trợ
// Kiểm Kê; DM cắt liều xử lý sẵn trong chính file báo cáo bên đó rồi).
const GUI_MAIL_REFERENCE_ITEMS = [
  { key: "shopinfo", label: "Danh sách shop mở bán" },
  { key: "cc_by_vung", label: "Danh sách email vùng" },
];

// Dữ liệu tham chiếu riêng cho "Hỗ Trợ Kiểm Kê" (chốt 27/08 lần 20, dời
// từ 2 tab "Tổng hợp Báo cáo Kiểm Soát Sau Kiểm Kê" + "Hỗ trợ kiểm kê
// shop VX" sang đây).
const CAT_LIEU_REFERENCE_ITEMS = [
  { key: "dmsp_cat_lieu", label: "DM sản phẩm cắt liều (DMSP_CatLieu)" },
];
const VX_REFERENCE_ITEMS = [
  { key: "msp_loai_tru_vx", label: "MSP loại trừ xử lý tồn kho VX (MSP_LoaiTru_VX)" },
];

// Gộp cả 4 nhóm thành 1 lưới duy nhất (chốt 27/08 lần 23) — bỏ hết tiêu
// đề/ghi chú riêng từng nhóm, chỉ còn 1 tiêu đề tổng "Dữ liệu tham chiếu"
// ở card cha.
const ALL_REFERENCE_ITEMS = [
  ...REFERENCE_ITEMS, ...GUI_MAIL_REFERENCE_ITEMS, ...CAT_LIEU_REFERENCE_ITEMS, ...VX_REFERENCE_ITEMS,
];

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const now = new Date();
const CURRENT_MONTH = String(now.getMonth() + 1).padStart(2, "0");
const CURRENT_YEAR = now.getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

export default function TaiLenDuLieuPage() {
  const router = useRouter();
  const { can } = useAllowedKeys();
  const [checked, setChecked] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [uploadingType, setUploadingType] = useState(null);
  const kiemKeFileInputRef = useRef(null);
  const chuDeFileInputRef = useRef(null);
  const luyKeFileInputRef = useRef(null);
  const xknkFileInputRef = useRef(null);

  // Tải template 10 sheet cho khối "Dữ liệu tham chiếu" (chốt 27/08 lần 24)
  const [refTemplateBusy, setRefTemplateBusy] = useState(false);
  async function handleDownloadRefTemplate() {
    setRefTemplateBusy(true);
    try {
      await downloadReferenceFilesTemplate();
    } catch (err) {
      alert(err.message || "Tải template thất bại");
    } finally {
      setRefTemplateBusy(false);
    }
  }

  // Báo cáo kiểm kê (tháng) — xử lý NGAY, không qua hàng chờ PC
  const [kiemKePeriod, setKiemKePeriod] = useState({ month: CURRENT_MONTH, year: CURRENT_YEAR });
  const [kiemKeResult, setKiemKeResult] = useState(null); // {periodLabel, displayName} sau khi up thành công
  const [kiemKeError, setKiemKeError] = useState("");

  // Báo cáo kiểm soát chủ đề (tháng) — vẫn theo luồng cũ: up tạm, chờ PC xử lý
  const [chuDePeriod, setChuDePeriod] = useState({ month: CURRENT_MONTH, year: CURRENT_YEAR });

  // Dữ liệu Lũy Kế (chốt 27/08, thêm chiều tháng lần 2) — mỗi tháng 1 bộ
  // data riêng, up tháng nào chỉ xóa/ghi đúng tháng đó.
  const [luyKePeriod, setLuyKePeriod] = useState({ month: CURRENT_MONTH, year: CURRENT_YEAR });
  const [luyKeMonths, setLuyKeMonths] = useState([]); // [{thang, count, uploaded_at}]
  const [luyKeResult, setLuyKeResult] = useState(null);
  const [luyKeError, setLuyKeError] = useState("");

  // Data Cân tồn XK-NK (chốt 27/08 lần 5, dời từ "Theo dõi XK-NK" sang +
  // thêm chiều tháng) — mỗi tháng 1 bộ data riêng, up tháng nào chỉ
  // xóa/ghi đúng tháng đó.
  const [xknkPeriod, setXknkPeriod] = useState({ month: CURRENT_MONTH, year: CURRENT_YEAR });
  const [xknkMonths, setXknkMonths] = useState([]); // [{thang, matched_rows, total_rows, uploaded_at, uploaded_by, source_filename}]
  const [xknkResult, setXknkResult] = useState(null);
  const [xknkError, setXknkError] = useState("");

  useEffect(() => {
    const user = getUser();
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      router.replace("/");
      return;
    }
    setChecked(true);
    load();
    reloadLuyKeStatus();
    reloadXknkStatus();
    // Bridge sang phiên app1_ (Phân công & Quản lý) — cần cho nút Upload/
    // Tải "Danh sách shop" bên dưới (dời từ "Phân công KSNB kiểm kê" sang,
    // chốt 27/08 lần 21). Trang này đã CHỈ admin/super_admin vào được nên
    // bridge luôn ở đây, không cần đợi anh ghé "Phân công KSNB kiểm kê"
    // trước.
    llv2BridgeLogin().catch(() => {}); // lỗi bridge không chặn các mục upload khác trên trang
  }, []);

  function load() {
    listPendingUploads().then(setRows).catch((err) => setError(err.message));
  }

  function reloadLuyKeStatus() {
    getLuyKeStatus().then((r) => setLuyKeMonths(r.months || [])).catch(() => {});
  }

  function reloadXknkStatus() {
    getXknkCanTonMonths().then((r) => setXknkMonths(r.months || [])).catch(() => {});
  }

  async function handleXknkFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const thang = `${xknkPeriod.year}-${xknkPeriod.month}`;
    if (!confirm(`Upload file này sẽ XÓA SẠCH dữ liệu Cân tồn XK-NK của THÁNG ${thang} hiện có (nếu có) rồi ghi lại từ đầu — không dùng lại data cũ của tháng này. Các tháng khác không bị ảnh hưởng. Tiếp tục?`)) {
      e.target.value = "";
      return;
    }
    setUploadingType("xknk_can_ton");
    setXknkError("");
    setXknkResult(null);
    try {
      const res = await uploadXknkCanTon(thang, file);
      setXknkResult({ thang: res.thang, matched_rows: res.matched_rows, total_rows: res.total_rows });
      e.target.value = "";
      reloadXknkStatus();
    } catch (err) {
      setXknkError(err.message || "Upload thất bại");
    } finally {
      setUploadingType(null);
    }
  }

  async function handleLuyKeFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const thang = `${luyKePeriod.year}-${luyKePeriod.month}`;
    if (!confirm(`Upload file này sẽ XÓA SẠCH dữ liệu Lũy Kế của THÁNG ${thang} hiện có (nếu có) rồi ghi lại từ đầu — không dùng lại data cũ của tháng này. Các tháng khác không bị ảnh hưởng. Tiếp tục?`)) {
      e.target.value = "";
      return;
    }
    setUploadingType("luy_ke");
    setLuyKeError("");
    setLuyKeResult(null);
    try {
      const res = await uploadLuyKe(thang, file);
      setLuyKeResult({ count: res.count, thang: res.thang });
      e.target.value = "";
      reloadLuyKeStatus();
    } catch (err) {
      setLuyKeError(err.message || "Upload thất bại");
    } finally {
      setUploadingType(null);
    }
  }

  async function handleKiemKeFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const periodLabel = `${kiemKePeriod.year}-${kiemKePeriod.month}`;
    setUploadingType("kiem_ke_thang");
    setKiemKeError("");
    setKiemKeResult(null);
    try {
      const report = await uploadKiemKeThangReport(periodLabel, file);
      setKiemKeResult({ periodLabel: report.period_label, displayName: report.display_name });
      e.target.value = "";
    } catch (err) {
      setKiemKeError(err.message || "Upload thất bại");
    } finally {
      setUploadingType(null);
    }
  }

  async function handleChuDeFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const periodLabel = `${chuDePeriod.year}-${chuDePeriod.month}`;
    setUploadingType("chu_de_thang");
    setError("");
    try {
      await uploadPendingFile("chu_de_thang", periodLabel, file);
      e.target.value = "";
      load();
    } catch (err) {
      setError(err.message || "Upload thất bại");
    } finally {
      setUploadingType(null);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Xóa file này? (File gốc trên server sẽ bị xóa vĩnh viễn)")) return;
    try {
      await deletePendingUpload(id);
      load();
    } catch (err) {
      alert(err.message || "Xóa thất bại");
    }
  }

  if (!checked) return null;

  const chuDeRows = rows.filter((r) => r.upload_type === "chu_de_thang");

  return (
    <Layout crumb="Tải lên dữ liệu">
      <div className="page-head">
        <h1>Tải lên dữ liệu</h1>
      </div>

      {/* ---- Dữ liệu tham chiếu — gộp cả 4 nhóm (Kiểm kê Thanh Lý/Gửi mail
          BCKS/Cắt liều/VX) thành 1 lưới duy nhất, bỏ hết tiêu đề/ghi chú
          riêng từng nhóm (chốt 27/08 lần 23 — trước đó mỗi nhóm 1 khối
          tiêu đề riêng bên trong). ---- */}
      <div className="card" style={{ display: can("/tai-len-du-lieu::tham-chieu") ? undefined : "none" }}>
        <div className="card-head">
          <h3>🗂️ Dữ liệu tham chiếu</h3>
          <button className="fbtn" disabled={refTemplateBusy} onClick={handleDownloadRefTemplate}>
            {refTemplateBusy ? "Đang tải..." : "📥 Tải template (10 sheet)"}
          </button>
        </div>
        <div className="card-body">
          <ReferenceFilesPanel bare hideHeader items={ALL_REFERENCE_ITEMS} />
        </div>
      </div>

      {/* ---- Danh sách shop (Phân công KSNB kiểm kê) — dời từ "Phân công
          KSNB kiểm kê" sang đây (chốt 27/08 lần 21). ---- */}
      {can("/tai-len-du-lieu::danh-sach-shop") && <DanhSachShopUploadBar />}

      {/* ---- Báo cáo kiểm kê (tháng) — xử lý ngay ---- */}
      <div className="card" style={{ display: can("/tai-len-du-lieu::kiem-ke-thang") ? undefined : "none" }}>
        <div className="card-head"><h3>Báo cáo kiểm kê (tháng)</h3></div>
        <div className="card-body" style={{ padding: "16px 20px" }}>
          <p style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 12 }}>
            Kiểm kê hàng hóa — chốt 1 lần/tháng, gồm 4 mục: thống kê truy thu, TB shop 3 tháng, TB nhân viên, top shop.
            Upload đúng file theo mẫu <strong>bao-cao-kiem-ke-thang-TEMPLATE.xlsx</strong> — hệ thống đọc, tính toán và
            đăng lên web <strong>ngay lập tức</strong>, không cần chờ xử lý.
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={labelStyle}>Kỳ báo cáo — Tháng</label>
              <select
                value={kiemKePeriod.month}
                onChange={(e) => setKiemKePeriod({ ...kiemKePeriod, month: e.target.value })}
                style={selectStyle}
              >
                {MONTH_OPTIONS.map((m) => <option key={m} value={m}>Tháng {m}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Năm</label>
              <select
                value={kiemKePeriod.year}
                onChange={(e) => setKiemKePeriod({ ...kiemKePeriod, year: Number(e.target.value) })}
                style={selectStyle}
              >
                {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Chọn file Excel</label>
              <input
                ref={kiemKeFileInputRef}
                type="file"
                accept=".xlsx,.xls"
                disabled={uploadingType === "kiem_ke_thang"}
                onChange={handleKiemKeFileChange}
                style={{ display: "none" }}
              />
              <button
                type="button"
                className="upload-btn"
                onClick={() => kiemKeFileInputRef.current?.click()}
                disabled={uploadingType === "kiem_ke_thang"}
              >
                📤 Tải lên file Excel
              </button>
            </div>
            {uploadingType === "kiem_ke_thang" && <span style={{ fontSize: 12.5, color: "var(--text-400)" }}>Đang xử lý...</span>}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-400)", marginTop: 8 }}>
            Mặc định là kỳ hiện tại ({CURRENT_MONTH}/{CURRENT_YEAR}) — đổi lại nếu anh đang up bù cho tháng trước.
          </p>
          {kiemKeError && (
            <div className="placeholder-box" style={{ marginTop: 14, borderColor: "var(--danger)", color: "var(--danger)" }}>
              {kiemKeError}
            </div>
          )}
          {kiemKeResult && (
            <div style={successBoxStyle}>
              ✅ Đã xử lý và đăng báo cáo <strong>{kiemKeResult.displayName}</strong> lên web thành công.{" "}
              <Link href={`/bao-cao/${kiemKeResult.periodLabel}`}>Xem báo cáo →</Link>
            </div>
          )}
        </div>
      </div>

      {/* ---- Báo cáo kiểm soát chủ đề (tháng) — vẫn qua PC xử lý ---- */}
      <div className="card" style={{ display: can("/tai-len-du-lieu::chu-de-thang") ? undefined : "none" }}>
        <div className="card-head">
          <h3>Báo cáo kiểm soát chủ đề (tháng)</h3>
          <span className="note">{chuDeRows.length} file chờ xử lý</span>
        </div>
        <div className="card-body" style={{ padding: "16px 20px" }}>
          <p style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 12 }}>
            Chủ đề trọng tâm kiểm soát trong tháng — chốt 1 lần/tháng. File lưu tạm trên server, PC riêng tải về xử lý.
          </p>
          {error && <div className="placeholder-box">{error}</div>}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={labelStyle}>Kỳ báo cáo — Tháng</label>
              <select
                value={chuDePeriod.month}
                onChange={(e) => setChuDePeriod({ ...chuDePeriod, month: e.target.value })}
                style={selectStyle}
              >
                {MONTH_OPTIONS.map((m) => <option key={m} value={m}>Tháng {m}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Năm</label>
              <select
                value={chuDePeriod.year}
                onChange={(e) => setChuDePeriod({ ...chuDePeriod, year: Number(e.target.value) })}
                style={selectStyle}
              >
                {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Chọn file Excel</label>
              <input
                ref={chuDeFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={uploadingType === "chu_de_thang"}
                onChange={handleChuDeFileChange}
                style={{ display: "none" }}
              />
              <button
                type="button"
                className="upload-btn"
                onClick={() => chuDeFileInputRef.current?.click()}
                disabled={uploadingType === "chu_de_thang"}
              >
                📤 Tải lên file Excel
              </button>
            </div>
            {uploadingType === "chu_de_thang" && <span style={{ fontSize: 12.5, color: "var(--text-400)" }}>Đang tải lên...</span>}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-400)", marginTop: 8 }}>
            Mặc định là kỳ hiện tại ({CURRENT_MONTH}/{CURRENT_YEAR}) — đổi lại nếu anh đang up bù cho tháng trước.
          </p>
          {chuDeRows.length > 0 && (
            <table style={{ marginTop: 16 }}>
              <thead>
                <tr><th>Tên file</th><th>Kỳ báo cáo</th><th>Thời gian up</th><th>Trạng thái</th><th></th></tr>
              </thead>
              <tbody>
                {chuDeRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.original_filename}</td>
                    <td>{r.note || "-"}</td>
                    <td>{new Date(r.created_at).toLocaleString("vi-VN")}</td>
                    <td>
                      <span className={`pill ${r.status === "pending" ? "warn" : "ok"}`}>
                        {r.status === "pending" ? "Chờ PC xử lý" : "Đã xử lý"}
                      </span>
                    </td>
                    <td>
                      {can("/tai-len-du-lieu::chu-de-thang::xoa") && (
                        <button onClick={() => handleDelete(r.id)} style={deleteBtnStyle}>Xóa</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ---- Dữ liệu Lũy Kế — mỗi THÁNG 1 bộ data riêng, up tháng nào chỉ
          xóa/ghi đúng tháng đó, không đụng các tháng khác (chốt 27/08 lần 2) ---- */}
      <div className="card" style={{ display: can("/tai-len-du-lieu::luy-ke") ? undefined : "none" }}>
        <div className="card-head">
          <h3>Dữ liệu Lũy Kế</h3>
          <span className="note">{luyKeMonths.length > 0 ? `${luyKeMonths.length} tháng đã có data` : "Chưa có dữ liệu"}</span>
        </div>
        <div className="card-body" style={{ padding: "16px 20px" }}>
          <p style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 12 }}>
            File đúng mẫu cột: <strong>Mã Long Châu | Tên Long Châu | Luỹ kế được giữ lại</strong>.
            Mỗi tháng có 1 bộ data riêng — up cho tháng nào sẽ <strong>XÓA SẠCH data cũ của ĐÚNG tháng đó</strong> rồi
            ghi lại data mới, các tháng khác giữ nguyên không đổi.
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={labelStyle}>Dữ liệu cho — Tháng</label>
              <select
                value={luyKePeriod.month}
                onChange={(e) => setLuyKePeriod({ ...luyKePeriod, month: e.target.value })}
                style={selectStyle}
              >
                {MONTH_OPTIONS.map((m) => <option key={m} value={m}>Tháng {m}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Năm</label>
              <select
                value={luyKePeriod.year}
                onChange={(e) => setLuyKePeriod({ ...luyKePeriod, year: Number(e.target.value) })}
                style={selectStyle}
              >
                {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Chọn file Excel</label>
              <input
                ref={luyKeFileInputRef}
                type="file"
                accept=".xlsx,.xls"
                disabled={uploadingType === "luy_ke"}
                onChange={handleLuyKeFileChange}
                style={{ display: "none" }}
              />
              <button
                type="button"
                className="upload-btn"
                onClick={() => luyKeFileInputRef.current?.click()}
                disabled={uploadingType === "luy_ke"}
              >
                📤 {uploadingType === "luy_ke" ? "Đang xử lý..." : "Tải lên file Lũy Kế"}
              </button>
            </div>
            {uploadingType === "luy_ke" && <span style={{ fontSize: 12.5, color: "var(--text-400)" }}>Đang xử lý...</span>}
          </div>
          {luyKeError && (
            <div className="placeholder-box" style={{ marginTop: 14, borderColor: "var(--danger)", color: "var(--danger)" }}>
              {luyKeError}
            </div>
          )}
          {luyKeResult && (
            <div style={successBoxStyle}>
              ✅ Đã xóa data cũ của tháng <strong>{luyKeResult.thang}</strong> và ghi lại <strong>{luyKeResult.count}</strong> dòng dữ liệu mới.
            </div>
          )}
          {luyKeMonths.length > 0 && (
            <table style={{ marginTop: 16 }}>
              <thead>
                <tr><th>Tháng</th><th>Số dòng</th><th>Up lần gần nhất</th></tr>
              </thead>
              <tbody>
                {luyKeMonths.map((m) => (
                  <tr key={m.thang}>
                    <td>{m.thang}</td>
                    <td>{m.count}</td>
                    <td>{m.uploaded_at ? new Date(m.uploaded_at).toLocaleString("vi-VN") : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ---- Data Cân tồn XK-NK — dời từ "Theo dõi XK-NK" sang đây, mỗi
          THÁNG 1 bộ data riêng, up tháng nào chỉ xóa/ghi đúng tháng đó
          (chốt 27/08 lần 5) ---- */}
      <div className="card" style={{ display: can("/tai-len-du-lieu::can-ton-xknk") ? undefined : "none" }}>
        <div className="card-head">
          <h3>Data Cân tồn XK-NK</h3>
          <span className="note">{xknkMonths.length > 0 ? `${xknkMonths.length} tháng đã có data` : "Chưa có dữ liệu"}</span>
        </div>
        <div className="card-body" style={{ padding: "16px 20px" }}>
          <p style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 12 }}>
            File báo cáo Xuất Khác - Nhập Khác gốc (do anh Thiện xuất, dạng .csv) — dùng cho tab
            "Theo dõi cân tồn" ở menu <strong>Theo dõi XK-NK</strong>. Mỗi tháng có 1 bộ data riêng — up cho
            tháng nào sẽ <strong>XÓA SẠCH data cũ của ĐÚNG tháng đó</strong> rồi ghi lại data mới, các tháng
            khác giữ nguyên không đổi.
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={labelStyle}>Dữ liệu cho — Tháng</label>
              <select
                value={xknkPeriod.month}
                onChange={(e) => setXknkPeriod({ ...xknkPeriod, month: e.target.value })}
                style={selectStyle}
              >
                {MONTH_OPTIONS.map((m) => <option key={m} value={m}>Tháng {m}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Năm</label>
              <select
                value={xknkPeriod.year}
                onChange={(e) => setXknkPeriod({ ...xknkPeriod, year: Number(e.target.value) })}
                style={selectStyle}
              >
                {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Chọn file XK-NK</label>
              <input
                ref={xknkFileInputRef}
                type="file"
                accept=".csv,.txt"
                disabled={uploadingType === "xknk_can_ton"}
                onChange={handleXknkFileChange}
                style={{ display: "none" }}
              />
              <button
                type="button"
                className="upload-btn"
                onClick={() => xknkFileInputRef.current?.click()}
                disabled={uploadingType === "xknk_can_ton"}
              >
                📤 {uploadingType === "xknk_can_ton" ? "Đang xử lý..." : "Tải lên file XK-NK"}
              </button>
            </div>
            {uploadingType === "xknk_can_ton" && <span style={{ fontSize: 12.5, color: "var(--text-400)" }}>Đang xử lý (file lớn, có thể mất chút thời gian)...</span>}
          </div>
          {xknkError && (
            <div className="placeholder-box" style={{ marginTop: 14, borderColor: "var(--danger)", color: "var(--danger)" }}>
              {xknkError}
            </div>
          )}
          {xknkResult && (
            <div style={successBoxStyle}>
              ✅ Đã xóa data cũ của tháng <strong>{xknkResult.thang}</strong> và ghi lại{" "}
              <strong>{xknkResult.matched_rows?.toLocaleString("vi-VN")}</strong>/
              {xknkResult.total_rows?.toLocaleString("vi-VN")} dòng khớp "Xử lý kiểm kê tự động".
            </div>
          )}
          {xknkMonths.length > 0 && (
            <table style={{ marginTop: 16 }}>
              <thead>
                <tr><th>Tháng</th><th>Số dòng khớp</th><th>Up lần gần nhất</th><th>Người up</th></tr>
              </thead>
              <tbody>
                {xknkMonths.map((m) => (
                  <tr key={m.thang}>
                    <td>{m.thang}</td>
                    <td>{m.matched_rows?.toLocaleString("vi-VN")}/{m.total_rows?.toLocaleString("vi-VN")}</td>
                    <td>{m.uploaded_at ? new Date(m.uploaded_at).toLocaleString("vi-VN") : "-"}</td>
                    <td>{m.uploaded_by || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="placeholder-box">
        Mục <strong>"Đã kiểm"</strong> / <strong>"Đang kiểm"</strong> (Theo dõi kiểm kê hàng ngày)
        không upload thủ công ở đây — dữ liệu đồng bộ <strong>tự động mỗi ngày lúc 23h</strong>
        từ file Excel local trên PC riêng, hoặc bấm nút "Đồng bộ ngay" ở trang Theo dõi kiểm kê.
      </div>
    </Layout>
  );
}

// "Danh sách shop" cho menu "Phân công KSNB kiểm kê" — dời sang đây (chốt
// 27/08 lần 21), y nguyên logic cũ (UploadDanhSachBar), chỉ khác không
// còn `onDone` reload danh sách shop (trang đó tự tải lại khi mở lên).
// Giải mã base64 -> tải file .xlsx về máy (chốt 28/08, dùng cho file lỗi
// upload danh sách shop — cùng cách làm với các job trả file base64 khác
// trong app, xem lib/api.js).
function downloadBase64Xlsx(base64, filename) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "file.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function DanhSachShopUploadBar() {
  const [busy, setBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const [errorFile, setErrorFile] = useState(null); // { base64, filename, count }

  async function onPickFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // cho phép chọn lại đúng file lần sau
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setErrorFile(null);
    try {
      const r = await llv2UploadDanhSach(file);
      // Chốt 28/08 — mọi dòng không xử lý được (thiếu field bắt buộc, sai
      // Vùng/Loại shop, hay rơi vào lô lỗi) giờ gom vào 1 file lỗi tải về
      // được kèm lý do cụ thể, thay vì chỉ đoán qua vài dòng gợi ý.
      const errText = r.error_rows_count
        ? ` ⚠️ ${r.error_rows_count} dòng không xử lý được — tải file lỗi bên dưới để xem chi tiết từng dòng.`
        : "";
      setMsg({
        ok: true,
        text: `✅ Đã xử lý ${r.total_rows} dòng — thêm mới ${r.shop_added} shop, cập nhật kết quả kiểm gần nhất cho ${r.report_rows_updated} shop. File trạng thái trên server đã được ghi lại.${errText}`,
      });
      if (r.error_file_base64) {
        setErrorFile({ base64: r.error_file_base64, filename: r.error_filename, count: r.error_rows_count });
      }
    } catch (err) {
      setMsg({ ok: false, text: "❌ " + err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadTemplate() {
    setTemplateBusy(true);
    try {
      await downloadDanhSachShopTemplate();
    } catch (err) {
      alert(err.message || "Tải file mẫu thất bại");
    } finally {
      setTemplateBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head"><h3>Danh sách shop (Phân công KSNB kiểm kê)</h3></div>
      <div className="card-body" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <button className="fbtn" disabled={templateBusy} onClick={handleDownloadTemplate}>
          {templateBusy ? "Đang tải..." : "📥 Tải file mẫu (2 cột đỏ = bắt buộc)"}
        </button>
        <label className="upload-btn" style={{ cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Đang xử lý..." : "⬆️ Upload danh sách shop (Excel)"}
          <input type="file" accept=".xlsx" onChange={onPickFile} disabled={busy} style={{ display: "none" }} />
        </label>
        <a className="fbtn" href={llv2DownloadDanhSachUrl()} target="_blank" rel="noreferrer">⬇️ Tải file trạng thái hiện tại</a>
        <span style={{ fontSize: 12, color: "var(--text-600)" }}>
          Upload lại cùng file mẫu (cột Mã Shop, Tên Shop, Vùng...) để thêm shop mới hoặc cập nhật kết quả kiểm gần nhất — không ảnh hưởng lịch đang chia.
        </span>
        {msg && <div style={{ width: "100%", fontSize: 12.5, color: msg.ok ? "#3E7A2A" : "var(--danger)" }}>{msg.text}</div>}
        {errorFile && (
          <button
            className="fbtn"
            style={{ background: "#FDECEA", borderColor: "var(--danger)", color: "var(--danger)" }}
            onClick={() => downloadBase64Xlsx(errorFile.base64, errorFile.filename)}
          >
            📥 Tải file lỗi ({errorFile.count} dòng)
          </button>
        )}
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 11.5, fontWeight: 600, color: "var(--text-600)", display: "block", marginBottom: 5 };
const selectStyle = { padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "#FAFBFD" };
const deleteBtnStyle = {
  background: "none", border: "1px solid var(--border)", borderRadius: 6,
  padding: "5px 12px", fontSize: 12, color: "var(--danger)", cursor: "pointer",
};
const successBoxStyle = {
  marginTop: 14, background: "#EAF6E5", border: "1px solid #B9E0A8", borderRadius: 8,
  padding: "12px 16px", fontSize: 13, color: "#33691E",
};
