import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { getHomepageContent, updateHomepageContent, getUser } from "../lib/api";
import { useAllowedKeys } from "../lib/permissions";

// Chốt 28/08 — thay toàn bộ "Truy cập nhanh" theo đúng 5 menu anh chọn
// (icon lấy đúng như Sidebar.js để đồng bộ toàn web).
const QUICK_LINKS = [
  { href: "/ho-tro-kiem-ke", icon: "🧰", label: "Hỗ trợ kiểm kê" },
  { href: "/gui-mail-bcks", icon: "📧", label: "Gửi mail BCKS" },
  { href: "/theo-doi-kiem-ke", icon: "▦", label: "Theo dõi kiểm kê" },
  { href: "/theo-doi-chu-de", icon: "☰", label: "Theo dõi chủ đề" },
  { href: "/lich-nghi", icon: "🏖️", label: "Lịch làm việc & nghỉ phép" },
];

export default function HomePage() {
  const [content, setContent] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const isAdmin = ["admin", "super_admin"].includes(getUser()?.role);
  const { can } = useAllowedKeys();

  useEffect(() => {
    getHomepageContent().then(setContent).catch(() => {});
  }, []);

  function startEdit() {
    setDraft({ ...content });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function setField(field, value) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const updated = await updateHomepageContent(draft);
      setContent(updated);
      setEditing(false);
    } catch (err) {
      alert(err.message || "Lưu nội dung thất bại");
    } finally {
      setSaving(false);
    }
  }

  const data = editing ? draft : content;

  return (
    <Layout crumb="Trang chủ">
      <div className="intro-hero" style={{ position: "relative" }}>
        {isAdmin && !editing && content && can("/::sua-noi-dung") && (
          <button onClick={startEdit} style={editBtnStyle}>✏️ Sửa nội dung</button>
        )}
        {editing ? (
          <>
            <input
              value={draft.hero_title}
              onChange={(e) => setField("hero_title", e.target.value)}
              style={heroTitleInputStyle}
            />
            <textarea
              value={draft.hero_text}
              onChange={(e) => setField("hero_text", e.target.value)}
              rows={4}
              style={heroTextInputStyle}
            />
          </>
        ) : (
          <>
            <h2>{data?.hero_title || "Phòng Kiểm Soát Nội Bộ — Long Châu"}</h2>
            <p>{data?.hero_text || ""}</p>
          </>
        )}
      </div>

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
        {[1, 2, 3].map((i) => (
          <div className="org-card" key={i}>
            {editing ? (
              <>
                <input
                  value={draft[`stat${i}_num`]}
                  onChange={(e) => setField(`stat${i}_num`, e.target.value)}
                  style={statNumInputStyle}
                />
                <input
                  value={draft[`stat${i}_label`]}
                  onChange={(e) => setField(`stat${i}_label`, e.target.value)}
                  style={statLabelInputStyle}
                />
              </>
            ) : (
              <>
                <div className="num">{data?.[`stat${i}_num`]}</div>
                <div className="lbl">{data?.[`stat${i}_label`]}</div>
              </>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={saveEdit} disabled={saving} style={saveBtnStyle}>
            {saving ? "Đang lưu..." : "💾 Lưu toàn bộ"}
          </button>
          <button onClick={cancelEdit} disabled={saving} style={cancelBtnStyle}>✖ Hủy</button>
        </div>
      )}
    </Layout>
  );
}

const editBtnStyle = {
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

const statNumInputStyle = {
  width: "100%", padding: "6px 10px", borderRadius: 6, border: "1.5px solid var(--border)",
  fontSize: 18, fontWeight: 800, color: "var(--navy-800)", marginBottom: 6,
};

const statLabelInputStyle = {
  width: "100%", padding: "6px 10px", borderRadius: 6, border: "1.5px solid var(--border)",
  fontSize: 12.5, color: "var(--text-600)",
};

const saveBtnStyle = {
  padding: "9px 20px", borderRadius: 8, border: "none", background: "#4C9A2A",
  color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
};

const cancelBtnStyle = {
  padding: "9px 20px", borderRadius: 8, border: "1px solid var(--border)", background: "#fff",
  color: "var(--text-600)", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
};
