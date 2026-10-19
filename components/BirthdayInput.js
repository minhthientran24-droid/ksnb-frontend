import { useState } from "react";

// Ô chọn ngày sinh dạng 3 dropdown Ngày / Tháng / Năm — thay cho <input
// type="date">, vì lịch mặc định của trình duyệt rất khó lùi về năm cũ (chỉ
// cuộn dễ về tương lai). Năm xếp từ năm nay lùi dần về quá khứ.
// value / onChange dùng chuỗi "YYYY-MM-DD" (hoặc "" khi chưa chọn) — chỉ
// gọi onChange khi đã chọn đủ cả 3 ô, hoặc khi bỏ chọn cả 3.
const MIN_YEAR = 1940;

function parse(value) {
  const [y = "", m = "", d = ""] = (value || "").split("-");
  return { d: d ? String(Number(d)) : "", m: m ? String(Number(m)) : "", y };
}

function daysInMonth(m, y) {
  if (!m) return 31;
  return new Date(Number(y) || 2000, Number(m), 0).getDate();
}

export default function BirthdayInput({ value, onChange, style }) {
  const [parts, setParts] = useState(() => parse(value));
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear; y >= MIN_YEAR; y--) years.push(y);
  const maxDay = daysInMonth(parts.m, parts.y);

  function update(field, v) {
    const next = { ...parts, [field]: v };
    // Đổi tháng/năm làm ngày vượt quá số ngày của tháng (VD 31 -> tháng 2)
    // thì kéo ngày về ngày cuối tháng.
    const max = daysInMonth(next.m, next.y);
    if (next.d && Number(next.d) > max) next.d = String(max);
    setParts(next);
    if (next.d && next.m && next.y) {
      const pad = (n) => String(n).padStart(2, "0");
      onChange(`${next.y}-${pad(next.m)}-${pad(next.d)}`);
    } else if (!next.d && !next.m && !next.y) {
      onChange("");
    }
  }

  const selStyle = {
    padding: "5px 6px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12.5,
    background: "#FAFBFD", ...style,
  };

  return (
    <div style={{ display: "flex", gap: 4 }}>
      <select style={selStyle} value={parts.d} onChange={(e) => update("d", e.target.value)} aria-label="Ngày">
        <option value="">Ngày</option>
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <select style={selStyle} value={parts.m} onChange={(e) => update("m", e.target.value)} aria-label="Tháng">
        <option value="">Tháng</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <select style={selStyle} value={parts.y} onChange={(e) => update("y", e.target.value)} aria-label="Năm">
        <option value="">Năm</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}
