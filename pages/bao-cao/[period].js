import { useEffect, useState } from "react";
import { useRouter } from "next/router";
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

  return (
    <Layout crumb={`BÃ¡o cÃ¡o thÃ¡ng / ${report?.display_name || period || ""}`}>
      <div className="page-head">
        <h1>{report?.display_name || "Äang táº£i..."}</h1>
        <p>BÃ¡o cÃ¡o thÃ¡ng gá»“m 2 pháº§n: Kiá»ƒm kÃª hÃ ng hÃ³a vÃ  Kiá»ƒm soÃ¡t chá»§ Ä‘á».</p>
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

      {error && <div className="placeholder-box">KhÃ´ng táº£i Ä‘Æ°á»£c bÃ¡o cÃ¡o: {error}</div>}

      {report && (
        <>
          {/* Tab chá»n Kiá»ƒm kÃª hÃ ng hÃ³a / Kiá»ƒm soÃ¡t chá»§ Ä‘á» */}
          <div className="month-tabs">
            <div className={`month-tab ${tab === "kiem-ke" ? "active" : ""}`} onClick={() => setTab("kiem-ke")}>
              ðŸ“¦ BÃ¡o cÃ¡o kiá»ƒm kÃª
            </div>
            <div className={`month-tab ${tab === "chu-de" ? "active" : ""}`} onClick={() => setTab("chu-de")}>
              ðŸ—‚ï¸ BÃ¡o cÃ¡o kiá»ƒm soÃ¡t theo chá»§ Ä‘á»{cd.ten_chu_de ? `: ${cd.ten_chu_de}` : ""}
            </div>
          </div>

          {tab === "kiem-ke" && (
            <>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="accent b"></div>
                  <span className="tag">Shop kiá»ƒm kÃª</span>
                  <div className="val">{fmtMoney(kk.summary_kpi?.shop_kiem_ke)}</div>
                </div>
                <div className="kpi-card">
                  <div className="accent r"></div>
                  <span className="tag">Tá»•ng giÃ¡ trá»‹ truy thu</span>
                  <div className="val">{fmtMoney(kk.summary_kpi?.tong_gia_tri_truy_thu)}</div>
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h3>Thá»‘ng kÃª theo vÃ¹ng</h3></div>
                <div className="card-body">
                  <table>
                    <thead>
                      <tr><th>VÃ¹ng</th><th>SL Shop</th><th>GiÃ¡ trá»‹</th><th>TB / shop</th></tr>
                    </thead>
                    <tbody>
                      {(kk.region_stats || []).map((row, i) => (
                        <tr key={i}>
                          <td>{row.vung}</td>
                          <td className="num">{fmtMoney(row.sl_shop)}</td>
                          <td className="num neg">{fmtMoney(row.gia_tri)}</td>
                          <td className="num">{fmtMoney(row.tb_shop)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h3>Top shop truy thu cao nháº¥t</h3></div>
                <div className="card-body">
                  <table>
                    <thead>
                      <tr><th>MÃ£ shop</th><th>VÃ¹ng</th><th>GiÃ¡ trá»‹</th><th>LÃ½ do</th></tr>
                    </thead>
                    <tbody>
                      {(kk.top_shops || []).map((row, i) => (
                        <tr key={i}>
                          <td>{row.ma_shop}</td>
                          <td>{row.vung}</td>
                          <td className="num neg">{fmtMoney(row.gia_tri)}</td>
                          <td>{row.ly_do}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {tab === "chu-de" && (
            <>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="accent o"></div>
                  <span className="tag">NV vi pháº¡m</span>
                  <div className="val">{fmtMoney(cd.summary_kpi?.nv_vi_pham)}</div>
                </div>
                <div className="kpi-card">
                  <div className="accent g"></div>
                  <span className="tag">Case Ä‘ang xá»­ lÃ½</span>
                  <div className="val">{fmtMoney(cd.summary_kpi?.case_dang_xu_ly)}</div>
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h3>Tá»•ng há»£p theo chá»§ Ä‘á»</h3></div>
                <div className="card-body">
                  <table>
                    <thead><tr><th>Chá»§ Ä‘á»</th><th>SL NV</th></tr></thead>
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
                  <div className="card-head"><h3>Chi tiáº¿t case</h3></div>
                  <div className="card-body">
                    <table>
                      <thead><tr><th>Ná»™i dung</th><th>Tráº¡ng thÃ¡i</th></tr></thead>
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
