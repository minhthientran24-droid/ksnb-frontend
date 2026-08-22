import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { getActivityLogSummary, getInactiveUsers, getUser } from "../lib/api";

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
  const [tab, setTab] = useState("theo-ngay"); // "theo-ngay" | "khong-hoat-dong"

  useEffect(() => {
    const user = getUser();
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      router.replace("/");
      return;
    }
    setChecked(true);
  }, []);

  if (!checked) return null;

  return (
    <Layout crumb="Nhật ký hoạt động">
      <div className="page-head">
        <h1>Nhật ký hoạt động</h1>
        <p>Chỉ ghi nhận các hành động chính — không phải mọi thao tác trên web.</p>
      </div>

      <div className="month-tabs">
        <div className={`month-tab ${tab === "theo-ngay" ? "active" : ""}`} onClick={() => setTab("theo-ngay")}>
          📊 Theo ngày
        </div>
        <div className={`month-tab ${tab === "khong-hoat-dong" ? "active" : ""}`} onClick={() => setTab("khong-hoat-dong")}>
          🚨 Không hoạt động
        </div>
      </div>

      {tab === "theo-ngay" && <TheoNgayTab />}
      {tab === "khong-hoat-dong" && <KhongHoatDongTab />}
    </Layout>
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
