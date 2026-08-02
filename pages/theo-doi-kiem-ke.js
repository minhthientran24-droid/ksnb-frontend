import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { getKiemKePeriods, listKiemKe, updateKiemKeGhiChu } from "../lib/api";

function fmtMoney(n) {
  if (n === undefined || n === null) return "-";
  return n.toLocaleString("vi-VN");
}

export default function TheoDoiKiemKePage() {
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    getKiemKePeriods()
      .then((list) => {
        setPeriods(list);
        if (list.length > 0) setPeriod(list[0]); // tháng mới nhất trước
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!period) return;
    listKiemKe(period).then(setRows).catch((err) => setError(err.message));
  }, [period]);

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

  return (
    <Layout crumb="Theo dõi kiểm kê">
      <div className="page-head">
        <h1>Theo dõi kiểm kê</h1>
        <p>Xem lại danh sách shop đã/đang kiểm kê theo từng tháng. Cột Ghi chú do NV KSNB tự cập nhật.</p>
      </div>

      {periods.length > 0 && (
        <div className="month-tabs">
          {periods.map((p) => (
            <div key={p} className={`month-tab ${p === period ? "active" : ""}`} onClick={() => setPeriod(p)}>
              {p}
            </div>
          ))}
        </div>
      )}

      {error && <div className="placeholder-box">Không tải được dữ liệu: {error}</div>}
      {!error && periods.length === 0 && (
        <div className="placeholder-box">Chưa có dữ liệu theo dõi kiểm kê nào được đẩy lên.</div>
      )}

      {period && (
        <div className="card">
          <div className="card-head"><h3>Kỳ {period}</h3><span className="note">{rows.length} shop</span></div>
          <div className="card-body">
            <table>
              <thead>
                <tr>
                  <th>Vùng</th><th>Mã shop</th><th>Tên shop</th><th>Ngày kiểm kê</th>
                  <th>Trạng thái</th><th>Giá trị thất thoát</th><th>NV kiểm kê</th><th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.vung}</td>
                    <td>{r.ma_shop}</td>
                    <td>{r.ten_shop || "-"}</td>
                    <td>{r.ngay_kiem_ke || "-"}</td>
                    <td>{r.trang_thai || "-"}</td>
                    <td className="num neg">{fmtMoney(r.gia_tri_that_thoat)}</td>
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
                {rows.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-400)" }}>Không có shop nào trong tháng này</td></tr>
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
