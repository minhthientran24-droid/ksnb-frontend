import { useState } from "react";
import Layout from "../components/Layout";
import { getUser } from "../lib/api";

const ADMIN_ROLES = ["admin", "super_admin"];

const TABS = [
  { key: "can_ton", label: "Theo dõi cân tồn" },
  { key: "xuat_su_dung", label: "Theo dõi Xuất sử dụng" },
];

export default function TheoDoiXknkPage() {
  const me = getUser();
  const isAdmin = me && ADMIN_ROLES.includes(me.role);
  const [tab, setTab] = useState("can_ton");

  function handleUploadClick() {
    alert("Tính năng đang chờ file Excel mẫu để hoàn thiện — anh Thiện gửi file mẫu để em nối dữ liệu tiếp nhé.");
  }

  return (
    <Layout crumb="Theo dõi XK-NK">
      <div className="page-head">
        <h1>Theo dõi XK-NK</h1>
        <p>Theo dõi cân tồn và tình hình xuất sử dụng (Xuất Khác - Nhập Khác) — dữ liệu cập nhật qua file Excel do admin upload.</p>
      </div>

      <div className="month-tabs">
        {TABS.map((t) => (
          <div key={t.key} className={`month-tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>{TABS.find((t) => t.key === tab)?.label}</h3>
          {isAdmin && (
            <button className="upload-btn" onClick={handleUploadClick}>
              📤 Upload file Excel
            </button>
          )}
        </div>
        <div className="card-body">
          <div className="placeholder-box">
            Chưa có dữ liệu — đang chờ file Excel mẫu để hoàn thiện tính năng này.
          </div>
        </div>
      </div>
    </Layout>
  );
}
