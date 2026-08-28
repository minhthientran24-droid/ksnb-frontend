import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import {
  getUser, listMyLeaveDays, createLeaveDay, deleteLeaveDay, listAllLeaveDays,
} from "../lib/api";

const ADMIN_ROLES = ["admin", "super_admin"];

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatDateVn(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export default function LichNghiPage() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const u = getUser();
    setIsAdmin(!!u && ADMIN_ROLES.includes(u.role));
  }, []);

  return (
    <Layout crumb="Lịch làm việc & nghỉ phép">
      <div className="page-head">
        <h1>Lịch làm việc & nghỉ phép</h1>
        <p>
          Đăng ký ngày nghỉ của bản thân — khi menu "Phân công KSNB kiểm kê" chia lịch trúng đúng ngày
          bạn đang nghỉ, hệ thống sẽ tự động chặn, không chia shop cho bạn ngày đó.
        </p>
      </div>

      <div className="grid-2" style={{ gap: 18, alignItems: "start" }}>
        <MyLeavePanel />
        {isAdmin && <AllLeavePanel />}
      </div>
    </Layout>
  );
}

function MyLeavePanel() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [ngayNghi, setNgayNghi] = useState(todayStr());
  const [ghiChu, setGhiChu] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function load() {
    listMyLeaveDays().then((r) => setRows(r.rows || [])).catch((err) => setError(err.message));
  }
  useEffect(load, []);

  const sortedRows = [...rows].sort((a, b) => (a.ngay_nghi < b.ngay_nghi ? 1 : -1));
  const today = todayStr();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!ngayNghi) {
      setSaveError("Cần chọn ngày nghỉ.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await createLeaveDay(ngayNghi, ghiChu);
      setGhiChu("");
      load();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Xóa ngày nghỉ này?")) return;
    try {
      await deleteLeaveDay(id);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>🗓️ Ngày nghỉ của tôi</h3>
        <span className="note">Tổng số: {rows.length}</span>
      </div>
      <div className="card-body">
        {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
          <div className="form-grid-2">
            <div className="field">
              <label className="flabel">Ngày nghỉ *</label>
              <input type="date" className="finput" style={{ width: "100%" }} value={ngayNghi} onChange={(e) => setNgayNghi(e.target.value)} />
            </div>
            <div className="field">
              <label className="flabel">Ghi chú (không bắt buộc)</label>
              <input className="finput" style={{ width: "100%" }} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} placeholder="VD: Nghỉ phép năm, việc gia đình..." />
            </div>
          </div>
          {saveError && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{saveError}</div>}
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="login-btn" style={{ width: "auto", padding: "9px 20px" }} disabled={saving}>
              {saving ? "Đang lưu..." : "➕ Đăng ký nghỉ"}
            </button>
          </div>
        </form>

        <div style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={thStyle}>Ngày nghỉ</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Ghi chú</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: r.ngay_nghi < today ? "var(--text-400)" : "var(--text-900)" }}>
                    {formatDateVn(r.ngay_nghi)}
                    {r.ngay_nghi < today && <span style={{ fontSize: 10, marginLeft: 6, color: "var(--text-400)" }}>(đã qua)</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "left" }}>{r.ghi_chu || "—"}</td>
                  <td style={tdStyle}><button className="fbtn danger" onClick={() => handleDelete(r.id)}>Xóa</button></td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={3} style={{ color: "var(--text-400)", padding: 18 }}>Chưa đăng ký ngày nghỉ nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AllLeavePanel() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  function load() {
    listAllLeaveDays().then((r) => setRows(r.rows || [])).catch((err) => setError(err.message));
  }
  useEffect(load, []);

  const today = todayStr();
  const upcoming = rows.filter((r) => r.ngay_nghi >= today).sort((a, b) => (a.ngay_nghi > b.ngay_nghi ? 1 : -1));

  return (
    <div className="card">
      <div className="card-head">
        <h3>👥 Toàn bộ lịch nghỉ (Admin)</h3>
        <span className="note">Sắp tới: {upcoming.length}</span>
      </div>
      <div className="card-body">
        {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{error}</div>}
        <div style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={thStyle}>Ngày nghỉ</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Họ tên</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{formatDateVn(r.ngay_nghi)}</td>
                  <td style={{ ...tdStyle, textAlign: "left" }}>{r.full_name}</td>
                  <td style={{ ...tdStyle, textAlign: "left" }}>{r.ghi_chu || "—"}</td>
                </tr>
              ))}
              {!upcoming.length && (
                <tr><td colSpan={3} style={{ color: "var(--text-400)", padding: 18 }}>Không có ngày nghỉ sắp tới nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const thStyle = { fontSize: 10.5, padding: "8px 10px", whiteSpace: "normal", lineHeight: 1.3 };
const tdStyle = { fontSize: 11.5, padding: "8px 10px" };
