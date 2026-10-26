import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { getActivityLogSummary, getInactiveUsers, getGuestActivityStats, getGuestActivityEvents, getUser } from "../lib/api";
import { useAllowedKeys } from "../lib/permissions";

const ADMIN_ROLES = ["admin", "super_admin"];

function formatDateVn(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatDateTimeVn(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function NhatKyHoatDongPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState("theo-ngay"); // "theo-ngay" | "khong-hoat-dong" | "guest" (chỉ super_admin)
  const [isSuper, setIsSuper] = useState(false);
  const { can, ready: permReady } = useAllowedKeys();

  useEffect(() => {
    const user = getUser();
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      router.replace("/");
      return;
    }
    setIsSuper(user.role === "super_admin");
    setChecked(true);
  }, []);

  useEffect(() => {
    if (!permReady || tab === "guest" || can(`/nhat-ky-hoat-dong::${tab}`)) return;
    const first = ["theo-ngay", "khong-hoat-dong"].find((k) => can(`/nhat-ky-hoat-dong::${k}`));
    if (first) setTab(first);
  }, [permReady, tab]);

  if (!checked) return null;

  return (
    <Layout crumb="Nhật ký hoạt động">
      <div className="page-head">
        <h1>Nhật ký hoạt động</h1>
        <p>Chỉ ghi nhận các hành động chính — không phải mọi thao tác trên web.</p>
      </div>

      <div className="month-tabs">
        {can("/nhat-ky-hoat-dong::theo-ngay") && (
          <div className={`month-tab ${tab === "theo-ngay" ? "active" : ""}`} onClick={() => setTab("theo-ngay")}>
            📊 Theo ngày
          </div>
        )}
        {can("/nhat-ky-hoat-dong::khong-hoat-dong") && (
          <div className={`month-tab ${tab === "khong-hoat-dong" ? "active" : ""}`} onClick={() => setTab("khong-hoat-dong")}>
            🚨 Không hoạt động
          </div>
        )}
        {isSuper && (
          <div className={`month-tab ${tab === "guest" ? "active" : ""}`} onClick={() => setTab("guest")}>
            👤 Nhật ký hoạt động user Guest
          </div>
        )}
      </div>

      {tab === "theo-ngay" && can("/nhat-ky-hoat-dong::theo-ngay") && <TheoNgayTab />}
      {tab === "khong-hoat-dong" && can("/nhat-ky-hoat-dong::khong-hoat-dong") && <KhongHoatDongTab />}
      {tab === "guest" && isSuper && <GuestLogTab />}
    </Layout>
  );
}

// ---------------------------------------------------------------------
// Tab "Nhật ký hoạt động user Guest" (chốt 26/10) — CHỈ super_admin: thống kê lượt truy cập (đăng nhập) + sử dụng tính
// năng của các tài khoản Guest, kèm nhật ký chi tiết từng lần.
// ---------------------------------------------------------------------
const DAY_OPTIONS = [7, 14, 30, 90];

