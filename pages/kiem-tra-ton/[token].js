import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import {
  getCheckLechTonVxPublic, scanCheckLechTonVxPublic, hoanTatCheckLechTonVxPublic,
  deleteCheckLechTonVxPublicScan,
} from "../../lib/api";

// Trang CÔNG KHAI (chốt 09/09) — KHÔNG dùng Layout/Sidebar, KHÔNG cần
// đăng nhập, dành cho NV cửa hàng quét QR đối chiếu tồn kho VX theo 1
// phiếu do NV nội bộ tạo ở menu "Hỗ trợ shop > Hỗ trợ check lệch tồn
// VX". Xác thực DUY NHẤT bằng `token` ngẫu nhiên trong URL (xem
// backend/app/routers/check_lech_ton_vx.py). Dùng html5-qrcode (import
// ĐỘNG bên trong useEffect/hàm xử lý, KHÔNG import ở đầu file) để tránh
// lỗi SSR — trang này được Next.js prerender lúc build, module đọc
// window/document ở top-level sẽ làm sập build nếu import tĩnh.
const QR_ELEMENT_ID = "kiem-tra-ton-qr-reader";

function fmtDateTime(s) {
  if (!s) return "-";
  const d = new Date(s);
  if (isNaN(d)) return "-";
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch {}
}

// Thời gian giữ kết quả (camera tắt) trước khi tự mở lại quét tiếp —
// chốt 09/09 lần 6, kéo dài hơn bản trước (1200ms) theo phản hồi anh
// "tốc độ chuyển camera chậm lại tí".
const RESULT_HOLD_MS = 2000;

// Màu/icon/nhãn hiển thị cho 1 kết quả quét — DÙNG CHUNG cho cả overlay
// flash lẫn từng dòng "Lịch sử quét gần đây" (chốt 09/09 lần 7). "Trùng"
// (đã quét mã này trước đó rồi, bất kể khớp hay không) ưu tiên hiện màu
// CAM, đè lên trên xanh/đỏ bình thường — đúng yêu cầu anh.
function resultVisual(h) {
  if (h.da_trung) return { bg: "rgba(230,150,20,0.94)", icon: "🔁", label: "TRÙNG — ĐÃ QUÉT TRƯỚC ĐÓ", color: "#C97A0A" };
  if (h.khop) return { bg: "rgba(62,122,42,0.94)", icon: "✅", label: "CÓ TỒN", color: "#3E7A2A" };
  return { bg: "rgba(214,69,69,0.94)", icon: "❌", label: "KHÔNG TỒN", color: "#D64545" };
}

