import { useEffect, useMemo, useState } from "react";
import { getDangKiemXuatNhapKhac } from "../lib/api";

// Popup "Xuất khác - Nhập khác của shop" (tab Đang kiểm, chốt 27/10): toàn bộ giao dịch Nhập khác / Xuất khác của 1 shop từ
// NGÀY KIỂM tới NGÀY CHỐT KIỂM KÊ. Dữ liệu lấy từ menu "Xuất Khác - Nhập Khác EHO" (cần đã đồng bộ từ EHO), chỉ gồm đúng shop này.
const PAGE_SIZE = 50;
const HEADS = ["STT", "Trạng thái", "Mã phiếu", "Loại phiếu", "Loại yêu cầu", "Shop", "Kho", "Sản phẩm", "Số lô - HSD", "Số lượng", "Đơn vị tính", "Ngày tạo phiếu", "Người tạo phiếu", "Ghi chú"];

function fmtDT(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : (iso || "-");
}
function fmtD(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || "-");
}
const fmtNum = (n) => (n === null || n === undefined ? "-" : Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 2 }));

export default function XuatNhapKhacModal({ shop, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loai, setLoai] = useState(0); // 0 tất cả, 1 nhập khác, 2 xuất khác
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    getDangKiemXuatNhapKhac(shop.ma_shop, shop.tu, shop.den)
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(e.message || "Không tải được dữ liệu"));
    return () => { alive = false; };
  }, [shop.ma_shop, shop.tu, shop.den]);

  const rows = useMemo(() => {
    if (!data) return [];
    const k = q.trim().toLowerCase();
    return data.rows.filter((r) => (!loai || r.gri_type === loai)
      && (!k || [r.code, r.sku, r.sku_name, r.source_type_name].some((x) => String(x || "").toLowerCase().includes(k))));
  }, [data, loai, q]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const cur = Math.min(page, totalPages);
  const view = rows.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  const chip = (v, label) => (
    <button key={v} type="button" className="fbtn" onClick={() => { setLoai(v); setPage(1); }}
      style={loai === v ? { background: "var(--navy-800)", color: "#fff" } : undefined}>{label}</button>
  );

  return (
    <div style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: "var(--navy-900)", margin: 0 }}>📦 Xuất Khác - Nhập Khác EHO — {shop.ma_shop}{shop.ten_shop ? ` · ${shop.ten_shop}` : ""}</h3>
            <div style={{ fontSize: 12.5, color: "var(--text-600)", marginTop: 4 }}>
              Từ ngày kiểm <b>{fmtD(shop.tu)}</b> đến ngày chốt kiểm kê <b>{fmtDT(shop.den)}</b>
            </div>
          </div>
          <button className="fbtn" onClick={onClose}>✕ Đóng</button>
        </div>

        {!data && !error && <div style={{ padding: 20, textAlign: "center", color: "var(--text-400)" }}>Đang tải...</div>}
        {error && <div style={{ padding: 12, color: "var(--danger)" }}>{error}</div>}

        {data && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              {chip(0, `Tất cả (${data.total.toLocaleString("vi-VN")})`)}
              {chip(1, `Nhập khác (${data.so_nhap.toLocaleString("vi-VN")} dòng · SL ${fmtNum(data.tong_nhap)})`)}
              {chip(2, `Xuất khác (${data.so_xuat.toLocaleString("vi-VN")} dòng · SL ${fmtNum(data.tong_xuat)})`)}
              <input className="finput" placeholder="Mã phiếu / SKU / Tên SP / Loại yêu cầu" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ width: 280 }} />
            </div>
            {data.truncated && (
              <div style={{ fontSize: 12.5, color: "#8a5a00", border: "1px solid #E0A100", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
                ⚠️ Có {data.total.toLocaleString("vi-VN")} dòng, chỉ hiển thị {data.rows.length.toLocaleString("vi-VN")} dòng mới nhất (số dòng và tổng SL ở trên vẫn là đủ).
              </div>
            )}
            <div style={{ overflow: "auto", maxHeight: "58vh", border: "1px solid var(--border)", borderRadius: 8 }}>
              <table style={{ minWidth: 1750, fontSize: 12.5 }}>
                <thead>
                  <tr>{HEADS.map((h) => <th key={h} style={{ fontSize: 10.5, padding: "8px 8px", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--card, #fff)" }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {view.length === 0 && (
                    <tr><td colSpan={HEADS.length} style={{ textAlign: "center", color: "var(--text-400)", padding: 16 }}>
                      {data.total === 0 ? "Không có giao dịch Xuất khác / Nhập khác nào của shop trong khoảng thời gian này (hoặc chưa đồng bộ dữ liệu từ EHO)." : "Không có dòng nào khớp bộ lọc."}
                    </td></tr>
                  )}
                  {view.map((r, i) => (
                    <tr key={r.item_id}>
                      <td>{(cur - 1) * PAGE_SIZE + i + 1}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{r.status_name || "-"}</td>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{r.code}</td>
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
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", marginTop: 10, fontSize: 12.5 }}>
              <span>{rows.length.toLocaleString("vi-VN")} dòng · trang {cur}/{totalPages}</span>
              <button className="fbtn" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>‹</button>
              <button className="fbtn" disabled={cur >= totalPages} onClick={() => setPage(cur + 1)}>›</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const box = { background: "var(--card, #fff)", borderRadius: 12, padding: "18px 20px", width: "min(1280px, 100%)", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" };
