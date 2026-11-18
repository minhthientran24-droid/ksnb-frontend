import { useEffect, useRef, useState } from "react";
import {
  listNhanHangLabUsers, listNhanHangAdminTasks, createNhanHangTask, updateNhanHangTask, deleteNhanHangTask, reopenNhanHangTask,
  downloadNhanHangTemplate, importNhanHangExcel, fetchNhanHangPhotoUrl,
} from "../lib/api";

// Màn hình QUẢN LÝ (web) của menu "Nhận hàng Long Châu LAB" (chốt 18/11): giao việc lấy hàng cho user loại LAB (nhập tay hoặc
// import Excel), xem trạng thái / ghi chú / ảnh nhận hàng. Xem backend/app/routers/nhan_hang_lab.py.
const TZ = "Asia/Ho_Chi_Minh";
const fmtDT = (iso) => new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
const todayVN = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const fmtQty = (q, dv) => (q === null || q === undefined ? "—" : `${q.toLocaleString("vi-VN")}${dv ? ` ${dv}` : ""}`);
// <input type="datetime-local"> ("2026-11-18T14:30") <-> ISO có múi giờ Việt Nam
const toIso = (local) => `${local}:00+07:00`;
const toLocal = (iso) => new Date(iso).toLocaleString("sv-SE", { timeZone: TZ }).replace(" ", "T").slice(0, 16);

const STATUS = {
  cho_lay: { label: "Chờ lấy", color: "#1C64B4" },
  da_nhan: { label: "Đã nhận", color: "#3E7A2A" },
  khong_nhan_duoc: { label: "Không nhận được", color: "#6B7280" },
};
const LEVEL_CHIP = { tre: { label: "TRỄ", color: "#C0392B" }, sap_tre: { label: "Sắp trễ", color: "#E8590C" } };

const thStyle = { textAlign: "center", padding: "8px 10px", fontSize: 12.5, whiteSpace: "nowrap" };
const tdStyle = { textAlign: "center", padding: "8px 10px", fontSize: 13.5, verticalAlign: "top" };
const labelStyle = { display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 4 };
const inputStyle = { width: "100%", padding: "8px 10px", fontSize: 13.5, borderRadius: 8, border: "1px solid var(--border)", boxSizing: "border-box" };

function PhotoModal({ task, onClose }) {
  const [urls, setUrls] = useState(null);
  useEffect(() => {
    let alive = true;
    const made = [];
    Promise.all(task.photo_ids.map((id) => fetchNhanHangPhotoUrl(id).catch(() => null))).then((u) => {
      u.forEach((x) => x && made.push(x));
      if (alive) setUrls(u.filter(Boolean));
    });
    return () => { alive = false; made.forEach((x) => URL.revokeObjectURL(x)); };
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 900, maxHeight: "90vh", overflowY: "auto", padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Ảnh nhận hàng — {task.ten_diem || task.dia_chi}</div>
          <button className="fbtn" onClick={onClose}>Đóng</button>
        </div>
        {task.ghi_chu_nhan && <div style={{ fontSize: 13.5, marginBottom: 10 }}>📝 {task.ghi_chu_nhan}</div>}
        {urls === null ? <div>Đang tải ảnh...</div> : urls.length === 0 ? <div>Không có ảnh.</div> : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" style={{ height: 220, borderRadius: 8, border: "1px solid var(--border)" }} /></a>)}
          </div>
        )}
      </div>
    </div>
  );
}

