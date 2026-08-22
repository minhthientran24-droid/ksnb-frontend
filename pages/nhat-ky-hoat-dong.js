import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { getActivityLogSummary, getUser } from "../lib/api";

const ADMIN_ROLES = ["admin", "super_admin"];

function formatDateVn(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function NhatKyHoatDongPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
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
    const user = getUser();
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      router.replace("/");
      return;
    }
    setChecked(true);
    load(); // không truyền ngày -> server mặc định hôm nay
  }, []);

  if (!checked) return null;

  const actions = data?.actions || [];
  const users = data?.users || [];

  return (
    <Layout crumb="Nhật ký hoạt động">
      <div className="page-head">
        <h1>Nhật ký hoạt động</h1>
        <p>
          Số lần dùng từng tính năng của mỗi tài khoản, xem theo từng ngày.
          Chỉ ghi nhận các hành động chính — không phải mọi thao tác trên web.
        </p>
      </div>

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
    </Layout>
  );
}

const thStyle = { fontSize: 10.5, padding: "8px 10px", whiteSpace: "normal", lineHeight: 1.3 };
const tdStyle = { fontSize: 11.5, padding: "8px 10px" };
