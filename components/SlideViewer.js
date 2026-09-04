import { useEffect, useRef, useState, useCallback } from "react";
import { fetchReportChuDeSlideBlobUrl } from "../lib/api";

// Trình xem/trình bày slide (chốt 04/09, sửa lại theo góp ý: full chiều
// ngang + nối tiếp cuộn dọc thay vì khung nhỏ 1-slide-1-lúc) — các slide
// xếp NỐI TIẾP nhau theo chiều dọc, mỗi slide rộng HẾT chiều ngang khung
// (giống hệt cách các card ở tab "Báo cáo kiểm kê" xếp chồng, cuộn trang
// bình thường để xem hết). Ảnh render sẵn ở backend (giữ nguyên layout gốc
// PowerPoint, xem app/services/pptx_slides.py), cần header Authorization
// nên phải tự fetch về dạng blob rồi mới gán vào <img src>, tự dọn (revoke)
// khi rời trang.
//
// "Toàn màn hình": áp Fullscreen API cho CHÍNH khung chứa danh sách slide —
// khi bật, khung này phủ hết viewport (100vw x 100vh) và TỰ CUỘN bên trong
// (giữ đúng "chiều ngang full màn hình, chiều dọc cuộn lên xuống").
//
// "Trình bày liên tục": tự cuộn mượt (scrollIntoView smooth) sang slide kế
// tiếp theo chu kỳ, lặp lại từ slide 1 sau slide cuối — IntersectionObserver
// theo dõi slide nào đang hiện rõ nhất để cập nhật đúng ô đếm "N/M".
const INTERVAL_OPTIONS = [3, 5, 8, 12];

