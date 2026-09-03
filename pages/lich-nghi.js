import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import {
  getUser, listMyLeaveDays, createLeaveDay, deleteLeaveDay, listAllLeaveDays,
  listMyDeXuatKsnb, upsertMyDeXuatKsnb, deleteMyDeXuatKsnb,
} from "../lib/api";
import { useAllowedKeys } from "../lib/permissions";

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
  const { can, ready: permReady } = useAllowedKeys();
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState("dang-ky");

  useEffect(() => {
    const u = getUser();
    setRole(u?.role || null);
  }, []);

  const isAdmin = ADMIN_ROLES.includes(role);
  // Kết hợp CẢ 2: role phải nằm trong VIEW_ALL_ROLES (khớp đúng quyền thật
  // của API backend GET /leave-days/all) VÀ chưa bị super_admin gỡ thêm ở
  // "Quản lý phân quyền" (cấp 2) — chốt 01/09.
  const canViewAll = VIEW_ALL_ROLES.includes(role) && can("/lich-nghi::lich-bo-tri");

  // Tự chuyển về tab "Đăng ký nghỉ" nếu đang ở "Lịch bố trí" mà bị gỡ quyền.
  useEffect(() => {
    if (permReady && tab === "lich-bo-tri" && !canViewAll) setTab("dang-ky");
  }, [permReady, canViewAll, tab]);

  return (
    <Layout crumb="Lịch làm việc & nghỉ phép">
      <div className="page-head">
        <h1>Lịch làm việc & nghỉ phép</h1>
        <p>
          Đăng ký ngày nghỉ của bản thân — khi menu "Phân công KSNB kiểm kê" chia lịch trúng đúng ngày
          bạn đang nghỉ, hệ thống sẽ tự động chặn, không chia shop cho bạn ngày đó.
        </p>
      </div>

      <div className="month-tabs">
        <div className={`month-tab${tab === "dang-ky" ? " active" : ""}`} onClick={() => setTab("dang-ky")}>
          Đăng ký nghỉ
        </div>
        <div className={`month-tab${tab === "kiem-ke-truc-tiep" ? " active" : ""}`} onClick={() => setTab("kiem-ke-truc-tiep")}>
          🚐 KSNB kiểm kê trực tiếp
        </div>
        {canViewAll && (
          <div className={`month-tab${tab === "lich-bo-tri" ? " active" : ""}`} onClick={() => setTab("lich-bo-tri")}>
            🗓️ Lịch bố trí
          </div>
        )}
      </div>

      {tab === "dang-ky" && (
        <div className="grid-2" style={{ gap: 18, alignItems: "start" }}>
          <MyLeavePanel />
          {isAdmin && <AllLeavePanel />}
        </div>
      )}

      {tab === "kiem-ke-truc-tiep" && <KsnbTrucTiepPanel />}

      {tab === "lich-bo-tri" && canViewAll && <ScheduleGridPanel />}
    </Layout>
  );
}

