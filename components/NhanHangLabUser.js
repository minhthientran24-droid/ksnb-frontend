import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  getNhanHangMy, getNhanHangDiemHen, confirmNhanHang, fetchNhanHangPhotoUrl, getNhanHangPushKey, subscribeNhanHangPush, testNhanHangPush,
} from "../lib/api";

// Màn hình ĐIỆN THOẠI của user loại LAB (chốt 18/11): danh sách địa chỉ cần lấy hàng trong ngày (số lượng + giờ cần lấy),
// bấm "Nhận hàng" kèm ghi chú + ảnh, có thông báo đẩy khi sắp trễ / trễ hạn. Xem backend/app/routers/nhan_hang_lab.py.
const TZ = "Asia/Ho_Chi_Minh";
const fmtHM = (iso) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
const fmtDM = (iso) => new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: TZ });
const dayKey = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
// Khoảng cách xác nhận so với điểm nhận mẫu (ước lượng từ địa chỉ): màu theo mức lệch
const fmtDist = (m) => (m < 1000 ? `${m} m` : `${(m / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km`);
const distColor = (m) => (m <= 300 ? "#3E7A2A" : m <= 1000 ? "#E8590C" : "#C0392B");
// Khoảng cách đường chim bay (mét) giữa 2 toạ độ
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dp = rad(lat2 - lat1), dl = rad(lng2 - lng1);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const CANH_BAO_XA_M = 1000; // vị trí hoàn tất cách điểm nhận mẫu hơn 1 km -> cảnh báo
const CANH_BAO_SOM_PHUT = 60; // hoàn tất sớm hơn giờ hẹn từ 60 phút trở lên -> cảnh báo
const fmtQty = (q) => (q === null || q === undefined ? "—" : `${q.toLocaleString("vi-VN")} mẫu`);
// Làm sạch địa chỉ trước khi gửi Google Maps: địa chỉ đối tác hay có nhiều số nhà nối nhau ("803-805-807-809 Đường 3/2") + ghi chú trong ngoặc,
// khiến Google hiểu thành TÊN cơ sở khác và chỉ sai. Bỏ phần trong ngoặc, chỉ lấy số nhà đầu của dải số, "Tp.HCM" -> "Hồ Chí Minh".
const cleanAddr = (a) => {
  let s = String(a || "");
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/^\s*(\d+[A-Za-z]?)(?:\s*[-–]\s*\d+[A-Za-z]?)+/, "$1");
  s = s.replace(/\b(?:Tp|TP)\.?\s*HCM\b/g, "Hồ Chí Minh");
  s = s.replace(/\s+,/g, ",").replace(/,\s*,+/g, ",").replace(/\s{2,}/g, " ").replace(/^[\s,]+|[\s,]+$/g, "");
  s = s.replace(/([^,\s])\s+(Hồ Chí Minh)(,|$)/, "$1, $2$3");
  return s || String(a || "");
};
const fmtMoney = (v) => (v === null || v === undefined ? "—" : `${v.toLocaleString("vi-VN")} đ`);

