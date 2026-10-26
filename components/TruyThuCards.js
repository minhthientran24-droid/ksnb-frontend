import { useState } from "react";

export function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export function fmtMoney(n) {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString("vi-VN");
}

// "2026-09" -> "09/2026"
export function fmtThang(t) {
  const [y, m] = String(t || "").split("-");
  return y && m ? `${m}/${y}` : t || "—";
}

// Hệ số: bỏ số 0 thừa, tối đa 3 số lẻ (VD 0.100671 -> 0.101, 1 -> 1).
export function fmtHeSo(n) {
  if (n === null || n === undefined) return "—";
  return String(Math.round(n * 1000) / 1000);
}

// Cùng ngưỡng tô đỏ + in đậm như bảng "Đã kiểm" ở Theo dõi kiểm kê.
export const DANGER_THRESHOLD = -4999999;
export function moneyStyle(n) {
  return n !== null && n !== undefined && n < DANGER_THRESHOLD ? { color: "var(--danger)", fontWeight: 700 } : undefined;
}

// Các số truy thu tổng (theo tháng / theo kỳ kiểm kê) luôn tô đỏ (chốt 22/10).
export const REDMONEY = { color: "var(--danger)", fontWeight: 700 };
export const thLeft = { textAlign: "left" };
export const tdNum = { textAlign: "right", whiteSpace: "nowrap" };

// ---- Truy thu thực tế của 1 shop (tối đa 12 tháng gần nhất, mới nhất trước) ----
// Mỗi tháng 1 khối thu gọn được: tháng mới nhất mở sẵn, các tháng cũ chỉ hiện dòng tổng.
export function TruyThuShopCard({ data }) {
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
export function TruyThuNhanVienCard({ nv }) {
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

