import { useEffect, useRef, useState } from "react";
import { getKiemKeThanhLyReferenceFiles, uploadKiemKeThanhLyReferenceFile } from "../lib/api";

// Danh mục "Dữ liệu tham chiếu (Admin)" mặc định — dùng chung cho Kiểm kê
// Thanh Lý (chốt 27/08 lần 18 — tách thành component riêng để dùng lại ở
// menu "Tải lên dữ liệu", trước đây chỉ nằm trong "Hỗ Trợ Kiểm Kê").
export const REFERENCE_ITEMS = [
  { key: "nganh_loai", label: "Ngành/Loại (Nganh_Loai)" },
  { key: "quydinh_can_date", label: "Quy định cận date (QuyDinh_CanDate)" },
  { key: "gia_ban", label: "Giá bán (GiaBan)" },
  { key: "danh_sach_nhan_vien", label: "Danh sách nhân viên (DanhSachNhanVien)" },
  { key: "kiemke_parquet", label: "Lịch sử kiểm kê (KIEMKE_ALL.parquet)" },
  { key: "quydoi_dvt", label: "Quy đổi đơn vị tính (QuyDoiDVT)" },
];

// Component dùng chung cho MỌI khối "Dữ liệu tham chiếu (Admin)" trên toàn
// web (Kiểm kê Thanh Lý ở "Tải lên dữ liệu" + Cắt liều/VX ở "Hỗ Trợ Kiểm
// Kê") — cùng 1 cặp API get/upload theo key, chỉ khác `items`/`title`.
export default function ReferenceFilesPanel({
  items = REFERENCE_ITEMS,
  title = "⚙️ Dữ liệu tham chiếu (Admin)",
  subtitle = "Cập nhật khi có quy định/giá bán/lịch sử kiểm kê mới",
}) {
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
        <h3>{title}</h3>
        <span className="note">{subtitle}</span>
      </div>
      <div className="card-body">
        {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
          {items.map((item) => {
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
                  className="upload-btn"
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