// Nút gọi điện (xanh #008CE3, vòng trắng + ống nghe) — bấm = gọi số
function CallBtn({ phone, label }) {
  return (
    <a href={`tel:${phone}`} aria-label={`Gọi ${label}`} style={{ flex: "none", width: 48, height: 48, borderRadius: 12, background: "#008CE3", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
      <svg width="34" height="34" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="21" fill="none" stroke="#fff" strokeWidth="2.4" />
        <path transform="translate(12 12)" fill="#fff" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
      </svg>
    </a>
  );
}

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
  const [detailId, setDetailId] = useState(null); // việc đang xem chi tiết
  const [tab, setTab] = useState("cho"); // cho = Chờ lấy | xong = Đã xong
  const [push, setPush] = useState("checking"); // checking | unsupported | off | denied | on
  const [pushMsg, setPushMsg] = useState("");
  const focusId = Number(router.query.task) || null;
  const geoTries = useRef(0);

  const doneDays = useRef(1); // đã xong: mặc định chỉ hôm nay; mỗi lần "Xem thêm" +7 ngày
  const [moreBusy, setMoreBusy] = useState(false);
  function load() {
    return getNhanHangMy(undefined, doneDays.current).then((r) => { setData(r); setErr(""); }).catch((e) => setErr(e.message));
  }
  async function loadMore() {
    setMoreBusy(true);
    doneDays.current += 7;
    await load();
    setMoreBusy(false);
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
  const todayKey = data ? dayKey(data.server_time) : "";
  const today = data ? new Date(data.server_time).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }) : "";
  const tomorrowKey = data ? dayKey(new Date(new Date(data.server_time).getTime() + 86400000).toISOString()) : "";

  // Nhóm theo NGÀY (hạn lấy), ngày cũ trước; trong ngày theo giờ
  // Tab "Đã xong": nhóm theo ngày XÁC NHẬN, ngày mới nhất lên trước
  const dayOf = (t) => (tab === "cho" ? t.han_lay : t.received_at || t.han_lay);
  const groups = [];
  [...(tab === "cho" ? pending : done)].sort((a, b) => (tab === "cho" ? 1 : -1) * (new Date(dayOf(a)) - new Date(dayOf(b)))).forEach((t) => {
    const k = dayKey(dayOf(t));
    let g = groups[groups.length - 1];
    if (!g || g.key !== k) { g = { key: k, list: [] }; groups.push(g); }
    g.list.push(t);
  });

  function levelOf(t) {
    // mức độ tính lại theo đồng hồ máy để màu/đếm ngược chạy mượt giữa 2 lần tải
    if (t.trang_thai !== "cho_lay") return t.trang_thai === "khong_nhan_duoc" ? "khong" : "xong";
    const diff = (new Date(t.han_lay).getTime() - now) / 60000;
    return diff <= 0 ? "tre" : diff <= 30 ? "sap_tre" : "binh_thuong";
  }
  function chipOf(t) {
    const lv = levelOf(t);
    if (lv === "khong") return { color: "#6B7280", text: "Không nhận được", bg: "#F3F4F6", bd: "var(--border)" };
    if (lv === "xong") return { color: "#3E7A2A", text: "Đã nhận", bg: LEVEL.xong.bg, bd: LEVEL.xong.bd };
    const L = LEVEL[lv];
    return { color: L.chip, text: lv === "tre" ? `TRỄ ${remainText(t.han_lay, now).replace("trễ ", "")}` : `${L.label} · ${remainText(t.han_lay, now)}`, bg: L.bg, bd: L.bd };
  }

  function renderDayHeader(g) {
    const d = new Date(`${g.key}T12:00:00+07:00`).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
    const hasPend = g.list.some((t) => t.trang_thai === "cho_lay");
    const tag = g.key === todayKey ? { t: "Hôm nay", c: "#1C64B4" } : g.key < todayKey ? (hasPend ? { t: "Quá hạn", c: "#C0392B" } : { t: "Đã qua", c: "#6B7280" }) : g.key === tomorrowKey ? { t: "Ngày mai", c: "#3E7A2A" } : null;
    return (
      <div key={`h-${g.key}`} style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 10px" }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, textTransform: "capitalize", minWidth: 0 }}>📅 {d}</div>
        {tag && <span style={{ background: tag.c, color: "#fff", fontSize: 11.5, fontWeight: 800, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>{tag.t}</span>}
        <div style={{ flex: 1, height: 1.5, background: "var(--border)" }} />
        <span style={{ fontSize: 14.5, fontWeight: 800, color: "#1C64B4", whiteSpace: "nowrap", marginLeft: "auto", textAlign: "right" }}>{g.list.length} Điểm nhận</span>
      </div>
    );
  }

  // Dòng gọn của 1 điểm nhận mẫu — bấm vào để xem chi tiết
  function renderTask(t) {
    const C = chipOf(t);
    const isDone = t.trang_thai !== "cho_lay";
    return (
      <div id={`task-${t.id}`} key={t.id} onClick={() => setDetailId(t.id)} role="button"
        style={{ background: C.bg, border: `1.5px solid ${C.bd}`, borderRadius: 14, padding: "12px 14px", marginBottom: 10, cursor: "pointer", opacity: isDone ? 0.92 : 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{fmtHM(t.han_lay)}{t.ma_don && <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-600)", marginLeft: 8 }}>#{t.ma_don}</span>}</div>
          <span style={{ background: C.color, color: "#fff", fontWeight: 800, fontSize: 12.5, padding: "4px 11px", borderRadius: 999, whiteSpace: "nowrap" }}>{C.text}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.ten_diem || t.dia_chi}</div>
            {t.ten_diem && <div style={{ fontSize: 13.5, color: "var(--text-600)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {t.dia_chi}</div>}
            <div style={{ fontSize: 13.5, marginTop: 2 }}>📦 {isDone ? `Thực nhận: ${fmtQty(t.so_luong_thuc_te)}` : `Cần lấy: ${fmtQty(t.so_luong)}`}{!isDone && (t.so_tien_thu != null || t.phu_phi != null) && <span style={{ marginLeft: 10, fontWeight: 700 }}>💰 Thu: <span style={{ color: "#D32F2F" }}>{fmtMoney((t.so_tien_thu || 0) + (t.phu_phi || 0))}</span></span>}</div>
          </div>
          <div style={{ fontSize: 26, color: "var(--text-600)", lineHeight: 1 }}>›</div>
        </div>
      </div>
    );
  }

  // vừa xác nhận xong: địa chỉ từ toạ độ được tra sau vài giây -> tự tải lại 1 lần cho tới khi có
  useEffect(() => {
    if (!items.some((t) => t.nhan_lat != null && !t.nhan_dia_chi) || geoTries.current >= 6) return undefined;
    geoTries.current += 1; // tối đa 6 lần (~24 giây), sau đó luồng nền / lần tải sau sẽ lo
    const h = setTimeout(load, 4000);
    return () => clearTimeout(h);
  }, [data]);

  useEffect(() => {
    if (focusId && data && items.some((t) => t.id === focusId)) { setTab(items.find((t) => t.id === focusId).trang_thai === "cho_lay" ? "cho" : "xong"); setDetailId(focusId); document.getElementById(`task-${focusId}`)?.scrollIntoView({ block: "center" }); }
  }, [focusId, !!data]);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--text-600)", textTransform: "capitalize" }}>{today}</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>📦 Danh sách nhận mẫu cần xử lý</div>
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
          <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
            {[["cho", "Chờ lấy", pending.length, "#1C64B4"], ["xong", "Đã xong", data.done_today ?? done.length, "#3E7A2A"]].map(([k, label, n, color]) => {
              const on = tab === k;
              return (
                <button key={k} onClick={() => setTab(k)}
                  style={{ flex: 1, textAlign: "left", cursor: "pointer", fontFamily: "inherit", background: on ? "#fff" : "#EEF2F8", border: on ? `2px solid ${color}` : "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", boxShadow: on ? "0 2px 8px rgba(0,0,0,0.08)" : "none" }}>
                  <div style={{ fontSize: 12.5, color: on ? color : "var(--text-600)", fontWeight: on ? 800 : 500 }}>{label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color }}>{n}</div>
                </button>
              );
            })}
          </div>
          {groups.length === 0 && <div className="placeholder-box">{tab === "cho" ? (items.length === 0 ? "Hiện chưa có điểm nhận mẫu nào được phân công cho bạn." : "Không còn điểm nào chờ lấy 🎉") : (doneDays.current > 1 ? "Chưa có điểm nào đã xong trong khoảng thời gian này." : "Hôm nay chưa có điểm nào đã xong.")}</div>}
          {groups.map((g) => (
            <div key={g.key}>
              {renderDayHeader(g)}
              {g.list.map(renderTask)}
            </div>
          ))}
          {tab === "xong" && data.done_more && (
            <button onClick={loadMore} disabled={moreBusy} style={{ width: "100%", marginTop: 16, padding: "14px 8px", borderRadius: 12, border: "1.5px solid #1C64B4", background: "#fff", color: "#1C64B4", fontWeight: 800, fontSize: 16, cursor: "pointer", opacity: moreBusy ? 0.6 : 1 }}>
              {moreBusy ? "Đang tải..." : "Xem thêm"}
            </button>
          )}
        </>
      )}

      {detailId && items.find((t) => t.id === detailId) && (
        <DetailSheet task={items.find((t) => t.id === detailId)} chip={chipOf(items.find((t) => t.id === detailId))} onClose={() => setDetailId(null)}
          onReceive={(t) => { setDetailId(null); setSheet(t); }} />
      )}
      {sheet && <ConfirmSheet task={sheet} onClose={() => setSheet(null)} onDone={() => { geoTries.current = 0; setSheet(null); load(); }} />}
    </div>
  );
}

// Chi tiết 1 điểm nhận mẫu (bấm từ danh sách)
function DetailSheet({ task: t, chip, onClose, onReceive }) {
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleanAddr(t.dia_chi))}`;
  const full = new Date(t.han_lay).toLocaleString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
  const row = (label, val) => val ? (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, lineHeight: 1.45 }}>{val}</div>
    </div>
  ) : null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(5,10,20,0.78)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto", borderRadius: "18px 18px 0 0", padding: "18px 18px 22px", boxShadow: "0 -6px 28px rgba(0,0,0,0.45)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{t.ten_diem || "Đơn hàng lấy mẫu"}</div>
            <span style={{ display: "inline-block", marginTop: 6, background: chip.color, color: "#fff", fontWeight: 800, fontSize: 12.5, padding: "4px 11px", borderRadius: 999 }}>{chip.text}</span>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 24, cursor: "pointer", color: "var(--text-600)" }}>✕</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {row("🔖 Mã đơn hàng", t.ma_don ? <b>{t.ma_don}</b> : null)}
          {row("⏰ Thời gian lấy mẫu", <b style={{ textTransform: "capitalize" }}>{full}</b>)}
          {row("📍 Địa chỉ lấy mẫu", t.dia_chi)}
          {(t.nguoi_lien_he || t.sdt_lien_he) && (
            <div style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 2 }}>👥 Người liên hệ</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontSize: 16, lineHeight: 1.45 }}>
                  {t.nguoi_lien_he && <b>{t.nguoi_lien_he}</b>}
                  {t.nguoi_lien_he && t.sdt_lien_he && " · "}
                  {t.sdt_lien_he}
                </div>
                {t.sdt_lien_he && <CallBtn phone={t.sdt_lien_he.replace(/[^0-9+]/g, "")} label={t.nguoi_lien_he || "người liên hệ"} />}
              </div>
            </div>
          )}
          {row("📦 Số lượng mẫu lấy", t.so_luong != null ? <b>{fmtQty(t.so_luong)}</b> : null)}
          {(t.so_tien_thu != null || t.phu_phi != null) && row("💰 Số tiền cần thu", (
            <div>
              <div>Tổng thu: <b style={{ color: "#D32F2F", fontSize: 19 }}>{fmtMoney((t.so_tien_thu || 0) + (t.phu_phi || 0))}</b></div>
              {t.so_tien_thu != null && t.phu_phi != null && (
                <div style={{ color: "var(--text-600)", fontSize: 13.5, marginTop: 2 }}>Số tiền thu {fmtMoney(t.so_tien_thu)} + Phụ phí {fmtMoney(t.phu_phi)}</div>
              )}
            </div>
          ))}
          {row("🧪 Chỉ định", t.chi_dinh)}
          {row("📝 Lưu ý", t.ghi_chu_giao)}
          {t.created_name && (
            <div style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 2 }}>👤 Người tạo</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontSize: 16, lineHeight: 1.45, fontWeight: 700 }}>{t.created_name}</div>
                {t.created_phone && <CallBtn phone={t.created_phone} label={t.created_name} />}
              </div>
            </div>
          )}
          {t.trang_thai !== "cho_lay" && (
            <div style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 2 }}>✅ Kết quả xử lý</div>
              <div style={{ fontSize: 16, lineHeight: 1.45 }}>
                {t.trang_thai === "da_nhan" ? "Đã nhận" : "Không nhận được"} lúc {fmtHM(t.received_at)} {fmtDM(t.received_at)}
                {t.trang_thai === "da_nhan" && <> · Thực nhận: <b>{fmtQty(t.so_luong_thuc_te)}</b></>}
              </div>
              {t.ghi_chu_nhan && <div style={{ fontSize: 15, marginTop: 4 }}>📝 {t.ghi_chu_nhan}</div>}
              <PhotoThumbs ids={t.photo_ids} />
            </div>
          )}
          {t.trang_thai !== "cho_lay" && t.nhan_lat != null && (
            <div style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 2 }}>📍 Nhận tại</div>
              <div style={{ fontSize: 16, lineHeight: 1.45 }}>{t.nhan_dia_chi || "(đang tra địa chỉ...)"}</div>
              {t.chenh_lech_m != null && t.chenh_lech_m > 200 && (
                <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, color: distColor(t.chenh_lech_m) }}>
                  📏 Chênh lệch ~{fmtDist(t.chenh_lech_m)} so với điểm nhận mẫu
                </div>
              )}
            </div>
          )}
        </div>
        {t.trang_thai === "cho_lay" && (
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <a href={maps} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", padding: "14px 8px", borderRadius: 10, border: "1.5px solid #1C64B4", color: "#1C64B4", background: "#fff", fontWeight: 800, fontSize: 15, textDecoration: "none" }}>🧭 Chỉ đường</a>
          {t.trang_thai === "cho_lay" && (
            <button onClick={() => onReceive(t)} style={{ flex: 1.3, padding: "14px 8px", borderRadius: 10, border: "none", background: "#3E7A2A", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>✅ Nhận hàng</button>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

// Màn hình tóm tắt SAU KHI xác nhận (chốt 19/11): hiện thông tin phiếu để user xem lại; bấm "Về trang chủ" hoặc tự chuyển sau 5 giây
const HOME_AFTER_SEC = 5;
function DoneSummary({ task: t, info, onHome }) {
  const [left, setLeft] = useState(HOME_AFTER_SEC);
  const fired = useRef(false);
  const go = () => { if (!fired.current) { fired.current = true; onHome(); } };
  useEffect(() => {
    if (left <= 0) { go(); return undefined; }
    const h = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(h);
  }, [left]);
  const R = info.ketQua === "da_nhan" ? { icon: "✅", text: "Đã nhận hàng thành công", color: "#3E7A2A" }
    : info.ketQua === "hen_lai" ? { icon: "🕒", text: "Đã hẹn lại giờ giao", color: "#E8590C" }
    : { icon: "❌", text: "Đã ghi nhận: không nhận được hàng", color: "#6B7280" };
  const row = (label, val) => val ? (
    <div style={{ padding: "9px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, lineHeight: 1.4 }}>{val}</div>
    </div>
  ) : null;
  const tong = (t.so_tien_thu || 0) + (t.phu_phi || 0);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(5,10,20,0.78)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={go}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto", borderRadius: "18px 18px 0 0", padding: "18px 18px 22px", boxShadow: "0 -6px 28px rgba(0,0,0,0.45)" }}>
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 40, lineHeight: 1 }}>{R.icon}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: R.color, marginTop: 6 }}>{R.text}</div>
          {info.ketQua === "hen_lai" && info.hanLayMoi && <div style={{ fontSize: 15, marginTop: 4 }}>Giờ giao mới: <b>{fmtHM(info.hanLayMoi)} {fmtDM(info.hanLayMoi)}</b></div>}
        </div>
        <div style={{ marginTop: 8 }}>
          {row("🔖 Mã đơn hàng", t.ma_don ? <b>{t.ma_don}</b> : null)}
          {row("🏥 Điểm lấy mẫu", <b>{t.ten_diem || "—"}</b>)}
          {row("📦 Số mẫu", info.ketQua === "da_nhan" ? <><b>Thực nhận {fmtQty(info.q)}</b>{t.so_luong != null && <span style={{ color: "var(--text-600)" }}> · cần lấy {fmtQty(t.so_luong)}</span>}</> : (t.so_luong != null ? <>Cần lấy <b>{fmtQty(t.so_luong)}</b></> : null))}
          {(t.so_tien_thu != null || t.phu_phi != null) && row("💰 Số tiền cần thu", <b style={{ color: "#D32F2F", fontSize: 18 }}>{fmtMoney(tong)}</b>)}
          {row("📍 Địa chỉ", t.dia_chi)}
          {(t.nguoi_lien_he || t.sdt_lien_he) && row("👥 Người liên hệ", <>{t.nguoi_lien_he && <b>{t.nguoi_lien_he}</b>}{t.nguoi_lien_he && t.sdt_lien_he && " · "}{t.sdt_lien_he}</>)}
          {info.ghiChu && row("📝 Ghi chú của bạn", info.ghiChu)}
        </div>
        <button onClick={go} style={{ width: "100%", marginTop: 14, padding: "14px 8px", borderRadius: 10, border: "none", background: "#1C64B4", color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>🏠 Về trang chủ ({left}s)</button>
      </div>
    </div>
  );
}

function ConfirmSheet({ task, onClose, onDone }) {
  const [done, setDone] = useState(null); // {ketQua, q, hanLayMoi, ghiChu} sau khi xác nhận thành công -> màn hình tóm tắt
  const [qty, setQty] = useState(""); // chốt 19/11: để trống, user tự nhập (không điền sẵn)
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState([]); // [{file, url}]
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const input = useRef(null);
  // Định vị (GPS điện thoại): bắt đầu lấy ngay khi mở form để lúc bấm xác nhận đã có sẵn
  const [loc, setLoc] = useState({ st: "loading" }); // loading | ok | fail
  const locRef = useRef({ st: "loading" });
  const waiters = useRef([]);
  function setLocBoth(v) { locRef.current = v; setLoc(v); if (v.st !== "loading") { waiters.current.forEach((f) => f(v)); waiters.current = []; } }
  function getLoc() {
    setLocBoth({ st: "loading" });
    if (typeof navigator === "undefined" || !navigator.geolocation) { setLocBoth({ st: "fail", msg: "Thiết bị không hỗ trợ định vị" }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocBoth({ st: "ok", lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      (e) => setLocBoth({ st: "fail", msg: e.code === 1 ? "Bạn chưa cho phép truy cập vị trí" : e.code === 3 ? "Hết thời gian chờ định vị" : "Không xác định được vị trí" }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }
  function waitLoc() { // đợi kết quả định vị nếu đang lấy dở (tối đa ~16 giây)
    if (locRef.current.st !== "loading") return Promise.resolve(locRef.current);
    return new Promise((res) => { waiters.current.push(res); setTimeout(() => res(locRef.current), 16000); });
  }
  const destP = useRef(null); // toạ độ ước lượng của điểm nhận mẫu (để cảnh báo lệch vị trí)
  useEffect(() => { getLoc(); destP.current = getNhanHangDiemHen(task.id).catch(() => null); }, []);
  const [warn, setWarn] = useState(null); // {items: [...], resolve}
  const askWarn = (items) => new Promise((resolve) => setWarn({ items, resolve }));
  // Số lượng = 0 -> không nhận được hàng: chọn "khách huỷ giao mẫu" hoặc "hẹn lại giờ giao" (nhập ngày giờ mới)
  const [zero, setZero] = useState(null); // {step: "choose" | "time", val, err, resolve}
  const askZero = () => new Promise((resolve) => {
    const h = new Date(task.han_lay).getTime();
    const base = new Date(h > Date.now() ? h : Date.now() + 3600 * 1000);
    setZero({ step: "choose", val: base.toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 16).replace(" ", "T"), err: "", resolve });
  });

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
    let q = null;
    if (ketQua === "da_nhan") {
      if (String(qty).trim() === "") { setErr("Vui lòng nhập số lượng thực nhận."); return; }
      q = Number(String(qty).replace(",", "."));
      if (!Number.isFinite(q) || q < 0) { setErr("Số lượng thực nhận không hợp lệ (không được âm)."); return; }
      if (q === 0 && !note.trim()) { setErr("Số lượng bằng 0 nghĩa là không nhận được hàng: hãy ghi lý do vào ô ghi chú."); return; }
      if (q > 0 && task.so_luong != null && q !== task.so_luong && !note.trim()) { setErr("Số lượng nhận khác số lượng yêu cầu: hãy ghi lý do vào ô ghi chú."); return; }
    }
    if (ketQua === "khong_nhan_duoc" && !note.trim()) { setErr("Không nhận được hàng: hãy ghi lý do vào ô ghi chú."); return; }
    setBusy(ketQua);
    const L = await waitLoc();
    if (L.st !== "ok" && !window.confirm(`Chưa lấy được vị trí của bạn (${L.msg || "đang chờ định vị"}).\nVẫn xác nhận mà không có vị trí?`)) { setBusy(""); return; }
    let hanLayMoi = "";
    let noteSend = note;
    if ((ketQua === "da_nhan" && q === 0) || ketQua === "khong_nhan_duoc") { // cả 2 đường "không nhận được" đều hỏi: khách huỷ / hẹn lại giờ giao
      const z = await askZero();
      if (!z) { setBusy(""); return; }
      if (z.kind === "huy") { ketQua = "khong_nhan_duoc"; noteSend = `Khách hàng hủy giao mẫu. ${note.trim()}`; }
      else { ketQua = "hen_lai"; hanLayMoi = z.iso; }
    }
    if (ketQua === "da_nhan") {
      const items = [];
      const D = destP.current ? await Promise.race([destP.current, new Promise((r) => setTimeout(() => r(null), 8000))]) : null;
      if (L.st === "ok" && D && D.lat != null && D.lng != null) {
        const m = haversineM(L.lat, L.lng, D.lat, D.lng);
        const nguong = D.nguong_m === undefined ? CANH_BAO_XA_M : D.nguong_m; // địa chỉ chỉ tra được tới cấp quận/thành phố thì ngưỡng rộng hơn (null = không cảnh báo xa)
        if (nguong != null && m > nguong) items.push({ icon: "📏", pre: "Vị trí hiện tại của bạn cách điểm nhận mẫu khoảng ", strong: fmtDist(Math.round(m)), post: " (theo địa chỉ ghi trên đơn)." });
      }
      const som = (new Date(task.han_lay).getTime() - Date.now()) / 60000;
      if (som >= CANH_BAO_SOM_PHUT) {
        const p = Math.round(som);
        items.push({ icon: "⏰", pre: "Bạn đang nhận sớm hơn giờ hẹn khoảng ", strong: p >= 60 ? `${Math.floor(p / 60)} giờ${p % 60 ? ` ${p % 60} phút` : ""}` : `${p} phút`, post: ` (hẹn lúc ${fmtHM(task.han_lay)} ${fmtDM(task.han_lay)}).` });
      }
      if (task.so_luong != null && q != null && q > 0 && q !== task.so_luong) { // nhận ít hơn / nhiều hơn số lượng yêu cầu (chốt 19/11)
        const chenh = Math.round(Math.abs(task.so_luong - q) * 1000) / 1000;
        const it = q < task.so_luong;
        items.push({ qty: true, icon: "📦", pre: "Số lượng thực nhận ", strong: fmtQty(q), post: ` ${it ? "ít hơn" : "nhiều hơn"} số lượng yêu cầu (${fmtQty(task.so_luong)}), ${it ? "thiếu" : "dư"} `, strong2: fmtQty(chenh), post2: "." });
      }
      if (items.length && !(await askWarn(items))) { setBusy(""); return; }
    }
    try {
      await confirmNhanHang(task.id, { ketQua, ghiChu: noteSend, soLuongThucTe: ketQua === "da_nhan" ? qty : "", files: photos.map((p) => p.file), viTri: L.st === "ok" ? L : null, hanLayMoi });
      setDone({ ketQua, q, hanLayMoi, ghiChu: noteSend.trim() }); // chuyển sang màn hình tóm tắt; tải lại danh sách khi về trang chủ
    } catch (e) {
      setErr(e.message);
      setBusy("");
    }
  }

  if (done) return <DoneSummary task={task} info={done} onHome={onDone} />;

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

        <label style={{ display: "block", fontSize: 14, fontWeight: 700, margin: "16px 0 6px" }}>Số lượng thực nhận {task.so_luong !== null && task.so_luong !== undefined ? `(cần lấy: ${fmtQty(task.so_luong)})` : ""}</label>
        <input type="number" inputMode="decimal" min="0" placeholder="Nhập số lượng" value={qty} onKeyDown={(e) => { if (["-", "+", "e", "E"].includes(e.key)) e.preventDefault(); }} onChange={(e) => setQty(e.target.value.replace(/-/g, ""))} style={{ width: "100%", padding: "13px 12px", fontSize: 17, borderRadius: 10, border: "1.5px solid var(--border)" }} />

        <label style={{ display: "block", fontSize: 14, fontWeight: 700, margin: "14px 0 6px" }}>Ghi chú</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="VD: đã nhận đủ, người giao là anh A... (bắt buộc nếu không nhận được hoặc nhận lệch số lượng)" style={{ width: "100%", padding: "11px 12px", fontSize: 16, borderRadius: 10, border: "1.5px solid var(--border)", resize: "vertical", fontFamily: "inherit" }} />

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

        <div style={{ marginTop: 14, padding: "9px 12px", borderRadius: 10, fontSize: 13.5, background: loc.st === "ok" ? "#EEF7EA" : loc.st === "fail" ? "#FFF3E0" : "#F1F5FB", border: `1px solid ${loc.st === "ok" ? "#BBD9AE" : loc.st === "fail" ? "#F2C688" : "var(--border)"}` }}>
          {loc.st === "loading" && <>📍 Đang xác định vị trí của bạn...</>}
          {loc.st === "ok" && <>📍 Đã lấy vị trí</>}
          {loc.st === "fail" && <>⚠️ {loc.msg}. Hãy bật GPS / cho phép vị trí rồi <button onClick={getLoc} style={{ border: "none", background: "none", color: "#1C64B4", fontWeight: 800, textDecoration: "underline", cursor: "pointer", fontSize: 13.5, padding: 0 }}>thử lại</button></>}
        </div>

        {err && <div style={{ background: "#FDEAEA", color: "var(--danger)", padding: "10px 12px", borderRadius: 10, marginTop: 14, fontSize: 14 }}>{err}</div>}

        {warn && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.6)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, padding: "20px 18px" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#C0392B" }}>⚠️ Vui lòng kiểm tra lại</div>
              <div style={{ marginTop: 12 }}>
                {warn.items.map((w, i) => (
                  <div key={i} style={{ fontSize: 15.5, lineHeight: 1.5, marginBottom: 10 }}>{w.icon} {w.pre}<b style={{ color: "#C0392B", fontWeight: 800 }}>{w.strong}</b>{w.post}{w.strong2 && <b style={{ color: "#C0392B", fontWeight: 800 }}>{w.strong2}</b>}{w.post2}</div>
                ))}
              </div>
              <div style={{ fontSize: 14.5, color: "var(--text-600)", lineHeight: 1.5 }}>{warn.items.every((w) => w.qty) ? "Hãy kiểm tra lại số lượng đã nhận. Nếu nhập sai, bấm " : warn.items.some((w) => w.qty) ? "Hãy kiểm tra lại các thông tin trên. Nếu chưa đúng, bấm " : "Hãy kiểm tra xem bạn có bấm nhận hàng nhầm chỗ không. Nếu nhầm, bấm "}<b>Hủy</b>. Nếu đúng, bấm <b>Hoàn tất</b>.</div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button onClick={() => { warn.resolve(false); setWarn(null); }} style={{ flex: 1, padding: "14px 8px", borderRadius: 10, border: "1.5px solid #C0392B", background: "#fff", color: "#C0392B", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>Hủy</button>
                <button onClick={() => { warn.resolve(true); setWarn(null); }} style={{ flex: 1.2, padding: "14px 8px", borderRadius: 10, border: "none", background: "#3E7A2A", color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>Hoàn tất</button>
              </div>
            </div>
          </div>
        )}

        {zero && (() => {
          const done = (r) => { zero.resolve(r); setZero(null); };
          const pad = (n) => String(n).padStart(2, "0");
          const [zd, zt] = (zero.val || "").split("T");
          const [zh, zm] = (zt || "08:00").split(":");
          const setV = (d, h, m) => setZero({ ...zero, val: `${d}T${h}:${m}`, err: "" });
          const selS = { padding: "12px 6px", fontSize: 16, borderRadius: 10, border: "1.5px solid var(--border)", background: "#fff", flex: 1 };
          const btn = (bg, col, bd) => ({ width: "100%", padding: "14px 8px", borderRadius: 12, border: bd || "none", background: bg, color: col, fontWeight: 800, fontSize: 16, cursor: "pointer", marginTop: 10 });
          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(5,10,20,0.78)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, padding: "20px 18px" }}>
                {zero.step === "choose" ? (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#C0392B" }}>⚠️ Không nhận được hàng</div>
                    <div style={{ fontSize: 15.5, lineHeight: 1.5, marginTop: 10 }}>Số lượng thực nhận bằng <b style={{ color: "#C0392B" }}>0</b>. Vui lòng chọn lý do:</div>
                    <button onClick={() => done({ kind: "huy" })} style={btn("#C0392B", "#fff")}>Khách hàng hủy giao mẫu</button>
                    <button onClick={() => setZero({ ...zero, step: "time" })} style={btn("#1C64B4", "#fff")}>Hẹn lại giờ giao</button>
                    <button onClick={() => done(null)} style={btn("#fff", "var(--text-600)", "1.5px solid var(--border)")}>Quay lại</button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>🕒 Hẹn lại giờ giao</div>
                    <div style={{ fontSize: 14.5, color: "var(--text-600)", marginTop: 6 }}>Chọn ngày giờ giao mẫu mới (giờ 24h):</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 12 }}>
                      <input type="date" value={zd || ""} onChange={(e) => setV(e.target.value, zh, zm)} style={{ ...selS, flex: 2.2 }} />
                      <select value={zh} onChange={(e) => setV(zd, e.target.value, zm)} style={selS}>{Array.from({ length: 24 }, (_, i) => pad(i)).map((h) => <option key={h} value={h}>{h}</option>)}</select>
                      <b>:</b>
                      <select value={zm} onChange={(e) => setV(zd, zh, e.target.value)} style={selS}>{Array.from({ length: 60 }, (_, i) => pad(i)).map((m) => <option key={m} value={m}>{m}</option>)}</select>
                    </div>
                    {zero.err && <div style={{ color: "#C0392B", fontSize: 14, marginTop: 10 }}>{zero.err}</div>}
                    <button onClick={() => {
                      const iso = `${zd}T${zh}:${zm}:00+07:00`;
                      if (!zd || !(new Date(iso).getTime() > Date.now())) { setZero({ ...zero, err: "Giờ hẹn mới phải sau thời điểm hiện tại." }); return; }
                      done({ kind: "hen", iso });
                    }} style={btn("#3E7A2A", "#fff")}>Hoàn tất</button>
                    <button onClick={() => setZero({ ...zero, step: "choose", err: "" })} style={btn("#fff", "var(--text-600)", "1.5px solid var(--border)")}>Quay lại</button>
                  </>
                )}
              </div>
            </div>
          );
        })()}

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
