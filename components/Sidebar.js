import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { getUser, getMyAllowedMenusCached } from "../lib/api";

const NAV_ITEMS = [
  { href: "/", icon: "🏠", label: "Trang chủ" },
  { href: "/chat-nhom", icon: "💬", label: "Chat nhóm" },
  { href: "/bao-cao", icon: "▤", label: "Báo cáo tháng", hideForRoles: ["editor_base"] },
  { href: "/ho-tro-kiem-ke", icon: "🧰", label: "Hỗ Trợ Kiểm Kê" },
  { href: "/gui-mail-bcks", icon: "📧", label: "Gửi mail BCKS" },
  { href: "/theo-doi-kiem-ke", icon: "▦", label: "Theo dõi kiểm kê" },
  { href: "/theo-doi-chu-de", icon: "☰", label: "Theo dõi chủ đề" },
  { href: "/theo-doi-xknk", icon: "📦", label: "Theo dõi XK-NK" },
  { href: "/de-xuat-kiem-ke", icon: "📮", label: "Đề xuất kiểm kê", hideForRoles: ["editor_base", "viewer"] },
  { href: "/ghi-nhan-case", icon: "📝", label: "Ghi nhận case vi phạm" },
  { href: "/nhan-su", icon: "🧑‍💼", label: "Giới thiệu nhân sự KSNB" },
  { href: "/hoat-dong", icon: "🎉", label: "Hoạt động phòng ban" },
  { href: "/lich-nghi", icon: "🏖️", label: "Lịch làm việc & nghỉ phép" },
  // Trang tự giới hạn nội dung theo role (chỉ admin/super_admin thấy 3 tab
  // Chia lịch/Dời lịch/Phân loại shop, "editor" chỉ thấy tab "Thống kê" —
  // chốt 27/08) — để ở NAV_ITEMS (không phải ADMIN_ITEMS) để hiện được cho editor.
  { href: "/lich-lam-viec", icon: "🗓️", label: "Phân công KSNB kiểm kê", hideForRoles: ["viewer", "editor_base"] },
];

const ADMIN_ITEMS = [
  { href: "/tai-len-du-lieu", icon: "⬆️", label: "Tải lên dữ liệu", hideForRoles: ["editor", "editor_base", "viewer"] },
  { href: "/quan-ly-tai-khoan", icon: "🔑", label: "Quản lý tài khoản", hideForRoles: ["editor", "editor_base", "viewer"] },
  { href: "/nhat-ky-hoat-dong", icon: "📊", label: "Nhật ký hoạt động", hideForRoles: ["editor", "editor_base", "viewer"] },
  // Menu thử nghiệm (chốt 03/09) — chỉ admin/super_admin, dùng để thiết kế
  // tính năng mới cho "Theo dõi chủ đề" trước khi đưa vào bản thật.
  { href: "/theo-doi-chu-de-v2", icon: "🧪", label: "Theo dõi chủ đề Ver2", hideForRoles: ["editor", "editor_base", "viewer"] },
];
const STORAGE_KEY = "ksnb_sidebar_collapsed";

export default function Sidebar() {
  const router = useRouter();
  const [myRole, setMyRole] = useState(null);
  // Danh sách menu_key được phép — cấu hình động qua "Quản lý phân quyền"
  // (chốt 31/08). null = chưa tải xong, tạm dùng hideForRoles hardcode ở
  // trên làm phương án hiển thị ngay (đỡ chớp menu rỗng lúc đầu) — super_admin
  // luôn full quyền, khỏi cần gọi API.
  const [allowedMenus, setAllowedMenus] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  // Menu dạng ngăn kéo (drawer) riêng cho mobile — độc lập với "collapsed"
  // (tính năng thu gọn còn icon dành cho desktop, không dùng trên mobile).
  const [mobileOpen, setMobileOpen] = useState(false);
  // Tooltip tên menu khi thu gọn (chốt 30/08) — dùng position:fixed + toạ
  // độ tính tay lúc hover thay vì absolute lồng trong .sb-item, vì .sb-item
  // (overflow:hidden) và .sb-nav (overflow-y:auto, kéo theo overflow-x bị
  // ép thành "auto" luôn theo spec CSS) đều CẮT MẤT tooltip cũ — tooltip
  // trước giờ chưa từng hiện ra được dù code đã có sẵn.
  const [hoveredTip, setHoveredTip] = useState(null); // {label, top, left}

  useEffect(() => {
    const me = getUser();
    setMyRole(me?.role || null);
    const saved = typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY);
    if (saved === "1") setCollapsed(true);
    if (me && me.role !== "super_admin") {
      getMyAllowedMenusCached().then((r) => setAllowedMenus(r.allowed_menus || [])).catch(() => {});
    }
  }, []);

  // Tự đóng menu ngăn kéo mỗi khi chuyển trang, đỡ phải tự tay đóng.
  useEffect(() => {
    setMobileOpen(false);
  }, [router.pathname]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    setHoveredTip(null);
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }

  const isActive = (href) =>
    href === "/" ? router.pathname === "/" : router.pathname.startsWith(href);

  // super_admin: luôn thấy hết. Đã tải xong danh sách động: theo đúng danh
  // sách đó. Chưa tải xong: tạm theo hideForRoles hardcode (không chớp menu).
  function isVisible(item) {
    if (myRole === "super_admin") return true;
    if (allowedMenus) return allowedMenus.includes(item.href);
    return !item.hideForRoles?.includes(myRole);
  }

  function handleItemMouseEnter(e, item) {
    if (!collapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredTip({ label: item.label, top: rect.top + rect.height / 2, left: rect.right + 10 });
  }
  function handleItemMouseLeave() {
    setHoveredTip(null);
  }

  function renderItem(item) {
    return (
      <Link key={item.href} href={item.href}>
        <div
          className={`sb-item ${isActive(item.href) ? "active" : ""}`}
          onMouseEnter={(e) => handleItemMouseEnter(e, item)}
          onMouseLeave={handleItemMouseLeave}
        >
          <span className="ic">{item.icon}</span>
          <span className="sb-item-label">{item.label}</span>
        </div>
      </Link>
    );
  }

  const visibleNavItems = NAV_ITEMS.filter(isVisible);
  const visibleAdminItems = ADMIN_ITEMS.filter(isVisible);

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
          {visibleNavItems.map(renderItem)}

          {visibleAdminItems.length > 0 && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "10px 14px" }} />
              {visibleAdminItems.map(renderItem)}
            </>
          )}
        </nav>

        <div className="sb-toggle" onClick={toggleCollapsed}>
          <span className="sb-toggle-icon">{collapsed ? "»" : "«"}</span>
          <span className="sb-toggle-label">Thu gọn menu</span>
        </div>
      </aside>

      {collapsed && hoveredTip && (
        <div className="sb-tooltip-fixed" style={{ top: hoveredTip.top, left: hoveredTip.left }}>
          {hoveredTip.label}
        </div>
      )}
    </>
  );
}
