import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import NhanHangLabUser from "../components/NhanHangLabUser";
import NhanHangLabAdmin from "../components/NhanHangLabAdmin";
import { getUser } from "../lib/api";

// Menu "Nhận hàng Long Châu LAB" (chốt 18/11): user loại "lab" thấy màn hình điện thoại (việc hôm nay + nhận hàng);
// admin/super_admin (có quyền menu) thấy màn hình giao việc + xem kết quả.
export default function NhanHangLabPage() {
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState("quan-ly");
  useEffect(() => {
    setRole(getUser()?.role || "");
    try { if (localStorage.getItem("nhanhang_tab") === "cua-toi") setTab("cua-toi"); } catch {}
  }, []);
  function switchTab(k) { setTab(k); try { localStorage.setItem("nhanhang_tab", k); } catch {} }
  if (role === null) return null;
  const isLab = role === "lab";
  const isSuper = role === "super_admin";
  return (
    <Layout crumb={isLab ? "Nhận hàng LAB" : "Nhận hàng Long Châu LAB"}>
      {!isLab && (
        <div className="page-head">
          <h1>📦 Nhận hàng Long Châu LAB</h1>
        </div>
      )}
      {isSuper && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[["quan-ly", "🗂️ Quản lý"], ["cua-toi", "📱 Việc của tôi (nhận hàng)"]].map(([k, l]) => (
            <button key={k} className={tab === k ? "login-btn" : "fbtn"} style={tab === k ? { width: "auto", padding: "8px 18px" } : undefined} onClick={() => switchTab(k)}>{l}</button>
          ))}
        </div>
      )}
      {isLab || (isSuper && tab === "cua-toi") ? <NhanHangLabUser /> : <NhanHangLabAdmin />}
    </Layout>
  );
}
