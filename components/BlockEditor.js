// Chỉnh sửa thủ công các "blocks" của báo cáo kiểm soát theo chủ đề — dùng
// cho cả bản AI tổng hợp (trước khi lưu) và bản đã công bố (sửa lại sau),
// để anh tự do sửa câu chữ/số liệu/thứ tự theo ý mình.
import { useState } from "react";
import { ICON_MAP, iconFor } from "./ReportBlocks";

const BLOCK_TYPE_LABELS = {
  narrative: "Ghi chú",
  stat_highlight: "Số liệu nổi bật",
  discipline_matrix: "Bảng hình thức XLKL",
  topic_group: "Nhóm case theo chủ đề",
  merged_group: "Nhóm gộp case nhỏ lẻ",
};
const SEVERITY_OPTIONS = [
  { value: "nhe", label: "Nhẹ" },
  { value: "vua", label: "Vừa" },
  { value: "nghiem_trong", label: "Nghiêm trọng" },
  { value: "rat_nghiem_trong", label: "Rất nghiêm trọng" },
];
const ACCENT_OPTIONS = [
  { value: "b", label: "Xanh dương" },
  { value: "o", label: "Cam" },
  { value: "g", label: "Xanh lá" },
  { value: "r", label: "Đỏ" },
];
const DEFAULT_XLKL_COLUMNS = ["Sa thải", "Phạt tiền", "Cảnh cáo nhắc nhở", "Chờ họp XLKL"];

function emptyBlock(type) {
  switch (type) {
    case "narrative": return { type, heading: "", text: "" };
    case "stat_highlight": return { type, value: 0, label: "", accent: "b" };
    case "discipline_matrix": return {
      type, title: "Thống kê hình thức và số lượng NV vi phạm",
      columns: [...DEFAULT_XLKL_COLUMNS], rows: [], col_totals: [0, 0, 0, 0], grand_total: 0,
    };
    case "topic_group": return { type, order: 1, icon_key: "khac", chu_de: "", cases: [] };
    case "merged_group": return { type, order: 1, title: "Các vi phạm khác trong tháng", items: [] };
    default: return { type: "narrative", heading: "", text: "" };
  }
}

