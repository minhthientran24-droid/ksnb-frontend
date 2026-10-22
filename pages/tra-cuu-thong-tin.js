import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { getUser, traCuuThongTinShop, traCuuTruyThuNhanVien } from "../lib/api";

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function fmtMoney(n) {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString("vi-VN");
}

// "2026-09" -> "09/2026"
function fmtThang(t) {
  const [y, m] = String(t || "").split("-");
  return y && m ? `${m}/${y}` : t || "—";
}

// Hệ số: bỏ số 0 thừa, tối đa 3 số lẻ (VD 0.100671 -> 0.101, 1 -> 1).
function fmtHeSo(n) {
  if (n === null || n === undefined) return "—";
  return String(Math.round(n * 1000) / 1000);
}

// Cùng ngưỡng tô đỏ + in đậm như bảng "Đã kiểm" ở Theo dõi kiểm kê.
const DANGER_THRESHOLD = -4999999;
function moneyStyle(n) {
  return n !== null && n !== undefined && n < DANGER_THRESHOLD ? { color: "var(--danger)", fontWeight: 700 } : undefined;
}

// Các số truy thu tổng (theo tháng / theo kỳ kiểm kê) luôn tô đỏ (chốt 22/10).
const REDMONEY = { color: "var(--danger)", fontWeight: 700 };
const thLeft = { textAlign: "left" };
const tdNum = { textAlign: "right", whiteSpace: "nowrap" };

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

