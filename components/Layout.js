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

// Chốt 23/09 lần 2 — đổi hiển thị từ "Ver <mã commit> · Cập nhật <ngày
// giờ>" sang thuần số "Ver:<tháng>.<ngày>.<giờ><phút>" (VD commit lúc
// 08:05 ngày 23/09 -> "Ver:9.23.0805") theo đúng yêu cầu anh Thiện —
// nhìn chuyên nghiệp hơn, và bản thân số đã nói lên ngày giờ nên không
// cần thêm phần "Cập nhật ..." riêng nữa. Tháng KHÔNG đệm số 0 (9, không
// phải 09), ngày/giờ/phút đệm đủ 2 chữ số. Vẫn giữ mã commit + giờ ISO
// đầy đủ ở tooltip (hover) để tra chính xác khi cần, không hiện ra ngoài.
function AppVersionTag() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  const commitTime = process.env.NEXT_PUBLIC_APP_COMMIT_TIME;
  if (!commitTime) return null;
  const d = new Date(commitTime);
  if (isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  const verText = `${d.getMonth() + 1}.${pad(d.getDate())}.${pad(d.getHours())}${pad(d.getMinutes())}`;
  return (
    <span
      title={`Mã commit: ${version || "?"} — ${commitTime}`}
      style={{ fontSize: 11, color: "var(--text-400, #8B93A5)", whiteSpace: "nowrap", margin: "0 8px" }}
    >
      Ver:{verText}
    </span>
  );
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
            <AppVersionTag />
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
