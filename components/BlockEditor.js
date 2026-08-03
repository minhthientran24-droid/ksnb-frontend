// Chỉnh sửa thủ công các "blocks" của báo cáo kiểm soát theo chủ đề — dùng
// cho cả bản AI tổng hợp (trước khi lưu) và bản đã công bố (sửa lại sau),
// để anh tự do sửa câu chữ theo văn phong của mình thay vì chỉ được
// Lưu/Hủy nguyên văn AI viết.
import { useState } from "react";
import { ICON_MAP, iconFor } from "./ReportBlocks";

const BLOCK_TYPE_LABELS = {
  narrative: "Đoạn văn tổng quan",
  stat_highlight: "Số liệu nổi bật",
  case_card: "Thẻ case",
  case_group: "Nhóm case cùng chủ đề",
  timeline: "Dòng thời gian",
  bar_chart: "Biểu đồ cột",
  quote_callout: "Trích dẫn nổi bật",
};
const SEVERITY_OPTIONS = [
  { value: "nhe", label: "Nhẹ" },
  { value: "vua", label: "Vừa" },
  { value: "nghiem_trong", label: "Nghiêm trọng" },
];
const ACCENT_OPTIONS = [
  { value: "b", label: "Xanh dương" },
  { value: "o", label: "Cam" },
  { value: "g", label: "Xanh lá" },
  { value: "r", label: "Đỏ" },
];

function emptyBlock(type) {
  switch (type) {
    case "narrative": return { type, heading: "", text: "" };
    case "stat_highlight": return { type, value: 0, label: "", accent: "b" };
    case "case_card": return { type, title: "", severity: "vua", featured: false, icon_key: "khac", summary: "", meta: { doi_tuong: "", vung: "", ngay: "", trang_thai: "" } };
    case "case_group": return { type, icon_key: "khac", title: "", description: "", items: [] };
    case "timeline": return { type, title: "", items: [] };
    case "bar_chart": return { type, title: "", data: [] };
    case "quote_callout": return { type, text: "", attribution: "" };
    default: return { type: "narrative", heading: "", text: "" };
  }
}