export default function SlideViewer({ periodLabel, slideCount }) {
  const [urls, setUrls] = useState({}); // { [slideNo]: objectUrl }
  const [failedSlides, setFailedSlides] = useState({}); // { [slideNo]: true }
  const [visible, setVisible] = useState(1); // slide đang hiện rõ nhất trên màn hình (1-based)
  const [playing, setPlaying] = useState(false);
  const [intervalSec, setIntervalSec] = useState(5);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");

  const total = slideCount || 0;
  const cacheRef = useRef({});
  const slideNodeRef = useRef({}); // { [slideNo]: DOM node }
  const containerRef = useRef(null);
  const timerRef = useRef(null);

  // Tải TOÀN BỘ slide tuần tự ngay khi mở (không đợi cuộn tới mới tải) —
  // báo cáo tháng thường chỉ vài chục slide, ảnh PNG nhẹ, tải hết ngay cho
  // trình bày liên tục/cuộn mượt không bị khựng chờ.
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      for (let n = 1; n <= total; n++) {
        if (cancelled) return;
        if (cacheRef.current[n]) continue;
        try {
          const u = await fetchReportChuDeSlideBlobUrl(periodLabel, n);
          if (cancelled) { URL.revokeObjectURL(u); return; }
          cacheRef.current[n] = u;
          setUrls((prev) => ({ ...prev, [n]: u }));
        } catch (err) {
          if (!cancelled) setFailedSlides((prev) => ({ ...prev, [n]: true }));
        }
      }
    }
    loadAll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodLabel, total]);

  // Dọn toàn bộ object URL đã cache khi rời trang — tránh rò rỉ bộ nhớ.
  useEffect(() => {
    return () => {
      Object.values(cacheRef.current).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const goToSlide = useCallback((n) => {
    const clamped = Math.max(1, Math.min(total, n));
    slideNodeRef.current[clamped]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [total]);
  const goPrev = useCallback(() => goToSlide(visible - 1), [goToSlide, visible]);
  const goNext = useCallback(() => goToSlide(visible + 1), [goToSlide, visible]);

  // Theo dõi slide nào đang hiện rõ nhất trong khung nhìn (trang thường
  // hoặc bên trong khung toàn màn hình) để cập nhật ô đếm "N/M" đúng theo
  // vị trí cuộn thực tế.
  useEffect(() => {
    const root = isFullscreen ? containerRef.current : null;
    const observer = new IntersectionObserver(
      (entries) => {
        let best = null;
        for (const e of entries) {
          if (e.isIntersecting && (!best || e.intersectionRatio > best.intersectionRatio)) best = e;
        }
        if (best) {
          const n = Number(best.target.dataset.slideNo);
          if (n) setVisible(n);
        }
      },
      { root, threshold: [0.5] }
    );
    Object.values(slideNodeRef.current).forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, [isFullscreen, total, urls]);

  // Trình bày liên tục — tự cuộn mượt sang slide kế tiếp theo chu kỳ, lặp
  // lại từ slide 1 sau slide cuối (đúng nghĩa "liên tục", không tự dừng).
  useEffect(() => {
    if (!playing) return;
    timerRef.current = setInterval(() => {
      setVisible((cur) => {
        const next = cur >= total ? 1 : cur + 1;
        slideNodeRef.current[next]?.scrollIntoView({ behavior: "smooth", block: "start" });
        return next;
      });
    }, intervalSec * 1000);
    return () => clearInterval(timerRef.current);
  }, [playing, intervalSec, total]);

  function handleKeyDown(e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
    else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
  }

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    if (!containerRef.current?.requestFullscreen) {
      setFullscreenError("Trình duyệt này không hỗ trợ Toàn màn hình.");
      return;
    }
    setFullscreenError("");
    containerRef.current.requestFullscreen().catch((err) => {
      setFullscreenError("Không bật được Toàn màn hình: " + (err.message || err.name || "trình duyệt chặn"));
    });
  }

  if (total <= 0) return null;

  return (
    <div tabIndex={0} onKeyDown={handleKeyDown} style={{ outline: "none" }}>
      {/* Thanh điều khiển — dính trên đầu (sticky) khi cuộn qua nhiều slide */}
      <div style={{
        position: "sticky", top: 0, zIndex: 5, background: "var(--card, #fff)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap",
        padding: "10px 0", marginBottom: 12, borderBottom: "1px solid var(--border, #E4E9F2)",
      }}>
        <button onClick={goPrev} style={slideBtnStyle}>◀ Trước</button>
        <span style={{ fontSize: 13, fontWeight: 700, minWidth: 60, textAlign: "center", color: "var(--navy-900)" }}>
          {visible} / {total}
        </span>
        <button onClick={goNext} style={slideBtnStyle}>Sau ▶</button>
        <button
          onClick={() => setPlaying((p) => !p)}
          style={{ ...slideBtnStyle, background: playing ? "#C0392B" : "#2E7D32", borderColor: "transparent", color: "#fff" }}
        >
          {playing ? "⏸ Tạm dừng" : "▶️ Trình bày liên tục"}
        </button>
        {playing && (
          <select value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))} style={{ ...slideBtnStyle, cursor: "pointer" }}>
            {INTERVAL_OPTIONS.map((s) => <option key={s} value={s}>{s} giây/slide</option>)}
          </select>
        )}
        <button onClick={toggleFullscreen} style={slideBtnStyle}>
          {isFullscreen ? "🗗 Thoát toàn màn hình" : "⛶ Toàn màn hình"}
        </button>
        {fullscreenError && <span style={{ fontSize: 12, color: "var(--danger, #C0392B)" }}>{fullscreenError}</span>}
      </div>

      {/* Khung chứa slide nối tiếp — full chiều ngang, cuộn dọc bình thường
          trong trang; khi bật Toàn màn hình thì CHÍNH khung này phủ hết
          viewport và tự cuộn bên trong. */}
      <div
        ref={containerRef}
        style={{
          display: "flex", flexDirection: "column", gap: 16,
          ...(isFullscreen
            ? { position: "fixed", inset: 0, background: "#0B1220", padding: "16px 0", overflowY: "auto", zIndex: 50 }
            : {}),
        }}
      >
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            data-slide-no={n}
            ref={(el) => { slideNodeRef.current[n] = el; }}
            style={{ width: isFullscreen ? "min(100%, 1400px)" : "100%", margin: isFullscreen ? "0 auto" : 0 }}
          >
            {urls[n] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urls[n]}
                alt={`Slide ${n}/${total}`}
                style={{ width: "100%", height: "auto", display: "block", borderRadius: 6, boxShadow: "0 2px 14px rgba(10,25,55,0.15)" }}
              />
            ) : (
              <div style={{
                width: "100%", aspectRatio: "16/9", borderRadius: 6,
                background: isFullscreen ? "#141F35" : "#EEF1F6",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: isFullscreen ? "#8FA0C2" : "var(--text-400)", fontSize: 13,
              }}>
                {failedSlides[n] ? `❌ Không tải được slide ${n}` : `Đang tải slide ${n}...`}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const slideBtnStyle = {
  background: "var(--surface, #F3F5F9)", border: "1px solid var(--border, #D9DFEA)", color: "var(--navy-900, #182338)",
  borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};
