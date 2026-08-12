import { useRef, useState } from "react";
import Layout from "../components/Layout";

// TODO: phần xử lý file tồn kho thanh lý thật sẽ làm sau — hiện tại chỉ có
// khung UI (chọn file -> "xử lý" -> khung kết quả tải về), mô phỏng bằng
// setTimeout, chưa gọi API thật. Khi có logic xử lý, thay hàm này bằng lời
// gọi API thật (upload file, nhận về file/link kết quả).
function fakeProcessTonKho(file, onDone) {
  setTimeout(() => onDone({ filename: file.name }), 1600);
}

export default function HoTroKiemKePage() {
  const [tab, setTab] = useState("thanh-ly"); // "thanh-ly" | "khac"
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null); // { filename } | null
  const fileInputRef = useRef(null);

  function handleTonKhoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    setResult(null);
    fakeProcessTonKho(file, (res) => {
      setProcessing(false);
      setResult(res);
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
          <div className="card">
            <div className="card-head"><h3>🛠️ Hỗ trợ xử lý tồn kho thanh lý</h3></div>
            <div className="card-body">
              <p style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 12, lineHeight: 1.6 }}>
                Chọn file tồn kho từ máy tính — hệ thống xử lý rồi trả kết quả ngay trên trang để tải về.
              </p>
              <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleTonKhoUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={processing}
                style={uploadBtnStyle}
              >
                📤 Tải lên file tồn kho
              </button>

              {processing && (
                <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-600)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="tiny-spinner" />
                  Đang xử lý file, vui lòng đợi...
                </div>
              )}

              {result && !processing && (
                <div style={resultBoxStyle}>
                  <span style={{ fontSize: 12.5, color: "#3E7A2A", fontWeight: 600 }}>
                    ✅ Đã xử lý xong file &quot;{result.filename}&quot;
                  </span>
                  <button style={downloadBtnStyle}>📥 Tải file kết quả về</button>
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
      )}

      {tab === "khac" && (
        <div className="placeholder-box">
          Tab &quot;Kiểm kê khác&quot; — chưa xác định nội dung/cấu trúc dữ liệu.
        </div>
      )}
    </Layout>
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
