import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { listPendingUploads, uploadPendingFile, deletePendingUpload, getUser } from "../lib/api";

const ADMIN_ROLES = ["admin", "super_admin"];

const MONTHLY_SLOTS = [
  {
    type: "kiem_ke_thang",
    title: "Báo cáo kiểm kê (tháng)",
    desc: "Kiểm kê hàng hóa — chốt 1 lần/tháng, gồm 4 mục: thống kê truy thu, TB shop 3 tháng, TB nhân viên, top shop.",
  },
  {
    type: "chu_de_thang",
    title: "Báo cáo kiểm soát chủ đề (tháng)",
    desc: "Chủ đề trọng tâm kiểm soát trong tháng — chốt 1 lần/tháng.",
  },
];

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

  // Kỳ báo cáo cho 2 mục theo tháng — mặc định luôn là tháng/năm hiện tại
  const [periodDraft, setPeriodDraft] = useState({
    kiem_ke_thang: { month: CURRENT_MONTH, year: CURRENT_YEAR },
    chu_de_thang: { month: CURRENT_MONTH, year: CURRENT_YEAR },
  });

  useEffect(() => {
    const user = getUser();
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      router.replace("/");
      return;
    }
    setChecked(true);
    load();
  }, []);

  function load() {
    listPendingUploads().then(setRows).catch((err) => setError(err.message));
  }

  async function handleMonthlyFileChange(slotType, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { month, year } = periodDraft[slotType];
    const periodLabel = `${year}-${month}`; // VD: 2026-08
    setUploadingType(slotType);
    setError("");
    try {
      await uploadPendingFile(slotType, periodLabel, file);
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

  const rowsByType = (t) => rows.filter((r) => r.upload_type === t);

  function renderPendingTable(slotType) {
    const list = rowsByType(slotType);
    if (list.length === 0) return null;
    return (
      <table style={{ marginTop: 16 }}>
        <thead>
          <tr><th>Tên file</th><th>Kỳ báo cáo</th><th>Thời gian up</th><th>Trạng thái</th><th></th></tr>
        </thead>
        <tbody>
          {list.map((r) => (
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
    );
  }

  return (
    <Layout crumb="Tải lên dữ liệu">
      <div className="page-head">
        <h1>Tải lên dữ liệu</h1>
        <p>
          File Excel gốc chỉ được <strong>lưu tạm</strong> trên server để PC riêng tải về xử lý —
          không hiển thị nội dung, không public, tự xóa sau khi xử lý xong.
        </p>
      </div>

      {error && <div className="placeholder-box">{error}</div>}

      {MONTHLY_SLOTS.map((slot) => (
        <div className="card" key={slot.type}>
          <div className="card-head">
            <h3>{slot.title}</h3>
            <span className="note">{rowsByType(slot.type).length} file chờ xử lý</span>
          </div>
          <div className="card-body" style={{ padding: "16px 20px" }}>
            <p style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 12 }}>{slot.desc}</p>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <label style={labelStyle}>Kỳ báo cáo — Tháng</label>
                <select
                  value={periodDraft[slot.type].month}
                  onChange={(e) => setPeriodDraft({ ...periodDraft, [slot.type]: { ...periodDraft[slot.type], month: e.target.value } })}
                  style={selectStyle}
                >
                  {MONTH_OPTIONS.map((m) => <option key={m} value={m}>Tháng {m}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Năm</label>
                <select
                  value={periodDraft[slot.type].year}
                  onChange={(e) => setPeriodDraft({ ...periodDraft, [slot.type]: { ...periodDraft[slot.type], year: Number(e.target.value) } })}
                  style={selectStyle}
                >
                  {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Chọn file Excel</label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={uploadingType === slot.type}
                  onChange={(e) => handleMonthlyFileChange(slot.type, e)}
                  style={{ fontSize: 12.5 }}
                />
              </div>
              {uploadingType === slot.type && <span style={{ fontSize: 12.5, color: "var(--text-400)" }}>Đang tải lên...</span>}
            </div>
            <p style={{ fontSize: 11.5, color: "var(--text-400)", marginTop: 8 }}>
              Mặc định là kỳ hiện tại ({CURRENT_MONTH}/{CURRENT_YEAR}) — đổi lại nếu anh đang up bù cho tháng trước.
            </p>
            {renderPendingTable(slot.type)}
          </div>
        </div>
      ))}

      <div className="placeholder-box">
        Mục <strong>"Đã kiểm"</strong> / <strong>"Đang kiểm"</strong> (Theo dõi kiểm kê hàng ngày)
        không upload thủ công ở đây nữa — dữ liệu được đồng bộ <strong>tự động mỗi ngày lúc 23h</strong>
        từ file Excel local trên PC riêng (script <code>sync_kiem_ke_from_excel.py</code>).
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
