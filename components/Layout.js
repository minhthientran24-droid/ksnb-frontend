import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Sidebar from "./Sidebar";
import { getToken, getUser, clearSession, getMyAllowedMenusCached } from "../lib/api";

// Rút gọn pathname về đúng menu_key gốc (VD "/bao-cao/2026-08" ->
// "/bao-cao") — khớp danh mục menu bên backend (menu_permissions.py).
function menuKeyFromPathname(pathname) {
  if (!pathname || pathname === "/") return "/";
  const first = pathname.split("/").filter(Boolean)[0];
  return "/" + first;
}

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

    // Chặn vào thẳng URL nếu role không có quyền menu này (chốt 31/08, xem
    // "Quản lý phân quyền") — super_admin luôn qua, "/" (Trang chủ) luôn
    // cho qua (tránh vòng lặp chuyển hướng nếu lỡ tự khoá cả Trang chủ).
    const menuKey = menuKeyFromPathname(router.pathname);
    if (u && u.role !== "super_admin" && menuKey !== "/" && router.pathname !== "/doi-mat-khau") {
      getMyAllowedMenusCached()
        .then((r) => {
          if (!(r.allowed_menus || []).includes(menuKey)) {
            router.replace("/");
            return;
          }
          setChecked(true);
        })
        // Lỗi mạng khi kiểm tra quyền — không khoá oan người dùng ra khỏi
        // trang, cứ cho vào (đúng tinh thần: đây là chặn ở frontend, không
        // phải lớp bảo mật API chính).
        .catch(() => setChecked(true));
      return;
    }
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
