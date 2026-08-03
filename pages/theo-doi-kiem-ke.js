import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { getKiemKePeriods, listKiemKe, updateKiemKeGhiChu, syncKiemKeNow, getUser } from "../lib/api";

function fmtMoney(n) {
  if (n === undefined || n === null) return "-";
  return n.toLocaleString("vi-VN");
}

export default function TheoDoiKiemKePage() {
  const [loai, setLoai] = useState("da_kiem"); // "da_kiem" | "dang_kiem"
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const isAdmin = ["admin", "super_admin"].includes(getUser()?.role);

  // Khi đổi tab Đã kiểm / Đang kiểm -> nạp lại danh sách kỳ tương ứng
  useEffect(() => {
    getKiemKePeriods(loai)
      .then((list) => {
        setPeriods(list);
        setPeriod(list.length > 0 ? list[0] : null);
        setRows([]);
      })
      .catch((err) => setError(err.message));
  }, [loai]);

  useEffect(() => {
    if (!period) return;
    listKiemKe(period, loai).then(setRows).catch((err) => setError(err.message));
  }, [period, loai]);

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

  function handleSearch() {
    setSearchQuery(searchInput.trim().toLowerCase());
  }

  function handleClearSearch() {
    setSearchInput("");
    setSearchQuery("");
  }

  // Lọc theo mã shop/tên shop, rồi sắp xếp theo |giá trị thất thoát| giảm dần
  // (dư cũng là nguy cơ, thiếu cũng là nguy cơ — lệch càng nhiều càng lên đầu)
  const displayRows = rows
    .filter((r) => {
      if (!searchQuery) return true;
      return (
        (r.ma_shop || "").toLowerCase().includes(searchQuery) ||
        (r.ten_shop || "").toLowerCase().includes(searchQuery)
      );
    })
    .sort((a, b) => Math.abs(b.gia_tri_that_thoat || 0) - Math.abs(a.gia_tri_that_thoat || 0));

  async function handleSyncNow() {
    setSyncing(true);
    setSyncMsg("");
    try {
      const result = await syncKiemKeNow();
      const added = (result.results?.da_kiem?.added || 0) + (result.results?.dang_kiem?.added || 0);
      setSyncMsg(`Đã đồng bộ xong — thêm ${added} dòng mới.`);
      // Nạp lại danh sách kỳ + dữ liệu đang xem cho đúng số mới nhất
      const list = await getKiemKePeriods(loai);
      setPeriods(list);
      if (list.length > 0) {
        const keepPeriod = list.includes(period) ? period : list[0];
        setPeriod(keepPeriod);
        const newRows = await listKiemKe(keepPeriod, loai);
        setRows(newRows);
      }
    } catch (err) {
      setSyncMsg(`Đồng bộ thất bại: ${err.message || "lỗi không xác định"}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Layout crumb="Theo dõi kiểm kê">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1>Theo dõi kiểm kê</h1>
          <p>Đồng bộ tự động từ Excel local trên PC lúc 23h mỗi ngày. Cột Ghi chú do NV KSNB tự cập nhật.</p>
        </div>
        {isAdmin && (
          <div style={{ textAlign: "right" }}>
            <button onClick={handleSyncNow} disabled={syncing} style={syncBtnStyle}>
              {syncing ? "Đang đồng bộ..." : "🔄 Đồng bộ ngay"}
            </button>
            {syncMsg && (
              <div style={{ fontSize: 12.5, marginTop: 6, color: syncMsg.startsWith("Đồng bộ thất bại") ? "#c00" : "var(--text-600)" }}>
                {syncMsg}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tab chọn Đã kiểm / Đang kiểm — giống kiểu tab ở Báo cáo tháng */}
      <div className="month-tabs">
        <div className={`month-tab ${loai === "da_kiem" ? "active" : ""}`} onClick={() => setLoai("da_kiem")}>
          ✅ Đã kiểm
        </div>
        <div className={`month-tab ${loai === "dang_kiem" ? "active" : ""}`} onClick={() => setLoai("dang_kiem")}>
          ⏳ Đang kiểm
        </div>
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
        <div className="placeholder-box">
          Chưa có dữ liệu "{loai === "da_kiem" ? "Đã kiểm" : "Đang kiểm"}" nào được đồng bộ.
        </div>
      )}

      {periods.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-body" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "14px 18px" }}>
            <input
              type="text"
              placeholder="Mã shop / tên shop..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              style={{ width: "5cm", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13.5 }}
            />
            <button onClick={handleSearch} style={syncBtnStyle}>🔍 Tìm kiếm</button>
            {searchQuery && (
              <button onClick={handleClearSearch} style={{ ...syncBtnStyle, background: "var(--border)", color: "var(--text-900)" }}>
                Xóa lọc
              </button>
            )}
          </div>
        </div>
      )}

      {period && (
        <div className="card">
          <div className="card-head">
            <h3>Kỳ {period}</h3>
            <span className="note">
              {searchQuery ? `${displayRows.length}/${rows.length} shop (đang lọc)` : `${rows.length} shop`}
              {" · sắp xếp theo giá trị thất thoát (lệch nhiều nhất lên đầu)"}
            </span>
          </div>
          <div className="card-body">
            <table>
              <thead>
                <tr>
                  <th>Vùng</th><th>Mã shop</th><th>Tên shop</th><th>Ngày kiểm kê</th>
                  <th>Giá trị thất thoát</th><th>Truy thu thanh lý</th><th>NV kiểm kê</th><th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ textAlign: "left" }}>{r.vung}</td>
                    <td>{r.ma_shop}</td>
                    <td style={{ textAlign: "left" }}>{r.ten_shop || "-"}</td>
                    <td>{r.ngay_kiem_ke || "-"}</td>
                    <td className="num neg">{fmtMoney(r.gia_tri_that_thoat)}</td>
                    <td className="num">{fmtMoney(r.truy_thu_thanh_ly)}</td>
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
                {displayRows.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-400)" }}>
                    {searchQuery ? "Không tìm thấy shop nào khớp" : "Không có shop nào trong tháng này"}
                  </td></tr>
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

const syncBtnStyle = {
  padding: "9px 16px", borderRadius: 8, border: "none",
  background: "var(--navy-800)", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
};
