import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { fmtDate, fmtMoney, moneyStyle, TruyThuShopCard, TruyThuNhanVienCard } from "../components/TruyThuCards";
import { getUser, traCuuThongTinShop, traCuuTruyThuNhanVien, timShopTheoTen, timNguoi, shopCuaAsm, shopTheoTinh } from "../lib/api";

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

const NHOM_SHOP = [
  { loai: "vaccine", label: "Shop Vaccine", bg: "#EAF1FB" },
  { loai: "long_chau", label: "Shop Long Châu", bg: "#EAF6EC" },
];

// Các shop 1 ASM quản lý — Shop Vaccine trước, rồi Shop Long Châu; trong cùng loại đã xếp sẵn theo tỉnh (backend).
function AsmShopsCard({ data }) {
  const { asm, shops } = data;
  let stt = 0;
  return (
    <div className="card">
      <div className="card-head">
        <h3>ASM {asm.ten}{asm.email ? ` - ${asm.email}` : ""}</h3>
        <span className="note" style={{ fontWeight: 700 }}>
          Quản lý {asm.so_shop} shop đang hoạt động ({asm.so_vaccine} Vaccine, {asm.so_long_chau} Long Châu) — xếp Shop Vaccine trước, rồi Shop Long Châu; cùng loại xếp theo tỉnh
        </span>
      </div>
      <div className="card-body" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>STT</th>
              <th>Mã shop</th>
              <th style={{ textAlign: "left" }}>Tên shop</th>
              <th style={{ textAlign: "left" }}>Tỉnh thành</th>
              <th style={{ textAlign: "left" }}>Quản lý</th>
              <th style={{ textAlign: "left" }}>Trưởng ca</th>
              <th>Ngày mở bán</th>
              <th>Kiểm kê gần nhất</th>
            </tr>
          </thead>
          <tbody>
            {NHOM_SHOP.map((g) => {
              const list = shops.filter((x) => x.loai === g.loai);
              if (list.length === 0) return null;
              return [
                <tr key={`h-${g.loai}`}>
                  <td colSpan={8} style={{ background: g.bg, fontWeight: 700, textAlign: "left" }}>{g.label} ({list.length})</td>
                </tr>,
                ...list.map((x) => {
                  stt += 1;
                  return (
                    <tr key={x.ma_shop}>
                      <td>{stt}</td>
                      <td>{x.ma_shop}</td>
                      <td style={{ textAlign: "left" }}>{x.ten_shop}</td>
                      <td style={{ textAlign: "left" }}>{x.tinh_thanh || "—"}</td>
                      <td style={{ textAlign: "left" }}><TenEmailList items={x.quan_ly} />{(!x.quan_ly || x.quan_ly.length === 0) && "—"}</td>
                      <td style={{ textAlign: "left" }}><TenEmailList items={x.truong_ca} />{(!x.truong_ca || x.truong_ca.length === 0) && "—"}</td>
                      <td>{x.ngay_mo_ban ? fmtDate(x.ngay_mo_ban) : "—"}</td>
                      <td>{x.ngay_kiem_ke_gan_nhat ? fmtDate(x.ngay_kiem_ke_gan_nhat) : "—"}</td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Toàn bộ shop đang hoạt động của 1 tỉnh — nhóm theo ASM phụ trách (A→Z), trong cùng ASM Shop Vaccine lên trên (backend đã xếp sẵn).
function TinhShopsCard({ data }) {
  const groups = [];
  for (const x of data.shops) {
    const key = x.ten_asm ? `${x.ten_asm}|${(x.email_asm || "").toLowerCase()}` : "";
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, ten: x.ten_asm, email: x.email_asm, list: [] };
      groups.push(g);
    }
    g.list.push(x);
  }
  let stt = 0;
  return (
    <div className="card">
      <div className="card-head">
        <h3>{data.tinh} - {data.tong_shop} shop</h3>
        <span className="note" style={{ fontWeight: 700 }}>
          {data.so_vaccine} Shop Vaccine, {data.tong_shop - data.so_vaccine} Shop Long Châu · {data.so_asm} ASM phụ trách (chỉ tính shop đang hoạt động) — xếp theo tên ASM, trong cùng ASM Shop Vaccine lên trên
        </span>
      </div>
      <div className="card-body" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>STT</th>
              <th>Mã shop</th>
              <th style={{ textAlign: "left" }}>Tên shop</th>
              <th>Loại</th>
              <th style={{ textAlign: "left" }}>Quản lý</th>
              <th style={{ textAlign: "left" }}>Trưởng ca</th>
              <th>Ngày mở bán</th>
              <th>Kiểm kê gần nhất</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => [
              <tr key={`g-${gi}`}>
                <td colSpan={8} style={{ background: "#EAF1FB", fontWeight: 700, textAlign: "left" }}>
                  {g.ten ? `ASM ${g.ten}${g.email ? ` - ${g.email}` : ""}` : "Chưa có ASM"} ({g.list.length} shop)
                </td>
              </tr>,
              ...g.list.map((x) => {
                stt += 1;
                return (
                  <tr key={x.ma_shop}>
                    <td>{stt}</td>
                    <td>{x.ma_shop}</td>
                    <td style={{ textAlign: "left" }}>{x.ten_shop}</td>
                    <td style={x.loai === "vaccine" ? { fontWeight: 700, color: "#1F4E79" } : undefined}>{x.loai === "vaccine" ? "Vaccine" : "Long Châu"}</td>
                    <td style={{ textAlign: "left" }}><TenEmailList items={x.quan_ly} />{(!x.quan_ly || x.quan_ly.length === 0) && "—"}</td>
                    <td style={{ textAlign: "left" }}><TenEmailList items={x.truong_ca} />{(!x.truong_ca || x.truong_ca.length === 0) && "—"}</td>
                    <td>{x.ngay_mo_ban ? fmtDate(x.ngay_mo_ban) : "—"}</td>
                    <td>{x.ngay_kiem_ke_gan_nhat ? fmtDate(x.ngay_kiem_ke_gan_nhat) : "—"}</td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// RSM / PRSM / ASM: tên in đậm, email ở dòng dưới (không in đậm)
function NguoiList({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((p, i) => (
        <div key={`${p.ten}-${p.email}-${i}`}>
          <div style={{ fontWeight: 700 }}>{p.ten || p.email}</div>
          {p.ten && p.email ? <div>{p.email}</div> : null}
        </div>
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
  const [nvLoading, setNvLoading] = useState(false);
  const [nvError, setNvError] = useState("");
  const [nvResult, setNvResult] = useState(null);
  const [nvSearched, setNvSearched] = useState("");

  // Ô tìm CHUNG ASM + nhân viên (chốt 08/11): 1 kết quả -> mở luôn; nhiều (trùng tên) -> danh sách để chọn, ASM xếp trên, nhân viên dưới.
  const [asmInput, setAsmInput] = useState("");
  const [asmLoading, setAsmLoading] = useState(false);
  const [asmError, setAsmError] = useState("");
  const [asmCands, setAsmCands] = useState(null); // {q, asm:[{key, ten, email, so_shop, so_vaccine, so_long_chau}], nhan_vien:[{ma_nv, ten, shop_gan_nhat}]|null, ...}
  const [asmResult, setAsmResult] = useState(null); // {asm, shops}
  const [asmSearched, setAsmSearched] = useState("");

  const [tinhResult, setTinhResult] = useState(null); // {tinh, tong_shop, so_vaccine, so_asm, shops}

  function clearAsm() {
    setTinhResult(null);
    setAsmCands(null);
    setAsmResult(null);
    setAsmError("");
    setAsmSearched("");
  }

  async function openAsm(key) {
    setAsmLoading(true);
    setAsmError("");
    setAsmCands(null);
    setNvResult(null); setNvError("");
    try {
      setAsmResult(await shopCuaAsm(key));
    } catch (err) {
      setAsmResult(null);
      setAsmError(err.message || "Tra cứu thất bại");
    } finally {
      setAsmLoading(false);
    }
  }

  // Chọn 1 nhân viên trong danh sách (đúng Mã NV) -> hiện truy thu thực tế của người đó
  async function openNv(maNv, ten) {
    setAsmLoading(true);
    setAsmError("");
    setAsmCands(null);
    setAsmResult(null);
    setNvError("");
    setNvSearched(ten);
    try {
      setNvResult(await traCuuTruyThuNhanVien(ten, maNv));
    } catch (err) {
      setNvResult(null);
      setNvError(err.message || "Tra cứu thất bại");
    } finally {
      setAsmLoading(false);
    }
  }

  async function handleLookupAsm() {
    const q = asmInput.trim();
    if (!q || q === asmSearched) return;
    setAsmSearched(q);
    setAsmLoading(true);
    setAsmError("");
    setAsmCands(null);
    setAsmResult(null);
    setTinhResult(null);
    // đang xem theo ASM thì ẩn kết quả theo shop / nhân viên cho gọn
    setResult(null); setSearched(""); setError(""); setCandidates(null);
    setNvResult(null); setNvSearched(""); setNvError("");
    try {
      const r = await timNguoi(q);
      const nAsm = r.asm.length;
      const nNv = (r.nhan_vien || []).length;
      if (nAsm + nNv === 0) {
        setAsmSearched("");
        setAsmError(`Không tìm thấy ASM hay nhân viên nào có tên (hoặc mã/email) "${q}".`);
      } else if (nAsm === 1 && nNv === 0) {
        await openAsm(r.asm[0].key);
        return;
      } else if (nAsm === 0 && nNv === 1) {
        await openNv(r.nhan_vien[0].ma_nv, r.nhan_vien[0].ten);
        return;
      } else {
        setAsmCands(r);
      }
    } catch (err) {
      setAsmSearched("");
      setAsmError(err.message || "Tra cứu thất bại");
    } finally {
      setAsmLoading(false);
    }
  }

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
    clearAsm();
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
    clearAsm();
    try {
      // Gõ đúng tên tỉnh -> hiện toàn bộ shop của tỉnh (xếp theo ASM); không phải tên tỉnh thì tìm theo tên shop như cũ
      const t = await shopTheoTinh(q);
      if (t.found) {
        setTinhResult(t);
        return;
      }
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

  if (!checked) return null;

  return (
    <Layout crumb="Tra cứu thông tin">
      <div className="page-head">
        <h1>🔎 Tra cứu thông tin</h1>
      </div>

      <div className="card">
        <div className="card-body" style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 280px", maxWidth: 380 }}>
            <label style={labelStyle}>Mã shop, tên shop hoặc tên tỉnh</label>
            <input
              type="text"
              autoFocus
              placeholder="VD: 80834, Nguyễn Văn Cừ hoặc tên tỉnh (Hải Phòng)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onBlur={handleLookup}
              onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: "1 1 280px", maxWidth: 380 }}>
            <label style={labelStyle}>Tên ASM hoặc tên nhân viên</label>
            <input
              type="text"
              placeholder="VD: Nguyễn Thị Hương (hoặc Mã NV, email ASM)"
              value={asmInput}
              onChange={(e) => setAsmInput(e.target.value)}
              onBlur={handleLookupAsm}
              onKeyDown={(e) => { if (e.key === "Enter") handleLookupAsm(); }}
              style={inputStyle}
            />
          </div>
          {(loading || asmLoading) && <span style={{ fontSize: 13, color: "var(--text-400)", paddingBottom: 10 }}>Đang tra cứu...</span>}
        </div>
      </div>

      {asmCands && (
        <div className="card">
          <div className="card-head">
            <h3>Chọn ASM / nhân viên</h3>
            <span className="note">
              Có {asmCands.asm_total} ASM{asmCands.nhan_vien ? ` và ${asmCands.nv_total} nhân viên` : ""} khớp "{asmCands.q}"
              {asmCands.asm_total > asmCands.asm.length || asmCands.nv_truncated ? " (chỉ hiện những người đầu — gõ cụ thể hơn để thu hẹp)" : ""}. Bấm vào một dòng để xem.
            </span>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {asmCands.asm.length > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-600)" }}>ASM ({asmCands.asm.length})</div>}
            {asmCands.asm.map((m) => (
              <div
                key={`asm-${m.key}`}
                onClick={() => openAsm(m.key)}
                style={{ cursor: "pointer", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, background: "#EAF1FB" }}
              >
                <strong>{m.ten}</strong> <span style={{ fontSize: 12, fontWeight: 700, color: "#1F4E79" }}>ASM</span>{m.email ? ` - ${m.email}` : ""}
                <span style={{ color: "var(--text-600)", fontSize: 12.5 }}> · {m.so_shop} shop ({m.so_vaccine} Vaccine, {m.so_long_chau} Long Châu)</span>
              </div>
            ))}
            {(asmCands.nhan_vien || []).length > 0 && (
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-600)", marginTop: asmCands.asm.length ? 8 : 0 }}>Nhân viên ({asmCands.nhan_vien.length})</div>
            )}
            {(asmCands.nhan_vien || []).map((m) => (
              <div
                key={`nv-${m.ma_nv}`}
                onClick={() => openNv(m.ma_nv, m.ten)}
                style={{ cursor: "pointer", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14 }}
              >
                <strong>{m.ten}</strong> - Mã NV {m.ma_nv}
                {m.shop_gan_nhat && (
                  <span style={{ color: "var(--text-600)", fontSize: 12.5 }}> · gần nhất: {m.shop_gan_nhat.ma_shop} - {m.shop_gan_nhat.ten_shop} (tháng {m.shop_gan_nhat.thang})</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tinhResult && <TinhShopsCard data={tinhResult} />}

      {asmError && <div className="placeholder-box">{asmError}</div>}
      {asmResult && <AsmShopsCard data={asmResult} />}

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
            <div className="card-head"><h3>{result.ma_shop} - {result.ten_shop || "—"}{result.vung ? ` - Vùng ${result.vung}` : ""}</h3></div>
            <div className="card-body">
              {result.thieu_shopinfo && (
                <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>
                  Shop chưa có trong file ShopInfo — chỉ hiện được dữ liệu kiểm kê.
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 18 }}>
                <InfoItem label="RSM"><NguoiList items={result.rsm} /></InfoItem>
                <InfoItem label="PRSM"><NguoiList items={result.prsm} /></InfoItem>
                <InfoItem label="ASM">
                  <NguoiList items={result.ten_asm ? [{ ten: result.ten_asm, email: result.email_asm }] : []} />
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
              ? <>Nhân viên <strong>{nvSearched}</strong>{nvResult.total_matches > 1 ? " — tách riêng theo Mã nhân viên bên dưới." : "."}</>
              : <>Không có nhân viên tên đúng "{nvSearched}" — hiện <strong>{nvResult.total_matches}</strong> nhân viên có tên chứa cụm này, tách riêng theo Mã nhân viên.</>}
            {nvResult.truncated && <span style={{ color: "var(--danger)" }}> (chỉ hiện 50 người đầu — hãy nhập tên đầy đủ hơn)</span>}
          </div>
          {nvResult.nhan_vien.map((nv) => <TruyThuNhanVienCard key={nv.ma_nv} nv={nv} />)}
        </>
      )}
    </Layout>
  );
}
