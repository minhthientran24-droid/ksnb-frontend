import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { getLatestChuDe } from "../lib/api";

export default function TheoDoiChuDePage() {
  const [snap, setSnap] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getLatestChuDe()
      .then(setSnap)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Layout crumb="Theo dõi chủ đề">
      <div className="page-head">
        <h1>Theo dõi chủ đề đang kiểm soát</h1>
        <p>Tiến độ xử lý chủ đề trọng tâm trong tháng — dữ liệu đẩy lên cuối mỗi ngày.</p>
      </div>

      {error && (
        <div className="placeholder-box">
          {error.includes("404") || error.includes("Chưa có")
            ? "Chưa có dữ liệu theo dõi chủ đề nào được đẩy lên."
            : `Không tải được dữ liệu: ${error}`}
        </div>
      )}

      {snap && (
        <div className="card">
          <div className="card-head">
            <h3>Chủ đề: {snap.ten_chu_de}</h3>
            <span className="note">Cập nhật ngày {snap.snapshot_date} · Kỳ {snap.period_label}</span>
          </div>
          <div className="card-body">
            <table>
              <thead>
                <tr><th>Nội dung</th><th>Trạng thái</th><th>Phụ trách</th><th>Ghi chú</th></tr>
              </thead>
              <tbody>
                {snap.data.map((row, i) => (
                  <tr key={i}>
                    <td>{row.noi_dung}</td>
                    <td>{row.trang_thai}</td>
                    <td>{row.phu_trach}</td>
                    <td>{row.ghi_chu}</td>
                  </tr>
                ))}
                {snap.data.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-400)" }}>Chưa có case nào</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}
