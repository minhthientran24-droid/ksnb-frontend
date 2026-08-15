import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import {
  checkKiemKeCanDate, capNhatKetQuaKiemKe, getKiemKeThanhLyReferenceFiles, uploadKiemKeThanhLyReferenceFile, getUser,
} from "../lib/api";

const REFERENCE_ITEMS = [
  { key: "nganh_loai", label: "Ngành/Loại (Nganh_Loai)" },
  { key: "quydinh_can_date", label: "Quy định cận date (QuyDinh_CanDate)" },
  { key: "gia_ban", label: "Giá bán (GiaBan)" },
  { key: "danh_sach_nhan_vien", label: "Danh sách nhân viên (DanhSachNhanVien)" },
  { key: "kiemke_parquet", label: "Lịch sử kiểm kê (KIEMKE_ALL.parquet)" },
  { key: "quydoi_dvt", label: "Quy đổi đơn vị tính (QuyDoiDVT)" },
];

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function HoTroKiemKePage() {
  const [tab, setTab] = useState("thanh-ly"); // "thanh-ly" | "khac"
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null); // { filename, blob } | null
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const me = getUser();
  const isAdmin = ["admin", "super_admin"].includes(me?.role);
  // Tải lên kết quả kiểm kê thanh lý: mọi role được dùng, trừ viewer.
  const canUploadKetQua = me?.role && me.role !== "viewer";
  // Tải danh sách LCNB Về Kho Tổng: chỉ admin/super_admin/editor (không gồm editor_base, viewer).
  const canDownloadLcnb = ["admin", "super_admin", "editor"].includes(me?.role);

  // Cập nhật kết quả kiểm kê thanh lý -> xuất file Xuất Khác Tính Giá Trị
  const [ketQuaProcessing, setKetQuaProcessing] = useState(false);
  const [ketQuaResult, setKetQuaResult] = useState(null); // { filename, blob, soDong } | null
  const [ketQuaError, setKetQuaError] = useState("");
  const ketQuaFileInputRef = useRef(null);

  // Hỗ trợ xử lý báo cáo kiểm kê hàng thường - hàng cắt liều — UI dựng
  // trước, chưa nối backend (chưa có nghiệp vụ xử lý), bấm chọn file sẽ
  // báo "đang hoàn thiện" giống các nút khác đang chờ hoàn thiện trên trang.
  const [hangThuongProcessing, setHangThuongProcessing] = useState(false);
  const hangThuongFileInputRef = useRef(null);

  function handleComingSoon() {
    alert("Tính năng đang được hoàn thiện, sẽ sớm ra mắt.");
  }

  function handleHangThuongUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    handleComingSoon();
  }

  async function handleTonKhoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    setResult(null);
    setError("");
    try {
      const blob = await checkKiemKeCanDate(file);
      setResult({ filename: `KetQua_KiemKeCanDate_${file.name.replace(/\.[^.]+$/, "")}.xlsx`, blob });
    } catch (err) {
      setError(err.message || "Xử lý thất bại");
    } finally {
      setProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleKetQuaUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setKetQuaProcessing(true);
    setKetQuaResult(null);
    setKetQuaError("");
    try {
      const { blob, soDong } = await capNhatKetQuaKiemKe(file);
      setKetQuaResult({
        filename: `XuatKhacTinhGiaTri_${file.name.replace(/\.[^.]+$/, "")}.xlsx`,
        blob,
        soDong,
      });
    } catch (err) {
      setKetQuaError(err.message || "Xử lý thất bại");
    } finally {
      setKetQuaProcessing(false);
      if (ketQuaFileInputRef.current) ketQuaFileInputRef.current.value = "";
    }
  }

  return (
    <Layout crumb="Hỗ Trợ Kiểm Kê">
      <div className="page-head">
        <h1>Hỗ Trợ Kiểm Kê</h1>
        <p>Các nội dung hỗ trợ nghiệp vụ kiểm kê ngoài báo cáo tháng — chia theo tab bên dưới.</p>
      </div>

      <div className="month-tabs">
        <div className={`month-tab ${tab === "thanh-ly" ? "active" : ""}`} onClick={() => setTab("thanh-ly")}>
          Kiểm kê Thanh Lý
        </div>
        <div className={`month-tab ${tab === "khac" ? "active" : ""}`} onClick={() => setTab("khac")}>
          Kiểm kê hàng thường - hàng cắt liều
        </div>
      </div>

      {tab === "thanh-ly" && (
        <>
          {isAdmin && <ReferenceFilesPanel />}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
            <div className="card">
              <div className="card-head"><h3>🛠️ Hỗ trợ xử lý tồn kho thanh lý</h3></div>
              <div className="card-body">
                <p style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 12, lineHeight: 1.6 }}>
                  Chọn file tồn kho (TonKhoProductItem*.csv) từ máy tính — hệ thống kiểm tra kỳ kiểm kê cận
                  date cho toàn bộ hàng trong kho thanh lý (060), rồi trả file kết quả để tải về ngay.
                </p>
                <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleTonKhoUpload} />
                <button onClick={() => fileInputRef.current?.click()} disabled={processing} style={uploadBtnStyle}>
                  📤 Tải lên file tồn kho
                </button>

                {processing && (
                  <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-600)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="tiny-spinner" />
                    Đang xử lý file, vui lòng đợi...
                  </div>
                )}

                {error && !processing && (
                  <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--danger)" }}>{error}</div>
                )}

                {result && !processing && (
                  <div style={resultBoxStyle}>
                    <span style={{ fontSize: 12.5, color: "#3E7A2A", fontWeight: 600 }}>
                      ✅ Đã xử lý xong
                    </span>
                    <button style={downloadBtnStyle} onClick={() => downloadBlob(result.blob, result.filename)}>
                      📥 Tải file kết quả về
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h3>📋 Cập nhật kết quả kiểm kê thanh lý</h3></div>
              <div className="card-body">
                {canUploadKetQua ? (
                  <>
                    <p style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 12, lineHeight: 1.6 }}>
                      Tải lên file kết quả kiểm kê thanh lý (đã điền Số Lượng Thực Tế, Lý Do, Số lượng truy thu).
                      Hệ thống tách các dòng có <b>Số lượng truy thu &gt; 0</b> để trả về file import{" "}
                      <b>Xuất Khác Tính Giá Trị</b>. Phần ghi nhận LCNB Về Kho Tổng đang được hoàn thiện.
                    </p>
                    <input
                      ref={ketQuaFileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      style={{ display: "none" }}
                      onChange={handleKetQuaUpload}
                    />
                    <button
                      onClick={() => ketQuaFileInputRef.current?.click()}
                      disabled={ketQuaProcessing}
                      style={uploadBtnStyle}
                    >
                      📤 Tải lên file kết quả kiểm kê
                    </button>

                    {ketQuaProcessing && (
                      <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-600)", display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="tiny-spinner" />
                        Đang xử lý file, vui lòng đợi...
                      </div>
                    )}

                    {ketQuaError && !ketQuaProcessing && (
                      <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--danger)" }}>{ketQuaError}</div>
                    )}

                    {ketQuaResult && !ketQuaProcessing && (
                      <div style={resultBoxStyle}>
                        <span style={{ fontSize: 12.5, color: "#3E7A2A", fontWeight: 600 }}>
                          ✅ Đã xử lý xong — {ketQuaResult.soDong} dòng xuất khác tính giá trị
                        </span>
                        <button
                          style={downloadBtnStyle}
                          onClick={() => downloadBlob(ketQuaResult.blob, ketQuaResult.filename)}
                        >
                          📥 Tải file import truy thu
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={lockedBoxStyle}>
                    <span style={{ fontSize: 19, lineHeight: 1.1 }}>🔒</span>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-900)", marginBottom: 3 }}>
                        Không có quyền cập nhật kết quả kiểm kê thanh lý
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-600)", lineHeight: 1.55 }}>
                        Tài khoản <b>Viewer</b> chỉ xem báo cáo, không tải lên được mục này.
                      </div>
                    </div>
                  </div>
                )}

                {canDownloadLcnb && (
                  <>
                    <div style={{ borderTop: "1px solid var(--border)", margin: "16px 0" }} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-900)" }}>
                          📦 Danh sách LCNB Về Kho Tổng
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--text-400)", marginTop: 3 }}>
                          Danh sách luỹ kế của tháng hiện tại
                        </div>
                      </div>
                      <button onClick={handleComingSoon} style={lcnbDlBtnStyle}>📥 Tải về</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "khac" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
          <div className="card">
            <div className="card-head"><h3>🛠️ Hỗ trợ xử lý báo cáo kiểm kê</h3></div>
            <div className="card-body">
              <p style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 12, lineHeight: 1.6 }}>
                Chọn file báo cáo kiểm kê hàng thường - hàng cắt liều từ máy tính — hệ thống kiểm tra và xử lý,
                rồi trả file kết quả để tải về ngay.
              </p>
              <input
                ref={hangThuongFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={handleHangThuongUpload}
              />
              <button
                onClick={() => hangThuongFileInputRef.current?.click()}
                disabled={hangThuongProcessing}
                style={uploadBtnStyle}
              >
                📤 Tải lên báo cáo Xuất Khác - Nhập Khác
              </button>

              {hangThuongProcessing && (
                <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-600)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="tiny-spinner" />
                  Đang xử lý file, vui lòng đợi...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function ReferenceFilesPanel() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [uploadingKey, setUploadingKey] = useState(null);
  const fileInputRefs = useRef({});

  function load() {
    getKiemKeThanhLyReferenceFiles().then(setStatus).catch((err) => setError(err.message));
  }
  useEffect(load, []);

  async function handleUpload(key, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingKey(key);
    setError("");
    try {
      const updated = await uploadKiemKeThanhLyReferenceFile(key, file);
      setStatus(updated);
    } catch (err) {
      setError(err.message || "Upload thất bại");
    } finally {
      setUploadingKey(null);
      if (fileInputRefs.current[key]) fileInputRefs.current[key].value = "";
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>⚙️ Dữ liệu tham chiếu (Admin)</h3>
        <span className="note">Cập nhật khi có quy định/giá bán/lịch sử kiểm kê mới</span>
      </div>
      <div className="card-body">
        {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
          {REFERENCE_ITEMS.map((item) => {
            const info = status?.[item.key];
            const uploading = uploadingKey === item.key;
            return (
              <div key={item.key} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--navy-900)", marginBottom: 6 }}>{item.label}</div>
                {info?.uploaded ? (
                  <div style={{ fontSize: 11, color: "#4C9A2A", marginBottom: 8 }}>
                    ✅ Đã có — cập nhật {new Date(info.updated_at).toLocaleString("vi-VN")}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--text-400)", marginBottom: 8 }}>Chưa có file</div>
                )}
                <input
                  ref={(el) => (fileInputRefs.current[item.key] = el)}
                  type="file"
                  style={{ display: "none" }}
                  onChange={(e) => handleUpload(item.key, e)}
                />
                <button
                  className="fbtn"
                  disabled={uploading}
                  onClick={() => fileInputRefs.current[item.key]?.click()}
                >
                  {uploading ? "Đang tải lên..." : info?.uploaded ? "Thay file mới" : "Tải file lên"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const uploadBtnStyle = {
  background: "var(--navy-800)", color: "#fff", border: "none", borderRadius: 8,
  padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 8,
};
const resultBoxStyle = {
  marginTop: 14, background: "#EAF6E5", border: "1px solid #CFE8C4", borderRadius: 8,
  padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
};
const downloadBtnStyle = {
  background: "#fff", border: "1px solid #4C9A2A", color: "#3E7A2A", borderRadius: 8,
  padding: "8px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
};
const lockedBoxStyle = {
  border: "1.5px dashed var(--border)", borderRadius: 8, padding: "20px 16px",
  display: "flex", alignItems: "flex-start", gap: 12, background: "#F7F9FD",
};
const lcnbDlBtnStyle = {
  background: "#fff", border: "1.5px solid var(--navy-800)", color: "var(--navy-800)", borderRadius: 8,
  padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
};
