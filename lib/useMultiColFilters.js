import { useState } from "react";
import ColumnMultiFilter from "../components/ColumnMultiFilter";

// Lọc theo cột kiểu tick nhiều giá trị (chốt 27/10) — dùng chung cho các bảng. Mỗi cột khai báo 1 def:
//   { key, get(row) -> chữ đang hiển thị của ô (lọc đúng theo chữ thấy trên bảng), rank?(row) -> giá trị để sắp xếp danh sách
//     trong nút lọc (số hoặc chuỗi), desc? -> sắp từ lớn/mới đến nhỏ/cũ, menu? -> độ rộng danh sách }
// Danh sách tick của 1 cột được tính trên các dòng đã qua bộ lọc của CÁC CỘT KHÁC nên số dòng luôn khớp với bảng.
export function useMultiColFilters() {
  const [sel, setSel] = useState({}); // { cột: Set giá trị được tick } — cột không có = tất cả
  const active = Object.keys(sel).length > 0;
  const clear = () => setSel({});
  const setFilter = (key, set) => setSel((o) => { const n = { ...o }; if (set) n[key] = set; else delete n[key]; return n; });
  const pass = (defs, row, skipKey) => defs.every((c) => c.key === skipKey || !sel[c.key] || sel[c.key].has(c.get(row)));
  const filterRows = (defs, rows) => (active ? rows.filter((r) => pass(defs, r, null)) : rows);

  function optionsFor(defs, rows, key) {
    const c = defs.find((x) => x.key === key);
    const m = new Map();
    rows.filter((r) => pass(defs, r, key)).forEach((r) => {
      const v = c.get(r);
      const cur = m.get(v) || { value: v, count: 0, rank: c.rank ? c.rank(r) : v };
      cur.count += 1;
      m.set(v, cur);
    });
    // giá trị đang tick nhưng tạm không còn dòng nào vẫn phải hiện để bỏ tick được
    (sel[key] ? [...sel[key]] : []).forEach((v) => { if (!m.has(v)) m.set(v, { value: v, count: 0, rank: c.rank ? -2 : v }); });
    const arr = [...m.values()];
    arr.sort((a, b) => {
      const x = typeof a.rank === "number" && typeof b.rank === "number" ? a.rank - b.rank : String(a.rank).localeCompare(String(b.rank), "vi");
      return c.desc ? -x : x;
    });
    return arr;
  }

  // Nút lọc gọn đặt cùng dòng với tên cột (gọi như hàm, KHÔNG dùng như component con để không bị tạo lại mỗi lần vẽ)
  const button = (defs, rows, key) => {
    const c = defs.find((x) => x.key === key);
    if (!c) return null;
    return <ColumnMultiFilter compact options={optionsFor(defs, rows, key)} selected={sel[key] || null} onChange={(set) => setFilter(key, set)} menuWidth={c.menu || 300} />;
  };

  return { sel, active, clear, setFilter, filterRows, optionsFor, button };
}
