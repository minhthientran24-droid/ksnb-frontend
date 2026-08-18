import { useState } from "react";
import { useRouter } from "next/router";
import { login, getToken } from "../lib/api";
import FptLogo from "../components/FptLogo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Nếu đã đăng nhập rồi thì vào thẳng trang chủ
  if (typeof window !== "undefined" && getToken()) {
    router.replace("/");
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(email, password);
      router.push(data.must_change_password ? "/doi-mat-khau" : "/");
    } catch (err) {
      setError(err.message || "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <FptLogo height={34} />
          <div className="logo-text">
            FPT Retail
            <br />
            <small style={{ fontWeight: 500, opacity: 0.7 }}>Nhà Thuốc Long Châu</small>
          </div>
        </div>
        <div className="login-title">Cổng thông tin KSNB</div>
        <div className="login-sub">
          Đăng nhập để truy cập báo cáo &amp; dashboard kiểm soát nội bộ
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Tên đăng nhập (email)</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="thientm@fpt.com"
            />
          </div>
          <div className="field">
            <label>Mật khẩu</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
        <div className="login-foot">KSNBlongchau.com · Nội bộ Phòng KSNB</div>
      </div>
    </div>
  );
}
