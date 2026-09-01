import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import {
  listUsers, createUserAccount, updateUserAccount, deleteUserAccount, exportUsersExcel, getUser,
  getMenuPermissionCatalog, saveMenuPermissions,
} from "../lib/api";
import { useAllowedKeys } from "../lib/permissions";

const emptyForm = { email: "", full_name: "", position: "", password: "", role: "viewer", xlkk_app_access: false, kiem_ke_permission: false, khu_vuc: "" };
const ADMIN_ROLES = ["admin", "super_admin"];
const ROLE_LABELS = { super_admin: "Super Admin", admin: "Admin", editor: "Editor", viewer: "Viewer" };
const KHU_VUC_OPTIONS = ["VP HCM", "VP HNI"];

// Thứ tự hiển thị bảng: Admin (gồm cả Super Admin) - Editor - Editor Base -
// Viewer, cùng quyền thì sắp tiếp theo Khu vực làm việc (VP HCM trước VP
// HNI, chưa chọn xuống cuối).
const ROLE_SORT_ORDER = { super_admin: 0, admin: 1, editor: 2, editor_base: 3, viewer: 4 };
const KHU_VUC_SORT_ORDER = KHU_VUC_OPTIONS.reduce((acc, k, i) => ({ ...acc, [k]: i }), {});

