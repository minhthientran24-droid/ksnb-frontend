import { useEffect, useMemo, useRef, useState } from "react";

// Nút lọc tick nhiều giá trị ở đầu cột bảng — cùng kiểu với ô "Tất cả loại yêu cầu" của menu Xuất Khác - Nhập Khác EHO:
// bấm mở danh sách có ô tick từng giá trị (kèm số dòng), ô "Tất cả" ở đầu bật/tắt hết, mặc định chọn tất cả.
//   options  : [{ value, count }]  — các giá trị đang có ở cột (đã sắp xếp)
//   selected : null (= tất cả) hoặc Set các giá trị được tick
//   onChange : (Set | null) => void   — chọn đủ hết thì trả null
// Danh sách mở bằng position: fixed để không bị khung cuộn ngang của bảng cắt mất.
export default function ColumnMultiFilter({ options, selected, onChange, width = 150, menuWidth = 300, allLabel = "Tất cả" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const box = useRef(null);
  const btn = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onScroll = (e) => { if (!(box.current && box.current.contains(e.target))) setOpen(false); };
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", onScroll, true);
    const onResize = () => setOpen(false);
    window.addEventListener("resize", onResize);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onResize); };
  }, [open]);

  const values = options.map((o) => o.value);
  const picked = selected ? values.filter((v) => selected.has(v)) : values;
  const allOn = !selected;
  const text = allOn ? allLabel : picked.length === 0 ? "Chưa chọn" : picked.length === 1 ? String(picked[0]) : `Đã chọn ${picked.length}/${values.length}`;

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? options.filter((o) => String(o.value).toLowerCase().includes(k)) : options;
  }, [options, q]);

  function apply(next) { // next: Set | null
    const all = next === null || values.every((v) => next.has(v));
    onChange(all ? null : next);
  }
  function toggle(v) {
    const n = new Set(picked);
    if (n.has(v)) n.delete(v); else n.add(v);
    apply(n);
  }
  function openMenu() {
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - menuWidth - 8));
      setPos({ left, top: r.bottom + 4 });
      setQ("");
    }
    setOpen((o) => !o);
  }
  // "Chọn tất cả" trong ô tìm: khi đang lọc chữ thì tick/bỏ tick đúng các dòng đang hiện
  function toggleShown() {
    const shownVals = shown.map((o) => o.value);
    const allShownOn = shownVals.every((v) => picked.includes(v));
    const n = new Set(picked);
    shownVals.forEach((v) => (allShownOn ? n.delete(v) : n.add(v)));
    apply(n);
  }
  const shownAllOn = shown.length > 0 && shown.every((o) => picked.includes(o.value));
  const shownSome = shown.some((o) => picked.includes(o.value));

  return (
    <div ref={box} style={{ display: "inline-block", fontWeight: 400, textAlign: "left", textTransform: "none", letterSpacing: "normal", fontSize: 12.5, whiteSpace: "normal" }}>
      <button ref={btn} type="button" className="finput" onClick={openMenu} title={text}
        style={{ width, textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "5px 8px", fontSize: 12,
          background: allOn ? "var(--card, #fff)" : "#EEF4FF", borderColor: allOn ? undefined : "var(--blue-accent, #2F6FED)" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
        <span style={{ fontSize: 9, marginLeft: 6, color: "var(--text-400)" }}>▼</span>
      </button>
      {open && (
        <div style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 2000, width: menuWidth, background: "var(--card, #fff)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.18)", padding: "4px 0" }}>
          {options.length > 8 && (
            <div style={{ padding: "6px 10px" }}>
              <input className="finput" autoFocus placeholder="Tìm trong danh sách..." value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", fontSize: 12.5, padding: "5px 8px" }} />
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
            <input type="checkbox" checked={q ? shownAllOn : allOn} ref={(el) => { if (el) el.indeterminate = q ? (!shownAllOn && shownSome) : (!allOn && picked.length > 0); }}
              onChange={() => (q ? toggleShown() : apply(allOn ? new Set() : null))} />
            {q ? "Chọn tất cả kết quả tìm" : allLabel}
          </label>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {shown.map((o) => (
              <label key={String(o.value)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12.5, background: !allOn && picked.includes(o.value) ? "#EEF4FF" : "transparent" }}>
                <input type="checkbox" checked={picked.includes(o.value)} onChange={() => toggle(o.value)} />
                <span style={{ flex: 1, wordBreak: "break-word" }}>{String(o.value).length > 90 ? String(o.value).slice(0, 90) + "…" : String(o.value)}</span>
                <span style={{ color: "var(--text-400)", fontSize: 11.5 }}>{o.count.toLocaleString("vi-VN")}</span>
              </label>
            ))}
            {shown.length === 0 && <div style={{ padding: "8px 12px", fontSize: 12.5, color: "var(--text-400)" }}>Không có giá trị nào.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