const label = { fontSize: 11.5, fontWeight: 600, color: "var(--text-600)", display: "block", marginBottom: 4 };
const field = { marginBottom: 10 };
const rowBtns = { display: "flex", gap: 6 };
const smallBtn = { padding: "3px 9px", fontSize: 11.5, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer" };

export default function BlockEditor({ blocks = [], onChange }) {
  const [newBlockType, setNewBlockType] = useState("narrative");

  function setBlocks(next) {
    onChange(next);
  }
  function updateBlock(i, patch) {
    const next = blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b));
    setBlocks(next);
  }
  function updateMeta(i, patch) {
    const next = blocks.map((b, idx) => (idx === i ? { ...b, meta: { ...b.meta, ...patch } } : b));
    setBlocks(next);
  }
  function removeBlock(i) {
    setBlocks(blocks.filter((_, idx) => idx !== i));
  }
  function moveBlock(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
  }
  function addBlockOfType(type) {
    setBlocks([...blocks, emptyBlock(type)]);
  }
  function updateArrayItem(i, arrKey, itemIdx, patch) {
    const next = blocks.map((b, idx) => {
      if (idx !== i) return b;
      const arr = (b[arrKey] || []).map((it, ii) => (ii === itemIdx ? { ...it, ...patch } : it));
      return { ...b, [arrKey]: arr };
    });
    setBlocks(next);
  }
  function removeArrayItem(i, arrKey, itemIdx) {
    const next = blocks.map((b, idx) => {
      if (idx !== i) return b;
      return { ...b, [arrKey]: (b[arrKey] || []).filter((_, ii) => ii !== itemIdx) };
    });
    setBlocks(next);
  }
  function addArrayItem(i, arrKey, emptyItem) {
    const next = blocks.map((b, idx) => (idx === i ? { ...b, [arrKey]: [...(b[arrKey] || []), emptyItem] } : b));
    setBlocks(next);
  }

  return (
    <div>
      {blocks.map((b, i) => (
        <div key={i} className="card" style={{ marginBottom: 14, border: "1px dashed var(--border)" }}>
          <div className="card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 13 }}>{BLOCK_TYPE_LABELS[b.type] || b.type}</h3>
            <div style={rowBtns}>
              <button style={smallBtn} onClick={() => moveBlock(i, -1)} title="Chuyển lên">↑</button>
              <button style={smallBtn} onClick={() => moveBlock(i, 1)} title="Chuyển xuống">↓</button>
              <button style={{ ...smallBtn, color: "var(--danger)" }} onClick={() => removeBlock(i)} title="Xóa khối">🗑 Xóa</button>
            </div>
          </div>
          <div className="card-body" style={{ padding: "14px 18px" }}>
            {b.type === "narrative" && (
              <>
                <div style={field}>
                  <label style={label}>Tiêu đề</label>
                  <input className="finput" style={{ width: "100%" }} value={b.heading || ""} onChange={(e) => updateBlock(i, { heading: e.target.value })} />
                </div>
                <div style={field}>
                  <label style={label}>Nội dung</label>
                  <textarea className="finput" style={{ width: "100%" }} rows={4} value={b.text || ""} onChange={(e) => updateBlock(i, { text: e.target.value })} />
                </div>
              </>
            )}

            {b.type === "stat_highlight" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 10 }}>
                <div>
                  <label style={label}>Giá trị</label>
                  <input className="finput" style={{ width: "100%" }} type="number" value={b.value ?? 0} onChange={(e) => updateBlock(i, { value: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={label}>Nhãn</label>
                  <input className="finput" style={{ width: "100%" }} value={b.label || ""} onChange={(e) => updateBlock(i, { label: e.target.value })} />
                </div>
                <div>
                  <label style={label}>Màu</label>
                  <select className="finput" style={{ width: "100%" }} value={b.accent || "b"} onChange={(e) => updateBlock(i, { accent: e.target.value })}>
                    {ACCENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {b.type === "case_card" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={label}>Tiêu đề case</label>
                    <input className="finput" style={{ width: "100%" }} value={b.title || ""} onChange={(e) => updateBlock(i, { title: e.target.value })} />
                  </div>
                  <div>
                    <label style={label}>Mức độ</label>
                    <select className="finput" style={{ width: "100%" }} value={b.severity || "vua"} onChange={(e) => updateBlock(i, { severity: e.target.value })}>
                      {SEVERITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={label}>Icon</label>
                    <select className="finput" style={{ width: "100%" }} value={b.icon_key || "khac"} onChange={(e) => updateBlock(i, { icon_key: e.target.value })}>
                      {Object.keys(ICON_MAP).map((k) => <option key={k} value={k}>{iconFor(k)} {k}</option>)}
                    </select>
                  </div>
                </div>
                <label style={{ ...label, display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                  <input type="checkbox" checked={!!b.featured} onChange={(e) => updateBlock(i, { featured: e.target.checked })} />
                  Hiển thị khổ rộng (featured)
                </label>
                <div style={{ ...field, marginTop: 8 }}>
                  <label style={label}>Nội dung / phân tích</label>
                  <textarea className="finput" style={{ width: "100%" }} rows={5} value={b.summary || ""} onChange={(e) => updateBlock(i, { summary: e.target.value })} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={label}>Đối tượng</label>
                    <input className="finput" style={{ width: "100%" }} value={b.meta?.doi_tuong || ""} onChange={(e) => updateMeta(i, { doi_tuong: e.target.value })} />
                  </div>
                  <div>
                    <label style={label}>Vùng</label>
                    <input className="finput" style={{ width: "100%" }} value={b.meta?.vung || ""} onChange={(e) => updateMeta(i, { vung: e.target.value })} />
                  </div>
                  <div>
                    <label style={label}>Ngày</label>
                    <input className="finput" style={{ width: "100%" }} value={b.meta?.ngay || ""} onChange={(e) => updateMeta(i, { ngay: e.target.value })} />
                  </div>
                  <div>
                    <label style={label}>Trạng thái</label>
                    <input className="finput" style={{ width: "100%" }} value={b.meta?.trang_thai || ""} onChange={(e) => updateMeta(i, { trang_thai: e.target.value })} />
                  </div>
                </div>
              </>
            )}

            {b.type === "case_group" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                  <div>
                    <label style={label}>Tiêu đề nhóm</label>
                    <input className="finput" style={{ width: "100%" }} value={b.title || ""} onChange={(e) => updateBlock(i, { title: e.target.value })} />
                  </div>
                  <div>
                    <label style={label}>Icon</label>
                    <select className="finput" style={{ width: "100%" }} value={b.icon_key || "khac"} onChange={(e) => updateBlock(i, { icon_key: e.target.value })}>
                      {Object.keys(ICON_MAP).map((k) => <option key={k} value={k}>{iconFor(k)} {k}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ ...field, marginTop: 8 }}>
                  <label style={label}>Mô tả ngắn</label>
                  <textarea className="finput" style={{ width: "100%" }} rows={2} value={b.description || ""} onChange={(e) => updateBlock(i, { description: e.target.value })} />
                </div>
                {(b.items || []).map((item, ii) => (
                  <div key={ii} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8, marginBottom: 6, alignItems: "center" }}>
                    <input className="finput" placeholder="Tên/đối tượng" value={item.title || ""} onChange={(e) => updateArrayItem(i, "items", ii, { title: e.target.value })} />
                    <input className="finput" placeholder="Vùng" value={item.vung || ""} onChange={(e) => updateArrayItem(i, "items", ii, { vung: e.target.value })} />
                    <input className="finput" placeholder="Ngày" value={item.ngay || ""} onChange={(e) => updateArrayItem(i, "items", ii, { ngay: e.target.value })} />
                    <input className="finput" placeholder="Trạng thái" value={item.trang_thai || ""} onChange={(e) => updateArrayItem(i, "items", ii, { trang_thai: e.target.value })} />
                    <button style={smallBtn} onClick={() => removeArrayItem(i, "items", ii)}>🗑</button>
                  </div>
                ))}
                <button style={smallBtn} onClick={() => addArrayItem(i, "items", { title: "", doi_tuong: "", vung: "", ngay: "", trang_thai: "" })}>+ Thêm case vào nhóm</button>
              </>
            )}

            {b.type === "timeline" && (
              <>
                <div style={field}>
                  <label style={label}>Tiêu đề</label>
                  <input className="finput" style={{ width: "100%" }} value={b.title || ""} onChange={(e) => updateBlock(i, { title: e.target.value })} />
                </div>
                {(b.items || []).map((item, ii) => (
                  <div key={ii} style={{ display: "grid", gridTemplateColumns: "1fr 3fr auto", gap: 8, marginBottom: 6 }}>
                    <input className="finput" placeholder="Ngày" value={item.date || ""} onChange={(e) => updateArrayItem(i, "items", ii, { date: e.target.value })} />
                    <input className="finput" placeholder="Nội dung" value={item.text || ""} onChange={(e) => updateArrayItem(i, "items", ii, { text: e.target.value })} />
                    <button style={smallBtn} onClick={() => removeArrayItem(i, "items", ii)}>🗑</button>
                  </div>
                ))}
                <button style={smallBtn} onClick={() => addArrayItem(i, "items", { date: "", text: "" })}>+ Thêm dòng</button>
              </>
            )}

            {b.type === "bar_chart" && (
              <>
                <div style={field}>
                  <label style={label}>Tiêu đề biểu đồ</label>
                  <input className="finput" style={{ width: "100%" }} value={b.title || ""} onChange={(e) => updateBlock(i, { title: e.target.value })} />
                </div>
                {(b.data || []).map((item, ii) => (
                  <div key={ii} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8, marginBottom: 6 }}>
                    <input className="finput" placeholder="Nhãn" value={item.label || ""} onChange={(e) => updateArrayItem(i, "data", ii, { label: e.target.value })} />
                    <input className="finput" type="number" placeholder="Giá trị" value={item.value ?? 0} onChange={(e) => updateArrayItem(i, "data", ii, { value: Number(e.target.value) })} />
                    <button style={smallBtn} onClick={() => removeArrayItem(i, "data", ii)}>🗑</button>
                  </div>
                ))}
                <button style={smallBtn} onClick={() => addArrayItem(i, "data", { label: "", value: 0 })}>+ Thêm cột</button>
              </>
            )}

            {b.type === "quote_callout" && (
              <>
                <div style={field}>
                  <label style={label}>Nội dung trích dẫn</label>
                  <textarea className="finput" style={{ width: "100%" }} rows={2} value={b.text || ""} onChange={(e) => updateBlock(i, { text: e.target.value })} />
                </div>
                <div style={field}>
                  <label style={label}>Nguồn/ghi chú (tùy chọn)</label>
                  <input className="finput" style={{ width: "100%" }} value={b.attribution || ""} onChange={(e) => updateBlock(i, { attribution: e.target.value })} />
                </div>
              </>
            )}
          </div>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
        <select className="finput" value={newBlockType} onChange={(e) => setNewBlockType(e.target.value)}>
          {Object.entries(BLOCK_TYPE_LABELS).map(([type, l]) => <option key={type} value={type}>{l}</option>)}
        </select>
        <button style={smallBtn} onClick={() => addBlockOfType(newBlockType)}>
          + Thêm khối mới
        </button>
      </div>
    </div>
  );
}
