import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import {
  getToken, getUser, getKiemKeLabPublic, searchKiemKeLabPublic, getKiemKeLabPublicItem, saveKiemKeLabPublicItem,
  listKiemKeLabPublicDaKiem, listKiemKeLabPublicChuaKiem, listKiemKeLabPublicMaHang, hoanTatKiemKeLabPublic, xoaKiemKeLabPublicItem, themKiemKeLabNgoaiDs,
} from "../../lib/api";

// Trang kiểm kê cho người kiểm — KHÔNG dùng Layout/Sidebar. Từ 03/11 YÊU CẦU ĐĂNG NHẬP (trước đó là link công khai không cần login);
// mỗi lượt kiểm ghi lại người kiểm (phần trước @ của email). Người kiểm kê sản phẩm LAB (không có barcode)
// gõ mã / tên sản phẩm + Enter -> chọn đúng sản phẩm (chỉ 1 kết quả thì vào thẳng) -> xem thông tin + tồn kho -> nhập TAY số
// lượng kiểm kê -> Lưu -> quay lại màn tìm kiếm. Xác thực DUY NHẤT bằng `token` trong URL (xem backend/app/routers/kiem_ke_lab.py).
// Chốt 02/11 (lần 2): thêm nút 📷 mở camera quét barcode (Code128...) của tem sản phẩm thay cho gõ tay mã; màn tìm kiếm có
// "Lịch sử kiểm kê" (tất cả sản phẩm đã kiểm, mới nhất trên đầu, cho xoá từng dòng). Dùng @zxing/browser, import ĐỘNG (không import
// tĩnh ở đầu file để build SSR không đụng window/document).
function fmtTime(s) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d)) return "";
  const z = (n) => String(n).padStart(2, "0");
  return `${z(d.getHours())}:${z(d.getMinutes())} ${z(d.getDate())}/${z(d.getMonth() + 1)}`;
}
function beep() {
  try { navigator.vibrate?.(120); } catch {}
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    o.frequency.value = 1000;
    o.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 130);
  } catch {}
}
const normVi = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d");
// Gợi ý vị trí kiểm kê (chốt 02/11) — bấm chọn nhanh hoặc tự gõ; không bắt buộc.
const VI_TRI_GOI_Y = [
  "Phòng kho", "Tủ lạnh hóa chất", "Tủ âm sâu", "Tủ lạnh vắc xin có vách băng HBC-260",
  "Tủ lạnh hóa chất miễn dịch", "Tủ lạnh HC sinh hóa + elisa + blot",
  "Phòng nhập mẫu", "Phòng lưu mẫu", "Phòng vi sinh", "Phòng tra mẫu", "Phòng PCR",
  "Phòng pha hóa chất", "Phòng sinh hóa huyết học", "Sảnh lầu 2",
];
const fmtNum = (n) => (n === null || n === undefined ? "-" : Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 3 }));
const fmtDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : (d || ""); };
// Chốt 26/11 — mỗi sản phẩm có thể có NHIỀU date (HSD): mỗi dòng = 1 cặp "số lượng + date". Gom các dòng người kiểm nhập: bỏ dòng trống hoàn toàn.
const LOT0 = () => [{ sl: "", date: "" }];
function collectLots(lots) {
  const lo = [];
  for (const x of lots) {
    const sraw = String(x.sl).trim();
    const d = x.date || "";
    if (sraw === "" && !d) continue;
    if (sraw === "") return { error: "Có dòng đã chọn date nhưng chưa nhập số lượng." };
    const n = Number(sraw.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return { error: "Số lượng phải là số ≥ 0." };
    lo.push({ so_luong: n, date: d });
  }
  return { lo, total: Math.round(lo.reduce((a, x) => a + x.so_luong, 0) * 1000) / 1000 };
}
// Dòng chữ "5 × 31/12/2027 · 3 × 30/06/2028" — chỉ hiện khi sản phẩm có ít nhất 1 dòng có date
const loText = (it) => ((it.lo || []).some((x) => x.date) ? (it.lo || []).map((x) => `${fmtNum(x.sl)} × ${x.date ? fmtDate(x.date) : "không rõ date"}`).join(" · ") : "");

// Chốt 26/11 — chọn date bằng 3 "bánh xe" cuộn (Ngày / Tháng / Năm) thay cho lịch tháng của trình duyệt.
const ITEM_H = 36;
const WHEEL_VISIBLE = 5; // số dòng nhìn thấy (dòng giữa là dòng đang chọn)
function Wheel({ items, index, onIndex, title }) {
  const ref = useRef(null);
  const timer = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = index * ITEM_H; }, [index, items.length]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function onScroll() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!ref.current) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(ref.current.scrollTop / ITEM_H)));
      if (i !== index) onIndex(i);
    }, 90);
  }
  const pad = ITEM_H * Math.floor(WHEEL_VISIBLE / 2);
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#667085", marginBottom: 2 }}>{title}</div>
      <div style={{ position: "relative", height: ITEM_H * WHEEL_VISIBLE }}>
        <div
          ref={ref} className="kkl-wheel" onScroll={onScroll}
          style={{ height: "100%", overflowY: "auto", scrollSnapType: "y mandatory", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", padding: `${pad}px 0`, boxSizing: "border-box", scrollbarWidth: "none" }}
        >
          {items.map((it, i) => (
            <div
              key={i} onClick={() => ref.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" })}
              style={{ height: ITEM_H, lineHeight: `${ITEM_H}px`, scrollSnapAlign: "center", fontSize: i === index ? 20 : 16, fontWeight: i === index ? 800 : 500, color: i === index ? "#16365C" : "#98A2B3", cursor: "pointer", userSelect: "none" }}
            >{it}</div>
          ))}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: pad, height: ITEM_H, borderTop: "1.5px solid #1F6FD6", borderBottom: "1.5px solid #1F6FD6", background: "rgba(31,111,214,0.06)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: pad, background: "linear-gradient(#fff, rgba(255,255,255,0.55))", pointerEvents: "none" }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: pad, background: "linear-gradient(rgba(255,255,255,0.55), #fff)", pointerEvents: "none" }} />
      </div>
    </div>
  );
}
function DateSheet({ value, onPick, onClose }) {
  const now = new Date();
  const m0 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  const [y, setY] = useState(m0 ? +m0[1] : now.getFullYear());
  const [m, setM] = useState(m0 ? +m0[2] : now.getMonth() + 1);
  const [d, setD] = useState(m0 ? +m0[3] : now.getDate());
  const yFrom = Math.min(now.getFullYear() - 1, y);
  const years = Array.from({ length: Math.max(now.getFullYear() + 12, y) - yFrom + 1 }, (_, i) => yFrom + i);
  const dim = new Date(y, m, 0).getDate();
  const dd = Math.min(d, dim);
  const z = (n) => String(n).padStart(2, "0");
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(8,16,32,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box" }} onClick={onClose}>
      <style>{".kkl-wheel::-webkit-scrollbar{display:none}"}</style>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 330, background: "#fff", borderRadius: 16, padding: "12px 14px 14px", boxSizing: "border-box", boxShadow: "0 12px 40px rgba(15,40,80,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <b style={{ fontSize: 15, color: "#16365C" }}>Chọn date (HSD)</b>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1F6FD6" }}>{z(dd)}/{z(m)}/{y}</span>
        </div>
        <div style={{ fontSize: 12, color: "#667085", marginBottom: 6 }}>Không bắt buộc — có thể bỏ trống.</div>
        <div style={{ display: "flex", gap: 6 }}>
          <Wheel title="Ngày" items={Array.from({ length: dim }, (_, i) => z(i + 1))} index={dd - 1} onIndex={(i) => setD(i + 1)} />
          <Wheel title="Tháng" items={Array.from({ length: 12 }, (_, i) => `Th ${i + 1}`)} index={m - 1} onIndex={(i) => setM(i + 1)} />
          <Wheel title="Năm" items={years} index={years.indexOf(y)} onIndex={(i) => setY(years[i])} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" style={{ ...btnGhost, flex: 1, padding: "9px 4px", fontSize: 13, color: "#C0392B", borderColor: "#F0C4C0" }} onClick={() => onPick("")}>Xoá date</button>
          <button type="button" style={{ ...btnGhost, flex: 1, padding: "9px 4px", fontSize: 13 }} onClick={onClose}>Hủy</button>
          <button type="button" style={{ ...btnPrimary, flex: 1.6, padding: "9px 4px", fontSize: 14 }} onClick={() => onPick(`${y}-${z(m)}-${z(dd)}`)}>✓ Xong</button>
        </div>
      </div>
    </div>
  );
}

export default function KiemKeLabPublicPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : null;

  const [phieu, setPhieu] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState("search"); // search | detail | add (thêm sản phẩm ngoài danh sách)
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState(null); // {items, tong, gan_dung, q} | null (chưa tìm)
  const [item, setItem] = useState(null);
  const [datePick, setDatePick] = useState(null); // chỉ số dòng đang chọn date (mở bảng 3 bánh xe) | null
  const [lots, setLots] = useState(LOT0); // các dòng "số lượng + date" đang nhập (chốt 26/11)
  const [note, setNote] = useState("");
  const [viTri, setViTri] = useState("");
  const [viTriOpen, setViTriOpen] = useState(false); // mở danh sách gợi ý vị trí
  const ADD0 = { ma_hang: "", ten_hang: "", don_vi: "", phan_loai: "", ghi_chu: "" };
  const [addForm, setAddForm] = useState(ADD0); // form thêm sản phẩm ngoài danh sách (vị trí dùng chung state viTri)
  const [ghiDe, setGhiDe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [history, setHistory] = useState(null); // lịch sử kiểm kê (mới nhất trước) | null (đang tải)
  const [deletingId, setDeletingId] = useState(null);
  const [hq, setHq] = useState(""); // ô tìm trong danh sách đang mở (mã / tên / vị trí)
  const [panel, setPanel] = useState(null); // null (ẩn) | "ls" lịch sử kiểm kê | "chua" sản phẩm chưa kiểm | "lech" sản phẩm lệch tồn
  const [chuaKiem, setChuaKiem] = useState(null); // danh sách sản phẩm chưa kiểm (tải khi mở) | null
  const [scanOpen, setScanOpen] = useState(false);
  const [camError, setCamError] = useState("");
  const videoRef = useRef(null);
  const handledRef = useRef(false);
  const codesRef = useRef(new Set()); // mã hàng của phiếu (viết hoa) — đối chiếu kết quả quét
  const [lastRead, setLastRead] = useState(""); // dòng báo trong khung camera: mã vừa đọc nhưng bị bỏ qua
  const camModeRef = useRef(false); // đang kiểm bằng camera -> lưu xong tự mở lại camera cho sản phẩm kế
  const runSearchRef = useRef(null);
  const [completing, setCompleting] = useState(false);

  const searchRef = useRef(null);
  const qtyRef = useRef(null);
  const done = phieu?.trang_thai === "hoan_tat";

  // Từ 03/11 phải ĐĂNG NHẬP mới kiểm kê được: chưa có phiên -> chuyển sang trang đăng nhập, xong quay lại đúng link này.
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    if (!router.isReady) return;
    if (!getToken()) { router.replace(`/login?next=${encodeURIComponent(router.asPath)}`); return; }
    if (getUser()?.must_change_password) { router.replace("/doi-mat-khau"); return; }
    setAuthed(true);
  }, [router.isReady]);

  // tải sẵn thư viện quét mã vạch ngay khi vào trang -> bấm 📷 là mở camera + quét luôn, không phải chờ tải thư viện
  useEffect(() => {
    if (authed) { import("@zxing/browser").catch(() => {}); import("@zxing/library").catch(() => {}); }
  }, [authed]);

  useEffect(() => {
    if (!authed || !token) return;
    getKiemKeLabPublic(token).then(setPhieu).catch((e) => setLoadError(e.message || "Không tải được phiếu kiểm kê"));
    listKiemKeLabPublicMaHang(token).then((r) => { codesRef.current = new Set((r.codes || []).map((c) => String(c).trim().toUpperCase())); }).catch(() => {});
    loadHistory();
  }, [authed, token]);

  function loadHistory() {
    if (!token) return;
    listKiemKeLabPublicDaKiem(token).then((r) => setHistory(r.items)).catch(() => {});
    setChuaKiem(null); // số liệu đã đổi -> tải lại danh sách chưa kiểm khi cần
  }

  useEffect(() => {
    if (panel === "chua" && chuaKiem === null && token) {
      listKiemKeLabPublicChuaKiem(token).then((r) => setChuaKiem(r.items)).catch(() => setChuaKiem([]));
    }
  }, [panel, chuaKiem, token]);

  // ---- Camera quét barcode ----
  // Chốt 03/11 (tăng tốc): tự chạy vòng quét thay vì để thư viện giải mã NGUYÊN khung hình 1600x900 (rất nặng trên điện thoại ->
  // chỉ vài khung/giây). Mỗi vòng: ưu tiên BarcodeDetector gốc của máy (Android/Chrome, phần cứng, rất nhanh); không có (iPhone/Safari) thì
  // cắt đúng DẢI GIỮA khung hình (nơi người kiểm đặt tem) rồi giải mã bằng ZXing — ít điểm ảnh hơn nên nhanh hơn nhiều lần; cứ vài vòng
  // lại thử thêm nguyên khung hình + ảnh xoay 90° để không sót mã nằm lệch/dọc. Chỉ bật các loại mã vạch cần dùng (Code128/39, EAN, QR).
  useEffect(() => {
    if (!scanOpen) return undefined;
    let cancelled = false;
    let stream = null;
    let timer = null;
    (async () => {
      try {
        const video = videoRef.current;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const track = stream.getVideoTracks()[0];
        try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch {} // lấy nét liên tục nếu máy hỗ trợ
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play();

        const onOk = (text) => {
          if (handledRef.current || !text) return;
          handledRef.current = true;
          beep();
          setScanOpen(false);
          setQ(text);
          runSearchRef.current?.(text);
        };

        // Lọc kết quả đọc nhầm (chốt 03/11: máy quét hay "bắn ra toàn số" lạ do đọc nhầm vạch của Code128 thành EAN/UPC):
        //  - mã TRÙNG mã hàng trong phiếu -> nhận ngay (kể cả EAN/UPC/số);
        //  - mã Code128 / Code39 / QR (có checksum, ít đọc nhầm) không có trong phiếu -> phải đọc ra GIỐNG NHAU 2 lần liên tiếp mới nhận;
        //  - EAN/UPC không có trong phiếu -> bỏ qua (báo "bỏ qua" trong khung camera), tiếp tục quét.
        const STRONG = ["CODE_128", "CODE_39", "QR_CODE"];
        const pend = { text: "", n: 0 };
        let shown = "";
        const accept = (res) => {
          if (!res || !res.text) return null;
          const t = String(res.text).trim();
          if (!t) return null;
          if (codesRef.current.has(t.toUpperCase())) return t;
          const fmt = String(res.fmt || "").toUpperCase().replace(/-/g, "_");
          if (!STRONG.includes(fmt)) {
            if (shown !== t) { shown = t; setLastRead(`Đọc được “${t}” (${fmt || "?"}) nhưng không có trong danh sách — bỏ qua, đang quét tiếp…`); }
            return null;
          }
          if (pend.text === t) pend.n += 1; else { pend.text = t; pend.n = 1; }
          return pend.n >= 2 ? t : null;
        };

        // 1) BarcodeDetector gốc (nếu có)
        let native = null;
        try {
          if (typeof window !== "undefined" && "BarcodeDetector" in window) {
            const want = ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "qr_code"];
            const sup = await window.BarcodeDetector.getSupportedFormats();
            const formats = want.filter((f) => sup.includes(f));
            if (formats.length) native = new window.BarcodeDetector({ formats });
          }
        } catch { native = null; }

        // 2) ZXing (dự phòng / iPhone)
        const [{ HTMLCanvasElementLuminanceSource }, Z] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        if (cancelled) return;
        const { MultiFormatReader, BinaryBitmap, HybridBinarizer, DecodeHintType, BarcodeFormat } = Z;
        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.QR_CODE]);
        const reader = new MultiFormatReader();
        reader.setHints(hints);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const tryZxing = (sx, sy, sw, sh, maxW, rotate) => {
          const k = Math.min(1, maxW / sw);
          const cw = Math.max(1, Math.round(sw * k));
          const ch = Math.max(1, Math.round(sh * k));
          if (rotate) { canvas.width = ch; canvas.height = cw; ctx.setTransform(0, 1, -1, 0, ch, 0); } else { canvas.width = cw; canvas.height = ch; ctx.setTransform(1, 0, 0, 1, 0, 0); }
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
          try {
            const r = reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas))));
            return { text: r.getText(), fmt: BarcodeFormat[r.getBarcodeFormat()] };
          } catch { return null; }
        };

        let n = 0;
        const tick = async () => {
          if (cancelled || handledRef.current) return;
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          if (video.readyState >= 2 && vw && vh) {
            n += 1;
            let res = null;
            if (native) {
              try { const r = await native.detect(video); if (r && r.length) res = { text: r[0].rawValue, fmt: r[0].format }; } catch { native = null; }
            }
            let text = accept(res);
            if (!text && !native) {
              res = null;
              // Vòng nhanh: dải giữa khung hình (tem thường đặt giữa) 94% ngang x 32% dọc, thu nhỏ còn <= 800px ngang (~10-30ms/khung).
              // Mã vạch 1D chỉ cần vài dòng quét nên dải mỏng là đủ. Các vòng "đào sâu" xen kẽ để không sót:
              //  - mỗi 3 vòng: dải giữa độ phân giải cao (<= 1280px) cho tem nhỏ/mã dài;
              //  - mỗi 5 vòng: nguyên khung hình (mã nằm lệch khỏi giữa); mỗi 10 vòng: nguyên khung hình xoay 90° (mã đặt dọc).
              const bw = Math.round(vw * 0.94);
              const bh = Math.round(vh * 0.32);
              const bx = Math.round((vw - bw) / 2);
              const by = Math.round((vh - bh) / 2);
              res = tryZxing(bx, by, bw, bh, 800, false);
              if (!res && n % 3 === 0) res = tryZxing(bx, by, bw, bh, 1280, false);
              if (!res && n % 5 === 0) res = tryZxing(0, 0, vw, vh, 960, false);
              if (!res && n % 10 === 0) res = tryZxing(0, 0, vw, vh, 960, true);
              text = accept(res);
            }
            if (text) { onOk(text); return; }
          }
          timer = setTimeout(tick, 0);
        };
        tick();
      } catch (e) {
        if (cancelled) return;
        camModeRef.current = false;
        const m = String(e?.name || "") + " " + String(e?.message || e);
        setCamError(m.includes("NotAllowed") || m.includes("Permission")
          ? "Trình duyệt chưa được cấp quyền camera — bật quyền Camera cho trang này rồi thử lại."
          : (m.includes("NotFound") ? "Thiết bị không có camera." : "Không mở được camera trên thiết bị này."));
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      try { stream?.getTracks().forEach((t) => t.stop()); } catch {}
      try { if (videoRef.current) videoRef.current.srcObject = null; } catch {}
    };
  }, [scanOpen]);

  function startScan() {
    if (done) return;
    setErr("");
    setToast("");
    setCamError("");
    setLastRead("");
    setResult(null);
    handledRef.current = false;
    camModeRef.current = true;
    setScanOpen(true);
  }
  function closeScan() {
    camModeRef.current = false;
    setScanOpen(false);
  }

  useEffect(() => {
    if (view === "search") searchRef.current?.focus();
    if (view === "detail" && !done) setTimeout(() => qtyRef.current?.focus(), 50);
  }, [view, phieu?.ten_phieu]);

  function openItem(id) {
    setErr("");
    getKiemKeLabPublicItem(token, id)
      .then((it) => {
        setItem(it);
        setLots(LOT0()); // lần kiểm mới: nhập số đếm thêm, hệ thống cộng dồn vào số đã kiểm trước đó
        setNote("");
        setViTri("");
        setViTriOpen(false);
        setGhiDe(false);
        setView("detail");
      })
      .catch((e) => setErr(e.message));
  }

  async function doSearch(textArg) {
    const text = (typeof textArg === "string" ? textArg : q).trim();
    if (!text || searching) return;
    setSearching(true);
    setErr("");
    setToast("");
    try {
      const r = await searchKiemKeLabPublic(token, text);
      if (r.items.length === 1) { // chỉ có 1 sản phẩm -> vào thẳng màn thông tin
        setResult(null);
        openItem(r.items[0].id);
      } else {
        setResult({ ...r, q: text });
      }
    } catch (e) {
      setErr(e.message || "Tìm kiếm thất bại");
    } finally {
      setSearching(false);
    }
  }

  runSearchRef.current = doSearch;

  async function doSave() {
    const col = collectLots(lots);
    if (col.error) { setErr(col.error); return; }
    if (!col.lo.length) { setErr("Nhập số lượng kiểm kê hợp lệ (số ≥ 0)."); return; }
    const n = col.total;
    setSaving(true);
    setErr("");
    try {
      const r = await saveKiemKeLabPublicItem(token, item.id, col.lo, note, ghiDe, viTri);
      setPhieu(r.phieu);
      setToast(`✅ Đã lưu: ${item.ten_hang || item.ma_hang} — ${item.da_kiem && !ghiDe ? `+${fmtNum(n)}, tổng đã kiểm ${fmtNum(r.item.sl_kiem)}` : fmtNum(r.item.sl_kiem)} ${item.don_vi || ""}${col.lo.length > 1 || col.lo[0].date ? ` (${col.lo.length} date)` : ""}`);
      setItem(null);
      setResult(null);
      setQ("");
      setView("search");
      loadHistory();
      if (camModeRef.current) setTimeout(startScan, 700); // đang kiểm bằng camera -> mở lại camera cho sản phẩm kế
    } catch (e) {
      setErr(e.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  // Ô nhập "Số lượng + Date": mặc định 1 dòng; bấm "+" để thêm dòng cho date khác (cùng 1 mã sản phẩm có thể có nhiều date)
  function renderLots(onEnter) {
    const upd = (i, patch) => setLots((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    const col = collectLots(lots);
    return (
      <>
        <div style={{ display: "grid", gridTemplateColumns: lots.length > 1 ? "1fr 1fr 40px" : "1fr 1fr", gap: 8, marginBottom: 4, fontSize: 12.5, fontWeight: 700, color: "#667085" }}>
          <span>Số lượng</span><span style={{ whiteSpace: "nowrap" }}>Date <span style={{ fontWeight: 500 }}>(không bắt buộc)</span></span>{lots.length > 1 ? <span /> : null}
        </div>
        {lots.map((x, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: lots.length > 1 ? "1fr 1fr 40px" : "1fr 1fr", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <input
              ref={i === 0 ? qtyRef : undefined} value={x.sl} onChange={(e) => upd(i, { sl: e.target.value })} disabled={done}
              onKeyDown={(e) => { if (e.key === "Enter" && onEnter && !done) onEnter(); }}
              inputMode="decimal" placeholder="Số lượng" autoComplete="off"
              style={{ ...inputStyle, minWidth: 0, fontSize: 20, fontWeight: 700, textAlign: "center", padding: "10px 6px" }}
            />
            <button
              type="button" disabled={done} onClick={() => setDatePick(i)} aria-label="Chọn date (hạn sử dụng)"
              style={{ ...inputStyle, minWidth: 0, fontSize: 17, fontWeight: x.date ? 700 : 500, color: x.date ? "#101828" : "#98A2B3", padding: "10px 6px", height: 48, textAlign: "center", cursor: "pointer" }}
            >{x.date ? fmtDate(x.date) : "Chọn date"}</button>
            {lots.length > 1 ? (
              <button type="button" disabled={done} onClick={() => setLots((ls) => ls.filter((_, j) => j !== i))} aria-label="Bỏ dòng này"
                style={{ height: 40, width: 40, border: "1.5px solid #F0C4C0", borderRadius: 10, background: "#fff", color: "#C0392B", fontSize: 16, cursor: "pointer", padding: 0 }}>✕</button>
            ) : null}
          </div>
        ))}
        <button
          type="button" disabled={done} onClick={() => setLots((ls) => [...ls, { sl: "", date: "" }])}
          style={{ width: "100%", padding: "11px 10px", border: "1.5px dashed #1F6FD6", borderRadius: 10, background: "#F4F8FE", color: "#1F6FD6", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
        >＋ Thêm số lượng / date khác</button>
        {!col.error && col.lo.length > 1 && (
          <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: "#16365C" }}>Tổng {col.lo.length} dòng: {fmtNum(col.total)}{item?.don_vi && view === "detail" ? ` ${item.don_vi}` : ""}</div>
        )}
      </>
    );
  }

  function renderViTri() {
    return (
      <>
                    <label style={lbl}>Vị trí kiểm kê <span style={{ fontWeight: 500, color: "#667085" }}>(không bắt buộc)</span></label>
                    <div style={{ position: "relative", marginBottom: 14 }}>
                      <input
                        value={viTri} onChange={(e) => setViTri(e.target.value)} onFocus={() => setViTriOpen(false)} disabled={done} maxLength={200}
                        placeholder="Nhập hoặc chọn vị trí..." autoComplete="off" style={{ ...inputStyle, fontSize: 16, paddingRight: 54 }}
                      />
                      <button
                        type="button" disabled={done} aria-label="Chọn vị trí gợi ý" onClick={() => setViTriOpen((o) => !o)}
                        style={{ position: "absolute", right: 6, top: 6, bottom: 6, width: 40, border: "none", borderRadius: 8, background: viTriOpen ? "#CFE3FB" : "#E8F1FD", color: "#1F6FD6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                      >
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: viTriOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}><path d="M5 8l5 5 5-5" /></svg>
                      </button>
                      {viTriOpen && (
                        <>
                          <div style={{ position: "fixed", inset: 0, zIndex: 19 }} onClick={() => setViTriOpen(false)} />
                          <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 20, background: "#fff", border: "1.5px solid #C5D0E0", borderRadius: 10, boxShadow: "0 10px 24px rgba(15,40,80,0.18)", maxHeight: 280, overflowY: "auto" }}>
                            {VI_TRI_GOI_Y.map((g) => {
                              const on = viTri.trim().toLowerCase() === g.toLowerCase();
                              return (
                                <button
                                  key={g} type="button" onClick={() => { setViTri(on ? "" : g); setViTriOpen(false); }}
                                  style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", fontSize: 15, border: "none", borderBottom: "1px solid #EEF2F8", background: on ? "#E8F1FD" : "#fff", color: on ? "#1F6FD6" : "#16365C", fontWeight: on ? 700 : 500, cursor: "pointer" }}
                                >{on ? "✓ " : ""}{g}</button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
      </>
    );
  }

  function openAdd() {
    setErr("");
    setToast("");
    setAddForm(ADD0);
    setLots(LOT0());
    setViTri("");
    setViTriOpen(false);
    setResult(null);
    setView("add");
  }

  async function doAdd() {
    const f = addForm;
    const col = collectLots(lots);
    if (col.error) { setErr(col.error); return; }
    const n = col.lo.length ? col.total : null;
    if (![f.ma_hang, f.ten_hang, f.don_vi, f.phan_loai, f.ghi_chu, viTri].some((x) => x.trim()) && n === null) { setErr("Nhập ít nhất 1 thông tin để lưu."); return; }
    setSaving(true);
    setErr("");
    try {
      const r = await themKiemKeLabNgoaiDs(token, { ma_hang: f.ma_hang, ten_hang: f.ten_hang, don_vi: f.don_vi, so_luong: n, lo: col.lo, phan_loai: f.phan_loai, vi_tri: viTri, ghi_chu: f.ghi_chu });
      setPhieu(r.phieu);
      setToast(`✅ Đã thêm ngoài danh sách: ${r.item.ten_hang || r.item.ma_hang || "(sản phẩm)"}${n !== null ? ` — ${fmtNum(n)} ${r.item.don_vi || ""}` : ""}`);
      setView("search");
      loadHistory();
    } catch (e) {
      setErr(e.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  function backToSearch() {
    setErr("");
    setItem(null);
    setView("search");
  }

  async function doXoaDong(it) {
    const ten = it.ten_hang || it.ma_hang || "sản phẩm ngoài danh sách";
    const msg = it.ngoai_ds
      ? `Xoá sản phẩm ngoài danh sách “${ten}” (${fmtNum(it.sl_kiem)} ${it.don_vi || ""})? Dòng này sẽ bị xoá hẳn.`
      : `Xoá dòng kiểm kê “${ten}” (${fmtNum(it.sl_kiem)} ${it.don_vi || ""})? Số lượng và ghi chú đã nhập sẽ bị xoá, sản phẩm quay về trạng thái chưa kiểm.`;
    if (!confirm(msg)) return;
    setDeletingId(it.id);
    try {
      const r = await xoaKiemKeLabPublicItem(token, it.id);
      setPhieu(r.phieu);
      setHistory((h) => (h || []).filter((x) => x.id !== it.id));
      setChuaKiem(null);
    } catch (e) {
      alert(e.message || "Xoá thất bại");
    } finally {
      setDeletingId(null);
    }
  }

  async function doHoanTat() {
    const chua = (phieu?.so_sp || 0) - (phieu?.so_da_kiem || 0);
    if (!confirm(`Hoàn tất kiểm kê?${chua > 0 ? ` Còn ${chua} sản phẩm chưa kiểm.` : ""} Sau khi hoàn tất sẽ không nhập thêm được nữa (trừ khi được mở lại).`)) return;
    setCompleting(true);
    try { setPhieu(await hoanTatKiemKeLabPublic(token)); } catch (e) { setErr(e.message); } finally { setCompleting(false); }
  }

  // Màn tìm kiếm: khung cố định theo chiều cao màn hình — phần đầu + ô tìm kiếm luôn treo trên cùng, chỉ "Lịch sử kiểm kê" có thanh cuộn riêng
  const hqn = normVi(hq).trim();
  const lechOf = (it) => (it.da_kiem ? Math.round(((it.sl_kiem || 0) - (it.ton_kho || 0)) * 1000) / 1000 : 0);
  const lechList = (history || []).filter((it) => lechOf(it) !== 0);
  const baseList = panel === "chua" ? chuaKiem : panel === "lech" ? (history === null ? null : lechList) : history;
  const histShown = (baseList || []).filter((it) => !hqn || normVi(`${it.ma_hang} ${it.ten_hang || ""} ${it.vi_tri || ""} ${it.kiem_by || ""}`).includes(hqn));
  const soChua = phieu ? Math.max((phieu.so_sp || 0) - (phieu.so_da_kiem || 0), 0) : 0;
  const PANELS = [
    ["ls", "Lịch sử kiểm kê", history ? history.length : phieu?.so_da_kiem],
    ["chua", "Sản phẩm chưa kiểm", soChua],
    ["lech", "Sản phẩm lệch tồn", history ? lechList.length : null],
  ];
  const panelTitle = (PANELS.find((x) => x[0] === panel) || [])[1];
  const fixedView = !!phieu && view === "search" && !!panel;
  const pct = phieu && phieu.so_sp ? Math.round((phieu.so_da_kiem / phieu.so_sp) * 100) : 0;

  return (
    <div style={fixedView ? { ...pageStyle, height: "100dvh", minHeight: 0, boxSizing: "border-box", overflow: "hidden", paddingBottom: 14 } : pageStyle}>
      <Head>
        <title>Kiểm kê LAB</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <div style={fixedView ? { ...wrapStyle, height: "100%" } : wrapStyle}>
        {loadError && <div style={{ ...card, color: "#B42318", textAlign: "center" }}>{loadError}</div>}
        {!loadError && !phieu && <div style={{ ...card, textAlign: "center", color: "#667085" }}>{authed ? "Đang tải..." : "Đang chuyển sang trang đăng nhập..."}</div>}

        {phieu && (
          <>
            <div style={{ ...card, flexShrink: 0 }}>
              <div style={{ fontSize: 12, color: "#667085", fontWeight: 600 }}>🧪 KIỂM KÊ LAB</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#16365C", margin: "2px 0 8px" }}>{phieu.ten_phieu}</div>
              <div style={{ height: 8, background: "#E6EBF2", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: done ? "#3E7A2A" : "#1F6FD6", transition: "width .3s" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 13, gap: 8, flexWrap: "wrap" }}>
                <span>Đã kiểm <b>{phieu.so_da_kiem}</b>/{phieu.so_sp} sản phẩm ({pct}%)</span>
                <span style={{ display: "flex", gap: 6 }}>
                  {!done && view !== "add" && <button style={{ ...btnGhost, fontSize: 20, fontWeight: 700, lineHeight: 1, padding: "4px 14px" }} onClick={openAdd} title="Thêm sản phẩm không có trong danh sách" aria-label="Thêm sản phẩm ngoài danh sách">+</button>}
                  {!done && <button style={btnGhost} disabled={completing} onClick={doHoanTat}>{completing ? "..." : "🏁 Hoàn tất"}</button>}
                </span>
              </div>
              {done && <div style={{ marginTop: 10, padding: "8px 10px", background: "#E6F6E1", color: "#2f6b1a", borderRadius: 8, fontSize: 13 }}>✅ Phiếu đã hoàn tất — không nhập thêm được. Nhờ admin bấm “Mở lại” nếu cần chỉnh sửa.</div>}
            </div>

            {view === "search" && (
              <div style={{ ...card, flexShrink: 0 }}>
                {toast && <div style={{ marginBottom: 10, padding: "8px 10px", background: "#E6F6E1", color: "#2f6b1a", borderRadius: 8, fontSize: 13.5, fontWeight: 600 }}>{toast}</div>}
                <label style={lbl}>Tìm sản phẩm (mã hoặc tên)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    ref={searchRef} value={q} onChange={(e) => { setQ(e.target.value); setToast(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
                    placeholder="Gõ mã hoặc tên..." enterKeyHint="search" autoComplete="off" autoCapitalize="none"
                    style={inputStyle}
                  />
                  <button style={btnScan} disabled={done} onClick={startScan} title="Quét barcode bằng camera" aria-label="Quét barcode bằng camera">📷</button>
                  <button style={btnPrimary} disabled={searching || !q.trim()} onClick={() => doSearch()}>{searching ? "..." : "Tìm"}</button>
                </div>
                {err && <div style={errStyle}>{err}</div>}

                {result && result.items.length === 0 && (
                  <div style={{ marginTop: 14, color: "#667085", fontSize: 14 }}>Không tìm thấy sản phẩm nào khớp “{result.q}”. Thử gõ ngắn hơn hoặc đổi từ khóa.</div>
                )}
                {result && result.items.length > 1 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 13, color: "#667085", marginBottom: 8 }}>
                      {result.gan_dung ? "Không có kết quả khớp đúng — gợi ý gần giống" : `Có ${result.tong} kết quả`}
                      {result.tong > result.items.length ? ` (hiện ${result.items.length} đầu tiên — gõ thêm để lọc)` : ""}. Chọn đúng sản phẩm:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "38dvh", overflowY: "auto" }}>
                      {result.items.map((it) => (
                        <button key={it.id} style={resultBtn} onClick={() => openItem(it.id)}>
                          <div style={{ fontSize: 12, color: "#667085" }}>{it.ma_hang}</div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: "#16365C" }}>{it.ten_hang || "(không có tên)"}</div>
                          {it.da_kiem && <div style={{ fontSize: 12.5, fontWeight: 700, color: "#8A5A00", marginTop: 2 }}>✅ Đã kiểm trước đó: {fmtNum(it.sl_kiem)} {it.don_vi || ""}</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {view === "search" && (
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {PANELS.map(([k, label, n]) => (
                  <button
                    key={k} type="button" onClick={() => { setPanel(panel === k ? null : k); setHq(""); }}
                    style={{ ...tabBtn, ...(panel === k ? tabBtnOn : {}) }}
                  >
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 33, fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{label}</span>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 800, marginTop: 2 }}>{n === null || n === undefined ? "…" : n}</span>
                  </button>
                ))}
              </div>
            )}

            {view === "search" && panel && (
              <div style={{ ...card, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#16365C", whiteSpace: "nowrap" }}>{panelTitle}{baseList ? ` (${hqn ? `${histShown.length}/` : ""}${baseList.length})` : ""}</div>
                  <input
                    value={hq} onChange={(e) => setHq(e.target.value)} placeholder="Tìm mã, tên, vị trí" autoComplete="off" autoCapitalize="none"
                    style={{ ...inputStyle, flex: 1, minWidth: 0, padding: "6px 10px", fontSize: 16, borderRadius: 8 }}
                  />
                </div>
                {baseList === null && <div style={{ color: "#667085", fontSize: 14 }}>Đang tải...</div>}
                {baseList && baseList.length > 0 && histShown.length === 0 && <div style={{ color: "#667085", fontSize: 14 }}>Không có dòng nào khớp “{hq.trim()}”.</div>}
                {baseList && baseList.length === 0 && (
                  <div style={{ color: "#667085", fontSize: 14 }}>
                    {panel === "ls" ? "Chưa kiểm sản phẩm nào — bấm 📷 để quét mã hoặc gõ mã/tên để tìm sản phẩm."
                      : panel === "chua" ? "🎉 Đã kiểm hết tất cả sản phẩm."
                        : "Không có sản phẩm nào lệch tồn."}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", paddingRight: 2 }}>
                  {histShown.map((it) => {
                    const lech = lechOf(it);
                    const bg = !it.da_kiem || lech === 0 ? {} : lech > 0 ? { background: "#E3F0FF", borderColor: "#B7D4F7" } : { background: "#FDE8E6", borderColor: "#F3C0BB" };
                    return (
                      <div key={it.id} style={{ ...resultBtn, ...bg, display: "flex", gap: 8, alignItems: "center", cursor: "default" }}>
                        <div style={{ minWidth: 0, flex: 1, cursor: done ? "default" : "pointer" }} onClick={() => { if (!done) openItem(it.id); }}>
                          <div style={{ fontSize: 12, color: "#667085" }}>{it.ma_hang}{it.da_kiem ? ` · ${fmtTime(it.kiem_at)}` : ""}{it.da_kiem && it.kiem_by ? ` · ${it.kiem_by}` : ""}{it.ngoai_ds ? " · Ngoài danh sách" : ""}</div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#16365C" }}>{it.ten_hang || (it.ngoai_ds ? "(chưa nhập tên)" : "(không có tên)")}</div>
                          {loText(it) && <div style={{ fontSize: 12, color: "#3E5C2A", marginTop: 2, wordBreak: "break-word" }}>📅 {loText(it)}</div>}
                          {it.vi_tri && <div style={{ fontSize: 12, color: "#1F4E79", marginTop: 2, wordBreak: "break-word" }}>📍 {it.vi_tri}</div>}
                          {it.ghi_chu && <div style={{ fontSize: 12, color: "#8A5A00", marginTop: 2, wordBreak: "break-word" }}>📝 {it.ghi_chu}</div>}
                        </div>
                        {it.da_kiem ? (
                          <div style={{ flexShrink: 0, textAlign: "right", lineHeight: 1.3 }}>
                            <div style={{ fontSize: 17, fontWeight: 800 }}>{fmtNum(it.sl_kiem)} <span style={{ fontSize: 11.5, fontWeight: 500, color: "#667085" }}>{it.don_vi}</span></div>
                            {!it.ngoai_ds && <div style={{ fontSize: 11.5, color: "#667085" }}>Tồn: {fmtNum(it.ton_kho)}</div>}
                            {!(it.ngoai_ds && it.sl_kiem === null) && <div style={{ fontSize: 12.5, fontWeight: 800, color: lech === 0 ? "#3E7A2A" : lech > 0 ? "#1F6FD6" : "#C0392B" }}>
                              {lech === 0 ? "Khớp" : `Lệch ${lech > 0 ? "+" : ""}${fmtNum(lech)}`}
                            </div>}
                          </div>
                        ) : (
                          <div style={{ flexShrink: 0, textAlign: "right", lineHeight: 1.3 }}>
                            <div style={{ fontSize: 11.5, color: "#667085" }}>Tồn kho</div>
                            <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtNum(it.ton_kho)} <span style={{ fontSize: 11.5, fontWeight: 500, color: "#667085" }}>{it.don_vi}</span></div>
                          </div>
                        )}
                        {it.da_kiem && !done && (
                          <button style={btnDel} disabled={deletingId === it.id} onClick={() => doXoaDong(it)} aria-label="Xoá dòng kiểm kê">{deletingId === it.id ? "…" : "🗑"}</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {view === "add" && (
              <div style={card}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#16365C" }}>Thêm sản phẩm ngoài danh sách</div>
                <div style={{ fontSize: 12.5, color: "#667085", margin: "2px 0 14px" }}>Sản phẩm không có trong danh sách tồn cần kiểm. Các trường đều không bắt buộc — chỉ cần nhập ít nhất 1 trường là lưu được.</div>
                <label style={lbl}>Mã sản phẩm</label>
                <input value={addForm.ma_hang} onChange={(e) => setAddForm({ ...addForm, ma_hang: e.target.value })} maxLength={100} autoComplete="off" autoCapitalize="none" style={{ ...inputStyle, marginBottom: 12 }} />
                <label style={lbl}>Tên sản phẩm</label>
                <input value={addForm.ten_hang} onChange={(e) => setAddForm({ ...addForm, ten_hang: e.target.value })} maxLength={300} autoComplete="off" style={{ ...inputStyle, marginBottom: 12 }} />
                <label style={lbl}>Đơn vị tính</label>
                <input value={addForm.don_vi} onChange={(e) => setAddForm({ ...addForm, don_vi: e.target.value })} maxLength={50} autoComplete="off" style={{ ...inputStyle, marginBottom: 12 }} />
                <label style={lbl}>Số lượng &amp; Date</label>
                <div style={{ marginBottom: 14 }}>{renderLots()}</div>
                <label style={lbl}>Phân loại hàng</label>
                <input value={addForm.phan_loai} onChange={(e) => setAddForm({ ...addForm, phan_loai: e.target.value })} maxLength={100} autoComplete="off" style={{ ...inputStyle, marginBottom: 12 }} />
                {renderViTri()}
                <label style={lbl}>Ghi chú</label>
                <textarea value={addForm.ghi_chu} onChange={(e) => setAddForm({ ...addForm, ghi_chu: e.target.value })} rows={3} maxLength={1000} style={{ ...inputStyle, fontSize: 15, resize: "vertical", fontFamily: "inherit" }} />
                {err && <div style={errStyle}>{err}</div>}
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button style={{ ...btnGhost, flex: 1, padding: "13px 10px", fontSize: 15 }} onClick={backToSearch}>← Quay lại</button>
                  <button style={{ ...btnPrimary, flex: 2, padding: "13px 10px", fontSize: 16 }} disabled={saving || done} onClick={doAdd}>{saving ? "Đang lưu..." : "💾 Lưu"}</button>
                </div>
              </div>
            )}

            {view === "detail" && item && (
              <div style={card}>
                <div style={{ fontSize: 12.5, color: "#667085" }}>Mã sản phẩm</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{item.ma_hang || "-"}{item.ngoai_ds ? <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: "#1F6FD6", background: "#E8F1FD", borderRadius: 99, padding: "2px 9px" }}>Ngoài danh sách</span> : null}</div>
                <div style={{ fontSize: 12.5, color: "#667085" }}>Tên sản phẩm</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#16365C", marginBottom: 12 }}>{item.ten_hang || "-"}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div style={infoBox}><div style={infoLbl}>Đơn vị tính</div><div style={infoVal}>{item.don_vi || "-"}</div></div>
                  <div style={infoBox}><div style={infoLbl}>Số lượng tồn kho</div><div style={infoVal}>{item.ngoai_ds ? "-" : fmtNum(item.ton_kho)}</div></div>
                  <div style={{ ...infoBox, gridColumn: "1 / -1" }}><div style={infoLbl}>Phân loại hàng hóa</div><div style={infoVal}>{item.phan_loai || "-"}</div></div>
                </div>

                {item.da_kiem && (
                  <div style={{ marginBottom: 12, padding: "10px 12px", background: "#FFF4D6", border: "1px solid #F0D58A", borderRadius: 10, color: "#6B4700" }}>
                    <div style={{ fontSize: 13 }}>Đã kiểm trước đó</div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtNum(item.sl_kiem)} <span style={{ fontSize: 13, fontWeight: 600 }}>{item.don_vi}</span></div>
                    {loText(item) && <div style={{ fontSize: 13, marginTop: 2 }}>📅 {loText(item)}</div>}
                    {item.kiem_by && <div style={{ fontSize: 13, marginTop: 2 }}>Người kiểm: {item.kiem_by}</div>}
                    {item.vi_tri && <div style={{ fontSize: 13, marginTop: 2 }}>📍 {item.vi_tri}</div>}
                    {item.ghi_chu && <div style={{ fontSize: 13, marginTop: 2 }}>📝 {item.ghi_chu}</div>}
                    <div style={{ fontSize: 12.5, marginTop: 4 }}>Nhập số lượng kiểm <b>thêm</b> lần này — hệ thống sẽ <b>cộng dồn</b> vào số trên.</div>
                  </div>
                )}
                {renderViTri()}
                <label style={lbl}>{item.da_kiem && !ghiDe ? "Số lượng kiểm thêm lần này" : "Số lượng kiểm kê"}{item.don_vi ? ` (${item.don_vi})` : ""} <span style={{ fontWeight: 500, color: "#667085" }}>và date (HSD)</span></label>
                {renderLots(doSave)}
                <label style={{ ...lbl, marginTop: 14 }}>Ghi chú (nếu có)</label>
                <textarea
                  value={note} onChange={(e) => setNote(e.target.value)} disabled={done} rows={3} maxLength={1000}
                  placeholder="VD: hộp móp, hết hạn, thiếu nắp..." style={{ ...inputStyle, fontSize: 15, resize: "vertical", fontFamily: "inherit" }}
                />
                {item.da_kiem && !done && (() => {
                  const col = collectLots(lots);
                  const n = col.total;
                  const ok = !col.error && col.lo.length > 0;
                  return (
                    <>
                      <div style={{ fontSize: 14, marginTop: 8, fontWeight: 700, color: "#16365C" }}>
                        {ghiDe ? "Số lượng sau khi lưu (đặt lại)" : "Tổng sau khi lưu"}: {ok ? fmtNum(ghiDe ? n : Math.round((item.sl_kiem + n) * 1000) / 1000) : "..."} {item.don_vi}
                      </div>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 13, color: "#667085" }}>
                        <input type="checkbox" checked={ghiDe} onChange={(e) => setGhiDe(e.target.checked)} /> Nhập nhầm — đặt lại số lượng (không cộng dồn)
                      </label>
                    </>
                  );
                })()}
                {err && <div style={errStyle}>{err}</div>}
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button style={{ ...btnGhost, flex: 1, padding: "13px 10px", fontSize: 15 }} onClick={backToSearch}>← Quay lại</button>
                  <button style={{ ...btnPrimary, flex: 2, padding: "13px 10px", fontSize: 16 }} disabled={saving || done} onClick={doSave}>{saving ? "Đang lưu..." : "💾 Lưu"}</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {datePick !== null && (
        <DateSheet
          value={lots[datePick]?.date} onClose={() => setDatePick(null)}
          onPick={(v) => { setLots((ls) => ls.map((x, j) => (j === datePick ? { ...x, date: v } : x))); setDatePick(null); }}
        />
      )}

      {scanOpen && (
        <div style={scanOverlay}>
          <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", padding: "14px 16px", boxSizing: "border-box" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, color: "#fff" }}>
              <b style={{ fontSize: 16 }}>📷 Quét barcode sản phẩm</b>
              <button style={btnGhost} onClick={closeScan}>✕ Đóng</button>
            </div>
            {toast && <div style={{ marginBottom: 10, padding: "8px 10px", background: "#E6F6E1", color: "#2f6b1a", borderRadius: 8, fontSize: 13.5, fontWeight: 600 }}>{toast}</div>}
            <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", background: "#000", borderRadius: 12, overflow: "hidden" }}>
              <video ref={videoRef} muted playsInline autoPlay style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <div style={{ position: "absolute", left: "5%", right: "5%", top: "30%", bottom: "30%", border: "2px solid rgba(255,255,255,0.85)", borderRadius: 10, boxShadow: "0 0 0 999px rgba(0,0,0,0.35)", pointerEvents: "none" }}>
                <div style={{ position: "absolute", left: 6, right: 6, top: "50%", height: 2, background: "rgba(255,70,70,0.9)" }} />
              </div>
            </div>
            {camError
              ? <div style={{ color: "#FFB4AB", fontSize: 13.5, marginTop: 12 }}>⚠️ {camError}</div>
              : <div style={{ color: "#C9D6EA", fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>{lastRead && <div style={{ color: "#FFD58A", fontWeight: 600, marginBottom: 6 }}>{lastRead}</div>}Đưa mã vạch trên tem vào khung, giữ máy ổn định cách tem khoảng 15–25cm. Quét được sẽ tự rung/bíp và mở sản phẩm.</div>}
            <button style={{ ...btnGhost, width: "100%", marginTop: 14, padding: "12px" }} onClick={closeScan}>⌨️ Nhập mã bằng tay</button>
          </div>
        </div>
      )}
    </div>
  );
}

const tabBtn = { flex: 1, minWidth: 0, background: "#fff", color: "#1F4E79", border: "1.5px solid #C5D0E0", borderRadius: 12, padding: "9px 6px", cursor: "pointer", textAlign: "center", boxShadow: "0 2px 8px rgba(15,40,80,0.05)" };
const tabBtnOn = { background: "#1F6FD6", color: "#fff", borderColor: "#1F6FD6" };
const btnScan = { background: "#fff", color: "#1F4E79", border: "1.5px solid #1F6FD6", borderRadius: 10, padding: "0 12px", fontSize: 20, cursor: "pointer", flexShrink: 0 };
const btnDel = { background: "#fff", border: "1.5px solid #F0C4C0", borderRadius: 10, padding: "8px 10px", fontSize: 16, cursor: "pointer", flexShrink: 0 };
const scanOverlay = { position: "fixed", inset: 0, background: "rgba(8,16,32,0.96)", zIndex: 200, overflowY: "auto" };
const pageStyle = { minHeight: "100vh", background: "#F2F5FA", padding: "14px 16px 40px", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", color: "#101828" };
const wrapStyle = { maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 };
const card = { background: "#fff", borderRadius: 14, padding: "16px 16px", border: "1px solid #E4E9F2", boxShadow: "0 2px 8px rgba(15,40,80,0.05)" };
const lbl = { display: "block", fontSize: 13, fontWeight: 700, color: "#344054", marginBottom: 6 };
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "12px 12px", fontSize: 16, border: "1.5px solid #C5D0E0", borderRadius: 10, outline: "none", background: "#fff", color: "#101828" };
const btnPrimary = { background: "#1F6FD6", color: "#fff", border: "none", borderRadius: 10, padding: "0 18px", fontSize: 15, fontWeight: 700, cursor: "pointer", flexShrink: 0 };
const btnGhost = { background: "#fff", color: "#1F4E79", border: "1.5px solid #C5D0E0", borderRadius: 10, padding: "7px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const resultBtn = { textAlign: "left", background: "#F8FAFD", border: "1.5px solid #D5DEEC", borderRadius: 10, padding: "10px 12px", cursor: "pointer", width: "100%" };
const errStyle = { marginTop: 10, color: "#B42318", fontSize: 13.5, fontWeight: 600 };
const infoBox = { background: "#F6F8FC", border: "1px solid #E1E8F3", borderRadius: 10, padding: "8px 10px" };
const infoLbl = { fontSize: 11.5, color: "#667085", marginBottom: 2 };
const infoVal = { fontSize: 16, fontWeight: 700 };