function sortAccounts(list) {
  return [...list].sort((a, b) => {
    const ra = ROLE_SORT_ORDER[a.role] ?? 99;
    const rb = ROLE_SORT_ORDER[b.role] ?? 99;
    if (ra !== rb) return ra - rb;
    const ka = KHU_VUC_SORT_ORDER[a.khu_vuc] ?? 99;
    const kb = KHU_VUC_SORT_ORDER[b.khu_vuc] ?? 99;
    return ka - kb;
  });
}

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
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ full_name: "", password: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState("danh-sach");
  const { can } = useAllowedKeys();

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

  async function handlePositionBlur(u, value) {
    if (value === (u.position || "")) return;
    try {
      await updateUserAccount(u.id, { position: value });
      load();
    } catch (err) {
      alert(err.message || "Cập nhật thất bại");
    }
  }

  async function handleToggleXlkkAccess(u) {
    try {
      await updateUserAccount(u.id, { xlkk_app_access: !u.xlkk_app_access });
      load();
    } catch (err) {
      alert(err.message || "Cập nhật thất bại");
    }
  }

  async function handleToggleKiemKePermission(u) {
    try {
      await updateUserAccount(u.id, { kiem_ke_permission: !u.kiem_ke_permission });
      load();
    } catch (err) {
      alert(err.message || "Cập nhật thất bại");
    }
  }

  async function handleKhuVucChange(u, khu_vuc) {
    // Gửi chuỗi rỗng (không phải null) khi bỏ chọn — backend coi null là
    // "không đổi field này", còn "" mới thật sự xóa Khu vực đang có.
    try {
      await updateUserAccount(u.id, { khu_vuc });
      load();
    } catch (err) {
      alert(err.message || "Cập nhật thất bại");
    }
  }

  function startEdit(u) {
    setEditingId(u.id);
    setEditForm({ full_name: u.full_name || "", password: "" });
    setEditError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError("");
  }

  async function handleSaveEdit(id) {
    if (!editForm.full_name.trim()) {
      setEditError("Họ tên không được để trống");
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      const payload = { full_name: editForm.full_name.trim() };
      if (editForm.password.trim()) payload.password = editForm.password.trim();
      await updateUserAccount(id, payload);
      setEditingId(null);
      load();
    } catch (err) {
      setEditError(err.message || "Cập nhật thất bại");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleExportExcel() {
    setExporting(true);
    try {
      await exportUsersExcel();
    } catch (err) {
      alert(err.message || "Xuất file thất bại");
    } finally {
      setExporting(false);
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

      {me?.role === "super_admin" && (
        <div className="month-tabs">
          <div className={`month-tab ${tab === "danh-sach" ? "active" : ""}`} onClick={() => setTab("danh-sach")}>
            Danh sách tài khoản
          </div>
          <div className={`month-tab ${tab === "phan-quyen" ? "active" : ""}`} onClick={() => setTab("phan-quyen")}>
            🔐 Quản lý phân quyền
          </div>
        </div>
      )}

      {tab === "phan-quyen" && me?.role === "super_admin" ? (
        <PhanQuyenPanel />
      ) : (
        <>

      <div className="card">
        <div className="card-body" style={{ padding: "16px 20px", display: "flex", gap: 10 }}>
          <button className="login-btn" style={{ width: "auto", padding: "10px 24px" }} onClick={() => setShowForm(!showForm)}>
            + Tạo tài khoản mới
          </button>
          <button className="upload-btn" style={{ width: "auto", padding: "10px 24px" }} onClick={handleExportExcel} disabled={exporting}>
            {exporting ? "Đang xuất..." : "📥 Xuất file Excel"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <div className="card-head"><h3>Tạo tài khoản mới</h3></div>
          <form onSubmit={handleCreate} className="form-grid-2" style={{ padding: "16px 20px" }}>
            <div><label style={labelStyle}>Email đăng nhập *</label>
              <input style={inputStyle} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="thientm@fpt.com" /></div>
            <div><label style={labelStyle}>Họ tên *</label>
              <input style={inputStyle} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><label style={labelStyle}>Chức danh</label>
              <input style={inputStyle} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="VD: Chuyên viên KSNB" /></div>
            <div><label style={labelStyle}>Mật khẩu tạm thời *</label>
              <input style={inputStyle} type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Nên yêu cầu đổi sau lần đăng nhập đầu" /></div>
            <div><label style={labelStyle}>Quyền</label>
              <select style={inputStyle} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="viewer">Viewer — chỉ xem</option>
                <option value="editor">Editor — sửa nội dung được giao</option>
                <option value="editor_base">Editor Base — như Editor, không xem Báo cáo tháng</option>
                <option value="admin">Admin — sửa mọi nội dung</option>
                {me?.role === "super_admin" && <option value="super_admin">Super Admin — toàn quyền</option>}
              </select></div>
            <div><label style={labelStyle}>Khu vực làm việc</label>
              <select style={inputStyle} value={form.khu_vuc} onChange={(e) => setForm({ ...form, khu_vuc: e.target.value })}>
                <option value="">— chưa chọn —</option>
                {KHU_VUC_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select></div>
            <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
              <input
                id="xlkk_app_access"
                type="checkbox"
                checked={form.xlkk_app_access}
                onChange={(e) => setForm({ ...form, xlkk_app_access: e.target.checked })}
              />
              <label htmlFor="xlkk_app_access" style={{ fontSize: 13, color: "var(--text-600)", cursor: "pointer" }}>
                Cấp quyền dùng App Kiểm kê (XLKK) — cho phép đăng nhập app desktop kiểm kê bằng tài khoản này
              </label>
            </div>
            <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
              <input
                id="kiem_ke_permission"
                type="checkbox"
                checked={form.kiem_ke_permission}
                onChange={(e) => setForm({ ...form, kiem_ke_permission: e.target.checked })}
              />
              <label htmlFor="kiem_ke_permission" style={{ fontSize: 13, color: "var(--text-600)", cursor: "pointer" }}>
                Quyền Kiểm Kê — có tên trong danh sách KSNB khi Load danh sách ở Phân công KSNB kiểm kê
              </label>
            </div>
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
        <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                {["STT", "Email", "Họ tên", "Chức danh", "Khu vực", "Quyền", "Trạng thái", "App XLKK", "Quyền Kiểm Kê", ""].map((h) => (
                  <th key={h} style={{ position: "sticky", top: 0, zIndex: 2, background: "#eaf1fc" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortAccounts(list).map((u, idx) => (
                <Fragment key={u.id}>
                  <tr>
                    <td>{idx + 1}</td>
                    <td>{u.email}</td>
                    <td>{u.full_name}</td>
                    <td>
                      <input
                        defaultValue={u.position || ""}
                        onBlur={(e) => handlePositionBlur(u, e.target.value)}
                        placeholder="Chưa có"
                        style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12.5, width: 140 }}
                      />
                    </td>
                    <td>
                      <select
                        value={u.khu_vuc || ""}
                        onChange={(e) => handleKhuVucChange(u, e.target.value)}
                        style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12.5 }}
                      >
                        <option value="">— chưa chọn —</option>
                        {KHU_VUC_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        disabled={u.id === me?.id}
                        style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12.5 }}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="editor_base">Editor Base</option>
                        <option value="admin">Admin</option>
                        {me?.role === "super_admin" && <option value="super_admin">Super Admin</option>}
                      </select>
                    </td>
                    <td>
                      <span className={`pill ${u.is_active ? "ok" : "warn"}`}>
                        {u.is_active ? "Đang hoạt động" : "Đã khóa"}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => handleToggleXlkkAccess(u)} style={btnStyle}>
                        <span className={`pill ${u.xlkk_app_access ? "ok" : "warn"}`}>
                          {u.xlkk_app_access ? "Đã cấp quyền" : "Chưa cấp quyền"}
                        </span>
                      </button>
                    </td>
                    <td>
                      <button onClick={() => handleToggleKiemKePermission(u)} style={btnStyle}>
                        <span className={`pill ${u.kiem_ke_permission ? "ok" : "warn"}`}>
                          {u.kiem_ke_permission ? "Đã cấp quyền" : "Chưa cấp quyền"}
                        </span>
                      </button>
                    </td>
                    <td style={{ display: "flex", gap: 8 }}>
                      {can("/quan-ly-tai-khoan::sua-tai-khoan") && (
                        <button onClick={() => startEdit(u)} style={btnStyle}>
                          Sửa
                        </button>
                      )}
                      <button onClick={() => handleToggleActive(u)} style={btnStyle} disabled={u.id === me?.id}>
                        {u.is_active ? "Khóa" : "Mở khóa"}
                      </button>
                      {can("/quan-ly-tai-khoan::xoa-tai-khoan") && (
                        <button onClick={() => handleDelete(u.id)} style={{ ...btnStyle, color: "var(--danger)" }} disabled={u.id === me?.id}>
                          Xóa
                        </button>
                      )}
                    </td>
                  </tr>
                  {editingId === u.id && (
                    <tr>
                      <td colSpan={10} style={{ background: "var(--bg)", padding: "14px 16px" }}>
                        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
                          <div>
                            <label style={labelStyle}>Họ tên</label>
                            <input
                              style={{ ...inputStyle, width: 220 }}
                              value={editForm.full_name}
                              onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                            />
                          </div>
                          <div>
                            <label style={labelStyle}>Đặt lại mật khẩu (để trống nếu không đổi)</label>
                            <input
                              style={{ ...inputStyle, width: 220 }}
                              type="text"
                              value={editForm.password}
                              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                              placeholder="Mật khẩu mới"
                            />
                          </div>
                          <button
                            className="login-btn"
                            style={{ width: "auto", padding: "9px 20px" }}
                            disabled={editSaving}
                            onClick={() => handleSaveEdit(u.id)}
                          >
                            {editSaving ? "Đang lưu..." : "Lưu"}
                          </button>
                          <button style={btnStyle} onClick={cancelEdit}>Hủy</button>
                          {editError && <span style={{ fontSize: 12.5, color: "var(--danger)" }}>{editError}</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </Layout>
  );
}

// ---------- Tab "Quản lý phân quyền" (chốt 31/08, mở rộng cấp 2 — chốt
// 01/09) — chỉ super_admin. Bố trí dạng cây: mỗi menu 1 hàng ("thư mục"),
// bấm mũi tên để mở ra các tab/khu vực con (cấp 2) bên trong, tick chọn
// role nào được xem menu/tab đó. super_admin luôn full quyền, không hiện
// trong bảng. Cấp 2 chỉ thật sự có hiệu lực khi role đó ĐÃ có quyền cấp 1. ----------
// 1 dòng trong cây phân quyền (menu cấp 1 / tab cấp 2 / nút Xóa-Sửa cấp 3) —
// đệ quy tự gọi lại chính nó cho con, sâu bao nhiêu cấp cũng render được.
function PhanQuyenRow({ node, depth, data, expanded, toggleExpand, toggle }) {
  const children = node.children || [];
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(node.key);
  const icon = depth === 0 ? "📁" : hasChildren ? "📁" : "📄";
  return (
    <Fragment>
      <tr style={depth > 0 ? { background: "var(--bg)" } : undefined}>
        <td
          style={{
            textAlign: "left", paddingLeft: 12 + depth * 24,
            cursor: hasChildren ? "pointer" : "default",
            color: depth > 0 ? "var(--text-600)" : undefined,
          }}
          onClick={() => hasChildren && toggleExpand(node.key)}
        >
          {hasChildren ? (isOpen ? "▾" : "▸") : "　"} {icon} {node.label}
        </td>
        {data.roles.map((role) => (
          <td key={role}>
            <input
              type="checkbox"
              checked={!!data.matrix[role][node.key]}
              onChange={() => toggle(role, node.key)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
          </td>
        ))}
      </tr>
      {hasChildren && isOpen && children.map((c) => (
        <PhanQuyenRow
          key={c.key} node={c} depth={depth + 1} data={data}
          expanded={expanded} toggleExpand={toggleExpand} toggle={toggle}
        />
      ))}
    </Fragment>
  );
}

function PhanQuyenPanel() {
  const [data, setData] = useState(null); // {menus, roles, role_labels, matrix}
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  // Menu nào đang mở cây con — mặc định mở hết cho dễ rà soát tổng quan.
  const [expanded, setExpanded] = useState(new Set());

  function load() {
    setSaveMsg("");
    getMenuPermissionCatalog().then((d) => {
      setData(d);
      // Mở sẵn hết mọi cấp (2 lẫn 3) có con, để rà soát tổng quan dễ hơn.
      const expandable = [];
      (function collect(nodes) {
        for (const n of nodes) {
          if ((n.children || []).length) {
            expandable.push(n.key);
            collect(n.children);
          }
        }
      })(d.menus);
      setExpanded(new Set(expandable));
    }).catch((err) => setError(err.message));
  }
  useEffect(load, []);

  function toggleExpand(key) {
    setExpanded((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggle(role, key) {
    setData((d) => ({
      ...d,
      matrix: { ...d.matrix, [role]: { ...d.matrix[role], [key]: !d.matrix[role][key] } },
    }));
    setDirty(true);
    setSaveMsg("");
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg("");
    try {
      await saveMenuPermissions(data.matrix);
      setSaveMsg("✅ Đã lưu — role bị đổi quyền cần đăng nhập lại (hoặc tải lại trang) mới thấy đúng menu mới.");
      setDirty(false);
    } catch (err) {
      setSaveMsg("❌ " + err.message);
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div className="placeholder-box">Không tải được dữ liệu: {error}</div>;
  if (!data) return null;

  return (
    <div className="card">
      <div className="card-head">
        <h3>🔐 Quản lý phân quyền — theo Menu</h3>
        <span className="note">Super Admin luôn toàn quyền, không cần cấu hình riêng</span>
      </div>
      <div className="card-body">
        <div style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 14, lineHeight: 1.6 }}>
          Tick chọn role nào được xem/vào 1 menu — bỏ tick thì role đó không thấy menu này trên sidebar
          và cũng không vào được dù gõ thẳng link. Bấm ▸/▾ để mở ra các cấp con: cấp 2 là tab/khu vực bên
          trong menu, cấp 3 (nếu có) là từng nút Xóa/Sửa lẻ bên trong 1 tab — mỗi cấp chỉ thật sự có hiệu
          lực khi role đó ĐÃ được tick ở TẤT CẢ cấp cha phía trên.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Menu</th>
                {data.roles.map((role) => (
                  <th key={role}>{data.role_labels[role] || role}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.menus.map((m) => (
                <PhanQuyenRow
                  key={m.key} node={m} depth={0} data={data}
                  expanded={expanded} toggleExpand={toggleExpand} toggle={toggle}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <button className="login-btn" style={{ width: "auto", padding: "10px 24px" }} disabled={saving || !dirty} onClick={handleSave}>
            {saving ? "Đang lưu..." : "💾 Lưu thay đổi"}
          </button>
          {saveMsg && <span style={{ fontSize: 12.5, color: saveMsg.startsWith("❌") ? "var(--danger)" : "#3E7A2A" }}>{saveMsg}</span>}
        </div>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-600)", display: "block", marginBottom: 6 };
const inputStyle = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13.5, background: "#FAFBFD" };
const btnStyle = { background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "var(--text-600)", cursor: "pointer" };
