import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import ColumnMultiFilter from "../components/ColumnMultiFilter";
import FilterHeaderTh from "../components/FilterHeaderTh";
import { getUser, xknkEhoFilters, xknkEhoRows, xknkEhoExportStart, xknkEhoExportStatus, xknkEhoExportDownload } from "../lib/api";

// Menu "Xuất Khác - Nhập Khác EHO" (chốt 26/10; mở cho admin 27/10) — admin + super_admin. Toàn bộ giao dịch Nhập khác / Xuất khác kéo từ EHO
// về theo tháng. Việc ĐỒNG BỘ làm chung ở nút "Đồng bộ dữ liệu EHO" ở Trang chủ (components/EhoSyncModal.js, chốt 27/10) — trang này chỉ xem/lọc/xuất Excel.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pad = (n) => String(n).padStart(2, "0");
// Mặc định Ngày tạo từ - đến = đầu tháng -> cuối tháng hiện tại (chốt 30/10: bỏ bộ lọc tháng, chỉ còn lọc theo ngày)
function defaultRange() {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}` };
}
function fmtDT(iso) {
  if (!iso) return "-";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : iso;
}
function fmtNum(n) {
  return n === null || n === undefined ? "-" : Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}
const STATUS_COLOR = { "Hoàn tất": ["#E6F6E1", "#2f6b1a"], "Đã hủy": ["#FDE8E8", "#B42318"], "Chờ kiểm": ["#FFF4D6", "#8a5a00"] };

export default function XknkEhoPage() {
  const [checked, setChecked] = useState(false);

  // ---- Xem dữ liệu ----
  const [opts, setOpts] = useState({ loai_yeu_cau: [], trang_thai: [], loai_phieu: [], shop: [], kho: [], don_vi: [], nguoi_tao: [] });
  // Bộ lọc: q = ô tìm Mã phiếu/SKU/Tên SP; các mảng = giá trị được tick ở nút lọc đầu cột (mảng rỗng = tất cả)
  const RANGE0 = defaultRange();
  const F0 = { q: "", product: "", date_from: RANGE0.from, date_to: RANGE0.to, source_types: "", status_names: [], gri_types: [], shop_codes: [], whs_names: [], unit_names: [], creators: [] };
  const [f, setF] = useState(F0);
  const [colSel, setColSel] = useState({}); // { cột: Set nhãn được tick } — bộ lọc ở tiêu đề cột (còn lại: Trạng thái, Loại phiếu, Đơn vị tính, Người tạo); cột không có = tất cả
  // Ô tìm kiếm phía trên (chốt 30/10): vào menu KHÔNG tự tải dữ liệu — chọn điều kiện rồi bấm "Tìm kiếm" (không chọn gì = cả tháng hiện tại)
  const FORM0 = { shop: null, kho: null, loai_yc: null, product: "", from: RANGE0.from, to: RANGE0.to, q: "" };
  const [form, setForm] = useState(FORM0);
  const [searched, setSearched] = useState(false);
  const [searchTick, setSearchTick] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [data, setData] = useState({ total: 0, rows: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [gotoInput, setGotoInput] = useState("");
  const [exp, setExp] = useState(null); // {phase, done, total} khi đang tạo file Excel
  const [expMsg, setExpMsg] = useState(null);

  useEffect(() => {
    const u = getUser();
    if (!u || !["admin", "super_admin"].includes(u.role)) {
      window.location.replace("/");
      return;
    }
    setChecked(true);
    xknkEhoFilters("").then(setOpts).catch(() => {});
  }, []);

  // Nút lọc tick nhiều giá trị ở đầu cột (chốt 27/10; lọc ở server vì tháng có hàng trăm nghìn dòng). Mỗi cột:
  //   label(o) = chữ hiện trong danh sách; code(o) = giá trị gửi lên server; param = tên tham số; none = giá trị "không chọn gì"
  const COLS = {
    status: { optsKey: "trang_thai", label: (o) => o.ten, code: (o) => o.ten, param: "status_names", none: "__none__" },
    loai_phieu: { optsKey: "loai_phieu", label: (o) => o.ten, code: (o) => o.ma, param: "gri_types", none: 0 },
    loai_yc: { optsKey: "loai_yeu_cau", label: (o) => o.ten || `Loại yêu cầu ${o.ma}`, code: (o) => o.ma, param: "source_types", none: "0", csv: true, menu: 340 },
    shop: { optsKey: "shop", label: (o) => (o.ten ? `${o.ma} - ${o.ten}` : o.ma), code: (o) => o.ma, param: "shop_codes", none: "__none__", menu: 380 },
    kho: { optsKey: "kho", label: (o) => o.ten, code: (o) => o.ma, param: "whs_names", none: "__none__" },
    don_vi: { optsKey: "don_vi", label: (o) => o.ten, code: (o) => o.ten, param: "unit_names", none: "__none__" },
    nguoi_tao: { optsKey: "nguoi_tao", label: (o) => o.ten, code: (o) => o.ten, param: "creators", none: "__none__", menu: 300 },
  };
  const colOptions = (key) => (opts[COLS[key].optsKey] || []).map((o) => ({ value: COLS[key].label(o), count: o.so_dong }));
  function paramOf(key, set) { // set = Set nhãn được tick, hoặc null = tất cả -> giá trị gửi lên server
    const c = COLS[key];
    if (!set) return c.csv ? "" : [];
    if (set.size === 0) return c.csv ? c.none : [c.none];
    const codes = (opts[c.optsKey] || []).filter((o) => set.has(c.label(o))).map((o) => c.code(o));
    return c.csv ? codes.join(",") : codes;
  }
  function setColFilter(key, set) { // bộ lọc ở tiêu đề cột: áp dụng ngay (bảng chỉ hiện sau khi đã bấm Tìm kiếm)
    setColSel((o) => { const n = { ...o }; if (set) n[key] = set; else delete n[key]; return n; });
    setF((o) => ({ ...o, [COLS[key].param]: paramOf(key, set) }));
    setPage(1);
  }
  const colFilterActive = Object.keys(colSel).length > 0;
  function clearColFilters() {
    setColSel({});
    setF((o) => ({ ...o, status_names: [], gri_types: [], unit_names: [], creators: [] }));
    setPage(1);
  }
  const setFormKey = (k, v) => setForm((o) => ({ ...o, [k]: v }));
  function doSearch() {
    if (form.from && form.to && form.from > form.to) { setError("Từ ngày phải trước hoặc bằng Đến ngày."); return; }
    setError("");
    setF((o) => ({
      ...o, q: form.q.trim(), product: form.product.trim(), date_from: form.from, date_to: form.to,
      shop_codes: paramOf("shop", form.shop), whs_names: paramOf("kho", form.kho), source_types: paramOf("loai_yc", form.loai_yc),
    }));
    setPage(1);
    setSearched(true);
    setSearchTick((t) => t + 1);
  }
  function resetSearch() { // bấm Xóa: về trạng thái chưa tìm (ngày về lại cả tháng hiện tại)
    setForm(FORM0); setColSel({}); setF(F0); setPage(1); setSearched(false); setData({ total: 0, rows: [] }); setError("");
  }
  const filterBtn = (key) => <ColumnMultiFilter compact options={colOptions(key)} selected={colSel[key] || null} onChange={(set) => setColFilter(key, set)} menuWidth={COLS[key].menu || 300} />;
  const formFilter = (key, width) => <ColumnMultiFilter options={colOptions(key)} selected={form[key]} onChange={(set) => setFormKey(key, set)} width={width} menuWidth={COLS[key].menu || 300} />;

  // Chỉ tải dữ liệu SAU KHI bấm "Tìm kiếm" (searchTick đổi); sau đó đổi trang / bộ lọc ở tiêu đề cột thì tải lại ngay
  useEffect(() => {
    if (!searched) return;
    setLoading(true);
    setError("");
    xknkEhoRows({ ...f, page, page_size: pageSize })
      .then(setData)
      .catch((err) => { setError(err.message); setData({ total: 0, rows: [] }); })
      .finally(() => setLoading(false));
  }, [f, page, pageSize, searched, searchTick]);

  // Xuất Excel đúng kết quả tìm kiếm (kèm bộ lọc đang áp dụng)
  async function exportExcel() {
    if (exp) return;
    setExpMsg(null);
    setExp({ phase: "building", done: 0, total: data.total || 0 });
    try {
      const { job_id } = await xknkEhoExportStart({ ...f });
      while (true) {
        await sleep(2000);
        const st = await xknkEhoExportStatus(job_id);
        if (st.status === "error") throw new Error(st.error || "Tạo file Excel thất bại");
        setExp({ phase: st.phase, done: st.done, total: st.total });
        if (st.status === "done") break;
      }
      setExp((o) => ({ ...o, phase: "downloading" }));
      await xknkEhoExportDownload(job_id);
      setExpMsg({ type: "ok", text: "✅ Đã xuất Excel kết quả tìm kiếm." });
    } catch (e) {
      setExpMsg({ type: "err", text: e.message || "Xuất Excel thất bại" });
    } finally {
      setExp(null);
    }
  }

  if (!checked) return null;
  const totalPages = Math.max(1, Math.ceil((data.total || 0) / pageSize));
  const pageNums = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) pageNums.push(p);

  return (
    <Layout crumb="Xuất Khác - Nhập Khác EHO">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>🧾 Xuất Khác - Nhập Khác EHO</h1>
          <p>Toàn bộ giao dịch Nhập khác / Xuất khác kéo từ EHO về (menu thử nghiệm — Admin và Super Admin). Đồng bộ dữ liệu: nút "Đồng bộ dữ liệu EHO" ở Trang chủ.</p>
        </div>
      </div>

      {/* ------- Dữ liệu ------- */}
      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
          <h3>Dữ liệu</h3>
        </div>
        <div className="card-body" style={{ padding: "12px 16px" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12, padding: "12px 14px", background: "#F7FAFF", border: "1px solid var(--border)", borderRadius: 8 }}
            onKeyDown={(e) => { if (e.key === "Enter" && e.target.tagName === "INPUT" && !String(e.target.placeholder).startsWith("Tìm trong danh sách")) doSearch(); }}>
            <div><label style={lbl}>Shop</label>{formFilter("shop", 230)}</div>
            <div><label style={lbl}>Loại kho</label>{formFilter("kho", 170)}</div>
            <div><label style={lbl}>Loại yêu cầu</label>{formFilter("loai_yc", 230)}</div>
            <div><label style={lbl}>Sản phẩm (mã sản phẩm)</label>
              <input className="finput" placeholder="VD 00050118 (nhiều mã: cách nhau dấu phẩy)" value={form.product} onChange={(e) => setFormKey("product", e.target.value)} style={{ width: 260 }} />
            </div>
            <div><label style={lbl}>Mã phiếu</label>
              <input className="finput" placeholder="GR… / GI…" value={form.q} onChange={(e) => setFormKey("q", e.target.value)} style={{ width: 140 }} />
            </div>
            <div><label style={lbl}>Ngày tạo từ ngày</label>
              <input type="date" className="finput" value={form.from} onChange={(e) => setFormKey("from", e.target.value)} />
            </div>
            <div><label style={lbl}>Đến ngày</label>
              <input type="date" className="finput" value={form.to} onChange={(e) => setFormKey("to", e.target.value)} />
            </div>
            <button className="login-btn" style={{ width: "auto", padding: "8px 22px", opacity: loading ? 0.6 : 1 }} disabled={loading} onClick={doSearch}>{loading ? "Đang tìm..." : "🔍 Tìm kiếm"}</button>
            <button className="fbtn" onClick={resetSearch} disabled={loading}>Xóa</button>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
            {colFilterActive && <button className="fbtn" onClick={clearColFilters}>✕ Bỏ lọc cột</button>}
            <span style={{ fontSize: 12.5, color: "var(--text-600)" }}>{!searched ? "Chọn điều kiện rồi bấm Tìm kiếm (mặc định Ngày tạo là cả tháng hiện tại)" : loading ? "Đang tải..." : `${(data.total || 0).toLocaleString("vi-VN")} dòng`}</span>
            <button className="fbtn" style={{ marginLeft: "auto" }} disabled={!!exp || !searched || !(data.total > 0)} onClick={exportExcel}
              title="Xuất toàn bộ kết quả tìm kiếm (theo bộ lọc hiện tại) ra file Excel">
              {exp ? (exp.phase === "saving" ? "Đang đóng gói file..." : exp.phase === "downloading" ? "Đang tải về..." : `Đang tạo file... ${(exp.done || 0).toLocaleString("vi-VN")}/${(exp.total || 0).toLocaleString("vi-VN")}`) : "📥 Xuất Excel"}
            </button>
          </div>

          {expMsg && (
            <div style={{ marginBottom: 10, border: "1px solid", borderColor: expMsg.type === "ok" ? "#4C9A2A" : "var(--danger)", color: expMsg.type === "ok" ? "#2f6b1a" : "var(--danger)", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>{expMsg.text}</div>
          )}
          {error && <div className="placeholder-box" style={{ color: "var(--danger)" }}>{error}</div>}

          {!searched ? (
            <div className="placeholder-box" style={{ textAlign: "center", color: "var(--text-400)" }}>Chưa tìm kiếm — chọn điều kiện ở trên rồi bấm <b>Tìm kiếm</b> để xem dữ liệu.</div>
          ) : (<>
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 1700, fontSize: 12.5 }}>
              <thead>
                <tr>
                  {[["STT"], ["Trạng thái", "status"], ["Mã phiếu"], ["Loại phiếu", "loai_phieu"], ["Loại yêu cầu"], ["Shop"], ["Kho"], ["Sản phẩm"], ["Số lô - HSD"], ["Số lượng"], ["Đơn vị tính", "don_vi"], ["Ngày tạo phiếu"], ["Người tạo phiếu", "nguoi_tao"], ["Ghi chú"]].map(([h, key]) => (
                    <FilterHeaderTh key={h} label={h} filter={key ? filterBtn(key) : null} style={{ fontSize: 10.5, paddingTop: 8, paddingBottom: 8, paddingLeft: key ? 24 : 8, paddingRight: key ? 26 : 8 }} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && !loading && (
                  <tr><td colSpan={16} style={{ textAlign: "center", color: "var(--text-400)" }}>"Không có dòng nào khớp."</td></tr>
                )}
                {data.rows.map((r, i) => {
                  const sc = STATUS_COLOR[r.status_name] || ["#EEF1F6", "#44506b"];
                  return (
                    <tr key={r.item_id}>
                      <td>{(page - 1) * pageSize + i + 1}</td>
                      <td><span style={{ background: sc[0], color: sc[1], borderRadius: 10, padding: "2px 9px", fontWeight: 600, whiteSpace: "nowrap" }}>{r.status_name || "-"}</span></td>
                      <td style={{ whiteSpace: "nowrap", color: "var(--blue-accent, #2F6FED)", fontWeight: 600 }}>{r.code}</td>
                      <td><span style={{ background: r.gri_type === 2 ? "#FDE8E8" : "#E3F0FF", color: r.gri_type === 2 ? "#B42318" : "#1B5FB5", borderRadius: 10, padding: "2px 9px", fontWeight: 600, whiteSpace: "nowrap" }}>{r.gri_type_name || "-"}</span></td>
                      <td style={{ textAlign: "left" }}>{r.source_type_name || "-"}</td>
                      <td style={{ textAlign: "left" }}>{r.shop_code}{r.shop_name ? ` - ${r.shop_name}` : ""}</td>
                      <td style={{ textAlign: "left" }}>{r.whs_code}{r.whs_name ? ` - ${r.whs_name}` : ""}</td>
                      <td style={{ textAlign: "left" }}>{r.sku}{r.sku_name ? ` - ${r.sku_name}` : ""}</td>
                      <td>{[r.lot_number, r.expire_date ? String(r.expire_date).slice(0, 10) : ""].filter(Boolean).join(" - ") || "-"}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtNum(r.quantity)}</td>
                      <td>{r.unit_name || "-"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtDT(r.creation_time)}</td>
                      <td style={{ textAlign: "left" }}>{r.created_by_name || "-"}</td>
                      <td style={{ textAlign: "left" }}>{r.description || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", marginTop: 12, fontSize: 12.5 }}>
            <span>Số dòng/trang</span>
            <select className="finput" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ width: 80 }}>
              {[20, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="fbtn" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
            {pageNums[0] > 1 && <span>…</span>}
            {pageNums.map((p) => (
              <button key={p} className="fbtn" style={p === page ? { background: "var(--navy-800)", color: "#fff" } : undefined} onClick={() => setPage(p)}>{p}</button>
            ))}
            {pageNums[pageNums.length - 1] < totalPages && <span>… {totalPages.toLocaleString("vi-VN")}</span>}
            <button className="fbtn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
            <span>Đi đến trang</span>
            <input className="finput" value={gotoInput} onChange={(e) => setGotoInput(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter" && gotoInput) { setPage(Math.min(totalPages, Math.max(1, Number(gotoInput)))); setGotoInput(""); } }} style={{ width: 60 }} />
          </div>
          </>)}
        </div>
      </div>
    </Layout>
  );
}

const lbl = { fontSize: 11.5, fontWeight: 600, color: "var(--text-600)", display: "block", marginBottom: 5 };
