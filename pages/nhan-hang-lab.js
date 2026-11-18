import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import NhanHangLabUser from "../components/NhanHangLabUser";
import NhanHangLabAdmin from "../components/NhanHangLabAdmin";
import { getUser } from "../lib/api";

// Menu "Nhận hàng Long Châu LAB" (chốt 18/11): user loại "lab" thấy màn hình điện thoại (việc hôm nay + nhận hàng);
// admin/super_admin (có quyền menu) thấy màn hình giao việc + xem kết quả.
export default function NhanHangLabPage() {
  const [role, setRole] = useState(null);
  useEffect(() => { setRole(getUser()?.role || ""); }, []);
  if (role === null) return null;
  const isLab = role === "lab";
  return (
    <Layout crumb={isLab ? "Nhận hàng LAB" : "Nhận hàng Long Châu LAB"}>
      {!isLab && (
        <div className="page-head">
          <h1>📦 Nhận hàng Long Châu LAB</h1>
        </div>
      )}
      {isLab ? <NhanHangLabUser /> : <NhanHangLabAdmin />}
    </Layout>
  );
}
