import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { getActivityLogSummary, getInactiveUsers, getNoLoginUsers, getLoginDays, getGuestActivityStats, getUser } from "../lib/api";
import { useAllowedKeys } from "../lib/permissions";

// Chốt 17/11: Nhật ký hoạt động CHỈ super_admin truy cập (trước đây cả admin).
const ADMIN_ROLES = ["super_admin"];

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
  const [tab, setTab] = useState("theo-ngay"); // "theo-ngay" | "khong-hoat-dong" | "khong-dang-nhap" | "guest" (chỉ super_admin)
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
    const first = ["theo-ngay", "khong-hoat-dong", "khong-dang-nhap"].find((k) => can(`/nhat-ky-hoat-dong::${k}`));
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
        {can("/nhat-ky-hoat-dong::khong-dang-nhap") && (
          <div className={`month-tab ${tab === "khong-dang-nhap" ? "active" : ""}`} onClick={() => setTab("khong-dang-nhap")}>
            🔕 Không đăng nhập web
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
      {tab === "khong-dang-nhap" && can("/nhat-ky-hoat-dong::khong-dang-nhap") && <KhongDangNhapTab />}
      {tab === "guest" && isSuper && <GuestLogTab />}
    </Layout>
  );
}

// ---------------------------------------------------------------------
// Tab "Nhật ký hoạt động user Guest" (chốt 26/10) — CHỈ super_admin: thống kê lượt truy cập (đăng nhập) + sử dụng tính
// năng của các tài khoản Guest, 
// ---------------------------------------------------------------------
const DAY_OPTIONS = [7, 14, 30, 90];

function GuestLogTab() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function loadStats() {
    setLoading(true);
    setError("");
    getGuestActivityStats(days)
      .then(setStats)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadStats(); }, [days]);

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
          <button className="fbtn" disabled={loading} onClick={loadStats}>{loading ? "Đang tải..." : "🔄 Làm mới"}</button>
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
            <div className="card-head"><h3>Theo từng tài khoản Guest</h3></div>
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
                    <tr key={u.user_id}>
                      <td style={{ textAlign: "left" }}>
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

// Tab "Không đăng nhập web" (chốt 17/11): mọi tài khoản đang hoạt động (trừ Guest) + lần đăng nhập gần nhất + SỐ NGÀY chưa đăng nhập;
// người quá hạn (>= N ngày hoặc chưa từng đăng nhập) được tô nổi bật.
// Chi tiết 1 tài khoản: từng ngày có / không đăng nhập. Mỗi trang 60 ngày chia 2 cột (30 ngày gần nhất bên trái, 30 ngày kế tiếp bên phải),
// mới nhất trước, xem được nhiều trang.
const LOGIN_DAYS_PER_PAGE = 60;