function GuestLogTab() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null); // lọc nhật ký chi tiết theo 1 Guest
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [evLoading, setEvLoading] = useState(false);

  function loadStats() {
    setLoading(true);
    setError("");
    getGuestActivityStats(days)
      .then(setStats)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  function loadEvents(append = false) {
    setEvLoading(true);
    getGuestActivityEvents({ days, userId, offset: append ? events.length : 0 })
      .then((r) => { setEvents(append ? [...events, ...r.events] : r.events); setTotal(r.total); })
      .catch((err) => setError(err.message))
      .finally(() => setEvLoading(false));
  }

  useEffect(() => { loadStats(); }, [days]);
  useEffect(() => { loadEvents(false); }, [days, userId]);

  const maxDay = Math.max(1, ...(stats?.theo_ngay || []).map((d) => d.login + d.usage));
  const featureLabels = (stats?.theo_tinh_nang || []);

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-900)" }}>Khoảng thời gian</label>
          <select className="finput" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 160 }}>
            {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d} ngày gần nhất</option>)}
          </select>
          <button className="fbtn" disabled={loading} onClick={() => { loadStats(); loadEvents(false); }}>{loading ? "Đang tải..." : "🔄 Làm mới"}</button>
          {stats && <span style={{ fontSize: 12, color: "var(--text-600)" }}>Từ <b>{formatDateVn(stats.tu_ngay)}</b> đến <b>{formatDateVn(stats.den_ngay)}</b></span>}
        </div>
      </div>

      {error && <div className="placeholder-box">Không tải được dữ liệu: {error}</div>}

      {stats && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
            {[
              ["Tài khoản Guest", stats.tong.so_guest],
              ["Guest có hoạt động", stats.tong.so_guest_hoat_dong],
              ["Lượt truy cập (đăng nhập)", stats.tong.luot_dang_nhap],
              ["Lượt sử dụng tính năng", stats.tong.luot_su_dung],
            ].map(([label, val]) => (
              <div key={label} className="card" style={{ margin: 0 }}>
                <div className="card-body" style={{ padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "var(--navy-900)" }}>{val}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head"><h3>Sử dụng theo tính năng</h3></div>
            <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
              <table style={{ fontSize: 12.5 }}>
                <thead><tr><th style={{ ...thStyle, textAlign: "left" }}>Tính năng</th><th style={thStyle}>Số lượt</th><th style={thStyle}>Số Guest dùng</th></tr></thead>
                <tbody>
                  {featureLabels.map((f) => (
                    <tr key={f.action}><td style={{ textAlign: "left" }}>{f.label}</td><td className="num">{f.count}</td><td className="num">{f.so_user}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head"><h3>Theo từng tài khoản Guest</h3><span className="note">Bấm vào tên để lọc nhật ký chi tiết bên dưới</span></div>
            <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
              <table style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: "left" }}>Guest</th>
                    <th style={thStyle}>Vùng</th>
                    <th style={thStyle}>Lượt đăng nhập</th>
                    <th style={thStyle}>Lượt dùng tính năng</th>
                    {featureLabels.map((f) => <th key={f.action} style={thStyle}>{f.label}</th>)}
                    <th style={thStyle}>Lần hoạt động gần nhất</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.theo_user.length === 0 && <tr><td colSpan={5 + featureLabels.length} style={{ textAlign: "center", color: "var(--text-400)" }}>Chưa có tài khoản Guest nào.</td></tr>}
                  {stats.theo_user.map((u) => (
                    <tr key={u.user_id} style={{ background: userId === u.user_id ? "var(--bg)" : undefined }}>
                      <td style={{ textAlign: "left", cursor: "pointer" }} onClick={() => setUserId(userId === u.user_id ? null : u.user_id)} title="Bấm để lọc nhật ký chi tiết">
                        <b>{u.full_name}</b>{!u.is_active && <span style={{ color: "var(--danger)" }}> (đã khóa)</span>}
                        <div style={{ fontSize: 11, color: "var(--text-400)" }}>{u.email}</div>
                      </td>
                      <td>{u.vung || <span style={{ color: "var(--danger)" }}>chưa gán</span>}</td>
                      <td className="num">{u.login}</td>
                      <td className="num">{u.usage}</td>
                      {featureLabels.map((f) => <td key={f.action} className="num">{u.by_action[f.action] || 0}</td>)}
                      <td>{u.last_active_at ? formatDateTimeVn(u.last_active_at) : <span style={{ color: "var(--text-400)" }}>Chưa từng</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head"><h3>Theo ngày</h3><span className="note">Đăng nhập + sử dụng tính năng mỗi ngày (giờ VN)</span></div>
            <div className="card-body" style={{ padding: "8px 16px", maxHeight: 360, overflowY: "auto" }}>
              {[...stats.theo_ngay].reverse().map((d) => (
                <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, padding: "3px 0" }}>
                  <span style={{ width: 86, color: "var(--text-600)" }}>{formatDateVn(d.date)}</span>
                  <div style={{ flex: 1, height: 14, background: "var(--bg)", borderRadius: 4, overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${(d.login / maxDay) * 100}%`, background: "#2F6FED" }} title={`${d.login} lượt đăng nhập`} />
                    <div style={{ width: `${(d.usage / maxDay) * 100}%`, background: "#4C9A2A" }} title={`${d.usage} lượt dùng tính năng`} />
                  </div>
                  <span style={{ width: 170, textAlign: "right" }}>
                    <span style={{ color: "#2F6FED" }}>{d.login} đăng nhập</span> · <span style={{ color: "#4C9A2A" }}>{d.usage} dùng</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="card">
        <div className="card-head">
          <h3>Nhật ký chi tiết{userId && stats ? ` — ${stats.theo_user.find((u) => u.user_id === userId)?.full_name || ""}` : ""}</h3>
          <span className="note">
            {total} dòng{userId && <> · <span style={{ cursor: "pointer", color: "var(--blue-accent, #2F6FED)" }} onClick={() => setUserId(null)}>bỏ lọc</span></>}
          </span>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "left" }}>Thời gian</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Guest</th>
                <th style={thStyle}>Vùng</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Hành động</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && !evLoading && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-400)" }}>Chưa có hoạt động nào trong khoảng thời gian này.</td></tr>}
              {events.map((e) => (
                <tr key={e.id}>
                  <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{formatDateTimeVn(e.at)}</td>
                  <td style={{ textAlign: "left" }}>{e.full_name}</td>
                  <td>{e.vung || "—"}</td>
                  <td style={{ textAlign: "left", color: e.action === "tra_cuu_truy_thu_khac_vung" ? "var(--danger)" : undefined, fontWeight: e.action === "tra_cuu_truy_thu_khac_vung" ? 700 : undefined }}>{e.label}</td>
                  <td style={{ textAlign: "left" }}>{e.detail || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.length < total && (
            <div style={{ padding: 12, textAlign: "center" }}>
              <button className="fbtn" disabled={evLoading} onClick={() => loadEvents(true)}>{evLoading ? "Đang tải..." : `Xem thêm (${total - events.length} dòng nữa)`}</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function TheoNgayTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pickerValue, setPickerValue] = useState(""); // giá trị đang chọn trong ô ngày, chưa chắc đã áp dụng

  function load(date) {
    setLoading(true);
    setError("");
    getActivityLogSummary(date)
      .then((res) => {
        setData(res);
        setPickerValue(res.date); // đồng bộ ô chọn ngày theo đúng ngày server trả về
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(); // không truyền ngày -> server mặc định hôm nay
  }, []);

  const actions = data?.actions || [];
  const users = data?.users || [];

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-900)" }}>Xem theo ngày</label>
          <input
            type="date"
            className="finput"
            value={pickerValue}
            onChange={(e) => setPickerValue(e.target.value)}
            style={{ width: 160 }}
          />
          <button className="fbtn" disabled={loading || !pickerValue} onClick={() => load(pickerValue)}>
            {loading ? "Đang tải..." : "🔍 Kiểm tra"}
          </button>
          {data?.date && !loading && (
            <span style={{ fontSize: 12, color: "var(--text-600)" }}>
              Đang xem ngày <b>{formatDateVn(data.date)}</b>
            </span>
          )}
        </div>
      </div>

      {error && <div className="placeholder-box">Không tải được dữ liệu: {error}</div>}

      {data && !error && (
        <div className="card">
          <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
            {users.length === 0 ? (
              <div className="placeholder-box">Chưa có hoạt động nào được ghi nhận trong ngày này.</div>
            ) : (
              <table style={{ fontSize: 11.5 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: "left" }}>Người dùng</th>
                    <th style={thStyle}>Khu vực</th>
                    <th style={thStyle}>Tổng lượt</th>
                    {actions.map((a) => (
                      <th key={a.key} style={thStyle}>{a.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.user_id ?? u.email}>
                      <td style={{ ...tdStyle, textAlign: "left" }}>
                        <div style={{ fontWeight: 700, color: "var(--text-900)", fontSize: 12 }}>{u.full_name || "(đã xoá)"}</div>
                        <div style={{ fontSize: 10.5, color: "var(--text-400)" }}>{u.email}</div>
                      </td>
                      <td className="num" style={tdStyle}>{u.khu_vuc || "—"}</td>
                      <td className="num" style={{ ...tdStyle, fontWeight: 800, color: "var(--navy-800)" }}>{u.total}</td>
                      {actions.map((a) => (
                        <td key={a.key} className="num" style={tdStyle}>{u.actions?.[a.key] || 0}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function KhongHoatDongTab() {
  const [days, setDays] = useState(3);
  const [daysInput, setDaysInput] = useState("3"); // ô nhập số ngày, chưa chắc đã áp dụng
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load(n) {
    setLoading(true);
    setError("");
    getInactiveUsers(n)
      .then((res) => {
        setData(res);
        setDays(res.days);
        setDaysInput(String(res.days));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(3);
  }, []);

  const users = data?.users || [];

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-900)" }}>Không dùng tính năng nào trong</label>
          <input
            type="number"
            min={1}
            className="finput"
            value={daysInput}
            onChange={(e) => setDaysInput(e.target.value)}
            style={{ width: 70 }}
          />
          <span style={{ fontSize: 12.5, color: "var(--text-600)" }}>ngày gần nhất</span>
          <button
            className="fbtn"
            disabled={loading || !daysInput || Number(daysInput) < 1}
            onClick={() => load(Number(daysInput))}
          >
            {loading ? "Đang tải..." : "🔍 Kiểm tra"}
          </button>
          {data && !loading && (
            <span style={{ fontSize: 12, color: "var(--text-600)" }}>
              Từ ngày <b>{formatDateVn(data.since_date)}</b> tới nay — <b>{users.length}</b> tài khoản không hoạt động
            </span>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: "var(--text-400)", marginBottom: 12 }}>
        Chỉ tính các tài khoản có thể dùng những tính năng này (không gồm Viewer). "Chưa từng dùng" nghĩa là tài khoản chưa
        từng ghi nhận hành động nào trong nhóm này, không riêng {days} ngày gần đây.
      </div>

      {error && <div className="placeholder-box">Không tải được dữ liệu: {error}</div>}

      {data && !error && (
        <div className="card">
          <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
            {users.length === 0 ? (
              <div className="placeholder-box">✅ Không có tài khoản nào — mọi người đều có hoạt động trong {days} ngày gần đây.</div>
            ) : (
              <table style={{ fontSize: 11.5 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: "left" }}>Người dùng</th>
                    <th style={thStyle}>Khu vực</th>
                    <th style={thStyle}>Vai trò</th>
                    <th style={thStyle}>Lần dùng gần nhất</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.user_id ?? u.email}>
                      <td style={{ ...tdStyle, textAlign: "left" }}>
                        <div style={{ fontWeight: 700, color: "var(--text-900)", fontSize: 12 }}>{u.full_name || "(đã xoá)"}</div>
                        <div style={{ fontSize: 10.5, color: "var(--text-400)" }}>{u.email}</div>
                      </td>
                      <td className="num" style={tdStyle}>{u.khu_vuc || "—"}</td>
                      <td className="num" style={tdStyle}>{u.role_label}</td>
                      <td className="num" style={{ ...tdStyle, color: u.last_active_at ? "var(--text-900)" : "var(--danger)", fontWeight: u.last_active_at ? 400 : 700 }}>
                        {u.last_active_at ? formatDateTimeVn(u.last_active_at) : "Chưa từng dùng"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const thStyle = { fontSize: 10.5, padding: "8px 10px", whiteSpace: "normal", lineHeight: 1.3 };
const tdStyle = { fontSize: 11.5, padding: "8px 10px" };
