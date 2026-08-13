import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { getActivityLogSummary, getUser } from "../lib/api";

const ADMIN_ROLES = ["admin", "super_admin"];

export default function NhatKyHoatDongPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = getUser();
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      router.replace("/");
      return;
    }
    setChecked(true);
    getActivityLogSummary().then(setData).catch((err) => setError(err.message));
  }, []);

  if (!checked) return null;

  const actions = data?.actions || [];
  const users = data?.users || [];

  return (
    <Layout crumb="Nhật ký hoạt động">
      <div className="page-head">
        <h1>Nhật ký hoạt động</h1>
        <p>
          Tổng số lần đăng nhập và số lần dùng từng tính năng của mỗi tài khoản.
          Chỉ ghi nhận các hành động chính — không phải mọi thao tác trên web.
        </p>
      </div>

      {error && <div className="placeholder-box">Không tải được dữ liệu: {error}</div>}

      {data && (
        <div className="card">
          <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
            {users.length === 0 ? (
              <div className="placeholder-box">Chưa có dữ liệu hoạt động nào được ghi nhận.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Người dùng</th>
                    <th>Tổng lượt</th>
                    {actions.map((a) => (
                      <th key={a.key}>{a.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.user_id ?? u.email}>
                      <td style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: 700, color: "var(--text-900)" }}>{u.full_name || "(đã xoá)"}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-400)" }}>{u.email}</div>
                      </td>
                      <td className="num" style={{ fontWeight: 800, color: "var(--navy-800)" }}>{u.total}</td>
                      {actions.map((a) => (
                        <td key={a.key} className="num">{u.actions?.[a.key] || 0}</td>
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
