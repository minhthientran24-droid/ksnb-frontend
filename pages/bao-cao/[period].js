import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import Layout from "../../components/Layout";
import { getReport, listReports } from "../../lib/api";

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

const MONTH_COLORS = ["#8B93A5", "#F5821F", "#3E7FD1"];

export default function BaoCaoDetailPage() {
  const router = useRouter();
  const { period } = router.query;
  const [report, setReport] = useState(null);
  const [allPeriods, setAllPeriods] = useState([]);
  const [tab, setTab] = useState("kiem-ke"); // "kiem-ke" | "chu-de"
  const [error, setError] = useState("");

  useEffect(() => {
    listReports().then(setAllPeriods).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!period) return;
    getReport(period).then(setReport).catch((err) => setError(err.message));
  }, [period]);

  const kk = report?.report_kiem_ke || {};
  const cd = report?.report_chu_de || {};

  // Dữ liệu biểu đồ "Truy thu TB nhân viên" — gộp theo vùng, mỗi vùng có N tháng
  const nvChartData = (kk.trend_truy_thu_nv?.rows || []).map((row) => {
    const item = { vung: row.vung };
    (kk.trend_truy_thu_nv?.thang_labels || []).forEach((label, i) => {
      item[label] = row.values?.[i] ?? 0;
    });
    return item;
  });

  return (
    <Layout crumb={`Báo cáo tháng / ${report?.display_name || period || ""}`}>
      <div className="page-head">
        <h1>{report?.display_name || "Đang tải..."}</h1>
        <p>Báo cáo tháng gồm 2 phần: Kiểm kê hàng hóa và Kiểm soát chủ đề.</p>
      </div>

      {allPeriods.length > 0 && (
        <div className="month-tabs">
          {allPeriods.map((p) => (
            <div
              key={p.period_label}
              className={`month-tab ${p.period_label === period ? "active" : ""}`}
              onClick={() => router.push(`/bao-cao/${p.period_label}`)}
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
            <div className={`month-tab ${tab === "kiem-ke" ? "active" : ""}`} onClick={() => setTab("kiem-ke")}>
              📦 Báo cáo kiểm kê
            </div>
            <div className={`month-tab ${tab === "chu-de" ? "active" : ""}`} onClick={() => setTab("chu-de")}>
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
                  <div className="val">{fmtMoney(kk.summary_kpi?.shop_kiem_ke)}</div>
                </div>
                <div className="kpi-card">
                  <div className="accent r"></div>
                  <span className="tag">Tổng giá trị truy thu</span>
                  <div className="val">{fmtMoney(kk.summary_kpi?.tong_gia_tri_truy_thu)}</div>
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
                          <th rowSpan={2} style={{ verticalAlign: "bottom" }}>Vùng</th>
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
                            <td>{row.vung}</td>
                            <td className="num">{fmtMoney(row.online?.sl_shop)}</td>
                            <td className="num neg">{fmtMoney(row.online?.gia_tri)}</td>
                            <td className="num">{fmtMoney(row.online?.tb_shop)}</td>
                            <td className="num">{fmtMoney(row.truc_tiep?.sl_shop)}</td>
                            <td className="num neg">{fmtMoney(row.truc_tiep?.gia_tri)}</td>
                            <td className="num">{fmtMoney(row.truc_tiep?.tb_shop)}</td>
                            <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(row.total?.sl_shop)}</td>
                            <td className="num neg" style={{ fontWeight: 700 }}>{fmtMoney(row.total?.gia_tri)}</td>
                            <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(row.total?.tb_shop)}</td>
                          </tr>
                        ))}
                        {kk.grand_total && (
                          <tr style={{ background: "#F8FAFD", fontWeight: 700 }}>
                            <td>Grand Total</td>
                            <td className="num">{fmtMoney(kk.grand_total.online?.sl_shop)}</td>
                            <td className="num neg">{fmtMoney(kk.grand_total.online?.gia_tri)}</td>
                            <td className="num">{fmtMoney(kk.grand_total.online?.tb_shop)}</td>
                            <td className="num">{fmtMoney(kk.grand_total.truc_tiep?.sl_shop)}</td>
                            <td className="num neg">{fmtMoney(kk.grand_total.truc_tiep?.gia_tri)}</td>
                            <td className="num">{fmtMoney(kk.grand_total.truc_tiep?.tb_shop)}</td>
                            <td className="num">{fmtMoney(kk.grand_total.total?.sl_shop)}</td>
                            <td className="num neg">{fmtMoney(kk.grand_total.total?.gia_tri)}</td>
                            <td className="num">{fmtMoney(kk.grand_total.total?.tb_shop)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <div className="placeholder-box">Chưa có dữ liệu thống kê theo vùng</div>
                  )}
                </div>
              </div>

              {/* ---- 2. Giá trị truy thu trung bình shop (3 tháng gần nhất) ---- */}
              <div className="card">
                <div className="card-head"><h3>2. Giá trị truy thu trung bình shop (3 tháng gần nhất)</h3></div>
                <div className="card-body" style={{ overflowX: "auto" }}>
                  {kk.trend_tb_shop?.rows?.length > 0 ? (
                    <table>
                      <thead>
                        <tr>
                          <th rowSpan={2} style={{ verticalAlign: "bottom" }}>Vùng</th>
                          {kk.trend_tb_shop.thang_labels.map((label) => (
                            <th key={label} colSpan={3}>{label}</th>
                          ))}
                        </tr>
                        <tr>
                          {kk.trend_tb_shop.thang_labels.map((label) => (
                            <Fragment key={label}>
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
                            <td>{row.vung}</td>
                            {row.values.map((v, j) => (
                              <Fragment key={j}>
                                <td className="num">{fmtMoney(v.sl_shop)}</td>
                                <td className="num neg">{fmtMoney(v.gia_tri)}</td>
                                <td className="num">{fmtMoney(v.tb_shop)}</td>
                              </Fragment>
                            ))}
                          </tr>
                        ))}
                        {kk.trend_tb_shop.tong && (
                          <tr style={{ background: "#F8FAFD", fontWeight: 700 }}>
                            <td>Tổng số</td>
                            {kk.trend_tb_shop.tong.values.map((v, j) => (
                              <Fragment key={j}>
                                <td className="num">{fmtMoney(v.sl_shop)}</td>
                                <td className="num neg">{fmtMoney(v.gia_tri)}</td>
                                <td className="num">{fmtMoney(v.tb_shop)}</td>
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
                            {kk.trend_truy_thu_nv.thang_labels.map((label) => (
                              <th key={label}>{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {kk.trend_truy_thu_nv.rows.map((row, i) => (
                            <tr key={i}>
                              <td>{row.vung}</td>
                              {row.values.map((v, j) => (
                                <td className="num" key={j}>{fmtMoney(v)}</td>
                              ))}
                            </tr>
                          ))}
                          {kk.trend_truy_thu_nv.tb_toan_vung && (
                            <tr style={{ background: "#F8FAFD", fontWeight: 700 }}>
                              <td>TB Toàn Vùng</td>
                              {kk.trend_truy_thu_nv.tb_toan_vung.map((v, j) => (
                                <td className="num" key={j}>{fmtMoney(v)}</td>
                              ))}
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="card-body" style={{ padding: "16px 20px", height: 320 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={nvChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F6" />
                          <XAxis dataKey="vung" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                          <Tooltip formatter={(v) => fmtMoney(v) + " đ"} />
                          <Legend />
                          {kk.trend_truy_thu_nv.thang_labels.map((label, i) => (
                            <Bar key={label} dataKey={label} fill={MONTH_COLORS[i % MONTH_COLORS.length]} radius={[3, 3, 0, 0]} />
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
                      <thead>
                        <tr><th>Mã shop</th><th>Tên shop</th><th>Vùng</th><th>Giá trị</th><th>Lý do</th></tr>
                      </thead>
                      <tbody>
                        {kk.top_shops.map((row, i) => (
                          <tr key={i}>
                            <td>{row.ma_shop}</td>
                            <td>{row.ten_shop || "-"}</td>
                            <td>{row.vung}</td>
                            <td className="num neg" style={{ whiteSpace: "nowrap" }}>{fmtMoney(row.gia_tri)}</td>
                            <td style={{ minWidth: 280, whiteSpace: "pre-line" }}>{row.ly_do}</td>
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