// Chọn ngày + giờ theo 24h (input datetime-local của trình duyệt hay hiện AM/PM khó chỉnh) — value dạng "YYYY-MM-DDTHH:MM"
function DateTime24({ value, onChange }) {
  const [d, t] = (value || "").split("T");
  const [hh, mm] = (t || "08:00").split(":");
  const pad = (n) => String(n).padStart(2, "0");
  const hours = Array.from({ length: 24 }, (_, i) => pad(i));
  const mins = Array.from({ length: 60 }, (_, i) => pad(i));
  const set = (nd, nh, nm) => onChange(`${nd || todayVN()}T${nh}:${nm}`);
  const sel = { ...inputStyle, width: "auto", flex: 1 };
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input style={{ ...inputStyle, flex: 2 }} type="date" value={d || ""} onChange={(e) => set(e.target.value, hh, mm)} />
      <select style={sel} value={hh} onChange={(e) => set(d, e.target.value, mm)}>{hours.map((h) => <option key={h} value={h}>{h}</option>)}</select>
      <span style={{ fontWeight: 800 }}>:</span>
      <select style={sel} value={mm} onChange={(e) => set(d, hh, e.target.value)}>{mins.map((m) => <option key={m} value={m}>{m}</option>)}</select>
    </div>
  );
}

