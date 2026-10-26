import { useState } from "react";
import { changePassword } from "../lib/api";

const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-600)", display: "block", marginBottom: 6 };
const inputStyle = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13.5, background: "#FAFBFD" };

// Đổi mật khẩu đăng nhập của CHÍNH MÌNH (chốt 15/10): nhập mật khẩu cũ rồi mật khẩu mới 2 lần.
// Server tự kiểm tra mật khẩu cũ — không chỉ chặn ở UI.
export default function ChangePasswordSection({ bare = false }) {
  const [oldPass, setOldPass] = useState("");
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  async function handleChange() {
    setError("");
    setOkMsg("");
    if (!oldPass) return setError("Vui lòng nhập mật khẩu cũ");
    if (pass1.length < 6) return setError("Mật khẩu mới cần tối thiểu 6 ký tự");
    if (pass1 !== pass2) return setError("Mật khẩu mới nhập lại không khớp");
    if (pass1 === oldPass) return setError("Mật khẩu mới phải khác mật khẩu cũ");
    setSaving(true);
    try {
      await changePassword(pass1, oldPass);
      setOldPass(""); setPass1(""); setPass2("");
      setOkMsg("✅ Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới.");
    } catch (err) {
      setError(err.message || "Đổi mật khẩu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={bare ? undefined : { gridColumn: "1 / -1", borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 4 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--navy-900)", marginBottom: 10 }}>🔑 Đổi mật khẩu đăng nhập</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <div><label style={labelStyle}>Mật khẩu cũ</label>
          <input style={inputStyle} type="password" autoComplete="current-password" value={oldPass} onChange={(e) => setOldPass(e.target.value)} /></div>
        <div><label style={labelStyle}>Mật khẩu mới</label>
          <input style={inputStyle} type="password" autoComplete="new-password" placeholder="Tối thiểu 6 ký tự" value={pass1} onChange={(e) => setPass1(e.target.value)} /></div>
        <div><label style={labelStyle}>Nhập lại mật khẩu mới</label>
          <input style={inputStyle} type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} /></div>
      </div>
      {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 10 }}>{error}</div>}
      {okMsg && <div style={{ fontSize: 12.5, color: "#4C9A2A", marginTop: 10 }}>{okMsg}</div>}
      <button type="button" className="login-btn" style={{ width: "auto", padding: "9px 22px", marginTop: 12 }} onClick={handleChange} disabled={saving}>
        {saving ? "Đang đổi..." : "Đổi mật khẩu"}
      </button>
    </div>
  );
}

