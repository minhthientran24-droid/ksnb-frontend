import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { getUser } from "../lib/api";

const NAV_ITEMS_TOP = [
  { href: "/", icon: "⌂", label: "Trang chủ" },
  { href: "/bao-cao", icon: "▤", label: "Báo cáo tháng", hideForRoles: ["editor_base"] },
  { href: "/nhan-su", icon: "◈", label: "Giới thiệu nhân sự KSNB" },
  { href: "/theo-doi-kiem-ke", icon: "▦", label: "Theo dõi kiểm kê" },
];

const NAV_ITEMS_BOTTOM = [
  { href: "/ghi-nhan-case", icon: "📝", label: "Ghi nhận case vi phạm" },
  { href: "/theo-doi-chu-de", icon: "☰", label: "Theo dõi chủ đề" },
  { href: "/ho-tro-kiem-ke", icon: "🧰", label: "Hỗ Trợ Kiểm Kê" },
  { href: "/gui-mail-bcks", icon: "📧", label: "Gửi mail BCKS" },
  { href: "/hoat-dong", icon: "☺", label: "Hoạt động phòng ban" },
];

const ADMIN_ITEMS = [
  { href: "/tai-len-du-lieu", icon: "⬆️", label: "Tải lên dữ liệu" },
  { href: "/quan-ly-tai-khoan", icon: "🔑", label: "Quản lý tài khoản" },
  { href: "/nhat-ky-hoat-dong", icon: "📊", label: "Nhật ký hoạt động" },
  { href: "/lich-lam-viec-v2", icon: "🗓️", label: "Phân công KSNB kiểm kê" },
];
const ADMIN_ROLES = ["admin", "super_admin"];
const STORAGE_KEY = "ksnb_sidebar_collapsed";

export default function Sidebar() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [myRole, setMyRole] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const me = getUser();
    setIsAdmin(!!me && ADMIN_ROLES.includes(me.role));
    setMyRole(me?.role || null);
    const saved = typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY);
    if (saved === "1") setCollapsed(true);
  }, []);

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
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sb-logo">
        <img src="/logo-fpt-ksnb.jpg" alt="FPT | KSNB" style={{ height: 26, width: "auto", display: "block", borderRadius: 4, flexShrink: 0 }} />
        {!collapsed && <div className="logo-text">Phòng Kiểm Soát Nội Bộ</div>}
      </div>

      <nav className="sb-nav">
        {NAV_ITEMS_TOP.filter((item) => !item.hideForRoles?.includes(myRole)).map(renderItem)}
        {NAV_ITEMS_BOTTOM.filter((item) => !item.hideForRoles?.includes(myRole)).map(renderItem)}

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
  );
}
