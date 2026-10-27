// Ô tiêu đề cột có nút lọc (xem ColumnMultiFilter): chữ canh giữa cột, nút lọc nằm sát mép phải.
// onClick/sortActive/sortDir (tuỳ chọn): bấm vào tên cột để sắp xếp, ▲/▼ chỉ hiện ở cột đang sắp xếp.
export default function FilterHeaderTh({ label, filter, align, minWidth, onClick, sortActive, sortDir, style }) {
  return (
    <th
      onClick={onClick}
      title={onClick ? "Bấm để sắp xếp" : undefined}
      style={{
        textAlign: align || "center", minWidth, whiteSpace: "nowrap", position: "relative", paddingRight: filter ? 24 : undefined,
        paddingLeft: filter && align !== "left" ? 24 : undefined, cursor: onClick ? "pointer" : undefined, userSelect: onClick ? "none" : undefined,
        background: sortActive ? (sortDir === "asc" ? "#EAF6E5" : "#FFF1E1") : undefined, ...style,
      }}
    >
      {label}
      {sortActive && <span style={{ marginLeft: 4, fontSize: 10 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
      {filter && <span style={{ position: "absolute", right: 3, top: 0, bottom: 0, display: "inline-flex", alignItems: "center" }}>{filter}</span>}
    </th>
  );
}
