import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { getUser } from "../lib/api";

// "Theo dõi chủ đề Ver2" (chốt 03/09) — menu THỬ NGHIỆM, chỉ admin/super_admin
// xem được, dùng để thiết kế/thử tính năng mới trước khi đưa vào bản thật
// "Theo dõi chủ đề" (đang chạy thật cho mọi NV KSNB). Hiện tại CHƯA có gì —
// khung trang + quyền admin-only, chờ mô tả tính năng cụ thể để xây tiếp.
// Bảo vệ 2 lớp giống các trang admin-only khác (vd nhat-ky-hoat-dong.js):
// Layout.js đã chặn theo allowed_menus ở cấp trung tâm, đây là lớp phòng
// hờ ngay tại trang phòng khi truy cập trước khi allowed_menus tải xong.
const ADMIN_ROLES = ["admin", "super_admin"];

export default function TheoDoiChuDeV2Page() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      router.replace("/");
      return;
    }
    setChecked(true);
  }, []);

  if (!checked) return null;

  return (
    <Layout crumb="Theo dõi chủ đề Ver2">
      <div className="page-head">
        <h1>🧪 Theo dõi chủ đề Ver2</h1>
        <p>
          Menu thử nghiệm — chỉ admin/super_admin xem được. Dùng để thiết kế/thử tính năng mới
          trước khi đưa vào bản thật "Theo dõi chủ đề" đang chạy cho mọi NV KSNB.
        </p>
      </div>

      <div className="placeholder-box">
        Chưa có tính năng nào — mô tả cụ thể tính năng anh muốn để xây tiếp.
      </div>
    </Layout>
  );
}
