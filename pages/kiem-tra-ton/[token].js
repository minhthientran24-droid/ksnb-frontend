import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import {
  getCheckLechTonVxPublic, scanCheckLechTonVxPublic, hoanTatCheckLechTonVxPublic,
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

export default function KiemTraTonPublicPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : null;

  const [phieu, setPhieu] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [summary, setSummary] = useState(null); // {chua_quet, khong_ton} — có giá trị khi phiếu đã hoàn tất

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [lastResult, setLastResult] = useState(null); // {khop, ma_quet, ten_sp} | null — flash màu
  const [history, setHistory] = useState([]); // lịch sử quét, mới nhất trước
  const [completing, setCompleting] = useState(false);
  // Mặc định ẨN danh sách sản phẩm trên UI mobile quét (chốt 09/09 lần 3,
  // theo yêu cầu anh) — NV cần xem lại tên/mã thì tự bấm mở, đỡ chiếm màn
  // hình nhỏ lúc đang thao tác quét liên tục.
  const [showList, setShowList] = useState(false);

  const html5QrRef = useRef(null);
  const processingRef = useRef(false);

  function loadPhieu() {
    if (!token) return;
    setLoading(true);
    getCheckLechTonVxPublic(token)
      .then((p) => {
        setPhieu(p);
        setItems(p.items || []);
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

  async function stopScanning() {
    try {
      if (html5QrRef.current) {
        await html5QrRef.current.stop();
        html5QrRef.current.clear();
      }
    } catch {
      // camera có thể đã tự tắt (đổi tab, khoá màn hình...) — bỏ qua lỗi stop
    }
    html5QrRef.current = null;
    setScanning(false);
  }

  // Tự tắt camera khi rời trang (đổi route/đóng tab) — tránh camera bật
  // ngầm tốn pin/gây khó chịu cho NV.
  useEffect(() => {
    return () => { stopScanning(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onDecoded(decodedText) {
    if (processingRef.current) return;
    processingRef.current = true;
    scanCheckLechTonVxPublic(token, decodedText)
      .then((res) => {
        setLastResult(res);
        setHistory((h) => [{ ...res, at: Date.now() }, ...h].slice(0, 30));
        vibrate(res.khop ? 80 : [60, 80, 60]);
        if (res.khop) {
          const norm = decodedText.trim().toUpperCase();
          setItems((prev) => prev.map((it) => (it.ma_sp.trim().toUpperCase() === norm ? { ...it, da_quet: true } : it)));
        }
      })
      .catch((err) => {
        setLastResult({ khop: false, ma_quet: decodedText, error: err.message });
      })
      .finally(() => {
        setTimeout(() => {
          processingRef.current = false;
          setLastResult(null);
        }, 1200);
      });
  }

  async function startScanning() {
    setCameraError("");
    setScanning(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const inst = new Html5Qrcode(QR_ELEMENT_ID);
      html5QrRef.current = inst;
      await inst.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        onDecoded,
        () => {}, // callback báo "chưa thấy QR" ở MỖI khung hình — cố ý bỏ qua, quá nhiễu
      );
    } catch (err) {
      setCameraError(
        err?.message?.includes("NotAllowedError") || String(err).includes("NotAllowedError")
          ? "Trình duyệt chưa được cấp quyền camera — vào cài đặt trình duyệt bật quyền Camera cho trang này rồi thử lại."
          : (err?.message || "Không mở được camera trên thiết bị này."),
      );
      setScanning(false);
    }
  }

  async function handleHoanTat() {
    if (!confirm("Hoàn tất kiểm tra? Sau khi hoàn tất sẽ không quét thêm được nữa (trừ khi được mở lại).")) return;
    setCompleting(true);
    try {
      await stopScanning();
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

  const soDaQuet = items.filter((it) => it.da_quet).length;
  const soSp = items.length;
  const daHoanTat = phieu?.trang_thai === "hoan_tat";

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
                  {/* Khu vực camera */}
                  <div style={cardStyle}>
                    <div style={{ position: "relative" }}>
                      <div
                        id={QR_ELEMENT_ID}
                        style={{ width: "100%", borderRadius: 10, overflow: "hidden", background: scanning ? "#000" : "transparent", minHeight: scanning ? 260 : 0 }}
                      />
                      {lastResult && (
                        <div style={{ ...flashOverlayStyle, background: lastResult.khop ? "rgba(62,122,42,0.94)" : "rgba(214,69,69,0.94)" }}>
                          <div style={{ fontSize: 30 }}>{lastResult.khop ? "✅" : "❌"}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>
                            {lastResult.khop ? "CÓ TỒN" : "KHÔNG TỒN"}
                          </div>
                          <div style={{ fontSize: 12.5, marginTop: 4, opacity: 0.95 }}>
                            {lastResult.ma_quet}{lastResult.ten_sp ? ` — ${lastResult.ten_sp}` : ""}
                          </div>
                        </div>
                      )}
                    </div>

                    {cameraError && <div style={{ color: "#D64545", fontSize: 12.5, marginTop: 10 }}>⚠️ {cameraError}</div>}

                    <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                      {!scanning ? (
                        <button style={primaryBtnStyle} onClick={startScanning}>📷 Mở camera quét QR</button>
                      ) : (
                        <button style={secondaryBtnStyle} onClick={stopScanning}>⏹ Dừng quét</button>
                      )}
                    </div>
                  </div>

                  {history.length > 0 && (
                    <div style={cardStyle}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Lịch sử quét gần đây</div>
                      <div style={{ maxHeight: 160, overflowY: "auto" }}>
                        {history.map((h, i) => (
                          <div key={i} style={{ ...itemRowStyle, color: h.khop ? "#3E7A2A" : "#D64545" }}>
                            <span>{h.khop ? "✅" : "❌"}</span>
                            <span style={{ flex: 1, marginLeft: 8 }}>{h.ma_quet}{h.ten_sp ? ` — ${h.ten_sp}` : ""}</span>
                          </div>
                        ))}
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
const flashOverlayStyle = {
  position: "absolute", inset: 0, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", color: "#fff", borderRadius: 10, textAlign: "center", padding: 16,
};
