import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { getHomepageContent, updateHomepageContent, getUser, getDangKiem } from "../lib/api";
import { useAllowedKeys } from "../lib/permissions";

// Số ngày kiểm = Hôm nay - Ngày kiểm, trừ các ngày Chủ nhật rơi vào khoảng
// đó — copy y hệt hàm cùng tên bên pages/theo-doi-kiem-ke.js (chốt 08/09)
// để tính đúng "Số ngày kiểm" cho popup cảnh báo trễ hạn ở trang chủ.
function daysBetween(todayStr, dateStr) {
  if (!todayStr || !dateStr) return null;
  const a = new Date(`${todayStr}T00:00:00`);
  const b = new Date(`${dateStr}T00:00:00`);
  if (isNaN(a) || isNaN(b)) return null;
  const rawDays = Math.round((a - b) / 86400000);
  if (rawDays <= 0) return rawDays;
  let sundays = 0;
  const cursor = new Date(b);
  for (let i = 0; i < rawDays; i++) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() === 0) sundays++;
  }
  return rawDays - sundays;
}

// Cùng ngưỡng "Sắp trễ hạn"/"Đã trễ hạn" đang dùng ở tab "Đang kiểm"
// (theo-doi-kiem-ke.js::llvStatusText) — chốt 08/09.
function urgencyOf(soNgayKiem) {
  if (soNgayKiem == null) return null;
  if (soNgayKiem > 5) return "da_tre_han";
  if (soNgayKiem === 4 || soNgayKiem === 5) return "sap_tre_han";
  return null;
}

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(10,20,40,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
};
const modalStyle = {
  // Chốt 08/09 lần 2 — tăng bề ngang +70% (560 -> 952) theo yêu cầu anh.
  // display:flex/column + maxHeight cố định (không phải overflow ở đây
  // nữa, chốt 08/09 lần 3) để tiêu đề + 2 nút LUÔN hiện, chỉ phần bảng
  // shop bên trong cuộn riêng khi danh sách dài.
  background: "#fff", borderRadius: 12, padding: "24px 26px", width: 952, maxWidth: "100%",
  maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
};

// Popup cảnh báo shop "Sắp trễ hạn"/"Đã trễ hạn" ở tab "Đang kiểm" — hiện
// ngay khi vào trang chủ nếu user đang phụ trách shop nào có Số ngày kiểm
// >= 4 (chốt 08/09, theo yêu cầu anh).
function TreHanModal({ shops, onTat, onDongY }) {
  return (
    <div style={overlayStyle} onClick={onTat}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ color: "var(--danger)", fontSize: 16.5, fontWeight: 800, marginBottom: 14, flexShrink: 0 }}>
          ⚠️ Cảnh báo shop sắp/đã trễ hạn kiểm kê
        </h3>
        {/* Chỉ khối bảng này cuộn riêng (chốt 08/09 lần 3) — minHeight:0 bắt
            buộc để flexbox cho phép con cuộn thay vì tự giãn theo nội dung. */}
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "auto", minHeight: 0, flex: "0 1 auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: "#FAFAFA" }}>
                <th style={thStyle}>Mã shop</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Tên shop</th>
                <th style={thStyle}>Vùng</th>
                <th style={thStyle}>Ngày kiểm</th>
                <th style={thStyle}>Số ngày kiểm</th>
                <th style={thStyle}>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((r) => (
                <tr key={r.id} style={{ color: "var(--danger)", fontWeight: r._urgency === "da_tre_han" ? 700 : undefined }}>
                  <td style={tdStyle}>{r.ma_shop}</td>
                  <td style={{ ...tdStyle, textAlign: "left" }}>{r.ten_shop || "-"}</td>
                  <td style={tdStyle}>{r.vung || "-"}</td>
                  <td style={tdStyle}>{r.ngay_kiem || "-"}</td>
                  <td style={tdStyle}>{r._soNgayKiem}</td>
                  <td style={tdStyle}>{r._urgency === "da_tre_han" ? "Đã trễ hạn" : "Sắp trễ hạn"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18, flexShrink: 0 }}>
          <button onClick={onDongY} style={saveBtnStyle}>Đồng ý — vào Đang kiểm</button>
          <button onClick={onTat} style={cancelBtnStyle}>Tắt</button>
        </div>
      </div>
    </div>
  );
}

const thStyle = { padding: "8px 10px", textAlign: "center", fontWeight: 700, color: "var(--text-600)", borderBottom: "1px solid var(--border)" };
const tdStyle = { padding: "7px 10px", textAlign: "center", borderBottom: "1px solid var(--border)" };

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
  const router = useRouter();
  const [content, setContent] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const isAdmin = ["admin", "super_admin"].includes(getUser()?.role);
  const { can } = useAllowedKeys();
  const [treHanShops, setTreHanShops] = useState(null); // null = chưa xong/không hiện; [] hoặc mảng = đã kiểm tra xong

  useEffect(() => {
    getHomepageContent().then(setContent).catch(() => {});
  }, []);

  // Popup cảnh báo shop sắp/đã trễ hạn (chốt 08/09) — chỉ kiểm tra + hiện
  // 1 LẦN mỗi phiên đăng nhập (đánh dấu qua sessionStorage theo user id),
  // tránh làm phiền user mỗi lần quay lại trang chủ trong cùng phiên.
  useEffect(() => {
    const user = getUser();
    if (!user) return;
    const flagKey = `ksnb_tre_han_checked_${user.id}`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(flagKey)) return;
    getDangKiem()
      .then((data) => {
        if (typeof window !== "undefined") window.sessionStorage.setItem(flagKey, "1");
        const shops = (data?.rows || [])
          .map((r) => {
            const soNgayKiem = daysBetween(data.date, r.ngay_kiem);
            return { ...r, _soNgayKiem: soNgayKiem, _urgency: urgencyOf(soNgayKiem) };
          })
          .filter((r) => r._urgency)
          .sort((a, b) => b._soNgayKiem - a._soNgayKiem);
        if (shops.length > 0) setTreHanShops(shops);
      })
      .catch(() => {});
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

      {treHanShops && treHanShops.length > 0 && (
        <TreHanModal
          shops={treHanShops}
          onTat={() => setTreHanShops([])}
          onDongY={() => {
            setTreHanShops([]);
            router.push("/theo-doi-kiem-ke?tab=dang_kiem");
          }}
        />
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