const label = { fontSize: 11.5, fontWeight: 600, color: "var(--text-600)", display: "block", marginBottom: 4 };
const field = { marginBottom: 10 };
const rowBtns = { display: "flex", gap: 6 };
const smallBtn = { padding: "3px 9px", fontSize: 11.5, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer" };
const caseBox = { border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 8 };

export default function BlockEditor({ blocks = [], onChange }) {
  const [newBlockType, setNewBlockType] = useState("topic_group");

  function setBlocks(next) {
    onChange(next);
  }
  function updateBlock(i, patch) {
    setBlocks(blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
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

  // ---- helpers cho mảng lồng nhau (cases / items / rows) ----
  function updateArrayItem(i, arrKey, itemIdx, patch) {
    setBlocks(blocks.map((b, idx) => {
      if (idx !== i) return b;
      const arr = (b[arrKey] || []).map((it, ii) => (ii === itemIdx ? { ...it, ...patch } : it));
      return { ...b, [arrKey]: arr };
    }));
  }
  function removeArrayItem(i, arrKey, itemIdx) {
    setBlocks(blocks.map((b, idx) => (idx === i ? { ...b, [arrKey]: (b[arrKey] || []).filter((_, ii) => ii !== itemIdx) } : b)));
  }
  function addArrayItem(i, arrKey, emptyItem) {
    setBlocks(blocks.map((b, idx) => (idx === i ? { ...b, [arrKey]: [...(b[arrKey] || []), emptyItem] } : b)));
  }
  function updateMatrixRowCount(i, rowIdx, colIdx, value) {
    setBlocks(blocks.map((b, idx) => {
      if (idx !== i) return b;
      const rows = (b.rows || []).map((r, ri) => {
        if (ri !== rowIdx) return r;
        const counts = [...r.counts];
        counts[colIdx] = value;
        return { ...r, counts };
      });
      return { ...b, rows };
    }));
  }
  function updateColTotal(i, colIdx, value) {
    setBlocks(blocks.map((b, idx) => {
      if (idx !== i) return b;
      const col_totals = [...(b.col_totals || [])];
      col_totals[colIdx] = value;
      return { ...b, col_totals };
    }));
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
                  <input className="finput" style={{ width: "100%" }} value={b.value ?? 0}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const asNum = Number(raw);
                      updateBlock(i, { value: raw !== "" && !Number.isNaN(asNum) && /^-?\d+$/.test(raw) ? asNum : raw });
                    }} />
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

            {b.type === "discipline_matrix" && (
              <>
                <div style={field}>
                  <label style={label}>Tiêu đề bảng</label>
                  <input className="finput" style={{ width: "100%" }} value={b.title || ""} onChange={(e) => updateBlock(i, { title: e.target.value })} />
                </div>
                {(b.columns || []).length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: `2fr repeat(${b.columns.length}, 1fr) auto`, gap: 8, marginBottom: 6, alignItems: "center" }}>
                    <span style={label}>Lỗi vi phạm</span>
                    {b.columns.map((c, ci) => (
                      <input key={ci} className="finput" style={{ fontSize: 11, textAlign: "center" }} value={c}
                        onChange={(e) => {
                          const columns = [...b.columns];
                          columns[ci] = e.target.value;
                          updateBlock(i, { columns });
                        }} />
                    ))}
                    <span />
                  </div>
                )}
                {(b.rows || []).map((r, ri) => (
                  <div key={ri} style={{ display: "grid", gridTemplateColumns: `2fr repeat(${b.columns.length}, 1fr) auto`, gap: 8, marginBottom: 6, alignItems: "center" }}>
                    <input className="finput" placeholder="Lỗi vi phạm" value={r.label || ""}
                      onChange={(e) => updateArrayItem(i, "rows", ri, { label: e.target.value })} />
                    {r.counts.map((v, ci) => (
                      <input key={ci} className="finput" type="number" value={v ?? 0}
                        onChange={(e) => updateMatrixRowCount(i, ri, ci, Number(e.target.value))} />
                    ))}
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input className="finput" type="number" style={{ width: 54 }} value={r.total ?? 0}
                        onChange={(e) => updateArrayItem(i, "rows", ri, { total: Number(e.target.value) })} />
                      <button style={smallBtn} onClick={() => removeArrayItem(i, "rows", ri)}>🗑</button>
                    </div>
                  </div>
                ))}
                <button style={{ ...smallBtn, marginBottom: 10 }} onClick={() => addArrayItem(i, "rows", { label: "", counts: b.columns.map(() => 0), total: 0 })}>
                  + Thêm dòng lỗi vi phạm
                </button>
                <div style={{ display: "grid", gridTemplateColumns: `2fr repeat(${b.columns.length}, 1fr) auto`, gap: 8, alignItems: "center" }}>
                  <span style={{ ...label, marginBottom: 0 }}>Tổng cột</span>
                  {(b.col_totals || []).map((v, ci) => (
                    <input key={ci} className="finput" type="number" value={v ?? 0} onChange={(e) => updateColTotal(i, ci, Number(e.target.value))} />
                  ))}
                  <input className="finput" type="number" style={{ width: 54 }} value={b.grand_total ?? 0}
                    onChange={(e) => updateBlock(i, { grand_total: Number(e.target.value) })} />
                </div>
              </>
            )}

            {b.type === "topic_group" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "80px 2fr 1fr", gap: 10 }}>
                  <div>
                    <label style={label}>Thứ tự</label>
                    <input className="finput" style={{ width: "100%" }} type="number" value={b.order ?? 1} onChange={(e) => updateBlock(i, { order: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label style={label}>Chủ đề vi phạm chung</label>
                    <input className="finput" style={{ width: "100%" }} value={b.chu_de || ""} onChange={(e) => updateBlock(i, { chu_de: e.target.value })} />
                  </div>
                  <div>
                    <label style={label}>Icon</label>
                    <select className="finput" style={{ width: "100%" }} value={b.icon_key || "khac"} onChange={(e) => updateBlock(i, { icon_key: e.target.value })}>
                      {Object.keys(ICON_MAP).map((k) => <option key={k} value={k}>{iconFor(k)} {k}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <label style={label}>Các case trong nhóm</label>
                  {(b.cases || []).map((c, ci) => (
                    <div key={ci} style={caseBox}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr auto", gap: 8, marginBottom: 8 }}>
                        <select className="finput" value={c.severity || "vua"} onChange={(e) => updateArrayItem(i, "cases", ci, { severity: e.target.value })}>
                          {SEVERITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <input className="finput" placeholder="NV [tên] – [tên shop]" value={c.doi_tuong || ""} onChange={(e) => updateArrayItem(i, "cases", ci, { doi_tuong: e.target.value })} />
                        <input className="finput" placeholder="Vùng" value={c.vung || ""} onChange={(e) => updateArrayItem(i, "cases", ci, { vung: e.target.value })} />
                        <input className="finput" placeholder="Ngày" value={c.ngay || ""} onChange={(e) => updateArrayItem(i, "cases", ci, { ngay: e.target.value })} />
                        <input className="finput" placeholder="Trạng thái" value={c.trang_thai || ""} onChange={(e) => updateArrayItem(i, "cases", ci, { trang_thai: e.target.value })} />
                        <button style={smallBtn} onClick={() => removeArrayItem(i, "cases", ci)}>🗑</button>
                      </div>
                      <textarea className="finput" style={{ width: "100%" }} rows={3} placeholder="Nguyên nhân: ...&#10;Hậu quả: ...&#10;Đề xuất: ..."
                        value={c.summary || ""} onChange={(e) => updateArrayItem(i, "cases", ci, { summary: e.target.value })} />
                    </div>
                  ))}
                  <button style={smallBtn} onClick={() => addArrayItem(i, "cases", { severity: "vua", doi_tuong: "", vung: "", ngay: "", trang_thai: "", summary: "" })}>
                    + Thêm case vào nhóm
                  </button>
                </div>
              </>
            )}

            {b.type === "merged_group" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10 }}>
                  <div>
                    <label style={label}>Thứ tự</label>
                    <input className="finput" style={{ width: "100%" }} type="number" value={b.order ?? 1} onChange={(e) => updateBlock(i, { order: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label style={label}>Tiêu đề khung</label>
                    <input className="finput" style={{ width: "100%" }} value={b.title || ""} onChange={(e) => updateBlock(i, { title: e.target.value })} />
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <label style={label}>Các mục gộp</label>
                  {(b.items || []).map((it, ii) => (
                    <div key={ii} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 70px auto", gap: 8, marginBottom: 8 }}>
                      <select className="finput" value={it.severity || "vua"} onChange={(e) => updateArrayItem(i, "items", ii, { severity: e.target.value })}>
                        {SEVERITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <input className="finput" placeholder="Chủ đề" value={it.chu_de || ""} onChange={(e) => updateArrayItem(i, "items", ii, { chu_de: e.target.value })} />
                      <input className="finput" type="number" placeholder="SL" value={it.count ?? 1} onChange={(e) => updateArrayItem(i, "items", ii, { count: Number(e.target.value) })} />
                      <button style={smallBtn} onClick={() => removeArrayItem(i, "items", ii)}>🗑</button>
                      <input className="finput" style={{ gridColumn: "1 / -1" }} placeholder="Chi tiết ngắn gọn" value={it.detail || ""} onChange={(e) => updateArrayItem(i, "items", ii, { detail: e.target.value })} />
                    </div>
                  ))}
                  <button style={smallBtn} onClick={() => addArrayItem(i, "items", { severity: "vua", chu_de: "", count: 1, detail: "" })}>
                    + Thêm mục
                  </button>
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
