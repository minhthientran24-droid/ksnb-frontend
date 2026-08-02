import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { listReports } from "../lib/api";

function fmtMoney(n) {
  if (n === undefined || n === null) return "-";
  return n.toLocaleString("vi-VN");
}

const QUICK_LINKS = [
  { href: "/bao-cao", icon: "📊", label: "Báo cáo tháng" },
  { href: "/theo-doi-kiem-ke", icon: "🔎", label: "Theo dõi kiểm kê" },
  { href: "/theo-doi-chu-de", icon: "🗂️", label: "Theo dõi chủ đề" },
  { href: "/nhan-su", icon: "👥", label: "Giới thiệu nhân sự KSNB" },
  { href: "/hoat-dong", icon: "🎉", label: "Hoạt động phòng ban" },
];

export default function HomePage() {
  const [latest, setLatest] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listReports()
      .then((reports) => { if (reports.length > 0) setLatest(reports[0]); })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Layout crumb="Trang chủ">
      <div className="intro-hero">
        <h2>Phòng Kiểm Soát Nội Bộ — Long Châu</h2>
        <p>
          KSNB đồng hành cùng vận hành để hạn chế sai phạm ngay từ đầu — thông
          qua kiểm soát dựa trên dữ liệu, phát hiện lỗ hổng quy trình và xử lý
          gốc rễ, thay vì chỉ kiểm tra và xử phạt.
        </p>
      </div>

      {latest && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="accent b"></div>
            <span className="tag">Báo cáo mới nhất</span>
            <div className="val" style={{ fontSize: 18 }}>{latest.display_name}</div>
          </div>
          <div className="kpi-card">
            <div className="accent g"></div>
            <span className="tag">Trạng thái</span>
            <div className="val" style={{ fontSize: 18 }}>
              {latest.published ? "Đã công bố" : "Nháp"}
            </div>
          </div>
        </div>
      )}
      {error && <div className="placeholder-box">Không tải được dữ liệu: {error}</div>}

      <div className="card">
        <div className="card-head"><h3>Truy cập nhanh</h3></div>
        <div className="card-body" style={{ padding: "18px 20px", display: "flex", gap: 14, flexWrap: "wrap" }}>
          {QUICK_LINKS.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className="org-card" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="org-grid">
        <div className="org-card"><div className="num">8</div><div className="lbl">Vùng miền phụ trách toàn quốc</div></div>
        <div className="org-card"><div className="num">4</div><div className="lbl">Mảng nghiệp vụ: Vận hành · Kiểm kê · GPP · Vaccine</div></div>
        <div className="org-card"><div className="num">01/08/2026</div><div className="lbl">Mốc vận hành mô hình KSNB toàn quốc</div></div>
      </div>
    </Layout>
  );
}
