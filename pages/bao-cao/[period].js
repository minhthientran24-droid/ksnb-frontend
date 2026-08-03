import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  BarChart, Bar, Cell, LabelList, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import Layout from "../../components/Layout";
import { getReport, listReports, updateReportKiemKe, getUser } from "../../lib/api";

export async function getStaticPaths() {
  return { paths: [], fallback: "blocking" };
}

export async function getStaticProps() {
  return { props: {} };
}

function fmtMoney(n) {
  if (n === undefined || n === null) return "-";
  return n.toLocaleString("vi-VN");
}

// ---- Helpers để đọc/ghi theo path lồng nhau trong object JSON, dùng cho chế độ "Sửa nhanh" ----
function getPath(obj, path) {
  return path.reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);
}

function numOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const cleaned = String(v).replace(/[^\d-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? null : n;
}

const MONTH_COLORS = ["#8B93A5", "#F5821F", "#3E7FD1"];
const REGION_COLORS = ["#3E7FD1", "#F5821F", "#7AC142", "#D64545", "#9B59B6", "#16A5A5", "#E4B62F", "#5580D6"];

// Ô hiển thị/sửa dùng chung cho bảng — đặt NGOÀI component chính, tránh bị
// tạo lại (remount) mỗi lần render khiến input mất focus lúc đang gõ.
function EditableTd({ kk, editMode, setValue, path, className, style, isText }) {
  const value = getPath(kk, path);
  if (!editMode) {
    return <td className={className} style={style}>{isText ? (value ?? "-") : fmtMoney(value)}</td>;
  }
  return (
    <td className={className} style={style}>
      <input
        className="editing-cell"
        value={value === null || value === undefined ? "" : value}
        onChange={(e) => setValue(path, e.target.value)}
        style={editInputStyle}
      />
    </td>
  );
}

export default function BaoCaoDetailPage() {
  const router = useRouter();
  const { period } = router.query;
  const [report, setReport] = useState(null);
  const [allPeriods, setAllPeriods] = useState([]);
  const [tab, setTab] = useState("kiem-ke"); // "kiem-ke" | "chu-de"
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [draftKk, setDraftKk] = useState(null);
  const [saving, setSaving] = useState(false);
  const isAdmin = ["admin", "super_admin"].includes(getUser()?.role);

  useEffect(() => {
    listReports().then(setAllPeriods).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!period) return;
    getReport(period).then(setReport).catch((err) => setError(err.message));
  }, [period]);

  const savedKk = report?.report_kiem_ke || {};
  const kk = editMode ? draftKk : savedKk;
  const cd = report?.report_chu_de || {};

  function setValue(path, rawValue) {
    setDraftKk((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      let obj = next;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
      obj[path[path.length - 1]] = rawValue;
      return next;
    });
  }

  function startEdit() {
    setDraftKk(JSON.parse(JSON.stringify(savedKk)));
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
    setDraftKk(null);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      // Chuẩn hóa các trường số (đang lưu dạng chuỗi khi gõ) về số nguyên/null trước khi lưu
      const payload = JSON.parse(JSON.stringify(draftKk));
      payload.summary_kpi.shop_kiem_ke = numOrNull(payload.summary_kpi.shop_kiem_ke);
      payload.summary_kpi.tong_gia_tri_truy_thu = numOrNull(payload.summary_kpi.tong_gia_tri_truy_thu);
      ["region_stats"].forEach((key) => {
        (payload[key] || []).forEach((row) => {
          ["online", "truc_tiep", "total"].forEach((g) => {
            if (!row[g]) return;
            row[g].sl_shop = numOrNull(row[g].sl_shop);
            row[g].gia_tri = numOrNull(row[g].gia_tri);
            row[g].tb_shop = numOrNull(row[g].tb_shop);
          });
        });
      });
      if (payload.grand_total) {
        ["online", "truc_tiep", "total"].forEach((g) => {
          if (!payload.grand_total[g]) return;
          payload.grand_total[g].sl_shop = numOrNull(payload.grand_total[g].sl_shop);
          payload.grand_total[g].gia_tri = numOrNull(payload.grand_total[g].gia_tri);
          payload.grand_total[g].tb_shop = numOrNull(payload.grand_total[g].tb_shop);
        });
      }
      (payload.trend_tb_shop?.rows || []).forEach((row) => {
        row.values = row.values.map((v) => ({
          sl_shop: numOrNull(v.sl_shop), gia_tri: numOrNull(v.gia_tri), tb_shop: numOrNull(v.tb_shop),
        }));
      });
      if (payload.trend_tb_shop?.tong) {
        payload.trend_tb_shop.tong.values = payload.trend_tb_shop.tong.values.map((v) => ({
          sl_shop: numOrNull(v.sl_shop), gia_tri: numOrNull(v.gia_tri), tb_shop: numOrNull(v.tb_shop),
        }));
      }
      (payload.trend_truy_thu_nv?.rows || []).forEach((row) => {
        row.values = row.values.map((v) => numOrNull(v));
      });
      if (payload.trend_truy_thu_nv?.tb_toan_vung) {
        payload.trend_truy_thu_nv.tb_toan_vung = payload.trend_truy_thu_nv.tb_toan_vung.map((v) => numOrNull(v));
      }
      (payload.top_shops || []).forEach((row) => {
        row.gia_tri = numOrNull(row.gia_tri);
      });

      const updated = await updateReportKiemKe(period, payload);
      setReport(updated);
      setEditMode(false);
      setDraftKk(null);
    } catch (err) {
      alert(err.message || "Lưu báo cáo thất bại");
    } finally {
      setSaving(false);
    }
  }

  // Dữ liệu biểu đồ luôn lấy từ bản ĐÃ LƯU (savedKk) — biểu đồ chỉ cập nhật sau khi bấm Lưu
  const nvChartData = (savedKk.trend_truy_thu_nv?.rows || []).map((row) => {
    const item = { vung: row.vung };
    (savedKk.trend_truy_thu_nv?.thang_labels || []).forEach((label, i) => {
      item[label] = row.values?.[i] ?? 0;
    });
    return item;
  });

  const regionChartData = (savedKk.region_stats || []).map((row) => ({
    vung: row.vung,
    tb_shop_abs: Math.abs(row.total?.tb_shop ?? 0),
  }));

  const tbShopKpi = kk.grand_total?.total?.tb_shop;
  const nvLabels = kk.trend_truy_thu_nv?.thang_labels || [];
  const tbNvKpi = kk.trend_truy_thu_nv?.tb_toan_vung?.[nvLabels.length - 1];

  return (
    <Layout crumb={`Báo cáo tháng / ${report?.display_name || period || ""}`}>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1>{report?.display_name || "Đang tải..."}</h1>
          <p>Báo cáo tháng gồm 2 phần: Kiểm kê hàng hóa và Kiểm soát chủ đề.</p>
        </div>
        {isAdmin && tab === "kiem-ke" && report && (
          <div style={{ display: "flex", gap: 8 }}>
            {!editMode ? (
              <button onClick={startEdit} style={editToggleBtnStyle}>✏️ Sửa nhanh</button>
            ) : (
              <>
                <button onClick={saveEdit} disabled={saving} style={saveBtnStyle}>
                  {saving ? "Đang lưu..." : "💾 Lưu"}
                </button>
                <button onClick={cancelEdit} disabled={saving} style={cancelBtnStyle}>✖ Hủy</button>
              </>
            )}
          </div>
        )}
      </div>
      {editMode && (
        <div style={editBannerStyle}>
          Đang ở <strong>chế độ chỉnh sửa</strong> (chỉ Admin/Super Admin thấy được) — sửa số liệu bên dưới rồi bấm <strong>Lưu</strong>. Bấm <strong>Hủy</strong> để thoát mà không lưu.
        </div>
      )}

      {allPeriods.length > 0 && (
        <div className="month-tabs">
          {allPeriods.map((p) => (
            <div
              key={p.period_label}
              className={`month-tab ${p.period_label === period ? "active" : ""}`}
              onClick={() => !editMode && router.push(`/bao-cao/${p.period_label}`)}
            >
              {p.display_name}
            </div>
          ))}
        </div>
      )}

      {error && <div className="placeholder-box">Không tải được báo cáo: {error}</div>}

      {report && (
        <>
          <div className="month-tabs">
            <div className={`month-tab ${tab === "kiem-ke" ? "active" : ""}`} onClick={() => !editMode && setTab("kiem-ke")}>
              📦 Báo cáo kiểm kê
            </div>
            <div className={`month-tab ${tab === "chu-de" ? "active" : ""}`} onClick={() => !editMode && setTab("chu-de")}>
              🗂️ Báo cáo kiểm soát theo chủ đề{cd.ten_chu_de ? `: ${cd.ten_chu_de}` : ""}
            </div>
          </div>

          {/* ================= TAB: BÁO CÁO KIỂM KÊ ================= */}
          {tab === "kiem-ke" && (
            <>
              {kk.ky_kiem_ke && (
                <p style={{ fontSize: 13, color: "var(--text-600)", marginBottom: 16 }}>
                  Kỳ kiểm kê: <strong>{kk.ky_kiem_ke}</strong>
                </p>
              )}

              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="accent b"></div>
                  <span className="tag">Shop kiểm kê</span>
                  {editMode ? (
                    <input className="editing-cell" style={editKpiInputStyle}
                      value={kk.summary_kpi?.shop_kiem_ke ?? ""}
                      onChange={(e) => setValue(["summary_kpi", "shop_kiem_ke"], e.target.value)} />
                  ) : (
                    <div className="val">{fmtMoney(kk.summary_kpi?.shop_kiem_ke)}</div>
                  )}
                </div>
                <div className="kpi-card">
                  <div className="accent r"></div>
                  <span className="tag">Tổng giá trị truy thu</span>
                  {editMode ? (
                    <input className="editing-cell" style={editKpiInputStyle}
                      value={kk.summary_kpi?.tong_gia_tri_truy_thu ?? ""}
                      onChange={(e) => setValue(["summary_kpi", "tong_gia_tri_truy_thu"], e.target.value)} />
                  ) : (
                    <div className="val">{fmtMoney(kk.summary_kpi?.tong_gia_tri_truy_thu)}</div>
                  )}
                </div>
                <div className="kpi-card">
                  <div className="accent o"></div>
                  <span className="tag">Giá trị TB / Shop</span>
                  {editMode ? (
                    <input className="editing-cell" style={editKpiInputStyle}
                      value={kk.grand_total?.total?.tb_shop ?? ""}
                      onChange={(e) => setValue(["grand_total", "total", "tb_shop"], e.target.value)} />
                  ) : (
                    <div className="val">{fmtMoney(tbShopKpi)}</div>
                  )}
                </div>
                <div className="kpi-card">
                  <div className="accent g"></div>
                  <span className="tag">TB Truy Thu / Nhân Viên</span>
                  {editMode ? (
                    <input className="editing-cell" style={editKpiInputStyle}
                      value={kk.trend_truy_thu_nv?.tb_toan_vung?.[nvLabels.length - 1] ?? ""}
                      onChange={(e) => setValue(["trend_truy_thu_nv", "tb_toan_vung", nvLabels.length - 1], e.target.value)} />
                  ) : (
                    <div className="val">{fmtMoney(tbNvKpi)}</div>
                  )}
                </div>
              </div>

              {/* ---- 1. Thống kê giá trị truy thu trong tháng ---- */}
              <div className="card">
                <div className="card-head"><h3>1. Thống kê giá trị truy thu trong tháng</h3></div>
                <div className="card-body" style={{ overflowX: "auto" }}>
                  {(kk.region_stats || []).length > 0 ? (
                    <table>
                      <thead>
                        <tr>
                          <th rowSpan={2} style={{ verticalAlign: "middle" }}>Vùng</th>
                          <th colSpan={3}>Kiểm kê Online</th>
                          <th colSpan={3}>Kiểm kê Trực tiếp</th>
                          <th colSpan={3}>Total</th>
                        </tr>
                        <tr>
                          <th>SL Shop</th><th>Giá trị</th><th>TB/shop</th>
                          <th>SL Shop</th><th>Giá trị</th><th>TB/shop</th>
                          <th>SL Shop</th><th>Giá trị</th><th>TB/shop</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kk.region_stats.map((row, i) => (
                          <tr key={i}>
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["region_stats", i, "vung"]} isText style={{ textAlign: "left" }} />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["region_stats", i, "online", "sl_shop"]} className="num" />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["region_stats", i, "online", "gia_tri"]} className="num neg" />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["region_stats", i, "online", "tb_shop"]} className="num" />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["region_stats", i, "truc_tiep", "sl_shop"]} className="num" />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["region_stats", i, "truc_tiep", "gia_tri"]} className="num neg" />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["region_stats", i, "truc_tiep", "tb_shop"]} className="num" />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["region_stats", i, "total", "sl_shop"]} className="num" style={{ fontWeight: 700 }} />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["region_stats", i, "total", "gia_tri"]} className="num neg" style={{ fontWeight: 700 }} />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["region_stats", i, "total", "tb_shop"]} className="num" style={{ fontWeight: 700 }} />
                          </tr>
                        ))}
                        {kk.grand_total && (
                          <tr style={{ background: "#F8FAFD", fontWeight: 700 }}>
                            <td style={{ textAlign: "left" }}>Grand Total</td>
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["grand_total", "online", "sl_shop"]} className="num" />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["grand_total", "online", "gia_tri"]} className="num neg" />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["grand_total", "online", "tb_shop"]} className="num" />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["grand_total", "truc_tiep", "sl_shop"]} className="num" />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["grand_total", "truc_tiep", "gia_tri"]} className="num neg" />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["grand_total", "truc_tiep", "tb_shop"]} className="num" />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["grand_total", "total", "sl_shop"]} className="num" />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["grand_total", "total", "gia_tri"]} className="num neg" />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["grand_total", "total", "tb_shop"]} className="num" />
                          </tr>
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <div className="placeholder-box">Chưa có dữ liệu thống kê theo vùng</div>
                  )}
                </div>
              </div>

              {regionChartData.length > 0 && (
                <div className="card">
                  <div className="card-head"><h3>Biểu đồ giá trị truy thu trung bình/shop theo vùng</h3></div>
                  <div className="card-body" style={{ height: 416 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={regionChartData} barCategoryGap="65%" margin={{ top: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F6" />
                        <XAxis dataKey="vung" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <Tooltip formatter={(v) => fmtMoney(v) + " đ"} />
                        <Bar dataKey="tb_shop_abs" radius={[4, 4, 0, 0]}>
                          {regionChartData.map((_, i) => (
                            <Cell key={i} fill={REGION_COLORS[i % REGION_COLORS.length]} />
                          ))}
                          <LabelList dataKey="tb_shop_abs" position="top" formatter={(v) => fmtMoney(v)} style={{ fontSize: 11, fontWeight: 700, fill: "#182338" }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ---- 2. Giá trị truy thu trung bình shop (3 tháng gần nhất) ---- */}
              <div className="card">
                <div className="card-head"><h3>2. Giá trị truy thu trung bình shop (3 tháng gần nhất)</h3></div>
                <div className="card-body" style={{ overflowX: "auto" }}>
                  {kk.trend_tb_shop?.rows?.length > 0 ? (
                    <table>
                      <thead>
                        <tr>
                          <th rowSpan={2} style={{ verticalAlign: "middle" }}>Vùng</th>
                          {kk.trend_tb_shop.thang_labels.map((label, li) => (
                            editMode ? (
                              <th key={li} colSpan={3}>
                                <input className="editing-cell" style={editThInputStyle} value={label}
                                  onChange={(e) => setValue(["trend_tb_shop", "thang_labels", li], e.target.value)} />
                              </th>
                            ) : <th key={li} colSpan={3}>{label}</th>
                          ))}
                        </tr>
                        <tr>
                          {kk.trend_tb_shop.thang_labels.map((label, li) => (
                            <Fragment key={li}>
                              <th>SL Shop</th>
                              <th>Giá trị</th>
                              <th>TB/shop</th>
                            </Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {kk.trend_tb_shop.rows.map((row, i) => (
                          <tr key={i}>
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["trend_tb_shop", "rows", i, "vung"]} isText style={{ textAlign: "left" }} />
                            {row.values.map((v, j) => (
                              <Fragment key={j}>
                                <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["trend_tb_shop", "rows", i, "values", j, "sl_shop"]} className="num" />
                                <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["trend_tb_shop", "rows", i, "values", j, "gia_tri"]} className="num neg" />
                                <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["trend_tb_shop", "rows", i, "values", j, "tb_shop"]} className="num" />
                              </Fragment>
                            ))}
                          </tr>
                        ))}
                        {kk.trend_tb_shop.tong && (
                          <tr style={{ background: "#F8FAFD", fontWeight: 700 }}>
                            <td style={{ textAlign: "left" }}>Tổng số</td>
                            {kk.trend_tb_shop.tong.values.map((v, j) => (
                              <Fragment key={j}>
                                <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["trend_tb_shop", "tong", "values", j, "sl_shop"]} className="num" />
                                <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["trend_tb_shop", "tong", "values", j, "gia_tri"]} className="num neg" />
                                <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["trend_tb_shop", "tong", "values", j, "tb_shop"]} className="num" />
                              </Fragment>
                            ))}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <div className="placeholder-box">Chưa có dữ liệu 3 tháng gần nhất</div>
                  )}
                </div>
              </div>

              {/* ---- 3. Truy thu trung bình nhân viên ---- */}
              <div className="card">
                <div className="card-head"><h3>3. Thống kê truy thu trung bình nhân viên</h3></div>
                {kk.trend_truy_thu_nv?.rows?.length > 0 ? (
                  <>
                    <div className="card-body" style={{ overflowX: "auto" }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Vùng</th>
                            {kk.trend_truy_thu_nv.thang_labels.map((label, li) => (
                              editMode ? (
                                <th key={li}>
                                  <input className="editing-cell" style={editThInputStyle} value={label}
                                    onChange={(e) => setValue(["trend_truy_thu_nv", "thang_labels", li], e.target.value)} />
                                </th>
                              ) : <th key={li}>{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {kk.trend_truy_thu_nv.rows.map((row, i) => (
                            <tr key={i}>
                              <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["trend_truy_thu_nv", "rows", i, "vung"]} isText style={{ textAlign: "left" }} />
                              {row.values.map((v, j) => (
                                <EditableTd kk={kk} editMode={editMode} setValue={setValue} key={j} path={["trend_truy_thu_nv", "rows", i, "values", j]} className="num" />
                              ))}
                            </tr>
                          ))}
                          {kk.trend_truy_thu_nv.tb_toan_vung && (
                            <tr style={{ background: "#F8FAFD", fontWeight: 700 }}>
                              <td style={{ textAlign: "left" }}>TB Toàn Vùng</td>
                              {kk.trend_truy_thu_nv.tb_toan_vung.map((v, j) => (
                                <EditableTd kk={kk} editMode={editMode} setValue={setValue} key={j} path={["trend_truy_thu_nv", "tb_toan_vung", j]} className="num" />
                              ))}
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="card-body" style={{ padding: "16px 20px", height: 432 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={nvChartData} margin={{ top: 24 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F6" />
                          <XAxis dataKey="vung" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                          <Tooltip formatter={(v) => fmtMoney(v) + " đ"} />
                          <Legend />
                          {(savedKk.trend_truy_thu_nv?.thang_labels || []).map((label, i) => (
                            <Bar key={label} dataKey={label} fill={MONTH_COLORS[i % MONTH_COLORS.length]} radius={[3, 3, 0, 0]}>
                              <LabelList dataKey={label} position="top" formatter={(v) => Math.floor(v / 1000)} style={{ fontSize: 9.5, fontWeight: 700, fill: "#182338" }} />
                            </Bar>
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <div className="card-body"><div className="placeholder-box">Chưa có dữ liệu truy thu trung bình nhân viên</div></div>
                )}
              </div>

              {/* ---- 4. Top shop truy thu cao nhất ---- */}
              <div className="card">
                <div className="card-head"><h3>4. Top shop truy thu cao nhất trong tháng</h3></div>
                <div className="card-body">
                  {(kk.top_shops || []).length > 0 ? (
                    <table>
                      <colgroup>
                        <col style={{ width: 120 }} />
                        <col style={{ width: 481 }} />
                        <col style={{ width: 182 }} />
                        <col style={{ width: 120 }} />
                        <col />
                      </colgroup>
                      <thead>
                        <tr><th>Mã shop</th><th>Tên shop</th><th>Vùng</th><th>Giá trị</th><th>Lý do</th></tr>
                      </thead>
                      <tbody>
                        {kk.top_shops.map((row, i) => (
                          <tr key={i}>
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["top_shops", i, "ma_shop"]} isText />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["top_shops", i, "ten_shop"]} isText style={{ textAlign: "left" }} />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["top_shops", i, "vung"]} isText style={{ textAlign: "left" }} />
                            <EditableTd kk={kk} editMode={editMode} setValue={setValue} path={["top_shops", i, "gia_tri"]} className="num neg" style={{ whiteSpace: "nowrap" }} />
                            {editMode ? (
                              <td style={{ minWidth: 280, textAlign: "left" }}>
                                <textarea className="editing-cell" style={editTextareaStyle} rows={2}
                                  value={row.ly_do ?? ""}
                                  onChange={(e) => setValue(["top_shops", i, "ly_do"], e.target.value)} />
                              </td>
                            ) : (
                              <td style={{ minWidth: 280, whiteSpace: "pre-line", textAlign: "left" }}>{row.ly_do}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="placeholder-box">Chưa có dữ liệu top shop</div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ================= TAB: BÁO CÁO CHỦ ĐỀ ================= */}
          {tab === "chu-de" && (
            <>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="accent o"></div>
                  <span className="tag">NV vi phạm</span>
                  <div className="val">{fmtMoney(cd.summary_kpi?.nv_vi_pham)}</div>
                </div>
                <div className="kpi-card">
                  <div className="accent g"></div>
                  <span className="tag">Case đang xử lý</span>
                  <div className="val">{fmtMoney(cd.summary_kpi?.case_dang_xu_ly)}</div>
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h3>Tổng hợp theo chủ đề</h3></div>
                <div className="card-body">
                  <table>
                    <thead><tr><th>Chủ đề</th><th>SL NV</th></tr></thead>
                    <tbody>
                      {(cd.violation_topics || []).map((row, i) => (
                        <tr key={i}>
                          <td>{row.chu_de}</td>
                          <td className="num">{fmtMoney(row.sl_nv)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(cd.chi_tiet_case || []).length > 0 && (
                <div className="card">
                  <div className="card-head"><h3>Chi tiết case</h3></div>
                  <div className="card-body">
                    <table>
                      <thead><tr><th>Nội dung</th><th>Trạng thái</th></tr></thead>
                      <tbody>
                        {cd.chi_tiet_case.map((row, i) => (
                          <tr key={i}>
                            <td>{row.noi_dung}</td>
                            <td>{row.trang_thai}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Layout>
  );
}

const editToggleBtnStyle = {
  background: "var(--navy-800)", color: "#fff", border: "none", borderRadius: 8,
  padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
};

const saveBtnStyle = {
  background: "#4C9A2A", color: "#fff", border: "none", borderRadius: 8,
  padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
};

const cancelBtnStyle = {
  background: "#fff", color: "var(--text-600)", border: "1px solid var(--border)", borderRadius: 8,
  padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
};

const editBannerStyle = {
  background: "#FFF6E5", border: "1px solid #F5D98A", borderRadius: 8,
  padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#8A6300",
};

const editInputStyle = {
  width: "100%", minWidth: 70, padding: "5px 8px", border: "1.5px dashed #E4B62F",
  background: "#FFFDF0", borderRadius: 4, fontSize: 13, textAlign: "inherit", fontFamily: "inherit",
};

const editKpiInputStyle = {
  width: "100%", padding: "6px 8px", border: "1.5px dashed #E4B62F",
  background: "#FFFDF0", borderRadius: 4, fontSize: 20, fontWeight: 800, color: "var(--navy-900)",
};

const editThInputStyle = {
  width: "100%", padding: "4px 6px", border: "1.5px dashed #E4B62F",
  background: "#FFFDF0", borderRadius: 4, fontSize: 12, fontWeight: 700, textAlign: "center", textTransform: "uppercase",
};

const editTextareaStyle = {
  width: "100%", padding: "6px 8px", border: "1.5px dashed #E4B62F",
  background: "#FFFDF0", borderRadius: 4, fontSize: 13, fontFamily: "inherit", resize: "vertical",
};
