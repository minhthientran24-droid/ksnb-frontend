import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { getUser } from "../lib/api";

const NAV_ITEMS = [
  { href: "/", icon: "⌂", label: "Trang chủ" },
  { href: "/chat-nhom", icon: "💬", label: "Chat nhóm" },
  { href: "/bao-cao", icon: "▤", label: "Báo cáo tháng", hideForRoles: ["editor_base"] },
  { href: "/ho-tro-kiem-ke", icon: "🧰", label: "Hỗ Trợ Kiểm Kê" },
  { href: "/gui-mail-bcks", icon: "📧", label: "Gửi mail BCKS" },
  { href: "/theo-doi-kiem-ke", icon: "▦", label: "Theo dõi kiểm kê" },
  { href: "/theo-doi-chu-de", icon: "☰", label: "Theo dõi chủ đề" },
  { href: "/theo-doi-xknk", icon: "📦", label: "Theo dõi XK-NK" },
  { href: "/de-xuat-kiem-ke", icon: "📮", label: "Đề xuất kiểm kê", hideForRoles: ["editor_base", "viewer"] },
  { href: "/ghi-nhan-case", icon: "📝", label: "Ghi nhận case vi phạm" },
  { href: "/nhan-su", icon: "◈", label: "Giới thiệu nhân sự KSNB" },
  { href: "/hoat-dong", icon: "☺", label: "Hoạt động phòng ban" },
  { href: "/lich-nghi", icon: "🏖️", label: "Lịch làm việc & nghỉ phép" },
  // Trang tự giới hạn nội dung theo role (chỉ admin/super_admin thấy 3 tab
  // Chia lịch/Dời lịch/Phân loại shop, "editor" chỉ thấy tab "Thống kê" —
  // chốt 27/08) — để ở NAV_ITEMS (không phải ADMIN_ITEMS) để hiện được cho editor.
  { href: "/lich-lam-viec-v2", icon: "🗓️", label: "Phân công KSNB kiểm kê", hideForRoles: ["viewer", "editor_base"] },
];

const ADMIN_ITEMS = [
  { href: "/tai-len-du-lieu", icon: "⬆️", label: "Tải lên dữ liệu" },
  { href: "/quan-ly-tai-khoan", icon: "🔑", label: "Quản lý tài khoản" },
  { href: "/nhat-ky-hoat-dong", icon: "📊", label: "Nhật ký hoạt động" },
];
const ADMIN_ROLES = ["admin", "super_admin"];
const STORAGE_KEY = "ksnb_sidebar_collapsed";

export default function Sidebar() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [myRole, setMyRole] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  // Menu dạng ngăn kéo (drawer) riêng cho mobile — độc lập với "collapsed"
  // (tính năng thu gọn còn icon dành cho desktop, không dùng trên mobile).
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const me = getUser();
    setIsAdmin(!!me && ADMIN_ROLES.includes(me.role));
    setMyRole(me?.role || null);
    const saved = typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY);
    if (saved === "1") setCollapsed(true);
  }, []);

  // Tự đóng menu ngăn kéo mỗi khi chuyển trang, đỡ phải tự tay đóng.
  useEffect(() => {
    setMobileOpen(false);
  }, [router.pathname]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }

  const isActive = (href) =>
    href === "/" ? router.pathname === "/" : router.pathname.startsWith(href);

  function renderItem(item) {
    return (
      <Link key={item.href} href={item.href}>
        <div className={`sb-item ${isActive(item.href) ? "active" : ""}`}>
          <span className="ic">{item.icon}</span>
          <span className="sb-item-label">{item.label}</span>
          {collapsed && <span className="sb-tooltip">{item.label}</span>}
        </div>
      </Link>
    );
  }

  return (
    <>
      <button
        className="sb-mobile-toggle"
        aria-label="Mở menu"
        onClick={() => setMobileOpen((v) => !v)}
      >
        ☰
      </button>
      {mobileOpen && <div className="sb-mobile-backdrop" onClick={() => setMobileOpen(false)} />}

      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="sb-logo">
          {!collapsed && <div className="logo-text">Phòng Kiểm Soát Nội Bộ</div>}
        </div>

        <nav className="sb-nav">
          {NAV_ITEMS.filter((item) => !item.hideForRoles?.includes(myRole)).map(renderItem)}

          {isAdmin && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "10px 14px" }} />
              {ADMIN_ITEMS.map(renderItem)}
            </>
          )}
        </nav>

        <div className="sb-toggle" onClick={toggleCollapsed}>
          <span className="sb-toggle-icon">{collapsed ? "»" : "«"}</span>
          <span className="sb-toggle-label">Thu gọn menu</span>
        </div>
      </aside>
    </>
  );
}