function MyLeavePanel() {
  const { can } = useAllowedKeys();
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
                  {can("/lich-nghi::dang-ky::xoa") && <button className="fbtn danger" onClick={() => handleDelete(r.id)}>Xóa</button>}
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

// ---------- Tab "KSNB kiểm kê trực tiếp" (03/09) — mọi user tự khai báo
// tháng mình có thể đi công tác kiểm kê trực tiếp + số lượng shop có thể
// nhận, đẩy thẳng vào bảng "Đề xuất kiểm kê" -> "Đề xuất KSNB kiểm kê trực
// tiếp" cho Admin/Editor xem (dùng CHUNG bảng de_xuat_kiem_ke_ksnb — xem
// backend routers/de_xuat_kiem_ke.py::/ksnb/self). Khai lại đúng tháng đã
// khai trước đó thì CẬP NHẬT đè lên (upsert theo tháng), không tạo trùng. ----------
function KsnbTrucTiepPanel() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [thang, setThang] = useState(currentMonthStr());
  const [soLuong, setSoLuong] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  function load() {
    listMyDeXuatKsnb().then((r) => setRows(r || [])).catch((err) => setError(err.message));
  }
  useEffect(load, []);

  const sortedRows = [...rows].sort((a, b) => (a.thang_kiem_ke < b.thang_kiem_ke ? 1 : -1));
  const daKhaiThangNay = rows.find((r) => r.thang_kiem_ke === thang);

  async function handleSubmit(e) {
    e.preventDefault();
    const sl = parseInt(soLuong, 10);
    if (!thang) {
      setSaveError("Cần chọn tháng.");
      return;
    }
    if (!sl || sl <= 0) {
      setSaveError("Số lượng shop đề xuất phải lớn hơn 0.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveMsg("");
    try {
      await upsertMyDeXuatKsnb({ thang_kiem_ke: thang, so_luong_shop: sl, ghi_chu: ghiChu });
      setSaveMsg(daKhaiThangNay ? "✅ Đã cập nhật khai báo tháng này." : "✅ Đã ghi nhận khai báo, chuyển sang \"Đề xuất kiểm kê\" cho Admin xem.");
      setSoLuong("");
      setGhiChu("");
      load();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Xóa khai báo này?")) return;
    try {
      await deleteMyDeXuatKsnb(id);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="grid-2" style={{ gap: 18, alignItems: "start" }}>
      <div className="card">
        <div className="card-head">
          <h3>🚐 Khai báo tháng có thể đi kiểm kê trực tiếp</h3>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 12.5, color: "var(--text-600)", marginTop: 0, marginBottom: 14 }}>
            Khai tháng anh/chị có thể đi công tác kiểm kê trực tiếp — data sẽ tự đẩy sang menu
            "Đề xuất kiểm kê" &gt; "Đề xuất KSNB kiểm kê trực tiếp" cho Admin sắp lịch.
          </p>
          {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{error}</div>}

          <form onSubmit={handleSubmit} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px" }}>
            <div className="form-grid-2">
              <div className="field">
                <label className="flabel">Tháng *</label>
                <input type="month" className="finput" style={{ width: "100%" }} value={thang} onChange={(e) => setThang(e.target.value)} />
              </div>
              <div className="field">
                <label className="flabel">Số lượng shop đề xuất *</label>
                <input type="number" min={1} className="finput" style={{ width: "100%" }} value={soLuong} onChange={(e) => setSoLuong(e.target.value)} />
              </div>
            </div>
            {daKhaiThangNay && (
              <div style={{ fontSize: 11.5, color: "#9A7B00", background: "#FFF8E1", borderRadius: 6, padding: "6px 10px", marginTop: 4 }}>
                ⚠️ Anh/chị đã khai báo tháng này rồi ({daKhaiThangNay.so_luong_shop} shop) — lưu lại sẽ cập nhật đè lên khai báo cũ.
              </div>
            )}
            <div className="field" style={{ marginTop: 10 }}>
              <label className="flabel">Ghi chú (không bắt buộc)</label>
              <textarea className="finput" rows={2} style={{ width: "100%", resize: "vertical" }} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
            </div>
            {saveError && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{saveError}</div>}
            {saveMsg && <div style={{ fontSize: 12, color: "#3E7A2A", marginTop: 8 }}>{saveMsg}</div>}
            <div style={{ marginTop: 12 }}>
              <button type="submit" className="login-btn" style={{ width: "auto", padding: "9px 20px" }} disabled={saving}>
                {saving ? "Đang lưu..." : daKhaiThangNay ? "Cập nhật khai báo" : "➕ Khai báo"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Đề xuất kiểm kê trực tiếp của tôi</h3>
          <span className="note">Tổng số: {rows.length}</span>
        </div>
        <div className="card-body">
          {!rows.length ? (
            <div className="leave-empty">Chưa khai báo tháng nào.</div>
          ) : (
            <div className="leave-list">
              {sortedRows.map((r) => (
                <div className="leave-row" key={r.id}>
                  <span className="leave-row-date">{formatThangVn(r.thang_kiem_ke)}</span>
                  <span className="leave-row-note">{r.so_luong_shop} shop{r.ghi_chu ? ` — ${r.ghi_chu}` : ""}</span>
                  <span className="leave-row-actions">
                    <button className="fbtn danger" onClick={() => handleDelete(r.id)}>Xóa</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatThangVn(v) {
  if (!v) return "—";
  const [y, m] = v.split("-");
  return m && y ? `Tháng ${m}/${y}` : v;
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
  const khuVucByName = {};
  monthRows.forEach((r) => {
    const day = parseInt(r.ngay_nghi.slice(8, 10), 10);
    if (!byName[r.full_name]) byName[r.full_name] = new Set();
    byName[r.full_name].add(day);
    khuVucByName[r.full_name] = r.khu_vuc || "";
  });
  // Nhiều NV cùng xin nghỉ (chốt 29/08): xếp VP HCM lên trên, VP HNI xuống
  // dưới, NV chưa gán Khu vực làm việc xuống cuối — trong cùng khu vực vẫn
  // sắp theo tên (bảng chữ cái tiếng Việt).
  const KHU_VUC_ORDER = { "VP HCM": 0, "VP HNI": 1 };
  const names = Object.keys(byName).sort((a, b) => {
    const oa = KHU_VUC_ORDER[khuVucByName[a]] ?? 2;
    const ob = KHU_VUC_ORDER[khuVucByName[b]] ?? 2;
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b, "vi");
  });

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
