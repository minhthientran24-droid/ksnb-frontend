import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Sidebar from "./Sidebar";
import { getToken, getUser, clearSession } from "../lib/api";

export default function Layout({ crumb, children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    const u = getUser();
    // Bắt đổi mật khẩu trước khi vào bất kỳ trang nào khác
    if (u?.must_change_password && router.pathname !== "/doi-mat-khau") {
      router.replace("/doi-mat-khau");
      return;
    }
    setUser(u);
    setChecked(true);
  }, [router]);

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  // Tránh chớp nội dung trước khi biết đã đăng nhập hay chưa
  if (!checked) return null;

  const initials = (user?.full_name || "?")
    .split(" ")
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <div className="topbar">
          <div>
            KSNB Long Châu &nbsp;/&nbsp;{" "}
            <span className="crumb-current">{crumb}</span>
          </div>
          <div className="tb-user">
            <div className="avatar">{initials}</div>
            <span className="tb-user-name">{user?.full_name}</span>
            <button className="logout-btn" onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