export default function KiemTraTonPublicPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : null;

  const [phieu, setPhieu] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [summary, setSummary] = useState(null); // {chua_quet, khong_ton} — có giá trị khi phiếu đã hoàn tất

  // "sessionOn" = phiên quét đang bật theo Ý NGƯỜI DÙNG (từ lúc bấm "Mở
  // camera" tới lúc bấm "Dừng quét"/"Hoàn tất") — KHÁC với việc camera
  // phần cứng có đang thật sự chạy hay không tại 1 thời điểm cụ thể: mỗi
  // lần quét được 1 mã, camera TẮT HẲN trong lúc hiện kết quả rồi mới tự
  // mở lại (chốt 09/09 lần 5, theo đúng yêu cầu anh) — "sessionOn" vẫn
  // giữ true suốt khoảng đó để UI (nút bấm, khung hình) không bị nhấp
  // nháy giữa các lần quét.
  const [sessionOn, setSessionOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [lastResult, setLastResult] = useState(null); // {khop, ma_quet, ten_sp} | null — flash màu lúc camera tắt
  const [history, setHistory] = useState([]); // lịch sử quét, mới nhất trước
  const [completing, setCompleting] = useState(false);
  // Mặc định TỰ HIỆN danh sách sản phẩm (chốt 09/09 lần 8 — đảo lại
  // quyết định lần 3, theo yêu cầu mới nhất của anh). Vẫn cho bấm ẩn/hiện
  // lại nếu cần dồn chỗ cho khung camera.
  const [showList, setShowList] = useState(true);

  const html5QrRef = useRef(null);
  const processingRef = useRef(false);
  // Nguồn sự thật đọc được bên trong callback/timer (state có thể bị stale
  // closure trong đó) — true nghĩa là NÊN tự mở lại camera sau mỗi lần
  // quét; tắt bởi "Dừng quét"/"Hoàn tất" (chủ động), KHÔNG tắt bởi lần tắt
  // camera nội bộ giữa 2 lượt quét.
  const autoScanRef = useRef(false);
  // AudioContext dùng phát tiếng "tít" lúc quét (chốt 09/09 lần 6 — anh
  // báo không cảm nhận được rung, navigator.vibrate() KHÔNG được hỗ trợ
  // trên iOS Safari nên là nguyên nhân chính; âm thanh đáng tin cậy hơn
  // nhiều). Trình duyệt chỉ cho phát âm thanh sau 1 thao tác bấm thật của
  // NV — nên chỉ tạo/resume đúng 1 lần NGAY trong hàm startScanning() (do
  // nút "Mở camera" gọi trực tiếp), rồi tái dùng mãi cho các lần quét sau
  // (kể cả khi beep() được gọi từ trong callback bất đồng bộ, không phải
  // trực tiếp từ 1 cú bấm).
  const audioCtxRef = useRef(null);

  function ensureAudioUnlocked() {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current?.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
    } catch {}
  }

  function beep() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 1046.5; // C6 — tiếng "tít" ngắn, rõ, không chói
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {}
  }

  function loadPhieu() {
    if (!token) return;
    setLoading(true);
    getCheckLechTonVxPublic(token)
      .then((p) => {
        setPhieu(p);
        setItems(p.items || []);
        // Nạp lại lịch sử quét TỪ SERVER (chốt 09/09 lần 8) — để NV vẫn
        // thấy các lượt quét trước đó dù mới mở lại link/tải lại trang
        // giữa chừng (phiếu đang kiểm, chưa hoàn tất), không chỉ những
        // lượt quét trong đúng phiên trình duyệt hiện tại.
        setHistory(p.lich_su_quet || []);
        setSummary(p.trang_thai === "hoan_tat" ? { chua_quet: p.chua_quet, khong_ton: p.khong_ton } : null);
        setLoadError("");
      })
      .catch((err) => setLoadError(err.message || "Không tải được phiếu kiểm tra"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!router.isReady) return;
    loadPhieu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, token]);

  // userInitiated=true (mặc định, nút "Dừng quét"/"Hoàn tất"/rời trang):
  // TẮT hẳn phiên quét, autoScanRef=false nên không tự mở lại nữa.
  // userInitiated=false (nội bộ, xem onDecoded): CHỈ tắt phần cứng
  // camera lúc hiện kết quả 1 lần quét — autoScanRef giữ nguyên, sessionOn
  // KHÔNG tắt (UI vẫn hiện "Dừng quét", khung hình vẫn giữ chỗ).
  async function stopScanning(userInitiated = true) {
    if (userInitiated) {
      autoScanRef.current = false;
      setSessionOn(false);
    }
    try {
      if (html5QrRef.current) {
        await html5QrRef.current.stop();
        html5QrRef.current.clear();
      }
    } catch {
      // camera có thể đã tự tắt (đổi tab, khoá màn hình...) — bỏ qua lỗi stop
    }
    html5QrRef.current = null;
  }

  // Tự tắt camera khi rời trang (đổi route/đóng tab) — tránh camera bật
  // ngầm tốn pin/gây khó chịu cho NV. Không setState trong lúc unmount.
  useEffect(() => {
    return () => {
      autoScanRef.current = false;
      if (html5QrRef.current) {
        html5QrRef.current.stop().then(() => html5QrRef.current?.clear()).catch(() => {});
        html5QrRef.current = null;
      }
    };
  }, []);

  // Quét được 1 mã -> TẮT camera ngay -> rung + tít 1 cái -> gọi API +
  // báo kết quả (xanh/đỏ) trong lúc camera đang tắt -> giữ kết quả
  // RESULT_HOLD_MS rồi TỰ MỞ LẠI camera, tiếp tục quét mã kế (chốt 09/09
  // lần 5/6, đúng luồng anh mô tả: tắt camera - rung/tít - báo kết quả -
  // rồi mới mở lại camera, có chậm lại 1 nhịp cho dễ đọc kết quả).
  function onDecoded(decodedText) {
    if (processingRef.current) return;
    processingRef.current = true;
    stopScanning(false)
      .then(() => {
        vibrate(80);
        beep(); // tiếng "tít" — đáng tin cậy hơn rung (rung không hoạt động trên iOS)
        return scanCheckLechTonVxPublic(token, decodedText);
      })
      .then((res) => {
        setLastResult(res);
        // Lượt quét TRÙNG (chốt 09/09 lần 9, theo yêu cầu anh) — backend
        // KHÔNG ghi log cho lượt này (scan_log_id = null), nên KHÔNG đẩy
        // vào "Lịch sử quét" ở đây nữa — chỉ báo cam + tự chuyển tiếp,
        // không có gì mới để ghi vào hệ thống.
        if (!res.da_trung) {
          setHistory((h) => [{ ...res, at: Date.now() }, ...h].slice(0, 50)); // khớp giới hạn 50 dòng của server
          if (res.khop) {
            const norm = decodedText.trim().toUpperCase();
            setItems((prev) => prev.map((it) => (it.ma_sp.trim().toUpperCase() === norm ? { ...it, da_quet: true } : it)));
          }
        }
      })
      .catch((err) => {
        setLastResult({ khop: false, ma_quet: decodedText, error: err.message });
      })
      .finally(() => {
        setTimeout(() => {
          setLastResult(null);
          processingRef.current = false;
          if (autoScanRef.current) startScanning();
        }, RESULT_HOLD_MS);
      });
  }

  async function startScanning() {
    autoScanRef.current = true;
    setSessionOn(true);
    setCameraError("");
    ensureAudioUnlocked(); // mở khoá phát âm thanh — PHẢI gọi trong cùng lượt bấm của NV
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      // Chốt 10/09 — QR/tem thuốc thực tế phần lớn là mã Data Matrix
      // (khung chữ L 2 cạnh, KHÔNG phải 3 ô vuông góc như QR thật), không
      // phải lỗi camera mờ/lấy nét như tưởng ban đầu: mặc định thư viện
      // ưu tiên dùng BarcodeDetector CÓ SẴN của trình duyệt (nhanh hơn),
      // nhưng bản native trên iOS Safari hỗ trợ Data Matrix rất kém/thiếu
      // — ép useBarCodeDetectorIfSupported=false để LUÔN dùng bộ giải mã
      // JS nội bộ (ZXing, đã xác nhận có decoder Data Matrix đầy đủ,
      // hoạt động ổn định same trên mọi trình duyệt). formatsToSupport chỉ
      // để QR_CODE + DATA_MATRIX (bỏ các loại mã vạch khác không dùng
      // tới) cho nhẹ, đỡ tốn xử lý mỗi khung hình.
      const inst = new Html5Qrcode(QR_ELEMENT_ID, {
        useBarCodeDetectorIfSupported: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.DATA_MATRIX],
      });
      html5QrRef.current = inst;
      // Chốt 10/09 lần 2 — tối ưu TỐC ĐỘ giải mã (anh báo "quét được rồi
      // nhưng nhận chậm" sau khi ép dùng ZXing JS ở trên, decoder JS vốn
      // chậm hơn BarcodeDetector gốc của trình duyệt):
      //  - disableFlip: true — bộ giải mã MẶC ĐỊNH thử luôn cả bản ảnh
      //    LẬT NGƯỢC mỗi khung hình (để hỗ trợ camera trước/selfie vốn bị
      //    mirror) — GẦN NHƯ GẤP ĐÔI khối lượng xử lý mỗi lần. App này
      //    LUÔN dùng camera sau (facingMode environment, không mirror)
      //    nên tắt hẳn bước thử ảnh lật, không mất gì mà nhanh hơn hẳn.
      //  - fps 10 -> 15 — thử giải mã nhiều lần hơn mỗi giây.
      //
      // Chốt 10/09 lần 3 — theo ảnh anh gửi: đúng 1 cự ly thì quét dễ,
      // gần hơn/xa hơn đều khó. 2 nguyên nhân KHÁC NHAU, sửa riêng từng cái:
      //  - QUÁ GẦN -> mã to hơn cả khung quét (qrbox) cố định 240x240px,
      //    bị CẮT MẤT 1 phần rìa mã -> không giải mã được (Data Matrix
      //    cần thấy TRỌN VẸN cả ký hiệu, khác universe với QR có thể chịu
      //    che khuất 1 phần nhờ sửa lỗi Reed-Solomon tốt hơn). Tăng qrbox
      //    thành HÀM co giãn theo đúng khung hình camera thật (70% cạnh
      //    ngắn hơn của khung xem, tối thiểu 220 - tối đa 320px) thay vì
      //    số cố định — dư chỗ hơn hẳn cho lúc đưa camera lại gần.
      //  - QUÁ XA -> mã co lại còn quá ít điểm ảnh để phân biệt từng ô
      //    (module) của ký hiệu, ảnh hưởng bởi ĐỘ PHÂN GIẢI video, không
      //    phải do qrbox. Nâng nhẹ độ phân giải ideal từ 1280x720 lên
      //    1600x900 (không quay lại hẳn 1920x1080 cũ để tránh làm chậm
      //    lại như trước) — cân bằng giữa xa hơn quét được và vẫn giữ
      //    được phần lớn tốc độ vừa tối ưu.
      const responsiveQrbox = (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const size = Math.max(220, Math.min(320, Math.floor(minEdge * 0.7)));
        return { width: size, height: size };
      };
      const baseConfig = { fps: 15, qrbox: responsiveQrbox, disableFlip: true };
      try {
        await inst.start(
          { facingMode: "environment" },
          {
            ...baseConfig,
            videoConstraints: {
              facingMode: "environment",
              width: { ideal: 1600 },
              height: { ideal: 900 },
              advanced: [{ focusMode: "continuous" }],
            },
          },
          onDecoded,
          () => {}, // callback báo "chưa thấy QR" ở MỖI khung hình — cố ý bỏ qua, quá nhiễu
        );
      } catch {
        // Một số thiết bị/trình duyệt có thể từ chối cấu hình nâng cao ở
        // trên (VD OverconstrainedError) — lùi về cấu hình mặc định đơn
        // giản, chắc chắn mở được camera.
        await inst.start({ facingMode: "environment" }, baseConfig, onDecoded, () => {});
      }
    } catch (err) {
      autoScanRef.current = false;
      setSessionOn(false);
      setCameraError(
        err?.message?.includes("NotAllowedError") || String(err).includes("NotAllowedError")
          ? "Trình duyệt chưa được cấp quyền camera — vào cài đặt trình duyệt bật quyền Camera cho trang này rồi thử lại."
          : (err?.message || "Không mở được camera trên thiết bị này."),
      );
    }
  }

  async function handleHoanTat() {
    if (!confirm("Hoàn tất kiểm tra? Sau khi hoàn tất sẽ không quét thêm được nữa (trừ khi được mở lại).")) return;
    setCompleting(true);
    try {
      await stopScanning(true);
      const res = await hoanTatCheckLechTonVxPublic(token);
      setPhieu(res);
      setItems(res.items || []);
      setSummary({ chua_quet: res.chua_quet, khong_ton: res.khong_ton });
    } catch (err) {
      alert(err.message || "Hoàn tất thất bại");
    } finally {
      setCompleting(false);
    }
  }

  // Cho phép NV tự xoá 1 lượt quét bị bắn sai (chốt 09/09 lần 7) — hỏi
  // xác nhận trước, xoá xong cập nhật lại items (đúng số đã quét) + báo
  // đã xoá thành công.
  const [deletingScanId, setDeletingScanId] = useState(null);
  async function handleDeleteScan(h) {
    if (!confirm(`Xoá lượt quét mã "${h.ma_quet}"? Không thể hoàn tác.`)) return;
    setDeletingScanId(h.scan_log_id);
    try {
      const res = await deleteCheckLechTonVxPublicScan(token, h.scan_log_id);
      setItems(res.items || []);
      setHistory((prev) => prev.filter((x) => x.scan_log_id !== h.scan_log_id));
      alert("✅ Đã xoá lượt quét.");
    } catch (err) {
      alert(err.message || "Xoá lượt quét thất bại");
    } finally {
      setDeletingScanId(null);
    }
  }

  const soDaQuet = items.filter((it) => it.da_quet).length;
  const soSp = items.length;
  const daHoanTat = phieu?.trang_thai === "hoan_tat";
  const resultVisualNow = lastResult ? resultVisual(lastResult) : null;

  return (
    <>
      <Head>
        <title>Kiểm tra lệch tồn VX</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <div style={pageStyle}>
        <div style={headerStyle}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>📦 Kiểm tra lệch tồn VX</div>
          {phieu && (
            <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 4 }}>
              {phieu.ma_shop ? `${phieu.ma_shop} - ` : ""}{phieu.ten_shop || "Cửa hàng"}
            </div>
          )}
        </div>

        <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>
          {loading && <div style={cardStyle}>Đang tải phiếu kiểm tra...</div>}

          {!loading && loadError && (
            <div style={{ ...cardStyle, color: "#D64545", textAlign: "center" }}>
              ❌ {loadError}
              <div style={{ fontSize: 12, color: "#8892A6", marginTop: 8 }}>
                Kiểm tra lại đường link, hoặc liên hệ người tạo phiếu.
              </div>
            </div>
          )}

          {!loading && !loadError && phieu && (
            <>
              {/* Tiến độ + danh sách sản phẩm cần kiểm tra */}
              <div style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    Đã quét {soDaQuet}/{soSp} sản phẩm
                  </div>
                  <button style={linkBtnStyle} onClick={() => setShowList((v) => !v)}>
                    {showList ? "▲ Ẩn danh sách" : "👁 Xem tên & mã SP"}
                  </button>
                </div>
                <div style={progressBarOuter}>
                  <div style={{ ...progressBarInner, width: `${soSp ? (soDaQuet / soSp) * 100 : 0}%` }} />
                </div>
                {showList && (
                  <div style={{ marginTop: 10, maxHeight: 220, overflowY: "auto", border: "1px solid #E4E8F0", borderRadius: 8 }}>
                    {items.map((it) => (
                      <div key={it.id} style={itemRowStyle}>
                        <span style={{ color: it.da_quet ? "#3E7A2A" : "#8892A6" }}>{it.da_quet ? "✅" : "⬜"}</span>
                        <span style={{ flex: 1, marginLeft: 8 }}>{it.ma_sp}{it.ten_sp ? ` — ${it.ten_sp}` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {daHoanTat ? (
                <div style={cardStyle}>
                  <div style={{ fontWeight: 800, fontSize: 14.5, color: "#3E7A2A", marginBottom: 6 }}>
                    ✅ Đã hoàn tất lúc {fmtDateTime(phieu.completed_at)}
                  </div>
                  <div style={{ fontSize: 12, color: "#8892A6", marginBottom: 14 }}>
                    Phiếu đã khoá — liên hệ người tạo phiếu nếu cần quét bổ sung.
                  </div>

                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                    ⬜ Chưa bắn ({summary.chua_quet.length})
                  </div>
                  {summary.chua_quet.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: "#3E7A2A", marginBottom: 14 }}>Không có — đã quét đủ toàn bộ.</div>
                  ) : (
                    <div style={{ ...summaryBoxStyle, marginBottom: 14 }}>
                      {summary.chua_quet.map((it) => (
                        <div key={it.ma_sp}>{it.ma_sp}{it.ten_sp ? ` — ${it.ten_sp}` : ""}</div>
                      ))}
                    </div>
                  )}

                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                    ⚠️ Đã bắn mà không tồn ({summary.khong_ton.length})
                  </div>
                  {summary.khong_ton.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: "#3E7A2A" }}>Không có mã lạ nào.</div>
                  ) : (
                    <div style={summaryBoxStyle}>
                      {summary.khong_ton.map((k) => (
                        <div key={k.ma_quet}>{k.ma_quet}{k.so_lan_quet > 1 ? ` (quét ${k.so_lan_quet} lần)` : ""}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Khu vực camera — chốt 09/09 lần 11, bỏ hẳn khung/thẻ
                      trắng bọc quanh, layout nút "Mở camera" giờ y hệt nút
                      "Hoàn tất" (nút trần, không thẻ bao, đặt thẳng trên
                      nền trang) theo yêu cầu anh, gọn/tiết kiệm diện tích
                      hơn hẳn bản có card. */}
                  <div style={{ position: "relative", marginBottom: sessionOn || lastResult ? 12 : 0 }}>
                    <div
                      id={QR_ELEMENT_ID}
                      style={{ width: "100%", borderRadius: 10, overflow: "hidden", background: sessionOn ? "#000" : "transparent", minHeight: sessionOn ? 260 : 0 }}
                    />
                    {lastResult && (
                      <div style={{ ...flashOverlayStyle, background: resultVisualNow.bg }}>
                        <div style={{ fontSize: 30 }}>{resultVisualNow.icon}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>
                          {resultVisualNow.label}
                        </div>
                        <div style={{ fontSize: 12.5, marginTop: 4, opacity: 0.95 }}>
                          {lastResult.ma_quet}{lastResult.ten_sp ? ` — ${lastResult.ten_sp}` : ""}
                        </div>
                      </div>
                    )}
                  </div>

                  {cameraError && <div style={{ color: "#D64545", fontSize: 12.5, marginBottom: 10 }}>⚠️ {cameraError}</div>}

                  {!sessionOn ? (
                    <button style={{ ...primaryBtnStyle, marginBottom: 14 }} onClick={startScanning}>📷 Mở camera quét QR</button>
                  ) : (
                    <button style={{ ...secondaryBtnStyle, marginBottom: 14 }} onClick={() => stopScanning(true)}>⏹ Dừng quét</button>
                  )}

                  {history.length > 0 && (
                    <div style={cardStyle}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Lịch sử quét gần đây</div>
                      <div style={{ fontSize: 11, color: "#8892A6", marginBottom: 8 }}>
                        Bắn sai thì bấm 🗑 để xoá lượt quét đó.
                      </div>
                      <div style={{ maxHeight: 200, overflowY: "auto" }}>
                        {history.map((h) => {
                          const v = resultVisual(h);
                          return (
                            <div key={h.scan_log_id} style={{ ...itemRowStyle, color: v.color }}>
                              <span>{v.icon}</span>
                              <span style={{ flex: 1, marginLeft: 8 }}>
                                {h.ma_quet}{h.ten_sp ? ` — ${h.ten_sp}` : ""}{h.da_trung ? " (trùng)" : ""}
                              </span>
                              <button
                                onClick={() => handleDeleteScan(h)}
                                disabled={deletingScanId === h.scan_log_id}
                                style={deleteScanBtnStyle}
                                title="Xoá lượt quét này (bắn sai)"
                              >
                                {deletingScanId === h.scan_log_id ? "..." : "🗑"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button style={{ ...primaryBtnStyle, background: "#1B3B80" }} disabled={completing} onClick={handleHoanTat}>
                    {completing ? "Đang xử lý..." : "🏁 Hoàn tất"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

const pageStyle = { minHeight: "100vh", background: "#F5F7FB", color: "#182338", fontFamily: "system-ui, -apple-system, sans-serif" };
const headerStyle = { background: "linear-gradient(135deg,#2850AD,#1B3B80)", color: "#fff", padding: "18px 20px" };
const cardStyle = { background: "#fff", border: "1px solid #E4E8F0", borderRadius: 12, padding: 16, marginBottom: 14, fontSize: 13.5 };
const itemRowStyle = { display: "flex", alignItems: "center", padding: "7px 10px", fontSize: 12.5, borderBottom: "1px solid #F0F2F7" };
const progressBarOuter = { height: 8, background: "#EEF1F6", borderRadius: 999, marginTop: 10, overflow: "hidden" };
const progressBarInner = { height: "100%", background: "#3E7A2A", borderRadius: 999, transition: "width .3s" };
const summaryBoxStyle = { border: "1px solid #D64545", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, color: "#D64545" };
const linkBtnStyle = { background: "none", border: "none", color: "#2850AD", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const primaryBtnStyle = {
  width: "100%", padding: "13px 16px", borderRadius: 10, border: "none",
  background: "linear-gradient(135deg,#2850AD,#1B3B80)", color: "#fff", fontSize: 14.5, fontWeight: 700, cursor: "pointer",
};
const secondaryBtnStyle = {
  width: "100%", padding: "13px 16px", borderRadius: 10, border: "1.5px solid #D64545",
  background: "#fff", color: "#D64545", fontSize: 14.5, fontWeight: 700, cursor: "pointer",
};
const deleteScanBtnStyle = {
  background: "none", border: "none", cursor: "pointer", fontSize: 13,
  padding: "2px 6px", flexShrink: 0, opacity: 0.75,
};
const flashOverlayStyle = {
  position: "absolute", inset: 0, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", color: "#fff", borderRadius: 10, textAlign: "center", padding: 16,
};
