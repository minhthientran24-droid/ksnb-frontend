import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { listUsers, createUserAccount, updateUserAccount, deleteUserAccount, getUser } from "../lib/api";

const emptyForm = { email: "", full_name: "", password: "", role: "viewer" };
const ADMIN_ROLES = ["admin", "super_admin"];
const ROLE_LABELS = { super_admin: "Super Admin", admin: "Admin", editor: "Editor", viewer: "Viewer" };

export default function QuanLyTaiKhoanPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [checked, setChecked] = useState(false);
  const [list, setList] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const user = getUser();
    setMe(user);
    // Chặn truy cập nếu không phải admin/super_admin — kể cả khi có link trực tiếp
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      router.replace("/");
      return;
    }
    setChecked(true);
    load();
  }, []);

  function load() {
    listUsers().then(setList).catch((err) => setError(err.message));
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.email.trim() || !form.full_name.trim() || !form.password.trim()) {
      setSaveError("Cần nhập đủ Email, Họ tên, Mật khẩu");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await createUserAccount(form);
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      setSaveError(err.message || "Tạo tài khoản thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(id, role) {
    try {
      await updateUserAccount(id, { role });
      load();
    } catch (err) {
      alert(err.message || "Cập nhật thất bại");
    }
  }

  async function handleToggleActive(u) {
    try {
      await updateUserAccount(u.id, { is_active: !u.is_active });
      load();
    } catch (err) {
      alert(err.message || "Cập nhật thất bại");
    }
  }

  async function handleDelete(id) {
    if (!confirm("Xóa tài khoản này? Người dùng sẽ không đăng nhập được nữa.")) return;
    try {
      await deleteUserAccount(id);
      load();
    } catch (err) {
      alert(err.message || "Xóa thất bại");
    }
  }

  if (!checked) return null;

  return (
    <Layout crumb="Quản lý tài khoản">
      <div className="page-head">
        <h1>Quản lý tài khoản đăng nhập</h1>
        <p>
          Tạo và quản lý tài khoản đăng nhập web — khác với hồ sơ "Giới thiệu nhân sự KSNB".
          Chỉ Admin/Super Admin truy cập được mục này.
        </p>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: "16px 20px" }}>
          <button className="login-btn" style={{ width: "auto", padding: "10px 24px" }} onClick={() => setShowForm(!showForm)}>
            + Tạo tài khoản mới
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <div className="card-head"><h3>Tạo tài khoản mới</h3></div>
          <form onSubmit={handleCreate} style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><label style={labelStyle}>Email đăng nhập *</label>
              <input style={inputStyle} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="thientm@fpt.com" /></div>
            <div><label style={labelStyle}>Họ tên *</label>
              <input style={inputStyle} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><label style={labelStyle}>Mật khẩu tạm thời *</label>
              <input style={inputStyle} type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Nên yêu cầu đổi sau lần đăng nhập đầu" /></div>
            <div><label style={labelStyle}>Quyền</label>
              <select style={inputStyle} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="viewer">Viewer — chỉ xem</option>
                <option value="editor">Editor — sửa nội dung được giao</option>
                <option value="admin">Admin — sửa mọi nội dung</option>
                {me?.role === "super_admin" && <option value="super_admin">Super Admin — toàn quyền</option>}
              </select></div>
            {saveError && <div style={{ gridColumn: "1 / -1", fontSize: 12.5, color: "var(--danger)" }}>{saveError}</div>}
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
              <button type="submit" disabled={saving} className="login-btn" style={{ width: "auto", padding: "10px 24px" }}>
                {saving ? "Đang tạo..." : "Tạo tài khoản"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={btnStyle}>Hủy</button>
            </div>
          </form>
        </div>
      )}

      {error && <div className="placeholder-box">Không tải được dữ liệu: {error}</div>}

      <div className="card">
        <div className="card-body">
          <table>
            <thead>
              <tr><th>Email</th><th>Họ tên</th><th>Quyền</th><th>Trạng thái</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.full_name}</td>
                  <td>
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={u.id === me?.id}
                      style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12.5 }}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                      {me?.role === "super_admin" && <option value="super_admin">Super Admin</option>}
                    </select>
                  </td>
                  <td>
                    <span className={`pill ${u.is_active ? "ok" : "warn"}`}>
                      {u.is_active ? "Đang hoạt động" : "Đã khóa"}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleToggleActive(u)} style={btnStyle} disabled={u.id === me?.id}>
                      {u.is_active ? "Khóa" : "Mở khóa"}
                    </button>
                    <button onClick={() => handleDelete(u.id)} style={{ ...btnStyle, color: "var(--danger)" }} disabled={u.id === me?.id}>
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-600)", display: "block", marginBottom: 6 };
const inputStyle = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13.5, background: "#FAFBFD" };
const btnStyle = { background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "var(--text-600)", cursor: "pointer" };
