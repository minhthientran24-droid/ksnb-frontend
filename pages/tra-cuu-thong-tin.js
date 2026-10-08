import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { getUser, traCuuThongTinShop } from "../lib/api";

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function fmtMoney(n) {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString("vi-VN");
}

// Cùng ngưỡng tô đỏ + in đậm như bảng "Đã kiểm" ở Theo dõi kiểm kê.
const DANGER_THRESHOLD = -4999999;
function moneyStyle(n) {
  return n !== null && n !== undefined && n < DANGER_THRESHOLD ? { color: "var(--danger)", fontWeight: 700 } : undefined;
}

function InfoItem({ label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-600)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: "var(--text-900)", wordBreak: "break-word" }}>{children || "—"}</div>
    </div>
  );
}

export default function TraCuuThongTinPage() {
  const [checked, setChecked] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState("");

  useEffect(() => {
    if (!getUser()) {
      window.location.replace("/");
      return;
    }
    setChecked(true);
  }, []);

  // Gõ Mã shop rồi bấm Tab (onBlur) hoặc Enter là tra cứu ngay. Tab rồi bấm
  // lại đúng mã vừa tra thì không gọi lại API (tránh gọi 2 lần Enter + blur).
  async function handleLookup() {
    const q = input.trim();
    if (!q || q === searched) return;
    setSearched(q);
    setLoading(true);
    setError("");
    try {
      setResult(await traCuuThongTinShop(q));
    } catch (err) {
      setResult(null);
      setSearched("");
      setError(err.message || "Tra cứu thất bại");
    } finally {
      setLoading(false);
    }
  }

  if (!checked) return null;

  return (
    <Layout crumb="Tra cứu thông tin">
      <div className="page-head">
        <h1>🔎 Tra cứu thông tin</h1>
        <p>Nhập Mã shop rồi bấm Tab hoặc Enter để xem thông tin shop và 3 kỳ kiểm kê gần nhất.</p>
      </div>

      <div className="card">
        <div className="card-body">
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-600)", display: "block", marginBottom: 6 }}>Mã shop</label>
          <input
            type="text"
            autoFocus
            placeholder="VD: 80834"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onBlur={handleLookup}
            onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }}
            style={{ width: 260, maxWidth: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
          />
          {loading && <span style={{ marginLeft: 12, fontSize: 13, color: "var(--text-400)" }}>Đang tra cứu...</span>}
        </div>
      </div>

      {error && <div className="placeholder-box">{error}</div>}
      {!error && result && result.found === false && (
        <div className="placeholder-box">Không tìm thấy shop có Mã shop "{searched}".</div>
      )}

      {result && result.found && (
        <>
          <div className="card">
            <div className="card-head"><h3>{result.ma_shop} - {result.ten_shop || "—"}</h3></div>
            <div className="card-body">
              {result.thieu_shopinfo && (
                <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>
                  Shop chưa có trong file ShopInfo — chỉ hiện được dữ liệu kiểm kê.
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 18 }}>
                <InfoItem label="Mã shop">{result.ma_shop}</InfoItem>
                <InfoItem label="Tên shop">{result.ten_shop}</InfoItem>
                <InfoItem label="Tên ASM">{result.ten_asm}</InfoItem>
                <InfoItem label="Email ASM">{result.email_asm}</InfoItem>
                <InfoItem label={result.quan_ly_chuc_danh && result.quan_ly_chuc_danh !== "Trưởng Quản lý Nhà Thuốc" && result.quan_ly_chuc_danh !== "Bác sĩ trưởng"
                  ? `Quản lý (${result.quan_ly_chuc_danh})` : "Quản lý"}>
                  {(result.quan_ly || []).join(", ")}
                </InfoItem>
                <InfoItem label="Trưởng ca">{(result.truong_ca || []).join(", ")}</InfoItem>
                <InfoItem label="Tỉnh thành">{result.tinh_thanh}</InfoItem>
                <InfoItem label="Ngày mở bán">{result.ngay_mo_ban ? fmtDate(result.ngay_mo_ban) : ""}</InfoItem>
                <InfoItem label="Ngày kiểm kê gần nhất">
                  {result.ngay_kiem_ke_gan_nhat
                    ? `${fmtDate(result.ngay_kiem_ke_gan_nhat)}${result.trang_thai_kiem_ke_gan_nhat ? ` (${result.trang_thai_kiem_ke_gan_nhat})` : ""}`
                    : ""}
                </InfoItem>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>3 kỳ kiểm kê gần nhất</h3>
              <span className="note">
                Giá trị thất thoát = Kiểm kê Non CL + Cắt liều (Long Châu) hoặc VX + VTYT + VPKM (Vaccine)
              </span>
            </div>
            <div className="card-body" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Kỳ</th>
                    <th>Ngày kiểm kê</th>
                    <th style={{ textAlign: "left" }}>NV kiểm kê</th>
                    <th>Giá trị thất thoát</th>
                    <th>Truy thu thanh lý</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.ky_kiem_ke || []).length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-400)" }}>Shop chưa có kỳ kiểm kê nào ở trạng thái "Đã kiểm".</td></tr>
                  )}
                  {(result.ky_kiem_ke || []).map((k, i) => (
                    <tr key={`${k.ky}-${k.ngay_kiem_ke}-${i}`}>
                      <td>{k.ky}</td>
                      <td>{fmtDate(k.ngay_kiem_ke)}</td>
                      <td style={{ textAlign: "left" }}>{k.nv_kiem_ke || "—"}</td>
                      <td style={moneyStyle(k.gia_tri_that_thoat)}>{fmtMoney(k.gia_tri_that_thoat)}</td>
                      <td style={moneyStyle(k.truy_thu_thanh_ly)}>{fmtMoney(k.truy_thu_thanh_ly)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