// ---- Truy thu thực tế của 1 shop (tối đa 12 tháng gần nhất, mới nhất trước) ----
// Mỗi tháng 1 khối thu gọn được: tháng mới nhất mở sẵn, các tháng cũ chỉ hiện dòng tổng.
function TruyThuShopCard({ data }) {
  const [openMap, setOpenMap] = useState({});
  const isOpen = (t, idx) => (openMap[t] === undefined ? idx === 0 : openMap[t]);
  const toggle = (t, idx) => setOpenMap((m) => ({ ...m, [t]: !isOpen(t, idx) }));
  return (
    <div className="card">
      <div className="card-head">
        <h3>Truy thu thực tế</h3>
        <span className="note">Tối đa 12 tháng gần nhất — theo từng nhân viên làm việc tại shop</span>
      </div>
      <div className="card-body">
        {data.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--text-400)" }}>Chưa có dữ liệu truy thu thực tế của shop này.</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.map((m, idx) => {
            const open = isOpen(m.thang, idx);
            return (
              <div key={m.thang} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <div
                  onClick={() => toggle(m.thang, idx)}
                  style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, padding: "9px 14px", cursor: "pointer", background: open ? "var(--bg)" : "transparent" }}
                >
                  <span style={{ fontSize: 11, color: "var(--text-400)", width: 12 }}>{open ? "▼" : "▶"}</span>
                  <span style={{ fontWeight: 700, color: "var(--navy-900)", minWidth: 90 }}>Tháng {fmtThang(m.thang)}</span>
                  <span style={{ fontSize: 13 }}>
                    Tổng truy thu shop: <strong style={REDMONEY}>{fmtMoney(m.tong_truy_thu_shop)}</strong>
                  </span>
                  <span style={{ fontSize: 13, color: "var(--text-600)" }}>
                    Tổng sau điều chỉnh (các NV): <strong style={REDMONEY}>{fmtMoney(m.tong_sau_dieu_chinh)}</strong>
                  </span>
                </div>
                {open && (
                  <div style={{ padding: "10px 14px 14px", borderTop: "1px solid var(--border)", overflowX: "auto" }}>
                    {m.ky.map((k, i) => (
                      <div key={`${k.ngay_kiem_ke}-${i}`} style={{ marginBottom: i < m.ky.length - 1 ? 16 : 0 }}>
                        <div style={{ fontSize: 13, marginBottom: 6 }}>
                          Ngày kiểm kê <strong>{fmtDate(k.ngay_kiem_ke)}</strong>
                          {k.ten_shop ? <span style={{ color: "var(--text-600)" }}> — {k.ten_shop}</span> : null}
                          {" · "}Tổng truy thu shop: <strong style={REDMONEY}>{fmtMoney(k.tong_truy_thu_shop)}</strong>
                        </div>
                        <table>
                          <thead>
                            <tr>
                              <th style={thLeft}>Mã NV</th>
                              <th style={thLeft}>Tên nhân viên</th>
                              <th style={thLeft}>Thời gian làm việc</th>
                              <th>Hệ số</th>
                              <th>Truy thu</th>
                              <th>Điều chỉnh</th>
                              <th>Sau điều chỉnh</th>
                            </tr>
                          </thead>
                          <tbody>
                            {k.nhan_vien.map((n, j) => (
                              <tr key={`${n.ma_nv}-${j}`}>
                                <td style={thLeft}>{n.ma_nv}</td>
                                <td style={thLeft}>{n.ten_nv}</td>
                                <td style={thLeft}>{n.thoi_gian_lam_viec || "—"}</td>
                                <td style={tdNum}>{fmtHeSo(n.he_so)}</td>
                                <td style={tdNum}>{fmtMoney(n.truy_thu)}</td>
                                <td style={tdNum}>{fmtMoney(n.dieu_chinh)}</td>
                                <td style={{ ...tdNum, fontWeight: 700 }}>{fmtMoney(n.sau_dieu_chinh)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- Truy thu thực tế theo NHÂN VIÊN: mỗi Mã NV 1 thẻ riêng (trùng tên -> hiện đủ mọi người, tách theo Mã NV) ----
function TruyThuNhanVienCard({ nv }) {
  return (
    <div className="card" style={{ borderLeft: "4px solid var(--blue-accent, #2F6FED)" }}>
      <div className="card-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <h3>{nv.ten_nv} <span style={{ fontWeight: 500, color: "var(--text-600)" }}>— Mã NV: {nv.ma_nv}</span></h3>
        <span className="note">
          {nv.so_thang} tháng gần nhất · Truy thu: <strong>{fmtMoney(nv.tong_truy_thu)}</strong> · Sau điều chỉnh: <strong>{fmtMoney(nv.tong_sau_dieu_chinh)}</strong>
        </span>
      </div>
      <div className="card-body" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th style={thLeft}>Tháng</th>
              <th style={thLeft}>Shop làm việc</th>
              <th>Ngày kiểm kê</th>
              <th>Tổng truy thu shop</th>
              <th style={thLeft}>Thời gian làm việc</th>
              <th>Hệ số</th>
              <th>Truy thu</th>
              <th>Điều chỉnh</th>
              <th>Sau điều chỉnh</th>
            </tr>
          </thead>
          <tbody>
            {nv.records.map((r, i) => (
              <tr key={`${r.thang}-${r.ma_shop}-${r.ngay_kiem_ke}-${i}`}>
                <td style={thLeft}>{fmtThang(r.thang)}</td>
                <td style={thLeft}>{r.ma_shop}{r.ten_shop ? ` - ${r.ten_shop}` : ""}</td>
                <td>{fmtDate(r.ngay_kiem_ke)}</td>
                <td style={tdNum}>{fmtMoney(r.tong_truy_thu_shop)}</td>
                <td style={thLeft}>{r.thoi_gian_lam_viec || "—"}</td>
                <td style={tdNum}>{fmtHeSo(r.he_so)}</td>
                <td style={tdNum}>{fmtMoney(r.truy_thu)}</td>
                <td style={tdNum}>{fmtMoney(r.dieu_chinh)}</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>{fmtMoney(r.sau_dieu_chinh)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  async function handleLookup() {
    const q = input.trim();
    if (!q || q === searched) return;
    setSearched(q);
    setLoading(true);
    setError("");
    setNvResult(null); // đang xem theo shop thì ẩn kết quả theo nhân viên cho gọn
    setNvSearched("");
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
          <div style={{ flex: "1 1 240px", maxWidth: 320 }}>
            <label style={labelStyle}>Mã shop</label>
            <input
              type="text"
              autoFocus
              placeholder="VD: 80834"
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
