import { useEffect, useRef } from "react";

// Rich-text editor nhỏ gọn cho chữ ký mail — in đậm/in nghiêng/màu chữ/cỡ
// chữ. Dùng document.execCommand trên 1 vùng contentEditable thay vì thêm
// thư viện rich-text ngoài (dự án chủ trương ít dependency). Value/onChange
// là chuỗi HTML (innerHTML) — server tự lọc lại (allowlist) khi lưu, xem
// app/services/html_sanitize.py bên backend.

const FONT_SIZES = [
  { label: "Nhỏ", px: "12px" },
  { label: "Vừa", px: "14px" },
  { label: "Lớn", px: "17px" },
  { label: "Rất lớn", px: "20px" },
];

// Riêng "Nội dung mail" (Gửi mail BCKS, chốt 26/08) — mặc định 12px nên
// đổi "Vừa" thành 12px cho khớp (thay vì 14px như Chữ ký/Hồ sơ nhân sự),
// dịch cả thang xuống 1 bậc để không trùng giá trị với "Nhỏ".
export const GREETING_FONT_SIZES = [
  { label: "Nhỏ", px: "10px" },
  { label: "Vừa", px: "12px" },
  { label: "Lớn", px: "14px" },
  { label: "Rất lớn", px: "17px" },
];

const toolbarStyle = {
  display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap",
};
const toolBtnStyle = {
  width: 30, height: 28, border: "1px solid var(--border)", borderRadius: 6,
  background: "#fff", cursor: "pointer", fontSize: 13, color: "var(--text-900)",
};
const toolSelectStyle = {
  height: 28, border: "1px solid var(--border)", borderRadius: 6, background: "#fff",
  fontSize: 12, color: "var(--text-600)", padding: "0 4px", cursor: "pointer",
};

export default function SignatureEditor({ value, onChange, placeholder, minHeight = 110, fontSizes = FONT_SIZES }) {
  const editorRef = useRef(null);
  // Bấm vào nút/toolbar (button, select, input color) làm trình duyệt tự
  // chuyển focus ra khỏi vùng contentEditable NGAY LÚC mousedown, khiến
  // đoạn chữ đang bôi đen bị mất trước khi kịp execCommand — phải tự lưu
  // lại vùng chọn (Range) mỗi khi người dùng bôi đen trong vùng soạn, rồi
  // khôi phục lại đúng vùng đó trước khi áp định dạng.
  const savedRangeRef = useRef(null);

  useEffect(() => {
    const el = editorRef.current;
    if (el && el.innerHTML !== (value || "")) {
      el.innerHTML = value || "";
    }
  }, [value]);

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    }
  }

  function restoreSelection() {
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    if (savedRangeRef.current) {
      sel.addRange(savedRangeRef.current);
    }
  }

  function emitChange() {
    onChange(editorRef.current.innerHTML);
  }

  function exec(cmd, arg) {
    editorRef.current.focus();
    restoreSelection();
    document.execCommand(cmd, false, arg);
    saveSelection();
    emitChange();
  }

  function applyFontSize(px) {
    const el = editorRef.current;
    el.focus();
    restoreSelection();
    // execCommand("fontSize") chỉ hỗ trợ 7 mức cũ (1-7) — dùng mốc "7" làm
    // đánh dấu rồi thay bằng style font-size thật để tuỳ ý theo px.
    document.execCommand("fontSize", false, "7");
    el.querySelectorAll('font[size="7"]').forEach((f) => {
      f.removeAttribute("size");
      f.style.fontSize = px;
    });
    saveSelection();
    emitChange();
  }

  return (
    <div>
      <div style={toolbarStyle}>
        <button
          type="button" title="In đậm" style={{ ...toolBtnStyle, fontWeight: 800 }}
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")}
        >
          B
        </button>
        <button
          type="button" title="In nghiêng" style={{ ...toolBtnStyle, fontStyle: "italic" }}
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")}
        >
          I
        </button>
        <label
          title="Màu chữ"
          style={{ ...toolBtnStyle, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, position: "relative" }}
          onMouseDown={saveSelection}
        >
          🎨
          <input
            type="color" defaultValue="#1a1a1a"
            onChange={(e) => exec("foreColor", e.target.value)}
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
          />
        </label>
        <select
          style={toolSelectStyle} defaultValue=""
          onMouseDown={saveSelection}
          onChange={(e) => { if (e.target.value) applyFontSize(e.target.value); e.target.value = ""; }}
        >
          <option value="" disabled>Cỡ chữ</option>
          {fontSizes.map((s) => <option key={s.px} value={s.px}>{s.label}</option>)}
        </select>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={emitChange}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        data-placeholder={placeholder || ""}
        className="signature-editable"
        style={{
          minHeight, padding: "9px 12px", border: "1.5px solid var(--border)",
          borderRadius: 8, fontSize: 13, background: "#FAFBFD", lineHeight: 1.6,
          outline: "none", overflowWrap: "break-word",
        }}
      />
    </div>
  );
}
