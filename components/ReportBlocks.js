// Bộ "khối trình bày" cho Báo cáo kiểm soát theo chủ đề — cấu trúc LUÔN
// được tính chính xác bằng backend (KPI, ma trận hình thức XLKL, gom nhóm
// theo chủ đề), không phải AI tự do sắp xếp. Giữ đồng bộ màu sắc/kiểu chữ
// với thiết kế chung của web (globals.css).

export const ACCENT_COLORS = { b: "#5580D6", o: "#DC7738", g: "#70B256", r: "#D64545" };

export const SEVERITY_INFO = {
  nhe: { label: "Nhẹ", color: "#4C9A2A", bg: "#EAF6E5" },
  vua: { label: "Vừa", color: "#DC7738", bg: "#FFF1E1" },
  nghiem_trong: { label: "Nghiêm trọng", color: "#D64545", bg: "#FDEAEA" },
  rat_nghiem_trong: { label: "Rất nghiêm trọng", color: "#fff", bg: "#7A1F1F" },
};

// Icon minh họa theo chủ đề — chọn từ bộ có sẵn (AI/backend chỉ chọn "icon_key",
// không vẽ ảnh) để phần trình bày sinh động hơn mà không cần gọi thêm API tạo ảnh.
export const ICON_MAP = {
  gian_lan: "🚨", an_toan: "🔥", ve_sinh: "🧹", ban_hang: "🧾",
  kiem_ke: "📦", gio_giac: "⏰", thai_do: "💬", tai_chinh: "💰", khac: "📋",
};
export function iconFor(key) {
  return ICON_MAP[key] || ICON_MAP.khac;
}

function fmtNum(n) {
  if (n === undefined || n === null) return "-";
  return Number(n).toLocaleString("vi-VN");
}

function severityInfo(sev) {
  return SEVERITY_INFO[sev] || SEVERITY_INFO.vua;
}

function StatHighlight({ value, label, accent = "b" }) {
  return (
    <div className="kpi-card">
      <div className="accent" style={{ background: ACCENT_COLORS[accent] || ACCENT_COLORS.b }}></div>
      <span className="tag">{label}</span>
      <div className="val" style={typeof value !== "number" ? { fontSize: 16, lineHeight: 1.35 } : undefined}>
        {typeof value === "number" ? fmtNum(value) : value}
      </div>
    </div>
  );
}

function GroupHeader({ order, icon, title }) {
  return (
    <div style={{
      background: "linear-gradient(135deg,var(--navy-800),var(--navy-700))",
      padding: "14px 22px", display: "flex", alignItems: "center", gap: 12,
    }}>
      {order != null && (
        <span style={{
          flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,.18)",
          color: "#fff", fontSize: 12.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {order}
        </span>
      )}
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: 0.3 }}>{title}</span>
    </div>
  );
}

function CaseSummary({ text }) {
  if (!text) return null;
  const lines = text.split("\n").filter(Boolean);
  return (
    <div style={{ marginTop: 9, fontSize: 13, lineHeight: 1.6, color: "var(--text-900)" }}>
      {lines.map((line, i) => {
        const m = line.match(/^([^:]{1,20}):\s*(.*)$/);
        return (
          <p key={i} style={{ margin: "0 0 4px" }}>
            {m ? <><strong>{m[1]}:</strong> {m[2]}</> : line}
          </p>
        );
      })}
    </div>
  );
}

function TopicGroup({ order, icon_key, chu_de, cases = [] }) {
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <GroupHeader order={order} icon={iconFor(icon_key)} title={`${chu_de} · ${cases.length} case`} />
      <div>
        {cases.map((c, i) => {
          const sev = severityInfo(c.severity);
          return (
            <div key={i} style={{ padding: "16px 22px", borderBottom: i === cases.length - 1 ? "none" : "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, marginRight: 7, background: sev.bg, color: sev.color }}>
                    {sev.label}
                  </span>
                  <strong style={{ fontSize: 13.5, color: "var(--navy-900)" }}>{c.doi_tuong}</strong>
                </div>
                <span style={{ fontSize: 11.5, color: "var(--text-600)", whiteSpace: "nowrap" }}>
                  {[c.vung, c.ngay, c.trang_thai].filter(Boolean).join(" · ")}
                </span>
              </div>
              <CaseSummary text={c.summary} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MergedGroup({ order, title, items = [] }) {
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <GroupHeader order={order} icon="📋" title={title} />
      <div className="card-body">
        {items.map((it, i) => {
          const sev = severityInfo(it.severity);
          return (
            <div key={i} style={{ padding: "10px 0", borderBottom: i === items.length - 1 ? "none" : "1px solid #F0F2F6", fontSize: 13, lineHeight: 1.6 }}>
              <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 10.5, fontWeight: 700, marginRight: 6, background: sev.bg, color: sev.color }}>
                {sev.label}
              </span>
              <strong style={{ color: "var(--navy-900)" }}>{it.chu_de}</strong> ({it.count} case) — {it.detail}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DisciplineMatrix({ title, columns = [], rows = [], col_totals = [], grand_total }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--blue-accent)", background: "#EEF3FE", padding: "4px 10px", borderRadius: 20 }}>
          ✏️ Cho phép sửa
        </span>
      </div>
      <div className="card-body">
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th rowSpan={2} style={{ verticalAlign: "middle" }}>Lỗi vi phạm</th>
                <th colSpan={columns.length}>Hình thức XLKL</th>
                <th rowSpan={2} style={{ verticalAlign: "middle" }}>Total</th>
              </tr>
              <tr>
                {columns.map((c, i) => <th key={i}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ textAlign: "left", fontWeight: 600 }}>{r.label}</td>
                  {r.counts.map((v, j) => <td key={j}>{v || "—"}</td>)}
                  <td>{r.total || "—"}</td>
                </tr>
              ))}
              <tr style={{ background: "#F5F8FE", fontWeight: 800 }}>
                <td style={{ textAlign: "left" }}>Tổng số lượng NV vi phạm</td>
                {col_totals.map((v, j) => <td key={j}>{v || "—"}</td>)}
                <td>{grand_total || "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Narrative({ heading, text }) {
  return (
    <div className="card">
      {heading && <div className="card-head"><h3>{heading}</h3></div>}
      <div className="card-body" style={{ padding: "18px 22px" }}>
        <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--text-900)", whiteSpace: "pre-line" }}>{text}</p>
      </div>
    </div>
  );
}

export default function BlockRenderer({ blocks = [] }) {
  const elements = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === "stat_highlight") {
      // gộp các stat_highlight liền kề thành 1 hàng kpi-grid
      const group = [];
      while (i < blocks.length && blocks[i].type === "stat_highlight") {
        group.push(blocks[i]);
        i++;
      }
      elements.push(
        <div className="kpi-grid" key={`stats-${i}`}>
          {group.map((s, j) => <StatHighlight key={j} {...s} />)}
        </div>
      );
      continue;
    }
    switch (b.type) {
      case "discipline_matrix":
        elements.push(<DisciplineMatrix key={i} {...b} />);
        break;
      case "topic_group":
        elements.push(<TopicGroup key={i} {...b} />);
        break;
      case "merged_group":
        elements.push(<MergedGroup key={i} {...b} />);
        break;
      case "narrative":
        elements.push(<Narrative key={i} {...b} />);
        break;
      default:
        break;
    }
    i++;
  }
  return <>{elements}</>;
}
