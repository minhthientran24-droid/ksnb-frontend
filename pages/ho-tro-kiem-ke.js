import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import {
  checkKiemKeCanDate, getKiemKeThanhLyReferenceFiles, uploadKiemKeThanhLyReferenceFile, getUser,
} from "../lib/api";

const REFERENCE_ITEMS = [
  { key: "nganh_loai", label: "Ngành/Loại (Nganh_Loai)" },
  { key: "quydinh_can_date", label: "Quy định cận date (QuyDinh_CanDate)" },
  { key: "gia_ban", label: "Giá bán (GiaBan)" },
  { key: "kiemke_parquet", label: "Lịch sử kiểm kê (KIEMKE_ALL.parquet)" },
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
          Kiểm kê khác
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
                <div className="placeholder-box">Đang chờ xác nhận nội dung — sẽ hoàn thiện sau.</div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "khac" && (
        <div className="placeholder-box">
          Tab &quot;Kiểm kê khác&quot; — chưa xác định nội dung/cấu trúc dữ liệu.
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
