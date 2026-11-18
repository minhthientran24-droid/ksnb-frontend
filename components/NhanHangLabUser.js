import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  getNhanHangMy, confirmNhanHang, fetchNhanHangPhotoUrl, getNhanHangPushKey, subscribeNhanHangPush, testNhanHangPush,
} from "../lib/api";

// Màn hình ĐIỆN THOẠI của user loại LAB (chốt 18/11): danh sách địa chỉ cần lấy hàng trong ngày (số lượng + giờ cần lấy),
// bấm "Nhận hàng" kèm ghi chú + ảnh, có thông báo đẩy khi sắp trễ / trễ hạn. Xem backend/app/routers/nhan_hang_lab.py.
const TZ = "Asia/Ho_Chi_Minh";
const fmtHM = (iso) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
const fmtDM = (iso) => new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: TZ });
const dayKey = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const fmtQty = (q, dv) => (q === null || q === undefined ? "—" : `${q.toLocaleString("vi-VN")}${dv ? ` ${dv}` : ""}`);

function remainText(iso, now) {
  const diff = Math.round((new Date(iso).getTime() - now) / 60000);
  const abs = Math.abs(diff);
  const t = abs >= 60 ? `${Math.floor(abs / 60)} giờ${abs % 60 ? ` ${abs % 60} phút` : ""}` : `${abs} phút`;
  return diff >= 0 ? `còn ${t}` : `trễ ${t}`;
}

// Bản đã nén ảnh (tối đa 1600px, JPEG) trước khi gửi — nhẹ mạng 4G; server nén lại lần nữa.
async function shrinkImage(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], (file.name || "anh").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function b64ToU8(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
}

async function subscribePush() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { public_key } = await getNhanHangPushKey();
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(public_key) });
    } catch (e) {
      const old = await reg.pushManager.getSubscription();
      if (old) await old.unsubscribe();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(public_key) });
    }
  }
  await subscribeNhanHangPush(sub.toJSON()); // luôn đồng bộ lên server (kể cả đổi người đăng nhập trên cùng điện thoại)
}

const LEVEL = {
  tre: { bg: "#FDEAEA", bd: "#E5A4A4", chip: "#C0392B", label: "TRỄ" },
  sap_tre: { bg: "#FFF3E0", bd: "#F2C688", chip: "#E8590C", label: "SẮP TRỄ" },
  binh_thuong: { bg: "#fff", bd: "var(--border)", chip: "#1C64B4", label: "Chờ lấy" },
  xong: { bg: "#F1F8EE", bd: "#BBD9AE", chip: "#3E7A2A", label: "Đã nhận" },
};

function PhotoThumbs({ ids }) {
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    let alive = true;
    const made = [];
    Promise.all(ids.map((id) => fetchNhanHangPhotoUrl(id).catch(() => null))).then((u) => {
      u.forEach((x) => x && made.push(x));
      if (alive) setUrls(u.filter(Boolean));
    });
    return () => { alive = false; made.forEach((x) => URL.revokeObjectURL(x)); };
  }, [ids.join(",")]);
  if (!ids.length) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
      {urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} /></a>
      ))}
    </div>
  );
}