function TaskModal({ task, users, onClose, onSaved }) {
  const editing = !!task?.id;
  const [f, setF] = useState(() => ({
    assigned_user_id: task?.assigned_user_id || (users[0]?.id ?? ""),
    ten_diem: task?.ten_diem || "", dia_chi: task?.dia_chi || "", so_luong: task?.so_luong ?? "", don_vi: task?.don_vi || "",
    mo_ta_hang: task?.mo_ta_hang || "", ghi_chu_giao: task?.ghi_chu_giao || "",
    han_lay: task?.han_lay ? toLocal(task.han_lay) : `${todayVN()}T08:00`,
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr("");
    if (!f.assigned_user_id) { setErr("Chọn người nhận việc (tài khoản loại LAB)"); return; }
    if (!f.dia_chi.trim()) { setErr("Nhập địa chỉ lấy hàng"); return; }
    if (!f.han_lay) { setErr("Nhập giờ cần lấy"); return; }
    setBusy(true);
    const body = {
      assigned_user_id: Number(f.assigned_user_id), ten_diem: f.ten_diem, dia_chi: f.dia_chi,
      so_luong: f.so_luong === "" ? null : Number(f.so_luong), don_vi: f.don_vi, mo_ta_hang: f.mo_ta_hang,
      ghi_chu_giao: f.ghi_chu_giao, han_lay: toIso(f.han_lay),
    };
    try {
      const saved = editing ? await updateNhanHangTask(task.id, body) : await createNhanHangTask(body);
      onSaved(saved);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 620, maxHeight: "92vh", overflowY: "auto", padding: "18px 20px" }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>{editing ? "Sửa việc lấy hàng" : "Thêm việc lấy hàng"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={labelStyle}>Người nhận việc (user LAB) *</label>
            <select style={inputStyle} value={f.assigned_user_id} onChange={set("assigned_user_id")}>
              {users.length === 0 && <option value="">— chưa có tài khoản LAB —</option>}
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
            </select></div>
          <div><label style={labelStyle}>Giờ cần lấy *</label><DateTime24 value={f.han_lay} onChange={(v) => setF({ ...f, han_lay: v })} /></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>Địa chỉ lấy hàng *</label><input style={inputStyle} value={f.dia_chi} onChange={set("dia_chi")} /></div>
          <div><label style={labelStyle}>Tên điểm / cửa hàng</label><input style={inputStyle} value={f.ten_diem} onChange={set("ten_diem")} /></div>
          <div><label style={labelStyle}>Mô tả hàng cần lấy</label><input style={inputStyle} value={f.mo_ta_hang} onChange={set("mo_ta_hang")} /></div>
          <div><label style={labelStyle}>Số lượng</label><input style={inputStyle} type="number" min="0" step="any" value={f.so_luong} onChange={set("so_luong")} /></div>
          <div><label style={labelStyle}>Đơn vị</label><input style={inputStyle} value={f.don_vi} onChange={set("don_vi")} placeholder="thùng / hộp / cái..." /></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>Ghi chú cho người lấy</label><input style={inputStyle} value={f.ghi_chu_giao} onChange={set("ghi_chu_giao")} /></div>
        </div>
        {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="fbtn" onClick={onClose} disabled={busy}>Huỷ</button>
          <button className="login-btn" style={{ width: "auto", padding: "8px 22px" }} onClick={save} disabled={busy}>{busy ? "Đang lưu..." : "Lưu"}</button>
        </div>
      </div>
    </div>
  );
}

export default function NhanHangLabAdmin() {
  const [from, setFrom] = useState(""); // bỏ trống = tất cả ngày (chốt 18/11)
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("");
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [modal, setModal] = useState(null); // {task?} | null
  const [photoTask, setPhotoTask] = useState(null);
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);

  function load() {
    setLoading(true);
    listNhanHangAdminTasks({ tu_ngay: from, den_ngay: to, user_id: userId, trang_thai: status })
      .then((r) => { setItems(r.items); setErr(""); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { listNhanHangLabUsers().then(setUsers).catch(() => {}); }, []);
  useEffect(() => { load(); }, [from, to, userId, status]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [from, to, userId, status]);

  async function act(name, fn, ok) {
    setBusy(name); setErr(""); setMsg("");
    try { await fn(); if (ok) setMsg(ok); load(); } catch (e) { setErr(e.message); } finally { setBusy(""); }
  }

  // Sau khi tạo/nhập: mở rộng bộ lọc để thấy ngay việc vừa thêm (nếu hạn lấy nằm ngoài ngày đang lọc)
  function showRange(a, b) {
    if (from && a && a < from) setFrom(a);
    if (to && b && b > to) setTo(b);
    setUserId(""); setStatus("");
  }

  async function onImport(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    act("import", async () => { const r = await importNhanHangExcel(file); showRange(r.tu_ngay, r.den_ngay); setMsg(`Đã nhập ${r.imported} việc từ file Excel.`); }, "");
  }

  const cnt = (s) => items.filter((t) => t.trang_thai === s).length;
  const late = items.filter((t) => t.muc_do === "tre").length;

  return (
    <>
      {modal && <TaskModal task={modal.task} users={users} onClose={() => setModal(null)} onSaved={(t) => { setModal(null); setMsg("Đã lưu."); if (t?.han_lay) { const d = toLocal(t.han_lay).slice(0, 10); showRange(d, d); } load(); }} />}
      {photoTask && <PhotoModal task={photoTask} onClose={() => setPhotoTask(null)} />}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div><label style={labelStyle}>Từ ngày</label><input className="finput" type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to && e.target.value > to) setTo(e.target.value); }} /></div>
          <div><label style={labelStyle}>Đến ngày</label><input className="finput" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="fbtn" title="Chỉ xem việc của hôm nay" onClick={() => { setFrom(todayVN()); setTo(todayVN()); }}>Hôm nay</button>
            <button className="fbtn" title="Xem tất cả các ngày" onClick={() => { setFrom(""); setTo(""); }} disabled={!from && !to}>Tất cả ngày</button>
          </div>
          <div><label style={labelStyle}>Người nhận</label>
            <select className="finput" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Tất cả</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select></div>
          <div><label style={labelStyle}>Trạng thái</label>
            <select className="finput" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Tất cả</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="fbtn" onClick={() => act("tpl", downloadNhanHangTemplate)}>📥 File mẫu</button>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={onImport} />
            <button className="fbtn" disabled={busy === "import"} onClick={() => fileRef.current?.click()}>{busy === "import" ? "Đang nhập..." : "📤 Import Excel"}</button>
            <button className="login-btn" style={{ width: "auto", padding: "8px 18px" }} onClick={() => setModal({ task: null })}>+ Thêm việc</button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {[["Tổng việc", items.length, "var(--text-900)"], ["Chờ lấy", cnt("cho_lay"), "#1C64B4"], ["Trễ hạn", late, "#C0392B"], ["Đã nhận", cnt("da_nhan"), "#3E7A2A"], ["Không nhận được", cnt("khong_nhan_duoc"), "#6B7280"]].map(([l, n, c]) => (
          <div key={l} className="card" style={{ margin: 0, padding: "10px 16px", minWidth: 120 }}>
            <div style={{ fontSize: 12.5, color: "var(--text-600)" }}>{l}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: c }}>{n}</div>
          </div>
        ))}
      </div>

      {msg && <div style={{ color: "#3E7A2A", fontSize: 13.5, marginBottom: 10 }}>{msg}</div>}
      {err && <div style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 10 }}>{err}</div>}

      <div className="card">
        <div className="card-head"><h3>Danh sách việc lấy hàng ({items.length})</h3><span className="note">Tự làm mới mỗi phút · user LAB: {users.length}</span></div>
        <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
          {loading && items.length === 0 ? <div className="placeholder-box">Đang tải...</div> : items.length === 0 ? (
            <div className="placeholder-box">Không có việc nào theo bộ lọc này. Bấm "+ Thêm việc" hoặc "Import Excel" để giao việc.</div>
          ) : (
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Giờ cần lấy</th><th style={thStyle}>Người nhận</th><th style={{ ...thStyle, textAlign: "left" }}>Điểm / địa chỉ</th>
                  <th style={thStyle}>SL cần lấy</th><th style={thStyle}>Trạng thái</th><th style={thStyle}>SL thực nhận</th><th style={{ ...thStyle, textAlign: "left" }}>Ghi chú nhận</th>
                  <th style={thStyle}>Ảnh</th><th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => {
                  const st = STATUS[t.trang_thai];
                  const lv = LEVEL_CHIP[t.muc_do];
                  return (
                    <tr key={t.id} style={t.muc_do === "tre" ? { background: "#FDEAEA" } : undefined}>
                      <td className="num" style={tdStyle}>{fmtDT(t.han_lay)}</td>
                      <td style={tdStyle}>{t.assigned_name}</td>
                      <td style={{ ...tdStyle, textAlign: "left", maxWidth: 320 }}>
                        {t.ten_diem && <div style={{ fontWeight: 700 }}>{t.ten_diem}</div>}
                        <div>{t.dia_chi}</div>
                        {t.mo_ta_hang && <div style={{ fontSize: 12, color: "var(--text-600)" }}>{t.mo_ta_hang}</div>}
                        {t.ghi_chu_giao && <div style={{ fontSize: 12, color: "var(--text-600)" }}>📝 {t.ghi_chu_giao}</div>}
                      </td>
                      <td className="num" style={tdStyle}>{fmtQty(t.so_luong, t.don_vi)}</td>
                      <td style={tdStyle}>
                        <span style={{ background: st.color, color: "#fff", fontWeight: 700, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap", fontSize: 12.5 }}>{st.label}</span>
                        {lv && <div><span style={{ background: lv.color, color: "#fff", fontWeight: 700, padding: "2px 8px", borderRadius: 999, fontSize: 11.5, display: "inline-block", marginTop: 4 }}>{lv.label}</span></div>}
                        {t.received_at && <div style={{ fontSize: 11.5, color: "var(--text-600)", marginTop: 4 }}>{fmtDT(t.received_at)}</div>}
                      </td>
                      <td className="num" style={tdStyle}>{t.trang_thai === "da_nhan" ? fmtQty(t.so_luong_thuc_te, t.don_vi) : "—"}</td>
                      <td style={{ ...tdStyle, textAlign: "left", maxWidth: 240 }}>{t.ghi_chu_nhan || "—"}</td>
                      <td style={tdStyle}>{t.photo_ids.length ? <a href="#" onClick={(e) => { e.preventDefault(); setPhotoTask(t); }}>🖼 {t.photo_ids.length} ảnh</a> : "—"}</td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        {t.trang_thai === "cho_lay" ? (
                          <button className="fbtn" onClick={() => setModal({ task: t })}>Sửa</button>
                        ) : (
                          <button className="fbtn" onClick={() => window.confirm("Mở lại việc này? Ảnh và ghi chú nhận hàng sẽ bị xoá.") && act("reopen", () => reopenNhanHangTask(t.id), "Đã mở lại việc.")}>Mở lại</button>
                        )}{" "}
                        <button className="fbtn danger" onClick={() => window.confirm("Xoá việc này (kèm ảnh nếu có)?") && act("del", () => deleteNhanHangTask(t.id), "Đã xoá.")}>Xoá</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
