// Popup "Cảnh báo phân việc — Theo dõi chủ đề Ver2" (chốt 15/10) — dùng chung cho:
//  - trang Theo dõi chủ đề Ver2 (admin/super_admin xem FULL mỗi lần vào menu),
//  - trang chủ ngay sau khi đăng nhập (admin xem FULL; user khác chỉ thấy thông tin CỦA CHÍNH MÌNH,
//    nếu có — backend trả sẵn data đã lọc theo quyền, che_do = "admin" | "ca_nhan").
// Dữ liệu từ GET /chu-de-jobs-v2/staff-overview.

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(10,20,40,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
};

export function hasStaffAlertContent(data) {
  return !!data && ((data.chua_nhan_task || []).length > 0 || (data.nhan_task_qua_han || []).length > 0);
}

function groupByVung(list) {
  const groups = [];
  for (const item of list) {
    const label = item.khu_vuc || "Chưa khai báo vùng";
    let g = groups.find((x) => x.label === label);
    if (!g) { g = { label, items: [] }; groups.push(g); }
    g.items.push(item);
  }
  return groups;
}

function fmtNgayVn(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

const BanTag = () => (
  <span style={{ marginLeft: 8, background: "#1E3A5F", color: "#fff", borderRadius: 10, padding: "1px 8px", fontSize: 10.5, fontWeight: 700 }}>Bạn</span>
);

export default function StaffAlertModal({ data, onClose }) {
  const caNhan = data.che_do === "ca_nhan";
  const idleGroups = groupByVung(data.chua_nhan_task || []);
  const overdueGroups = groupByVung(data.nhan_task_qua_han || []);
  const cols = (n) => ({ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, Math.min(n, 2))}, minmax(0, 1fr))`, gap: 18, alignItems: "start" });
  const regionHead = (label, n, color) => (
    <div style={{ fontSize: 12.5, fontWeight: 700, color, marginBottom: 7, paddingBottom: 4, borderBottom: `2px solid ${color}` }}>{label} ({n})</div>
  );
  const nIdle = (data.chua_nhan_task || []).length;
  const nOver = (data.nhan_task_qua_han || []).length;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={{
          background: "#fff", borderRadius: 12, padding: "24px 26px", boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
          width: caNhan ? 760 : 1320, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", border: "2px solid #E8A33D",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 16, color: "#B26A00" }}>
          {caNhan ? "📣 Cảnh báo phân việc — Thông tin của bạn" : "📣 Cảnh báo phân việc — Theo dõi chủ đề Ver2"}
        </h3>

        {(!caNhan || nIdle > 0) && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--navy-900)", marginBottom: 10 }}>
              {caNhan
                ? "⏳ Bạn đang KHÔNG nhận xử lý task nào"
                : `⏳ Nhân viên đang KHÔNG nhận xử lý task nào (${nIdle}/${data.tong_nhan_vien_co_quyen})`}
            </div>
            {nIdle === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-400)" }}>Tất cả nhân viên có Quyền Kiểm Kê đều đang có task.</div>
            ) : (
              <div style={cols(idleGroups.length)}>
                {idleGroups.map((g) => (
                  <div key={g.label}>
                    {regionHead(g.label, g.items.length, "#8A4B00")}
                    {g.items.map((u) => (
                      <div
                        key={u.user_id}
                        style={{
                          display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline",
                          background: u.la_ban_than ? "#FFEFD2" : "#FFF8EF", border: `1px solid ${u.la_ban_than ? "#E8A33D" : "#F3D9AE"}`,
                          borderRadius: 8, padding: "7px 11px", marginBottom: 6, fontSize: 12.5,
                        }}
                      >
                        <strong style={{ color: "#6B3A00" }}>{u.full_name}{u.la_ban_than && !caNhan ? <BanTag /> : null}</strong>
                        <span style={{ color: "var(--text-600)", textAlign: "right", whiteSpace: "nowrap" }}>
                          {u.ngay_xu_ly_cuoi
                            ? <>Xử lý gần nhất: <strong>{fmtNgayVn(u.ngay_xu_ly_cuoi)}{u.ngay_hoan_tat_cuoi ? ` - ${fmtNgayVn(u.ngay_hoan_tat_cuoi)}` : ""}</strong>{u.so_ngay_chua_xu_ly != null ? ` (${u.so_ngay_chua_xu_ly} ngày trước)` : ""}</>
                            : "Chưa từng xử lý task"}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(!caNhan || nOver > 0) && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--navy-900)", marginBottom: 10 }}>
              {caNhan
                ? `⚠️ Bạn có task nhận quá ${data.so_ngay_nguong} ngày chưa hoàn tất`
                : `⚠️ Nhân viên có task nhận quá ${data.so_ngay_nguong} ngày chưa hoàn tất (${nOver})`}
            </div>
            {nOver === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-400)" }}>Không có task nào nhận quá {data.so_ngay_nguong} ngày.</div>
            ) : (
              <div style={cols(overdueGroups.length)}>
                {overdueGroups.map((g) => (
                  <div key={g.label}>
                    {regionHead(g.label, g.items.length, "#B3261E")}
                    {g.items.map((u) => (
                      <div
                        key={u.user_id}
                        style={{
                          border: `1px solid ${u.la_ban_than ? "#D9534F" : "#F0C4C0"}`, background: u.la_ban_than ? "#FBE9E7" : "#FDF4F3",
                          borderRadius: 8, padding: "9px 12px", marginBottom: 8,
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#B3261E" }}>
                          {caNhan ? `${u.tasks.length} task` : `${u.full_name} — ${u.tasks.length} task`}
                          {u.la_ban_than && !caNhan ? <BanTag /> : null}
                        </div>
                        <ul style={{ margin: "5px 0 0 18px", padding: 0, fontSize: 12.5, color: "var(--text-900)", lineHeight: 1.6 }}>
                          {u.tasks.map((t) => (
                            <li key={t.id}>
                              {t.ma_phieu ? <strong>{t.ma_phieu} · </strong> : null}
                              {t.ten_chu_de}
                              {(t.ma_shop || t.ten_shop) ? ` · ${[t.ma_shop, t.ten_shop].filter(Boolean).join(" - ")}` : ""}
                              {" — "}<strong style={{ color: "#B3261E" }}>{t.so_ngay} ngày</strong>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button type="button" className="login-btn" style={{ width: "auto", padding: "9px 26px" }} onClick={onClose}>Đóng</button>
      </div>
    </div>
  );
}
