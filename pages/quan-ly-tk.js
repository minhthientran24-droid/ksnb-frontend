import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import ChangePasswordSection from "../components/ChangePasswordSection";
import { avatarSrc, deleteMyAvatar, getMyProfile, getUser, updateStoredUser, uploadMyAvatar } from "../lib/api";

// Menu RIÊNG của Guest Account (chốt 26/10) — "Quản lý TK": cập nhật ảnh đại diện + đổi mật khẩu của chính mình.
export default function QuanLyTkPage() {
  const [checked, setChecked] = useState(false);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    if (!getUser()) {
      window.location.replace("/");
      return;
    }
    setChecked(true);
    getMyProfile().then(setProfile).catch((err) => setError(err.message));
  }, []);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Ảnh vượt quá 5MB");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const p = await uploadMyAvatar(file);
      setProfile(p);
      updateStoredUser({ avatar_url: p.avatar_url });
      setMsg("✅ Đã cập nhật ảnh đại diện.");
    } catch (err) {
      setError(err.message || "Cập nhật ảnh thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Xóa ảnh đại diện hiện tại?")) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const p = await deleteMyAvatar();
      setProfile(p);
      updateStoredUser({ avatar_url: null });
      setMsg("✅ Đã xóa ảnh đại diện.");
    } catch (err) {
      setError(err.message || "Xóa ảnh thất bại");
    } finally {
      setBusy(false);
    }
  }

  if (!checked) return null;
  const initials = (profile?.full_name || getUser()?.full_name || "?").split(" ").slice(-2).map((w) => w[0]).join("").toUpperCase();

  return (
    <Layout crumb="Quản lý TK">
      <div className="page-head">
        <h1>⚙️ Quản lý TK</h1>
        <p>Cập nhật ảnh đại diện và đổi mật khẩu đăng nhập của tài khoản.</p>
      </div>

      {error && <div className="placeholder-box" style={{ color: "var(--danger)" }}>{error}</div>}

      <div className="card">
        <div className="card-head"><h3>Thông tin tài khoản</h3></div>
        <div className="card-body" style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", padding: "18px 20px" }}>
          <div style={{
            width: 96, height: 96, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 30,
            background: profile?.avatar_url ? `url(${avatarSrc(profile.avatar_url)}) center/cover` : "linear-gradient(135deg,var(--navy-700),var(--blue-accent))",
          }}>
            {!profile?.avatar_url && initials}
          </div>
          <div style={{ minWidth: 240, flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--navy-900)" }}>{profile?.full_name || "—"}</div>
            <div style={{ fontSize: 13, color: "var(--text-600)", marginTop: 4 }}>✉️ {profile?.email || "—"}</div>
            {profile?.position && <div style={{ fontSize: 13, color: "var(--text-600)", marginTop: 2 }}>🏷️ {profile.position}</div>}
            {profile?.guest_vung && <div style={{ fontSize: 13, color: "var(--text-600)", marginTop: 2 }}>📍 Vùng: <b>{profile.guest_vung}</b></div>}
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }} onChange={handleFile} />
              <button type="button" className="upload-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
                📤 {busy ? "Đang xử lý..." : profile?.avatar_url ? "Đổi ảnh đại diện" : "Chọn ảnh đại diện"}
              </button>
              {profile?.avatar_url && (
                <button type="button" className="fbtn" disabled={busy} onClick={handleRemove} style={{ color: "var(--danger)" }}>Xóa ảnh</button>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-400)", marginTop: 8 }}>Ảnh JPG, PNG, WEBP hoặc GIF, tối đa 5MB.</div>
            {msg && <div style={{ fontSize: 13, color: "#4C9A2A", marginTop: 8 }}>{msg}</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Đổi mật khẩu đăng nhập</h3></div>
        <div className="card-body" style={{ padding: "16px 20px" }}>
          <ChangePasswordSection bare />
        </div>
      </div>
    </Layout>
  );
}
