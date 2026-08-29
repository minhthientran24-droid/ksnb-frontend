import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import {
  getUser, listMyLeaveDays, createLeaveDay, deleteLeaveDay, listAllLeaveDays,
} from "../lib/api";

const ADMIN_ROLES = ["admin", "super_admin"];
// Xem tab "Lịch bố trí" (chốt 29/08) — mở thêm cho "editor", không mở cho
// "editor_base"/"viewer" — khớp với quyền GET /leave-days/all ở backend.
const VIEW_ALL_ROLES = ["admin", "super_admin", "editor"];

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateVn(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export default function LichNghiPage() {
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState("dang-ky");

  useEffect(() => {
    const u = getUser();
    setRole(u?.role || null);
  }, []);

  const isAdmin = ADMIN_ROLES.includes(role);
  const canViewAll = VIEW_ALL_ROLES.includes(role);

  return (
    <Layout crumb="Lịch làm việc & nghỉ phép">
      <div className="page-head">
        <h1>Lịch làm việc & nghỉ phép</h1>
        <p>
          Đăng ký ngày nghỉ của bản thân — khi menu "Phân công KSNB kiểm kê" chia lịch trúng đúng ngày
          bạn đang nghỉ, hệ thống sẽ tự động chặn, không chia shop cho bạn ngày đó.
        </p>
      </div>

      {canViewAll && (
        <div className="month-tabs">
          <div className={`month-tab${tab === "dang-ky" ? " active" : ""}`} onClick={() => setTab("dang-ky")}>
            Đăng ký nghỉ
          </div>
          <div className={`month-tab${tab === "lich-bo-tri" ? " active" : ""}`} onClick={() => setTab("lich-bo-tri")}>
            🗓️ Lịch bố trí
          </div>
        </div>
      )}

      {tab === "dang-ky" && (
        <div className="grid-2" style={{ gap: 18, alignItems: "start" }}>
          <MyLeavePanel />
          {isAdmin && <AllLeavePanel />}
        </div>
      )}

      {tab === "lich-bo-tri" && canViewAll && <ScheduleGridPanel />}
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

const WEEKDAY_LABELS = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

// ---------- Tab "Lịch bố trí" (chốt 29/08) — bảng dạng lịch làm việc kiểu
// Excel: mỗi NV 1 hàng, mỗi ngày trong tháng 1 cột, đánh dấu "OFF" đúng
// ngày đang nghỉ. Thứ 7/CN tô đỏ cho dễ nhìn — đúng mẫu anh gửi. Chỉ liệt
// kê NV có ít nhất 1 ngày nghỉ trong đúng tháng đang xem (đỡ rối bảng với
// hàng chục NV chưa đăng ký gì). ----------
function ScheduleGridPanel() {
  const [month, setMonth] = useState(currentMonthStr());
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    listAllLeaveDays().then((r) => setRows(r.rows || [])).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  const [year, mon] = month.split("-").map((x) => parseInt(x, 10));
  const daysInMonth = year && mon ? new Date(year, mon, 0).getDate() : 30;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  function weekdayOf(day) {
    return new Date(year, mon - 1, day).getDay(); // 0=CN...6=Thứ7
  }
  function isWeekend(day) {
    const w = weekdayOf(day);
    return w === 0 || w === 6;
  }

  const monthRows = rows.filter((r) => r.ngay_nghi.startsWith(month));
  const byName = {};
  monthRows.forEach((r) => {
    const day = parseInt(r.ngay_nghi.slice(8, 10), 10);
    if (!byName[r.full_name]) byName[r.full_name] = new Set();
    byName[r.full_name].add(day);
  });
  const names = Object.keys(byName).sort((a, b) => a.localeCompare(b, "vi"));

  return (
    <div className="card">
      <div className="card-head">
        <h3>🗓️ Lịch bố trí nghỉ</h3>
        <input type="month" className="finput" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <div className="card-body">
        {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{error}</div>}
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "var(--navy-900)" }}>
          Tháng {mon ? String(mon).padStart(2, "0") : "--"}/{year || "----"}
        </div>
        {!loading && names.length === 0 && (
          <div className="leave-empty">Không có ai đăng ký nghỉ trong tháng này.</div>
        )}
        {names.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="schedule-grid-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="name-col-header">Tên NV</th>
                  {days.map((d) => (
                    <th key={d} className={isWeekend(d) ? "weekend" : ""}>{String(d).padStart(2, "0")}</th>
                  ))}
                </tr>
                <tr>
                  {days.map((d) => (
                    <th key={d} className={isWeekend(d) ? "weekend" : ""}>{WEEKDAY_LABELS[weekdayOf(d)]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {names.map((name) => (
                  <tr key={name}>
                    <td className="name-col">{name}</td>
                    {days.map((d) => (
                      <td key={d}>{byName[name].has(d) ? "OFF" : ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
