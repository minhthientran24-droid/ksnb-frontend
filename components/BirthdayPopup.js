import { useEffect, useState } from "react";
import { listUpcomingBirthdays } from "../lib/api";

// Popup chúc mừng sinh nhật góc dưới bên phải (rộng ~14% màn hình) — hiện từ
// D-2 tới hết ngày D (D = ngày sinh nhật, theo trường "Ngày sinh" ở Quản lý
// tài khoản), báo cho mọi người TRỪ chính người có sinh nhật. Bấm đóng thì ẩn tới hết ngày hôm đó, sáng hôm sau hiện lại.
const DISMISS_KEY = "birthday_popup_dismissed";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function whenText(daysLeft) {
  if (daysLeft === 0) return "Hôm nay";
  if (daysLeft === 1) return "Ngày mai";
  return `Còn ${daysLeft} ngày`;
}

function formatDdMm(iso) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export default function BirthdayPopup() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === todayKey()) return;
    } catch {}
    listUpcomingBirthdays()
      .then((list) => {
        if (list?.length) {
          setItems(list);
          setOpen(true);
        }
      })
      .catch(() => {});
  }, []);

  function handleClose() {
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, todayKey());
    } catch {}
  }

  if (!open) return null;

  return (
    <div style={wrapStyle} role="dialog" aria-label="Sinh nhật sắp tới">
      <div style={headStyle}>
        <span>🎂 Sinh nhật sắp tới</span>
        <button onClick={handleClose} style={closeStyle} aria-label="Đóng">×</button>
      </div>
      <div style={{ padding: "10px 14px 14px" }}>
        {items.map((b) => (
          <div key={b.id} style={rowStyle}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{b.full_name}</div>
              <div style={{ fontSize: 12, color: "var(--text-600)" }}>
                {b.position ? `${b.position} · ` : ""}{formatDdMm(b.ngay_sinh_nhat)}
              </div>
            </div>
            <span style={{ ...pillStyle, ...(b.days_left === 0 ? pillTodayStyle : {}) }}>
              {b.days_left === 0 ? "🎉 " : ""}{whenText(b.days_left)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const wrapStyle = {
  position: "fixed", right: 16, bottom: 16, zIndex: 1000,
  width: "14vw", minWidth: 200, maxWidth: "calc(100vw - 32px)",
  maxHeight: "50vh", overflowY: "auto",
  background: "#fff", borderRadius: 12, border: "1px solid var(--border)",
  boxShadow: "0 10px 30px rgba(15, 40, 80, 0.18)",
};
const headStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "10px 14px", background: "linear-gradient(90deg, #FDE7EF, #FFF4E0)",
  borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 14,
  borderRadius: "12px 12px 0 0",
};
const closeStyle = {
  background: "none", border: "none", fontSize: 20, lineHeight: 1,
  cursor: "pointer", color: "var(--text-600)", padding: "0 4px",
};
const rowStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
  padding: "8px 0", borderBottom: "1px dashed var(--border)",
};
const pillStyle = {
  flexShrink: 0, fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
  background: "#EAF1FC", color: "#1F4E79", whiteSpace: "nowrap",
};
const pillTodayStyle = { background: "#FDE7EF", color: "#B0245A" };
