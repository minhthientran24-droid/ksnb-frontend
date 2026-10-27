import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { getUser, thongKeKiemKeInfo, thongKeKiemKePeriods, thongKeKiemKeDaKiem, thongKeKiemKeExport } from "../lib/api";
import { fmtMoney, moneyStyle, tinhUocTinhTruyThu, sortDaKiemRows } from "../lib/daKiem";

// Menu RIÊNG của Guest Account (chốt 26/10) — "Thống kê Kiểm Kê": CHỈ shop ĐÃ KIỂM theo từng tháng, cả Long Châu lẫn
// Vaccine, có Xuất Excel. Cố ý KHÔNG có: Shop đang kiểm, Shop được chia/chuẩn bị chia, Tải file báo cáo, Huỷ dòng.
const NHOM_TABS = [
  { key: "long_chau", label: "Long Châu" },
  { key: "vaccine", label: "Vaccine" },
];

export default function ThongKeKiemKePage() {
  const [checked, setChecked] = useState(false);
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState("");
  const [nhom, setNhom] = useState("long_chau");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState("uoc_tinh_truy_thu");
  const [sortDir, setSortDir] = useState("asc");
  const [exportBusy, setExportBusy] = useState(false);
  const [info, setInfo] = useState(null); // {vung, gioi_han} — vùng được phép xem

  useEffect(() => {
    if (!getUser()) {
      window.location.replace("/");
      return;
    }
    setChecked(true);
    thongKeKiemKeInfo().then(setInfo).catch(() => {});
    thongKeKiemKePeriods()
      .then((p) => { setPeriods(p); if (p.length) setPeriod(p[0]); })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!period) return;
    setLoading(true);
    setError("");
    thongKeKiemKeDaKiem(period)
      .then(setRows)
      .catch((err) => { setRows([]); setError(err.message); })
      .finally(() => setLoading(false));
  }, [period]);

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortTh({ label, sortCol }) {
    const active = sortKey === sortCol;
    const lines = Array.isArray(label) ? label : [label];
    const activeBg = active ? (sortDir === "asc" ? "#EAF6E5" : "#FFF1E1") : undefined;
    return (
      <th onClick={() => handleSort(sortCol)} style={{ cursor: "pointer", userSelect: "none", lineHeight: 1.3, background: activeBg }} title="Bấm để sắp xếp">
        {lines.map((line, i) => (
          <div key={i} style={{ whiteSpace: "nowrap" }}>
            {line}
            {i === lines.length - 1 && (
              <span style={{ marginLeft: 4, fontSize: 10, opacity: active ? 1 : 0.5 }}>{active ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
            )}
          </div>
        ))}
      </th>
    );
  }

  const countBy = (k) => rows.filter((r) => (r.nhom || "long_chau") === k).length;
  const groupRows = rows.filter((r) => (r.nhom || "long_chau") === nhom);
  const displayRows = sortDaKiemRows(
    groupRows.filter((r) => !searchQuery
      || (r.ma_shop || "").toLowerCase().includes(searchQuery)
      || (r.ten_shop || "").toLowerCase().includes(searchQuery)),
    sortKey, sortDir,
  );

  async function handleExport() {
    const numCols = nhom === "long_chau"
      ? [["Kiểm kê Non CL", (r) => r.gia_tri_non_cl], ["Cân tồn Non CL", (r) => r.can_ton_non_cl],
         ["Kiểm kê Cắt liều", (r) => r.gia_tri_cat_lieu], ["Cân tồn Cắt liều", (r) => r.can_ton_cat_lieu]]
      : [["Kiểm kê VX", (r) => r.kiem_ke_vx], ["Kiểm kê VTYT", (r) => r.kiem_ke_vtyt], ["Kiểm kê VPKM", (r) => r.kiem_ke_vpkm]];
    const cols = [
      ["Vùng", (r) => r.vung, "text"],
      ["Mã shop", (r) => r.ma_shop, "text"],
      ["Tên shop", (r) => r.ten_shop, "text"],
      ["Số ngày gửi trễ", (r) => r.so_ngay_gui_tre || "", "text"],
      ["Ngày kiểm kê", (r) => r.ngay_kiem_ke, "text"],
      ...numCols.map(([label, get]) => [label, get, "number"]),
      ["Lũy Kế", (r) => r.luy_ke, "number"],
      ["Ước tính truy thu", (r) => tinhUocTinhTruyThu(r), "number"],
      ["Truy thu thanh lý", (r) => r.truy_thu_thanh_ly, "number"],
      ["NV kiểm kê", (r) => r.nv_kiem_ke, "text"],
    ];
    setExportBusy(true);
    try {
      await thongKeKiemKeExport({
        period, nhom,
        columns: cols.map(([label, , type]) => ({ label, type })),
        rows: displayRows.map((r) => cols.map(([, get]) => get(r) ?? null)),
      });
    } catch (e) {
      alert("❌ " + e.message);
    } finally {
      setExportBusy(false);
    }
  }

  if (!checked) return null;

  return (
    <Layout crumb="Thống kê Kiểm Kê">
      <div className="page-head">
        <h1>📊 Thống kê Kiểm Kê</h1>
        <p>Các shop đã kiểm theo từng tháng (Long Châu và Vaccine). Bấm tiêu đề cột để sắp xếp, có thể xuất Excel.</p>
      </div>
      {info && (
        <div style={{ fontSize: 13.5, margin: "0 2px 12px" }}>
          Vùng của bạn: <strong>{info.vung || "chưa được gán"}</strong>
          {info.gioi_han && <span style={{ color: "var(--text-600)" }}> — chỉ xem và tải được shop thuộc vùng này.</span>}
        </div>
      )}

      {error && <div className="placeholder-box" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{error}</div>}
      {!error && periods.length === 0 && <div className="placeholder-box">Chưa có dữ liệu kiểm kê nào.</div>}

      {periods.length > 0 && (
        <div className="month-tabs" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
          {periods.map((p) => (
            <div key={p} className={`month-tab ${p === period ? "active" : ""}`} onClick={() => setPeriod(p)}>{p}</div>
          ))}
        </div>
      )}

      {period && (
        <div className="card">
          <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {NHOM_TABS.map((t) => (
                <div key={t.key} className={`month-tab ${nhom === t.key ? "active" : ""}`} onClick={() => setNhom(t.key)}>
                  {t.label} ({countBy(t.key)})
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="Tìm Mã shop / Tên shop"
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setSearchQuery(e.target.value.trim().toLowerCase()); }}
                style={{ padding: "7px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, width: 220 }}
              />
              <span className="note">
                {searchQuery ? `${displayRows.length}/${groupRows.length} shop (đang lọc)` : `${groupRows.length} shop`}
              </span>
              <button
                onClick={handleExport}
                disabled={exportBusy || displayRows.length === 0}
                style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--navy-800)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: exportBusy || displayRows.length === 0 ? 0.6 : 1 }}
                title="Xuất đúng dữ liệu đang hiển thị (đã lọc + sắp xếp) ra file Excel"
              >
                {exportBusy ? "Đang xuất..." : "📊 Xuất Excel"}
              </button>
            </div>
          </div>
          <div className="card-body" style={{ overflowX: "auto" }}>
            {loading && <div style={{ fontSize: 13, color: "var(--text-400)", marginBottom: 8 }}>Đang tải...</div>}
            <table style={{ minWidth: 1250 }}>
              <thead>
                <tr>
                  <SortTh label="Vùng" sortCol="vung" />
                  <SortTh label="Tên shop" sortCol="ten_shop" />
                  <SortTh label="Ngày kiểm kê" sortCol="ngay_kiem_ke" />
                  {nhom === "long_chau" ? (
                    <>
                      <SortTh label={["Kiểm kê", "Non CL"]} sortCol="gia_tri_non_cl" />
                      <SortTh label={["Cân tồn", "Non CL"]} sortCol="can_ton_non_cl" />
                      <SortTh label={["Kiểm kê", "Cắt liều"]} sortCol="gia_tri_cat_lieu" />
                      <SortTh label={["Cân tồn", "Cắt liều"]} sortCol="can_ton_cat_lieu" />
                    </>
                  ) : (
                    <>
                      <SortTh label="Kiểm kê VX" sortCol="kiem_ke_vx" />
                      <SortTh label="Kiểm kê VTYT" sortCol="kiem_ke_vtyt" />
                      <SortTh label="Kiểm kê VPKM" sortCol="kiem_ke_vpkm" />
                    </>
                  )}
                  <SortTh label="Lũy Kế" sortCol="luy_ke" />
                  <SortTh label={["Ước tính", "truy thu"]} sortCol="uoc_tinh_truy_thu" />
                  <SortTh label={["Truy thu", "thanh lý"]} sortCol="truy_thu_thanh_ly" />
                  <SortTh label="NV kiểm kê" sortCol="nv_kiem_ke" />
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{r.vung}</td>
                    <td style={{ textAlign: "left", minWidth: 280, color: r.so_ngay_gui_tre ? "var(--danger)" : undefined, fontWeight: r.so_ngay_gui_tre ? 700 : undefined }}>
                      {r.ma_shop}{r.ten_shop ? ` - ${r.ten_shop}` : ""}
                      {r.so_ngay_gui_tre ? ` - gửi trễ ${r.so_ngay_gui_tre} ngày` : ""}
                    </td>
                    <td>{r.ngay_kiem_ke || "-"}</td>
                    {nhom === "long_chau" ? (
                      <>
                        <td className="num" style={moneyStyle(r.gia_tri_non_cl)}>{fmtMoney(r.gia_tri_non_cl)}</td>
                        <td className="num" style={moneyStyle(r.can_ton_non_cl)}>{fmtMoney(r.can_ton_non_cl)}</td>
                        <td className="num" style={moneyStyle(r.gia_tri_cat_lieu)}>{fmtMoney(r.gia_tri_cat_lieu)}</td>
                        <td className="num" style={moneyStyle(r.can_ton_cat_lieu)}>{fmtMoney(r.can_ton_cat_lieu)}</td>
                      </>
                    ) : (
                      <>
                        <td className="num" style={moneyStyle(r.kiem_ke_vx)}>{fmtMoney(r.kiem_ke_vx)}</td>
                        <td className="num" style={moneyStyle(r.kiem_ke_vtyt)}>{fmtMoney(r.kiem_ke_vtyt)}</td>
                        <td className="num" style={moneyStyle(r.kiem_ke_vpkm)}>{fmtMoney(r.kiem_ke_vpkm)}</td>
                      </>
                    )}
                    <td className="num" style={moneyStyle(r.luy_ke)}>{fmtMoney(r.luy_ke)}</td>
                    <td className="num" style={moneyStyle(tinhUocTinhTruyThu(r))}>{fmtMoney(tinhUocTinhTruyThu(r))}</td>
                    <td className="num" style={moneyStyle(r.truy_thu_thanh_ly)}>{fmtMoney(r.truy_thu_thanh_ly)}</td>
                    <td>{r.nv_kiem_ke || "-"}</td>
                  </tr>
                ))}
                {!loading && displayRows.length === 0 && (
                  <tr><td colSpan={nhom === "long_chau" ? 11 : 10} style={{ textAlign: "center", color: "var(--text-400)" }}>
                    {searchQuery ? "Không tìm thấy shop nào khớp" : "Không có shop nào trong tháng này"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}
