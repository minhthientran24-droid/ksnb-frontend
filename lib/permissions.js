// Hook dùng chung cho từng trang tự ẩn tab/khu vực con (cấp 2) không có
// quyền — bổ sung cho phần chặn cấp 1 (menu) đã có ở Sidebar.js/Layout.js.
// Layout.js đã gọi getMyAllowedMenusCached() TRƯỚC khi cho vào được nội
// dung trang (children), nên tới lúc trang tự gọi lại ở đây gần như luôn
// lấy ngay từ cache có sẵn, không tốn thêm round-trip mạng đáng kể.
import { useEffect, useState } from "react";
import { getUser, getMyAllowedMenusCached } from "./api";

export function useAllowedKeys() {
  const [allowed, setAllowed] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const me = getUser();
    if (me?.role === "super_admin") {
      setIsSuperAdmin(true);
      return;
    }
    getMyAllowedMenusCached()
      .then((r) => setAllowed(new Set(r.allowed_menus || [])))
      .catch(() => setAllowed(new Set()));
  }, []);

  // super_admin: luôn true. Chưa tải xong danh sách: tạm cho true (Layout.js
  // đã chặn cấp 1 rồi, cấp 2 chỉ là tinh chỉnh thêm — tránh chớp ẩn hết tab
  // trong lúc chờ). Tải xong rồi: theo đúng danh sách.
  function can(key) {
    if (isSuperAdmin) return true;
    if (!allowed) return true;
    return allowed.has(key);
  }

  return { can, ready: isSuperAdmin || !!allowed };
}
