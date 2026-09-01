import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import SignatureEditor from "../components/SignatureEditor";
import {
  listPersonnel, saveOwnPersonnel, updatePersonnel, deletePersonnel, getUser, uploadAvatar,
  getMySignature, saveMySignature, listAllSignatures, adminSaveSignature,
} from "../lib/api";
import { useAllowedKeys } from "../lib/permissions";

const emptyForm = {
  full_name: "", position: "", email: "", phone: "",
  region: "", main_duties: "", hobbies: "", avatar_url: "",
};

const ADMIN_ROLES = ["admin", "super_admin"];

// Tự thiết lập chữ ký mail của CHÍNH MÌNH — riêng tư, người khác không xem
// được (server tự chặn), khác hẳn hồ sơ "giới thiệu" công khai ở trên.
function MySignatureCard() {
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    getMySignature()
      .then((s) => setSignature(s.signature || ""))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSavedMsg("");
    try {
      const s = await saveMySignature(signature);
      setSignature(s.signature || "");
      setSavedMsg("✅ Đã lưu.");
    } catch (err) {
      setError(err.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>✍️ Thiết Lập Chữ Ký Mail</h3>
        <span className="note">Riêng tư — chỉ mình anh/chị xem được, không hiện cho ai khác</span>
      </div>
      <div className="card-body">
        <p style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 12, lineHeight: 1.6 }}>
          Nhập chữ ký + thông tin liên hệ dùng khi gửi mail BCKS (mục "Gửi mail BCKS" sẽ tự lấy nội dung này để
          điền vào phần chữ ký). Có thể để nhiều dòng — VD: lời chào, tên, chức danh, số điện thoại...
        </p>
        {loading ? (
          <div style={{ fontSize: 12.5, color: "var(--text-600)" }}>Đang tải...</div>
        ) : (
          <>
            <SignatureEditor
              value={signature}
              onChange={setSignature}
              placeholder="Trân trọng, Nguyễn Văn A — Chuyên viên KSNB — ĐT: 09xx xxx xxx"
            />
            {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 10 }}>{error}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
              <button
                className="login-btn" style={{ width: "auto", padding: "9px 22px" }}
                onClick={handleSave} disabled={saving}
              >
                {saving ? "Đang lưu..." : "Lưu chữ ký"}
              </button>
              {savedMsg && <span style={{ fontSize: 12, color: "#4C9A2A" }}>{savedMsg}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Admin — xem/sửa chữ ký của TẤT CẢ mọi người (server tự chặn user thường
// gọi các API này, không chỉ ẩn ở UI).
function AdminSignaturesPanel() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    listAllSignatures()
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  function openEdit(item) {
    setOpenId(item.personnel_id);
    setDraft(item.signature || "");
  }

  async function handleSave(personnelId) {
    setSaving(true);
    try {
      await adminSaveSignature(personnelId, draft);
      setOpenId(null);
      load();
    } catch (err) {
      alert(err.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>🔐 Quản lý chữ ký toàn bộ nhân sự (Admin)</h3>
        <span className="note">Chỉ admin xem/sửa được chữ ký của người khác</span>
      </div>
      <div className="card-body">
        {loading && <div style={{ fontSize: 12.5, color: "var(--text-600)" }}>Đang tải...</div>}
        {error && <div style={{ fontSize: 12.5, color: "var(--danger)" }}>{error}</div>}
        {!loading && !error && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((item) => (
              <div key={item.personnel_id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 12.5, color: "var(--navy-900)" }}>{item.full_name}</span>
                    {item.email && <span style={{ fontSize: 11.5, color: "var(--text-400)", marginLeft: 8 }}>{item.email}</span>}
                    <span style={{ fontSize: 11, color: item.signature ? "#4C9A2A" : "var(--text-400)", marginLeft: 10 }}>
                      {item.signature ? "✅ Đã thiết lập" : "Chưa thiết lập"}
                    </span>
                  </div>
                  <button className="fbtn" onClick={() => openEdit(item)}>
                    {openId === item.personnel_id ? "Đang sửa..." : "Xem / Sửa"}
                  </button>
                </div>
                {openId === item.personnel_id && (
                  <div style={{ marginTop: 10 }}>
                    <SignatureEditor value={draft} onChange={setDraft} />
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <button
                        className="login-btn" style={{ width: "auto", padding: "8px 18px" }}
                        onClick={() => handleSave(item.personnel_id)} disabled={saving}
                      >
                        {saving ? "Đang lưu..." : "Lưu"}
                      </button>
                      <button className="fbtn" onClick={() => setOpenId(null)}>Đóng</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function NhanSuPage() {
  const [list, setList] = useState([]);
  const [error, setError] = useState("");
  const [me, setMe] = useState(null);
  const [editingId, setEditingId] = useState(null); // null = không mở form; "own" = form hồ sơ của mình
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploading, setUploading] = useState(false);
  const avatarInputRef = useRef(null);

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setSaveError("");
    try {
      const url = await uploadAvatar(file);
      setForm((f) => ({ ...f, avatar_url: url }));
    } catch (err) {
      setSaveError(err.message || "Upload ảnh thất bại");
    } finally {
      setUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  function load() {
    listPersonnel().then(setList).catch((err) => setError(err.message));
  }

  useEffect(() => {
    setMe(getUser());
    load();
  }, []);

  const { can } = useAllowedKeys();
  const isAdmin = me && ADMIN_ROLES.includes(me.role);
  const myProfile = me ? list.find((p) => p.owner_user_id === me.id) : null;

  function openEditOwn() {
    setForm(myProfile ? { ...emptyForm, ...myProfile } : emptyForm);
    setEditingId("own");
    setSaveError("");
  }

  function openEditOther(p) {
    setForm({ ...emptyForm, ...p });
    setEditingId(p.id);
    setSaveError("");
  }

  function closeForm() {
    setEditingId(null);
    setForm(emptyForm);
    setSaveError("");
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.full_name.trim() || !form.position.trim()) {
      setSaveError("Cần nhập ít nhất Tên và Chức danh");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const payload = { ...form };
      delete payload.id;
      delete payload.owner_user_id;

      if (editingId === "own") {
        await saveOwnPersonnel(payload);
      } else {
        await updatePersonnel(editingId, payload);
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
    if (!confirm("Xóa hồ sơ nhân sự này?")) return;
    try {
      await deletePersonnel(id);
      load();
    } catch (err) {
      alert(err.message || "Xóa thất bại");
    }
  }

  return (
    <Layout crumb="Giới thiệu nhân sự KSNB">
      <div className="page-head">
        <h1>Nhân sự phòng KSNB</h1>
        <p>
          Mỗi người tự cập nhật hồ sơ của mình
          {isAdmin && " — tài khoản admin/super_admin có thể sửa hồ sơ của bất kỳ ai"}.
        </p>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: "16px 20px" }}>
          <button className="login-btn" style={{ width: "auto", padding: "10px 24px" }} onClick={openEditOwn}>
            {myProfile ? "Sửa hồ sơ của tôi" : "+ Tạo hồ sơ của tôi"}
          </button>
        </div>
      </div>

      <MySignatureCard />
      {isAdmin && <AdminSignaturesPanel />}

      {/* Form thêm/sửa */}
      {editingId !== null && (
        <div className="card">
          <div className="card-head">
            <h3>{editingId === "own" ? "Hồ sơ của tôi" : `Sửa hồ sơ: ${form.full_name}`}</h3>
          </div>
          <form onSubmit={handleSave} className="form-grid-2" style={{ padding: "16px 20px" }}>
            <div><label style={labelStyle}>Tên *</label>
              <input style={inputStyle} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><label style={labelStyle}>Chức danh *</label>
              <input style={inputStyle} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
            <div><label style={labelStyle}>Email</label>
              <input style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label style={labelStyle}>Số điện thoại</label>
              <input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label style={labelStyle}>Khu vực đảm nhiệm</label>
              <input style={inputStyle} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></div>
            <div><label style={labelStyle}>Hình đại diện</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {form.avatar_url && (
                  <div style={{
                    width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                    background: `url(${form.avatar_url}) center/cover`,
                  }} />
                )}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  disabled={uploading}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  className="upload-btn"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploading}
                >
                  📤 {form.avatar_url ? "Đổi ảnh khác" : "Chọn ảnh đại diện"}
                </button>
              </div>
              {uploading && <div style={{ fontSize: 12, color: "var(--text-400)", marginTop: 4 }}>Đang tải ảnh lên...</div>}
            </div>
            <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>Nội dung công việc chính</label>
              <input style={inputStyle} value={form.main_duties} onChange={(e) => setForm({ ...form, main_duties: e.target.value })} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>Sở thích cá nhân</label>
              <input style={inputStyle} value={form.hobbies} onChange={(e) => setForm({ ...form, hobbies: e.target.value })} /></div>

            {saveError && <div style={{ gridColumn: "1 / -1", fontSize: 12.5, color: "var(--danger)" }}>{saveError}</div>}
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
              <button type="submit" disabled={saving || uploading} className="login-btn" style={{ width: "auto", padding: "10px 24px" }}>
                {saving ? "Đang lưu..." : "Lưu"}
              </button>
              <button type="button" onClick={closeForm} style={{ ...deleteBtnStyle, color: "var(--text-600)", padding: "10px 20px" }}>
                Hủy
              </button>
            </div>
          </form>
        </div>
      )}

      {error && <div className="placeholder-box">Không tải được dữ liệu: {error}</div>}
      {!error && list.length === 0 && (
        <div className="placeholder-box">Chưa có hồ sơ nhân sự nào. Bấm "Tạo hồ sơ của tôi" để bắt đầu.</div>
      )}

      <div className="org-grid">
        {list.map((p) => {
          const mine = me && p.owner_user_id === me.id;
          const canEdit = mine || (isAdmin && can("/nhan-su::sua-xoa-nguoi-khac"));
          return (
            <div className="card" key={p.id} style={{ padding: 18 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{
                  width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
                  background: p.avatar_url ? `url(${p.avatar_url}) center/cover` : "linear-gradient(135deg,var(--navy-700),var(--blue-accent))",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700,
                }}>
                  {!p.avatar_url && (p.full_name || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--navy-900)" }}>{p.full_name}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-600)" }}>{p.position}</div>
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-600)", lineHeight: 1.8 }}>
                {p.region && <div>📍 {p.region}</div>}
                {p.email && <div>✉️ {p.email}</div>}
                {p.phone && <div>📞 {p.phone}</div>}
                {p.main_duties && <div>🧩 {p.main_duties}</div>}
                {p.hobbies && <div>🎯 {p.hobbies}</div>}
              </div>
              {canEdit && (
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <button onClick={() => openEditOther(p)} style={deleteBtnStyle}>Sửa</button>
                  <button onClick={() => handleDelete(p.id)} style={{ ...deleteBtnStyle, color: "var(--danger)" }}>Xóa</button>
                </div>
              )}
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
