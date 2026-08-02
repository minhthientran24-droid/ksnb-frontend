import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import { listReports } from "../../lib/api";

export default function BaoCaoListPage() {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    listReports()
      .then(setReports)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Layout crumb="Báo cáo hàng tháng">
      <div className="page-head">
        <h1>Báo cáo hàng tháng</h1>
        <p>Danh sách các kỳ báo cáo giao ban KSNB đã công bố.</p>
      </div>

      {error && <div className="placeholder-box">Không tải được danh sách: {error}</div>}
      {!error && reports.length === 0 && (
        <div className="placeholder-box">Chưa có báo cáo nào được công bố.</div>
      )}

      <div className="card">
        <div className="card-body">
          <table>
            <thead>
              <tr>
                <th>Kỳ báo cáo</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.period_label}>
                  <td>{r.display_name}</td>
                  <td>{r.published ? "Đã công bố" : "Nháp"}</td>
                  <td>
                    <Link href={`/bao-cao/${r.period_label}`}>Xem chi tiết →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
