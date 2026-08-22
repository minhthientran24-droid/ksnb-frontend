import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { listActivities, createActivity, updateActivity, deleteActivity, getUser } from "../lib/api";

const emptyForm = { title: "", description: "", activity_date: "", image_url: "" };
const ADMIN_ROLES = ["admin", "super_admin"];

export default function HoatDongPage() {
  const [list, setList] = useState([]);
  const [error, setError] = useState("");
  const [me, setMe] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function load() {
    listActivities().then(setList).catch((err) => setError(err.message));
  }

  useEffect(() => {
    setMe(getUser());
    load();
  }, []);

  const isAdmin = me && ADMIN_ROLES.includes(me.role);

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
    setSaveError("");
  }

  function openEdit(a) {
    setForm({ title: a.title, description: a.description || "", activity_date: a.activity_date, image_url: a.image_url || "" });
    setEditingId(a.id);
    setShowForm(true);
    setSaveError("");
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.activity_date) {
      setSaveError("Cần nhập ít nhất Tiêu đề và Ngày diễn ra");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      if (editingId) {
        await updateActivity(editingId, form);
      } else {
        await createActivity(form);
      }
      closeForm();
      load();
    } catch (err) {
      setSaveError(err.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Xóa bài đăng này?")) return;
    try {
      await deleteActivity(id);
      load();
    } catch (err) {
      alert(err.message || "Xóa thất bại");
    }
  }

  return (
    <Layout crumb="Hoạt động phòng ban">
      <div className="page-head">
        <h1>Hoạt động phòng ban</h1>
        <p>Sinh hoạt, liên hoan, team building — ai cũng đăng được, sửa/xóa bài của chính mình.</p>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: "16px 20px" }}>
          <button className="login-btn" style={{ width: "auto", padding: "10px 24px" }} onClick={openCreate}>
            + Đăng hoạt động mới
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <div className="card-head"><h3>{editingId ? "Sửa hoạt động" : "Đăng hoạt động mới"}</h3></div>
          <form onSubmit={handleSave} className="form-grid-2" style={{ padding: "16px 20px" }}>
            <div><label style={labelStyle}>Tiêu đề *</label>
              <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><label style={labelStyle}>Ngày diễn ra *</label>
              <input type="date" style={inputStyle} value={form.activity_date} onChange={(e) => setForm({ ...form, activity_date: e.target.value })} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>Link ảnh (nếu có)</label>
              <input style={inputStyle} value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>Mô tả</label>
              <input style={inputStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>

            {saveError && <div style={{ gridColumn: "1 / -1", fontSize: 12.5, color: "var(--danger)" }}>{saveError}</div>}
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
              <button type="submit" disabled={saving} className="login-btn" style={{ width: "auto", padding: "10px 24px" }}>
                {saving ? "Đang lưu..." : "Lưu"}
              </button>
              <button type="button" onClick={closeForm} style={{ ...deleteBtnStyle, padding: "10px 20px" }}>Hủy</button>
            </div>
          </form>
        </div>
      )}

      {error && <div className="placeholder-box">Không tải được dữ liệu: {error}</div>}
      {!error && list.length === 0 && (
        <div className="placeholder-box">Chưa có hoạt động nào được đăng.</div>
      )}

      <div className="org-grid">
        {list.map((a) => {
          const mine = me && a.owner_user_id === me.id;
          const canEdit = mine || isAdmin;
          return (
            <div className="card" key={a.id} style={{ overflow: "hidden" }}>
              {a.image_url && (
                <img src={a.image_url} alt={a.title} style={{ width: "100%", height: 140, objectFit: "cover" }} />
              )}
              <div style={{ padding: "14px 16px" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--navy-900)" }}>{a.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-400)", margin: "4px 0 8px" }}>{a.activity_date}</div>
                {a.description && <div style={{ fontSize: 13, color: "var(--text-600)" }}>{a.description}</div>}
                {canEdit && (
                  <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                    <button onClick={() => openEdit(a)} style={deleteBtnStyle}>Sửa</button>
                    <button onClick={() => handleDelete(a.id)} style={{ ...deleteBtnStyle, color: "var(--danger)" }}>Xóa</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-600)", display: "block", marginBottom: 6 };
const inputStyle = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13.5, background: "#FAFBFD" };
const deleteBtnStyle = { background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "var(--text-600)", cursor: "pointer" };
