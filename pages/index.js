import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { listReports, getHomepageContent, updateHomepageContent, getUser } from "../lib/api";

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
  const [content, setContent] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const [saving, setSaving] = useState(false);
  const isAdmin = ["admin", "super_admin"].includes(getUser()?.role);

  useEffect(() => {
    listReports()
      .then((reports) => { if (reports.length > 0) setLatest(reports[0]); })
      .catch((err) => setError(err.message));
    getHomepageContent().then(setContent).catch(() => {});
  }, []);

  function startEdit() {
    setDraftTitle(content.hero_title);
    setDraftText(content.hero_text);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const updated = await updateHomepageContent(draftTitle, draftText);
      setContent(updated);
      setEditing(false);
    } catch (err) {
      alert(err.message || "Lưu nội dung thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout crumb="Trang chủ">
      <div className="intro-hero" style={{ position: "relative" }}>
        {isAdmin && !editing && content && (
          <button onClick={startEdit} style={heroEditBtnStyle}>✏️ Sửa nội dung</button>
        )}
        {editing ? (
          <div>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              style={heroTitleInputStyle}
            />
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={4}
              style={heroTextInputStyle}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={saveEdit} disabled={saving} style={heroSaveBtnStyle}>
                {saving ? "Đang lưu..." : "💾 Lưu"}
              </button>
              <button onClick={cancelEdit} disabled={saving} style={heroCancelBtnStyle}>✖ Hủy</button>
            </div>
          </div>
        ) : (
          <>
            <h2>{content?.hero_title || "Phòng Kiểm Soát Nội Bộ — Long Châu"}</h2>
            <p>{content?.hero_text || ""}</p>
          </>
        )}
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

const heroEditBtnStyle = {
  position: "absolute", top: 16, right: 16,
  padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.35)",
  background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};

const heroTitleInputStyle = {
  width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid rgba(255,255,255,0.4)",
  background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 20, fontWeight: 800, marginBottom: 10,
};

const heroTextInputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid rgba(255,255,255,0.4)",
  background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 13.5, lineHeight: 1.6, resize: "vertical",
};

const heroSaveBtnStyle = {
  padding: "8px 18px", borderRadius: 8, border: "none", background: "#4C9A2A",
  color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
};

const heroCancelBtnStyle = {
  padding: "8px 18px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.4)", background: "transparent",
  color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
};
