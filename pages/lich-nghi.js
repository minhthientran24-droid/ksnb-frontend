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

        {!rows.length ? (
          <div className="leave-empty">Chưa đăng ký ngày nghỉ nào.</div>
        ) : (
          <div className="leave-list">
            {sortedRows.map((r) => (
              <div className="leave-row" key={r.id}>
                <span className={`leave-row-date${r.ngay_nghi < today ? " past" : ""}`}>
                  {formatDateVn(r.ngay_nghi)}
                  {r.ngay_nghi < today && <span style={{ fontSize: 10, marginLeft: 6, fontWeight: 500 }}>(đã qua)</span>}
                </span>
                <span className="leave-row-note">{r.ghi_chu || "—"}</span>
                <span className="leave-row-actions">
                  <button className="fbtn danger" onClick={() => handleDelete(r.id)}>Xóa</button>
                </span>
              </div>
            ))}
          </div>
        )}
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
        {!upcoming.length ? (
          <div className="leave-empty">Không có ngày nghỉ sắp tới nào.</div>
        ) : (
          <div className="leave-list">
            {upcoming.map((r) => (
              <div className="leave-row" key={r.id}>
                <span className="leave-row-date">{formatDateVn(r.ngay_nghi)}</span>
                <span className="leave-row-name">{r.full_name}</span>
                <span className="leave-row-note">{r.ghi_chu || "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
