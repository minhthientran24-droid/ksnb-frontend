import { useState } from "react";
import { useRouter } from "next/router";
import { changePassword, getToken, getUser, saveSession, clearSession } from "../lib/api";

export default function DoiMatKhauPage() {
  const router = useRouter();
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (typeof window !== "undefined" && !getToken()) {
    router.replace("/login");
    return null;
  }

  const user = getUser();
  const forced = user?.must_change_password;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (pass1.length < 6) {
      setError("Mật khẩu mới cần tối thiểu 6 ký tự");
      return;
    }
    if (pass1 !== pass2) {
      setError("Mật khẩu nhập lại không khớp");
      return;
    }
    setLoading(true);
    try {
      await changePassword(pass1);
      // Cập nhật lại cờ must_change_password trong phiên hiện tại
      saveSession(getToken(), { ...user, must_change_password: false });
      router.push("/");
    } catch (err) {
      setError(err.message || "Đổi mật khẩu thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-title">
          {forced ? "Đổi mật khẩu bắt buộc" : "Đổi mật khẩu"}
        </div>
        <div className="login-sub">
          {forced
            ? "Đây là lần đăng nhập đầu tiên — anh/chị cần đặt mật khẩu mới trước khi tiếp tục sử dụng."
            : "Đặt mật khẩu mới cho tài khoản của anh/chị."}
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Mật khẩu mới</label>
            <input type="password" required value={pass1} onChange={(e) => setPass1(e.target.value)} placeholder="Tối thiểu 6 ký tự" />
          </div>
          <div className="field">
            <label>Nhập lại mật khẩu mới</label>
            <input type="password" required value={pass2} onChange={(e) => setPass2(e.target.value)} />
          </div>
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? "Đang lưu..." : "Đổi mật khẩu"}
          </button>
        </form>

        {!forced && (
          <div className="login-foot" style={{ cursor: "pointer" }} onClick={() => router.push("/")}>
            ← Quay lại
          </div>
        )}
      </div>
    </div>
  );
}
