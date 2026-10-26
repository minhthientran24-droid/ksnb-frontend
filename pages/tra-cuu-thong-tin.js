import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { fmtDate, fmtMoney, moneyStyle, TruyThuShopCard, TruyThuNhanVienCard } from "../components/TruyThuCards";
import { getUser, traCuuThongTinShop, traCuuTruyThuNhanVien, timShopTheoTen } from "../lib/api";

function InfoItem({ label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-600)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: "var(--text-900)", wordBreak: "break-word" }}>{children || "—"}</div>
    </div>
  );
}

// Danh sách nhân viên hiển thị theo cặp "Tên - email", mỗi người 1 dòng
// (không có email thì chỉ hiện tên).
function TenEmailList({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {items.map((p, i) => (
        <div key={`${p.ten}-${i}`}>{p.email ? `${p.ten} - ${p.email}` : p.ten}</div>
      ))}
    </div>
  );
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-600)", display: "block", marginBottom: 6 };
const inputStyle = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, boxSizing: "border-box" };

export default function TraCuuThongTinPage() {
  const [checked, setChecked] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState("");
  // Gõ TÊN shop (gần đúng) -> danh sách shop khớp để chọn (chốt 22/10)
  const [candidates, setCandidates] = useState(null); // {q, mode, total, matches:[{ma_shop, ten_shop}]}

  // Ô tìm theo tên nhân viên (truy thu thực tế)
  const [nvInput, setNvInput] = useState("");
  const [nvLoading, setNvLoading] = useState(false);
  const [nvError, setNvError] = useState("");
  const [nvResult, setNvResult] = useState(null);
  const [nvSearched, setNvSearched] = useState("");

  useEffect(() => {
    if (!getUser()) {
      window.location.replace("/");
      return;
    }
    setChecked(true);
  }, []);

  // Gõ Mã shop rồi bấm Tab (onBlur) hoặc Enter là tra cứu ngay. Tab rồi bấm
  // lại đúng mã vừa tra thì không gọi lại API (tránh gọi 2 lần Enter + blur).
  async function loadShopByCode(code) {
    setSearched(code);
    setLoading(true);
    setError("");
    setCandidates(null);
    setNvResult(null); // đang xem theo shop thì ẩn kết quả theo nhân viên cho gọn
    setNvSearched("");
    try {
      setResult(await traCuuThongTinShop(code));
    } catch (err) {
      setResult(null);
      setSearched("");
      setError(err.message || "Tra cứu thất bại");
    } finally {
      setLoading(false);
    }
  }

  // Ô nhập nhận Mã shop (toàn chữ số) HOẶC tên shop gần đúng. Tên: 1 shop khớp -> mở luôn; nhiều shop -> hiện danh sách để chọn.
  async function handleLookup() {
    const q = input.trim();
    if (!q || q === searched) return;
    if (/^\d{1,5}$/.test(q)) {
      await loadShopByCode(q);
      return;
    }
    setSearched(q);
    setLoading(true);
    setError("");
    setResult(null);
    setCandidates(null);
    setNvResult(null);
    setNvSearched("");
    try {
      const r = await timShopTheoTen(q);
      if (r.matches.length === 1) {
        setInput(r.matches[0].ma_shop);
        await loadShopByCode(r.matches[0].ma_shop);
        return;
      }
      if (r.matches.length === 0) {
        setSearched("");
        setError(`Không tìm thấy shop nào có tên gần đúng "${q}".`);
      } else {
        setCandidates(r);
      }
    } catch (err) {
      setSearched("");
      setError(err.message || "Tra cứu thất bại");
    } finally {
      setLoading(false);
    }
  }

  function pickCandidate(ma) {
    setInput(ma);
    loadShopByCode(ma);
  }

  async function handleLookupNv() {
    const q = nvInput.trim();
    if (!q || q === nvSearched) return;
    setNvSearched(q);
    setNvLoading(true);
    setNvError("");
    setResult(null); // đang xem theo nhân viên thì ẩn kết quả theo shop
    setSearched("");
    setError("");
    try {
      setNvResult(await traCuuTruyThuNhanVien(q));
    } catch (err) {
      setNvResult(null);
      setNvSearched("");
      setNvError(err.message || "Tra cứu thất bại");
    } finally {
      setNvLoading(false);
    }
  }

  if (!checked) return null;

  return (
    <Layout crumb="Tra cứu thông tin">
      <div className="page-head">
        <h1>🔎 Tra cứu thông tin</h1>
        <p>
          Nhập Mã shop để xem thông tin shop, 3 kỳ kiểm kê gần nhất và truy thu thực tế (tối đa 12 tháng) — hoặc tìm theo
          tên nhân viên để xem truy thu của từng người. Bấm Tab hoặc Enter để tra cứu.
        </p>
      </div>

      <div className="card">
        <div className="card-body" style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 280px", maxWidth: 380 }}>
            <label style={labelStyle}>Mã shop hoặc tên shop</label>
            <input
              type="text"
              autoFocus
              placeholder="VD: 80834 hoặc Nguyễn Văn Cừ"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onBlur={handleLookup}
              onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: "1 1 280px", maxWidth: 380 }}>
            <label style={labelStyle}>Tên nhân viên (hoặc Mã nhân viên)</label>
            <input
              type="text"
              placeholder="VD: Nguyễn Thị Hương"
              value={nvInput}
              onChange={(e) => setNvInput(e.target.value)}
              onBlur={handleLookupNv}
              onKeyDown={(e) => { if (e.key === "Enter") handleLookupNv(); }}
              style={inputStyle}
            />
          </div>
          {(loading || nvLoading) && <span style={{ fontSize: 13, color: "var(--text-400)", paddingBottom: 10 }}>Đang tra cứu...</span>}
        </div>
      </div>

      {candidates && (
        <div className="card">
          <div className="card-head">
            <h3>Chọn shop</h3>
            <span className="note">
              {candidates.mode === "fuzzy"
                ? `Không có shop khớp chính xác — gợi ý ${candidates.total} shop gần giống "${candidates.q}"`
                : `Có ${candidates.total} shop khớp "${candidates.q}"${candidates.total > candidates.matches.length ? ` (hiện ${candidates.matches.length} shop đầu — gõ cụ thể hơn để thu hẹp)` : ""}`}
            </span>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {candidates.matches.map((m) => (
              <div
                key={m.ma_shop}
                onClick={() => pickCandidate(m.ma_shop)}
                style={{ cursor: "pointer", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14 }}
              >
                <strong>{m.ma_shop}</strong> - {m.ten_shop}
              </div>
            ))}
          </div>
        </div>
      )}

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
                <InfoItem label="ASM">
                  <TenEmailList items={result.ten_asm ? [{ ten: result.ten_asm, email: result.email_asm }] : []} />
                </InfoItem>
                <InfoItem label={result.quan_ly_chuc_danh && result.quan_ly_chuc_danh !== "Trưởng Quản lý Nhà Thuốc" && result.quan_ly_chuc_danh !== "Bác sĩ trưởng"
                  ? `Quản lý (${result.quan_ly_chuc_danh})` : "Quản lý"}>
                  <TenEmailList items={result.quan_ly} />
                </InfoItem>
                <InfoItem label="Trưởng ca"><TenEmailList items={result.truong_ca} /></InfoItem>
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
              <span className="note" style={{ fontWeight: 700 }}>
                Giá trị thất thoát = Ước tính truy thu của kỳ (đúng cột "Ước tính truy thu" ở Theo dõi kiểm kê) - Tại ngày kiểm kê - chưa phải là số chốt truy thu trong tháng
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

          {/* null = user không có quyền xem Truy thu thực tế -> không hiện khối này */}
          {Array.isArray(result.truy_thu) && <TruyThuShopCard data={result.truy_thu} />}
        </>
      )}

      {nvError && <div className="placeholder-box">{nvError}</div>}
      {!nvError && nvResult && nvResult.found === false && (
        <div className="placeholder-box">Không tìm thấy nhân viên nào có tên (hoặc mã) "{nvSearched}" trong dữ liệu truy thu thực tế.</div>
      )}
      {nvResult && nvResult.found && (
        <>
          <div style={{ fontSize: 13, color: "var(--text-600)", margin: "4px 2px 12px" }}>
            {nvResult.mode === "exact"
              ? <>Có <strong>{nvResult.total_matches}</strong> nhân viên tên "{nvSearched}"{nvResult.total_matches > 1 ? " — tách riêng theo Mã nhân viên bên dưới." : "."}</>
              : <>Không có nhân viên tên đúng "{nvSearched}" — hiện <strong>{nvResult.total_matches}</strong> nhân viên có tên chứa cụm này, tách riêng theo Mã nhân viên.</>}
            {nvResult.truncated && <span style={{ color: "var(--danger)" }}> (chỉ hiện 50 người đầu — hãy nhập tên đầy đủ hơn)</span>}
          </div>
          {nvResult.nhan_vien.map((nv) => <TruyThuNhanVienCard key={nv.ma_nv} nv={nv} />)}
        </>
      )}
    </Layout>
  );
}
