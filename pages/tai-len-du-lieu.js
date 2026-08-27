import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { listPendingUploads, uploadPendingFile, deletePendingUpload, uploadKiemKeThangReport, getUser, getLuyKeStatus, uploadLuyKe } from "../lib/api";

const ADMIN_ROLES = ["admin", "super_admin"];

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const now = new Date();
const CURRENT_MONTH = String(now.getMonth() + 1).padStart(2, "0");
const CURRENT_YEAR = now.getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

export default function TaiLenDuLieuPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [uploadingType, setUploadingType] = useState(null);
  const kiemKeFileInputRef = useRef(null);
  const chuDeFileInputRef = useRef(null);
  const luyKeFileInputRef = useRef(null);

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

  useEffect(() => {
    const user = getUser();
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      router.replace("/");
      return;
    }
    setChecked(true);
    load();
    reloadLuyKeStatus();
  }, []);

  function load() {
    listPendingUploads().then(setRows).catch((err) => setError(err.message));
  }

  function reloadLuyKeStatus() {
    getLuyKeStatus().then((r) => setLuyKeMonths(r.months || [])).catch(() => {});
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
        <p>Báo cáo kiểm kê tháng xử lý ngay khi upload. Báo cáo chủ đề tháng và dữ liệu khác vẫn qua PC riêng xử lý.</p>
      </div>

      {/* ---- Báo cáo kiểm kê (tháng) — xử lý ngay ---- */}
      <div className="card">
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
      <div className="card">
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
                      <button onClick={() => handleDelete(r.id)} style={deleteBtnStyle}>Xóa</button>
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
      <div className="card">
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

      <div className="placeholder-box">
        Mục <strong>"Đã kiểm"</strong> / <strong>"Đang kiểm"</strong> (Theo dõi kiểm kê hàng ngày)
        không upload thủ công ở đây — dữ liệu đồng bộ <strong>tự động mỗi ngày lúc 23h</strong>
        từ file Excel local trên PC riêng, hoặc bấm nút "Đồng bộ ngay" ở trang Theo dõi kiểm kê.
      </div>
    </Layout>
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