function DayTable({ days, loading }) {
  return (
    <table style={{ fontSize: 12, width: "100%", opacity: loading ? 0.5 : 1 }}>
      <thead>
        <tr>
          <th style={{ ...thStyle, textAlign: "left" }}>Ngày</th>
          <th style={thStyle}>Thứ</th>
          <th style={thStyle}>Trạng thái</th>
        </tr>
      </thead>
      <tbody>
        {days.map((d) => (
          <tr key={d.date} style={d.co_dang_nhap ? undefined : { background: d.cuoi_tuan ? "#F4F4F4" : "#FDEAEA" }}>
            <td style={{ ...tdStyle, textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{formatDateVn(d.date)}</td>
            <td className="num" style={{ ...tdStyle, whiteSpace: "nowrap", color: d.cuoi_tuan ? "var(--text-400)" : undefined }}>{d.thu}</td>
            <td className="num" style={{ ...tdStyle, whiteSpace: "nowrap" }}>
              {d.co_dang_nhap ? (
                <span style={{ color: "#3E7A2A", fontWeight: 700 }}>
                  ✓ Có đăng nhập <span style={{ fontWeight: 400, color: "var(--text-600)" }}>({d.so_lan} lần, từ {d.gio_dau})</span>
                </span>
              ) : (
                <span style={{ color: d.cuoi_tuan ? "var(--text-400)" : "var(--danger)", fontWeight: 700 }}>
                  ✗ Không đăng nhập
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LoginDaysModal({ user, onClose }) {
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError("");
    getLoginDays(user.user_id, page, LOGIN_DAYS_PER_PAGE)
      .then((res) => {
        setData(res);
        setPageInput(String(res.page));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = data?.total_pages || 1;
  const goto = (p) => setPage(Math.max(1, Math.min(totalPages, p)));

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--surface, #fff)", borderRadius: 12, width: "100%", maxWidth: 1040, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-900)" }}>{user.full_name || "(không tên)"}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-400)" }}>{user.email}</div>
          </div>
          <button className="fbtn" onClick={onClose}>Đóng</button>
        </div>

        <div style={{ padding: "12px 18px", overflowY: "auto" }}>
          {error && <div style={{ color: "var(--danger)", fontSize: 12.5 }}>Không tải được dữ liệu: {error}</div>}
          {data && (
            <>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, marginBottom: 10 }}>
                <span>Tổng <b>{data.total_days}</b> ngày ({formatDateVn(data.tu_ngay)} → {formatDateVn(data.den_ngay)})</span>
                <span style={{ color: "#3E7A2A" }}>Có đăng nhập: <b>{data.so_ngay_co_dang_nhap}</b> ngày</span>
                <span style={{ color: "var(--danger)" }}>Không đăng nhập: <b>{data.so_ngay_khong_dang_nhap}</b> ngày</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-400)", marginBottom: 10 }}>
                Mốc xa nhất là ngày muộn hơn giữa ngày tạo tài khoản và ngày hệ thống bắt đầu ghi nhật ký — trước mốc này không có dữ liệu.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 16, alignItems: "start" }}>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-600)", marginBottom: 4 }}>
                    {data.days[0] ? `${formatDateVn(data.days[0].date)} → ${formatDateVn(data.days[Math.min(29, data.days.length - 1)].date)}` : ""}
                  </div>
                  <DayTable days={data.days.slice(0, 30)} loading={loading} />
                </div>
                {data.days.length > 30 && (
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-600)", marginBottom: 4 }}>
                      {`${formatDateVn(data.days[30].date)} → ${formatDateVn(data.days[data.days.length - 1].date)}`}
                    </div>
                    <DayTable days={data.days.slice(30)} loading={loading} />
                  </div>
                )}
              </div>
            </>
          )}
          {!data && !error && <div style={{ fontSize: 12.5, color: "var(--text-600)" }}>Đang tải...</div>}
        </div>

        {data && (
          <div style={{ padding: "10px 18px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <button className="fbtn" disabled={loading || page <= 1} onClick={() => goto(1)}>«</button>
            <button className="fbtn" disabled={loading || page <= 1} onClick={() => goto(page - 1)}>‹ Mới hơn</button>
            <span style={{ fontSize: 12.5 }}>
              Trang
              <input
                type="number" min={1} max={totalPages} className="finput" value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") goto(Number(pageInput) || 1); }}
                onBlur={() => goto(Number(pageInput) || 1)}
                style={{ width: 56, margin: "0 6px", textAlign: "center" }}
              />
              / {totalPages}
            </span>
            <button className="fbtn" disabled={loading || page >= totalPages} onClick={() => goto(page + 1)}>Cũ hơn ›</button>
            <button className="fbtn" disabled={loading || page >= totalPages} onClick={() => goto(totalPages)}>»</button>
          </div>
        )}
      </div>
    </div>
  );
}

function KhongDangNhapTab() {
  const [detailUser, setDetailUser] = useState(null); // bấm vào 1 dòng -> xem từng ngày có / không đăng nhập
  const [days, setDays] = useState(3);
  const [daysInput, setDaysInput] = useState("3");
  const [onlyOver, setOnlyOver] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load(n) {
    setLoading(true);
    setError("");
    getNoLoginUsers(n)
      .then((res) => {
        setData(res);
        setDays(res.days);
        setDaysInput(String(res.days));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(3); }, []);

  const all = data?.users || [];
  const users = onlyOver ? all.filter((u) => u.qua_han) : all;

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-900)" }}>Làm nổi bật user không đăng nhập từ</label>
          <input
            type="number" min={1} className="finput" value={daysInput}
            onChange={(e) => setDaysInput(e.target.value)} style={{ width: 70 }}
          />
          <span style={{ fontSize: 12.5, color: "var(--text-600)" }}>ngày trở lên</span>
          <button className="fbtn" disabled={loading || !daysInput || Number(daysInput) < 1} onClick={() => load(Number(daysInput))}>
            {loading ? "Đang tải..." : "🔍 Kiểm tra"}
          </button>
          <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginLeft: 8 }}>
            <input type="checkbox" checked={onlyOver} onChange={(e) => setOnlyOver(e.target.checked)} />
            Chỉ hiện user quá hạn
          </label>
          {data && !loading && (
            <span style={{ fontSize: 12, color: "var(--text-600)" }}>
              <b style={{ color: "var(--danger)" }}>{data.so_qua_han}</b> / {data.tong} tài khoản chưa đăng nhập từ {days} ngày trở lên
              {data.so_chua_tung > 0 && <> (trong đó <b>{data.so_chua_tung}</b> chưa từng ghi nhận đăng nhập)</>}
            </span>
          )}
        </div>
      </div>

      {detailUser && <LoginDaysModal user={detailUser} onClose={() => setDetailUser(null)} />}

      <div style={{ fontSize: 11.5, color: "var(--text-400)", marginBottom: 12 }}>
        Bấm vào một dòng để xem chi tiết từng ngày có / không đăng nhập (60 ngày/trang, chia 2 cột). Số ngày tính theo lịch Việt Nam: đăng nhập hôm nay = 0 ngày. Gồm mọi tài khoản đang hoạt động (kể cả Viewer), không gồm
        Guest (có tab riêng). "Chưa từng" nghĩa là hệ thống chưa ghi nhận lần đăng nhập nào của tài khoản đó.
      </div>

      {error && <div className="placeholder-box">Không tải được dữ liệu: {error}</div>}

      {data && !error && (
        <div className="card">
          <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
            {users.length === 0 ? (
              <div className="placeholder-box">✅ Không có tài khoản nào quá {days} ngày chưa đăng nhập.</div>
            ) : (
              <table style={{ fontSize: 11.5 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: "left" }}>Người dùng</th>
                    <th style={thStyle}>Khu vực</th>
                    <th style={thStyle}>Vai trò</th>
                    <th style={thStyle}>Đăng nhập gần nhất</th>
                    <th style={thStyle}>Số ngày không đăng nhập</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const never = u.so_ngay_khong_login === null;
                    return (
                      <tr key={u.user_id} onClick={() => setDetailUser(u)} style={{ cursor: "pointer", ...(u.qua_han ? { background: never ? "#FDEAEA" : "#FFF3E0" } : {}) }} title="Bấm để xem chi tiết từng ngày">
                        <td style={{ ...tdStyle, textAlign: "left" }}>
                          <div style={{ fontWeight: 700, color: "var(--text-900)", fontSize: 12 }}>{u.full_name || "(không tên)"}</div>
                          <div style={{ fontSize: 10.5, color: "var(--text-400)" }}>{u.email}</div>
                        </td>
                        <td className="num" style={tdStyle}>{u.khu_vuc || "—"}</td>
                        <td className="num" style={tdStyle}>{u.role_label}</td>
                        <td className="num" style={{ ...tdStyle, color: u.last_login_at ? "var(--text-900)" : "var(--danger)", fontWeight: u.last_login_at ? 400 : 700 }}>
                          {u.last_login_at ? formatDateTimeVn(u.last_login_at) : "Chưa từng"}
                        </td>
                        <td className="num" style={tdStyle}>
                          {never ? (
                            <span style={{ background: "var(--danger)", color: "#fff", fontWeight: 700, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
                              Chưa từng đăng nhập
                            </span>
                          ) : u.qua_han ? (
                            <span style={{ background: "#E8590C", color: "#fff", fontWeight: 700, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
                              {u.so_ngay_khong_login} ngày
                            </span>
                          ) : (
                            <span style={{ color: u.so_ngay_khong_login === 0 ? "#3E7A2A" : "var(--text-900)", fontWeight: u.so_ngay_khong_login === 0 ? 700 : 400 }}>
                              {u.so_ngay_khong_login === 0 ? "Hôm nay" : `${u.so_ngay_khong_login} ngày`}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