export default function NhanHangLabUser() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(Date.now());
  const [sheet, setSheet] = useState(null); // việc đang mở form nhận hàng
  const [push, setPush] = useState("checking"); // checking | unsupported | off | denied | on
  const [pushMsg, setPushMsg] = useState("");
  const focusId = Number(router.query.task) || null;

  function load() {
    return getNhanHangMy().then((r) => { setData(r); setErr(""); }).catch((e) => setErr(e.message));
  }

  useEffect(() => {
    load();
    const a = setInterval(load, 60000);
    const b = setInterval(() => setNow(Date.now()), 30000);
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(a); clearInterval(b); document.removeEventListener("visibilitychange", vis); };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setPush("unsupported"); return; }
    if (Notification.permission === "denied") { setPush("denied"); return; }
    if (Notification.permission === "granted") {
      subscribePush().then(() => setPush("on")).catch(() => setPush("off"));
      return;
    }
    setPush("off");
  }, []);

  async function enablePush() {
    setPushMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setPush(perm === "denied" ? "denied" : "off"); return; }
      await subscribePush();
      setPush("on");
      setPushMsg("Đã bật thông báo.");
    } catch (e) {
      setPushMsg(`Không bật được thông báo: ${e.message || e}`);
    }
  }

  async function sendTest() {
    setPushMsg("");
    try {
      const r = await testNhanHangPush();
      setPushMsg(r.sent > 0 ? "Đã gửi thông báo thử — vài giây nữa sẽ hiện trên điện thoại." : "Server chưa gửi được tới thiết bị này, hãy bấm Bật thông báo lại.");
    } catch (e) {
      setPushMsg(e.message);
    }
  }

  const items = data?.items || [];
  const pending = items.filter((t) => t.trang_thai === "cho_lay");
  const done = items.filter((t) => t.trang_thai !== "cho_lay");
  const today = data ? new Date(data.server_time).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }) : "";

  function renderTask(t) {
    const lv = LEVEL[t.trang_thai === "khong_nhan_duoc" ? "xong" : t.muc_do] || LEVEL.binh_thuong;
    // mức độ tính lại theo đồng hồ máy để màu/đếm ngược chạy mượt giữa 2 lần tải
    let level = t.muc_do;
    if (t.trang_thai === "cho_lay") {
      const diff = (new Date(t.han_lay).getTime() - now) / 60000;
      level = diff <= 0 ? "tre" : diff <= 30 ? "sap_tre" : "binh_thuong";
    }
    const L = t.trang_thai === "cho_lay" ? LEVEL[level] : lv;
    const other = dayKey(t.han_lay) !== dayKey(data.server_time);
    const maps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(t.dia_chi)}`;
    return (
      <div id={`task-${t.id}`} key={t.id} style={{ background: L.bg, border: `1.5px solid ${t.id === focusId ? "#1C64B4" : L.bd}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12, boxShadow: t.id === focusId ? "0 0 0 3px #BBD7F5" : "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text-900)", lineHeight: 1 }}>
            {fmtHM(t.han_lay)}{other && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-600)", marginLeft: 6 }}>{fmtDM(t.han_lay)}</span>}
          </div>
          <span style={{ background: t.trang_thai === "khong_nhan_duoc" ? "#6B7280" : L.chip, color: "#fff", fontWeight: 800, fontSize: 13, padding: "5px 12px", borderRadius: 999, whiteSpace: "nowrap" }}>
            {t.trang_thai === "cho_lay" ? `${L.label} · ${remainText(t.han_lay, now)}` : t.trang_thai === "da_nhan" ? "Đã nhận" : "Không nhận được"}
          </span>
        </div>
        {t.ten_diem && <div style={{ fontSize: 16, fontWeight: 800, marginTop: 10 }}>{t.ten_diem}</div>}
        <div style={{ fontSize: 15, marginTop: t.ten_diem ? 2 : 10, lineHeight: 1.45 }}>📍 {t.dia_chi}</div>
        <div style={{ fontSize: 15, marginTop: 8, fontWeight: 700 }}>
          📦 Cần lấy: {fmtQty(t.so_luong, t.don_vi)}{t.mo_ta_hang ? <span style={{ fontWeight: 500 }}> · {t.mo_ta_hang}</span> : null}
        </div>
        {t.ghi_chu_giao && <div style={{ fontSize: 14, marginTop: 6, color: "var(--text-600)" }}>📝 {t.ghi_chu_giao}</div>}

        {t.trang_thai === "cho_lay" ? (
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <a href={maps} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", padding: "13px 8px", borderRadius: 10, border: "1.5px solid #1C64B4", color: "#1C64B4", background: "#fff", fontWeight: 800, fontSize: 15, textDecoration: "none" }}>🧭 Chỉ đường</a>
            <button onClick={() => setSheet(t)} style={{ flex: 1.3, padding: "13px 8px", borderRadius: 10, border: "none", background: "#3E7A2A", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>✅ Nhận hàng</button>
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 14, borderTop: "1px dashed var(--border)", paddingTop: 8 }}>
            <div>Lúc {fmtHM(t.received_at)} · Thực nhận: <b>{fmtQty(t.so_luong_thuc_te, t.don_vi)}</b></div>
            {t.ghi_chu_nhan && <div style={{ marginTop: 4 }}>📝 {t.ghi_chu_nhan}</div>}
            <PhotoThumbs ids={t.photo_ids} />
          </div>
        )}
      </div>
    );
  }

  useEffect(() => {
    if (focusId && data) document.getElementById(`task-${focusId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusId, !!data]);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--text-600)", textTransform: "capitalize" }}>{today}</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>📦 Danh sách điểm nhận mẫu hôm nay</div>
        </div>
        <button onClick={load} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>🔄</button>
      </div>

      {push !== "checking" && push !== "on" && (
        <div style={{ background: "#E3F0FF", border: "1px solid #BBD7F5", borderRadius: 12, padding: "12px 14px", marginBottom: 12, fontSize: 14, lineHeight: 1.5 }}>
          {push === "off" && (
            <>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>🔔 Bật thông báo để được nhắc khi sắp trễ giờ lấy hàng</div>
              <button onClick={enablePush} style={{ padding: "11px 16px", borderRadius: 10, border: "none", background: "#1C64B4", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Bật thông báo</button>
            </>
          )}
          {push === "denied" && <div>🔕 Thông báo đang bị chặn. Vào <b>Cài đặt trình duyệt → Quyền của trang web → Thông báo</b> để cho phép, rồi mở lại trang.</div>}
          {push === "unsupported" && <div>🔕 Trình duyệt này chưa hỗ trợ thông báo. Hãy dùng <b>Chrome trên Android</b> (hoặc thêm trang vào màn hình chính) để nhận nhắc giờ.</div>}
        </div>
      )}
      {push === "on" && (
        <div style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 10 }}>
          🔔 Thông báo đã bật <button onClick={sendTest} style={{ marginLeft: 6, border: "none", background: "none", color: "#1C64B4", fontWeight: 700, cursor: "pointer", textDecoration: "underline", fontSize: 12.5 }}>Gửi thử</button>
        </div>
      )}
      {pushMsg && <div style={{ fontSize: 13, color: "var(--text-600)", marginBottom: 10 }}>{pushMsg}</div>}
      {err && <div style={{ background: "#FDEAEA", color: "var(--danger)", padding: "10px 12px", borderRadius: 10, marginBottom: 12, fontSize: 14 }}>{err}</div>}

      {data && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px" }}>
              <div style={{ fontSize: 12.5, color: "var(--text-600)" }}>Chờ lấy</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#1C64B4" }}>{pending.length}</div>
            </div>
            <div style={{ flex: 1, background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px" }}>
              <div style={{ fontSize: 12.5, color: "var(--text-600)" }}>Đã xong</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#3E7A2A" }}>{done.length}</div>
            </div>
          </div>
          {items.length === 0 && <div className="placeholder-box">Hôm nay chưa có việc lấy hàng nào được giao cho bạn.</div>}
          {pending.map(renderTask)}
          {done.length > 0 && <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-600)", margin: "18px 0 8px" }}>ĐÃ XỬ LÝ</div>}
          {done.map(renderTask)}
        </>
      )}

      {sheet && <ConfirmSheet task={sheet} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load(); }} />}
    </div>
  );
}

function ConfirmSheet({ task, onClose, onDone }) {
  const [qty, setQty] = useState(task.so_luong === null || task.so_luong === undefined ? "" : String(task.so_luong));
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState([]); // [{file, url}]
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const input = useRef(null);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []);

  async function addFiles(e) {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    if (!list.length) return;
    setBusy("photo");
    const out = [];
    for (const f of list) {
      const small = await shrinkImage(f);
      out.push({ file: small, url: URL.createObjectURL(small) });
    }
    setPhotos((p) => [...p, ...out].slice(0, 8));
    setBusy("");
  }

  async function submit(ketQua) {
    setErr("");
    if (ketQua === "khong_nhan_duoc" && !note.trim()) { setErr("Không nhận được hàng: hãy ghi lý do vào ô ghi chú."); return; }
    if (ketQua === "khong_nhan_duoc" && !window.confirm("Xác nhận KHÔNG nhận được hàng tại địa chỉ này?")) return;
    setBusy(ketQua);
    try {
      await confirmNhanHang(task.id, { ketQua, ghiChu: note, soLuongThucTe: ketQua === "da_nhan" ? qty : "", files: photos.map((p) => p.file) });
      onDone();
    } catch (e) {
      setErr(e.message);
      setBusy("");
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto", borderRadius: "18px 18px 0 0", padding: "18px 18px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Nhận hàng</div>
            <div style={{ fontSize: 14, color: "var(--text-600)", marginTop: 2 }}>{task.ten_diem ? `${task.ten_diem} — ` : ""}{task.dia_chi}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 24, cursor: "pointer", color: "var(--text-600)" }}>✕</button>
        </div>

        <label style={{ display: "block", fontSize: 14, fontWeight: 700, margin: "16px 0 6px" }}>Số lượng thực nhận {task.so_luong !== null && task.so_luong !== undefined ? `(cần lấy: ${fmtQty(task.so_luong, task.don_vi)})` : ""}</label>
        <input type="number" inputMode="decimal" min="0" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: "100%", padding: "13px 12px", fontSize: 17, borderRadius: 10, border: "1.5px solid var(--border)" }} />

        <label style={{ display: "block", fontSize: 14, fontWeight: 700, margin: "14px 0 6px" }}>Ghi chú</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="VD: đã nhận đủ, người giao là anh A... (bắt buộc nếu không nhận được)" style={{ width: "100%", padding: "11px 12px", fontSize: 16, borderRadius: 10, border: "1.5px solid var(--border)", resize: "vertical", fontFamily: "inherit" }} />

        <label style={{ display: "block", fontSize: 14, fontWeight: 700, margin: "14px 0 6px" }}>Ảnh ({photos.length}/8)</label>
        <input ref={input} type="file" accept="image/*" multiple onChange={addFiles} style={{ display: "none" }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {photos.map((p, i) => (
            <div key={p.url} style={{ position: "relative" }}>
              <img src={p.url} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }} />
              <button onClick={() => { URL.revokeObjectURL(p.url); setPhotos((x) => x.filter((_, j) => j !== i)); }} style={{ position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: 12, border: "none", background: "#C0392B", color: "#fff", fontWeight: 800, cursor: "pointer" }}>×</button>
            </div>
          ))}
          {photos.length < 8 && (
            <button onClick={() => input.current?.click()} disabled={busy === "photo"} style={{ width: 80, height: 80, borderRadius: 10, border: "2px dashed #1C64B4", background: "#F3F8FF", color: "#1C64B4", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              {busy === "photo" ? "..." : "📷 Chụp / chọn ảnh"}
            </button>
          )}
        </div>

        {err && <div style={{ background: "#FDEAEA", color: "var(--danger)", padding: "10px 12px", borderRadius: 10, marginTop: 14, fontSize: 14 }}>{err}</div>}

        <button disabled={!!busy} onClick={() => submit("da_nhan")} style={{ width: "100%", marginTop: 18, padding: "15px 8px", borderRadius: 12, border: "none", background: "#3E7A2A", color: "#fff", fontWeight: 800, fontSize: 17, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy === "da_nhan" ? "Đang gửi..." : "✅ Xác nhận đã nhận hàng"}
        </button>
        <button disabled={!!busy} onClick={() => submit("khong_nhan_duoc")} style={{ width: "100%", marginTop: 10, padding: "12px 8px", borderRadius: 12, border: "1.5px solid #C0392B", background: "#fff", color: "#C0392B", fontWeight: 800, fontSize: 15, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy === "khong_nhan_duoc" ? "Đang gửi..." : "Không nhận được hàng"}
        </button>
      </div>
    </div>
  );
}
