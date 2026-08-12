import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { listReports, deleteReport, getUser } from "../../lib/api";

export default function BaoCaoListPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const isAdmin = ["admin", "super_admin"].includes(getUser()?.role);

  function load() {
    listReports()
      .then(setReports)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    const user = getUser();
    if (user?.role === "editor_base") {
      router.replace("/");
      return;
    }
    setChecked(true);
    load();
  }, []);

  if (!checked) return null;

  async function handleDelete(periodLabel, displayName) {
    if (!confirm(`Xóa hẳn báo cáo "${displayName}"? Không thể hoàn tác.`)) return;
    setDeletingId(periodLabel);
    try {
      await deleteReport(periodLabel);
      load();
    } catch (err) {
      alert(err.message || "Xóa thất bại");
    } finally {
      setDeletingId(null);
    }
  }

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
                {isAdmin && <th></th>}
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
                  {isAdmin && (
                    <td>
                      <button
                        onClick={() => handleDelete(r.period_label, r.display_name)}
                        disabled={deletingId === r.period_label}
                        style={deleteBtnStyle}
                      >
                        {deletingId === r.period_label ? "Đang xóa..." : "🗑️ Xóa"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

const deleteBtnStyle = {
  background: "none", border: "1px solid var(--border)", borderRadius: 6,
  padding: "5px 12px", fontSize: 12, color: "var(--danger)", cursor: "pointer",
};
