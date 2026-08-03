// Bộ "khối trình bày" cho Báo cáo kiểm soát theo chủ đề — thay vì 1 bảng
// cứng, mỗi tháng dữ liệu được gom thành 1 danh sách "blocks" (tự động
// hoặc do AI sắp xếp), mỗi block chọn 1 trong các kiểu bên dưới. Giữ
// đồng bộ màu sắc/kiểu chữ với thiết kế chung của web (globals.css).
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const ACCENT_COLORS = { b: "#5580D6", o: "#DC7738", g: "#70B256", r: "#D64545" };
const SEVERITY_INFO = {
  nhe: { label: "Nhẹ", color: "#4C9A2A", bg: "#EAF6E5" },
  vua: { label: "Vừa", color: "#DC7738", bg: "#FFF1E1" },
  nghiem_trong: { label: "Nghiêm trọng", color: "#D64545", bg: "#FDEAEA" },
};
const BAR_COLORS = ["#3E7FD1", "#F5821F", "#7AC142", "#D64545", "#9B59B6", "#16A5A5", "#E4B62F", "#5580D6"];

function fmtNum(n) {
  if (n === undefined || n === null) return "-";
  return Number(n).toLocaleString("vi-VN");
}

function StatHighlight({ value, label, accent = "b" }) {
  return (
    <div className="kpi-card">
      <div className="accent" style={{ background: ACCENT_COLORS[accent] || ACCENT_COLORS.b }}></div>
      <span className="tag">{label}</span>
      <div className="val">{typeof value === "number" ? fmtNum(value) : value}</div>
    </div>
  );
}

function CaseCard({ title, severity = "vua", summary, meta }) {
  const sev = SEVERITY_INFO[severity] || SEVERITY_INFO.vua;
  return (
    <div className="card">
      <div className="card-body" style={{ padding: "16px 20px", borderLeft: `4px solid ${sev.color}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 700, background: sev.bg, color: sev.color }}>
              {sev.label}
            </span>{" "}
            <strong style={{ fontSize: 14.5, color: "var(--navy-900)" }}>{title}</strong>
          </div>
        </div>
        {meta && (
          <div style={{ fontSize: 12, color: "var(--text-600)", marginTop: 6 }}>
            {[meta.doi_tuong, meta.vung, meta.ngay, meta.trang_thai].filter(Boolean).join(" · ")}
          </div>
        )}
        {summary && <p style={{ fontSize: 13, marginTop: 10, whiteSpace: "pre-line", color: "var(--text-900)" }}>{summary}</p>}
      </div>
    </div>
  );
}

function Timeline({ title, items = [] }) {
  return (
    <div className="card">
      {title && <div className="card-head"><h3>{title}</h3></div>}
      <div className="card-body" style={{ padding: "18px 22px" }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 14, position: "relative", paddingBottom: i === items.length - 1 ? 0 : 20 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--navy-800)", flexShrink: 0, marginTop: 3 }} />
              {i !== items.length - 1 && <div style={{ width: 2, flex: 1, background: "var(--border)", marginTop: 2 }} />}
            </div>
            <div style={{ paddingBottom: 4 }}>
              {item.date && <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-400)", textTransform: "uppercase" }}>{item.date}</div>}
              <div style={{ fontSize: 13.5, color: "var(--text-900)", marginTop: 2 }}>{item.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniBarChart({ title, data = [] }) {
  return (
    <div className="card">
      {title && <div className="card-head"><h3>{title}</h3></div>}
      <div className="card-body" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F6" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function QuoteCallout({ text, attribution }) {
  return (
    <div style={{
      background: "linear-gradient(135deg,var(--navy-800),var(--navy-700))", borderRadius: "var(--radius)",
      padding: "22px 26px", color: "#fff", marginBottom: 20,
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.6, fontStyle: "italic" }}>&ldquo;{text}&rdquo;</div>
      {attribution && <div style={{ fontSize: 12, opacity: 0.75, marginTop: 10 }}>— {attribution}</div>}
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
      // gộp các stat_highlight liền kề thành 1 hàng kpi-grid, giống báo cáo kiểm kê
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
      case "case_card":
        elements.push(<CaseCard key={i} {...b} />);
        break;
      case "timeline":
        elements.push(<Timeline key={i} {...b} />);
        break;
      case "bar_chart":
        elements.push(<MiniBarChart key={i} {...b} />);
        break;
      case "quote_callout":
        elements.push(<QuoteCallout key={i} {...b} />);
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
