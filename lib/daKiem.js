// Helper dùng chung cho bảng "Đã kiểm": Theo dõi kiểm kê + menu Thống kê Kiểm Kê của Guest (chốt 26/10).

// "2026-10-19" (hoặc kèm giờ) -> "19-10" — bảng Đã kiểm chỉ hiện Ngày-Tháng cho gọn (chốt 26/10).
export function fmtNgayThang(iso) {
  const m = String(iso || "").match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[2]}-${m[1]}` : (iso || "-");
}

// "2026-10-21T15:30:00" -> "21-10 15:30"; chỉ có ngày ("2026-10-21") -> "21-10" — cột Ngày chốt kiểm kê ở tab Đang kiểm.
export function fmtNgayGio(iso) {
  const m = String(iso || "").match(/^\d{4}-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return iso || "-";
  return m[3] ? `${m[2]}-${m[1]} ${m[3]}:${m[4]}` : `${m[2]}-${m[1]}`;
}

export function fmtMoney(n) {
  // Giá trị null/undefined ở bảng "Đã kiểm" hiểu là 0 (chốt 27/08 lần 8)
  // — không hiện "-" nữa, hiện thẳng "0".
  const v = n === undefined || n === null ? 0 : n;
  // Chỉ lấy phần đơn vị, bỏ phần thập phân (chốt 27/08) — áp dụng chung
  // cho mọi cột tiền, kể cả "Lũy Kế" (Float, có sẵn phần lẻ từ nguồn).
  return Math.round(v).toLocaleString("vi-VN");
}

// "Ước tính truy thu" — Long Châu (chốt 27/08 lần 7):
// = Kiểm kê - Non CL + Cân tồn - Non CL + Lũy Kế
//   + (Kiểm kê - Cắt liều + Cân tồn - Cắt liều)  -- CHỈ cộng phần này khi
//     tổng cắt liều < 0; nếu > 0 thì bỏ qua, không cộng vào.
// Thành phần nào null/undefined coi là 0 (chốt 27/08 lần 8, áp dụng
// chung cho cả bảng, không riêng công thức này).
export function tinhUocTinhTruyThuLongChau(r) {
  const nonCl = (r.gia_tri_non_cl || 0) + (r.can_ton_non_cl || 0) + (r.luy_ke || 0);
  const catLieuSum = (r.gia_tri_cat_lieu || 0) + (r.can_ton_cat_lieu || 0);
  return nonCl + (catLieuSum < 0 ? catLieuSum : 0);
}

// "Ước tính truy thu" — Vaccine (chốt 29/08):
// tổng = Kiểm kê VPKM + Kiểm kê VX + Kiểm kê VTYT
// - tổng >= 0 -> truy thu = 0 (KHÔNG cộng lũy kế).
// - tổng < 0 -> cộng thêm Lũy Kế: sau khi cộng mà vẫn < 0 thì đó là giá
//   trị truy thu; còn nếu cộng lũy kế xong >= 0 thì truy thu = 0.
export function tinhUocTinhTruyThuVaccine(r) {
  const tong = (r.kiem_ke_vpkm || 0) + (r.kiem_ke_vx || 0) + (r.kiem_ke_vtyt || 0);
  if (tong >= 0) return 0;
  const sauLuyKe = tong + (r.luy_ke || 0);
  return sauLuyKe < 0 ? sauLuyKe : 0;
}

// Chốt 07/09 — "Ước tính truy thu" > 0 thì hiển thị = 0 (đây là ước tính
// SỐ TIỀN CẦN TRUY THU nên chỉ có ý nghĩa khi âm/bằng 0; dương nghĩa là
// dư, không truy thu gì cả). Nhánh Vaccine vốn đã không bao giờ ra dương
// (luôn return 0 khi >= 0), riêng nhánh Long Châu có thể ra dương —
// clamp chung ở đây cho chắc, khỏi sửa riêng từng nhánh.
export function tinhUocTinhTruyThu(r) {
  const v = r.nhom === "vaccine" ? tinhUocTinhTruyThuVaccine(r) : tinhUocTinhTruyThuLongChau(r);
  return v > 0 ? 0 : v;
}

// Số liệu bảng "Đã kiểm" — CHỈ tô đỏ + in đậm khi giá trị < -4.999.999,
// còn lại hiện bình thường (chốt 27/08 lần 14 — trước đây tô đỏ theo
// className "neg" cho mọi số âm, không phân biệt mức độ).
export const DANGER_THRESHOLD = -4999999;
export function moneyStyle(n) {
  const v = n === undefined || n === null ? 0 : n;
  return v < DANGER_THRESHOLD ? { color: "var(--danger)", fontWeight: 700 } : undefined;
}

// Sort bấm-vào-tiêu-đề cho toàn bộ cột bảng "Đã kiểm" (chốt 27/08 lần 10)
// — mỗi cột khai báo cách lấy giá trị để so sánh + kiểu dữ liệu (text
// sort A→Z/Z→A, number sort tăng/giảm dần). Null/undefined coi là 0
// (number) hoặc chuỗi rỗng (text) — nhất quán với quy tắc "null hiểu là
// 0" đã chốt cho cả bảng.
export const SORT_COLUMNS = {
  vung: { type: "text", get: (r) => r.vung },
  ten_shop: { type: "text", get: (r) => r.ten_shop },
  ngay_kiem_ke: { type: "text", get: (r) => r.ngay_kiem_ke },
  ngay_gui: { type: "text", get: (r) => r.ngay_gui },
  ngay_chot_kiem_ke: { type: "text", get: (r) => r.ngay_chot_kiem_ke },
  gia_tri_non_cl: { type: "number", get: (r) => r.gia_tri_non_cl },
  can_ton_non_cl: { type: "number", get: (r) => r.can_ton_non_cl },
  gia_tri_cat_lieu: { type: "number", get: (r) => r.gia_tri_cat_lieu },
  can_ton_cat_lieu: { type: "number", get: (r) => r.can_ton_cat_lieu },
  // 3 cột riêng cho nhóm Vaccine (chốt 29/08) — lấy từ C12/C13/C14 sheet
  // "Tổng hợp BCKS" lúc gửi mail BCKS, xem gui_mail_bcks.py.
  kiem_ke_vx: { type: "number", get: (r) => r.kiem_ke_vx },
  kiem_ke_vtyt: { type: "number", get: (r) => r.kiem_ke_vtyt },
  kiem_ke_vpkm: { type: "number", get: (r) => r.kiem_ke_vpkm },
  luy_ke: { type: "number", get: (r) => r.luy_ke },
  uoc_tinh_truy_thu: { type: "number", get: (r) => tinhUocTinhTruyThu(r) },
  truy_thu_thanh_ly: { type: "number", get: (r) => r.truy_thu_thanh_ly },
  nv_kiem_ke: { type: "text", get: (r) => r.nv_kiem_ke },
};

export function sortDaKiemRows(rows, sortKey, sortDir) {
  const col = SORT_COLUMNS[sortKey];
  if (!col) return rows;
  const mul = sortDir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (col.type === "number") {
      const va = col.get(a) || 0;
      const vb = col.get(b) || 0;
      return (va - vb) * mul;
    }
    const va = String(col.get(a) || "");
    const vb = String(col.get(b) || "");
    return va.localeCompare(vb, "vi") * mul;
  });
}

