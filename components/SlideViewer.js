import { useEffect, useRef, useState, useCallback } from "react";
import { fetchReportChuDeSlideBlobUrl } from "../lib/api";

// Trình xem/trình bày slide (chốt 04/09) — render từ ảnh PNG từng slide đã
// tách sẵn ở backend (giữ nguyên layout gốc file PowerPoint, xem
// app/services/pptx_slides.py). Ảnh cần header Authorization nên phải tự
// fetch về dạng blob (không gán thẳng <img src> được) — cache lại theo số
// slide, tự dọn (revoke) khi rời trang. Có nút "Trình bày liên tục" tự
// động lật slide theo chu kỳ (mặc định 5 giây), lặp lại từ đầu sau slide
// cuối, và nút Toàn màn hình dùng Fullscreen API cho đúng cảm giác trình chiếu.
const INTERVAL_OPTIONS = [3, 5, 8, 12];

export default function SlideViewer({ periodLabel, slideCount }) {
  const [index, setIndex] = useState(0); // 0-based
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [intervalSec, setIntervalSec] = useState(5);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const cacheRef = useRef({}); // { [slideNo]: objectUrl }
  const containerRef = useRef(null);
  const timerRef = useRef(null);

  const total = slideCount || 0;

  const loadSlide = useCallback(async (slideNo, { prefetchOnly = false } = {}) => {
    if (slideNo < 1 || slideNo > total) return null;
    if (cacheRef.current[slideNo]) return cacheRef.current[slideNo];
    try {
      const objUrl = await fetchReportChuDeSlideBlobUrl(periodLabel, slideNo);
      cacheRef.current[slideNo] = objUrl;
      return objUrl;
    } catch (err) {
      if (!prefetchOnly) setError(err.message || "Tải slide thất bại");
      return null;
    }
  }, [periodLabel, total]);

  // Tải slide hiện tại + tự tải trước (prefetch) slide kế tiếp cho mượt
  // khi bấm Sau/trình bày liên tục.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    loadSlide(index + 1).then((u) => {
      if (!cancelled) {
        setUrl(u);
        setLoading(false);
      }
    });
    loadSlide(index + 2, { prefetchOnly: true });
    return () => { cancelled = true; };
  }, [index, loadSlide]);

  // Dọn toàn bộ object URL đã cache khi rời trang — tránh rò rỉ bộ nhớ.
  useEffect(() => {
    return () => {
      Object.values(cacheRef.current).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const goTo = useCallback((next) => {
    if (total <= 0) return;
    setIndex(((next % total) + total) % total);
  }, [total]);
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);
  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);

  // Trình bày liên tục — tự lật slide theo chu kỳ, lặp lại từ slide 1 sau
  // slide cuối (đúng nghĩa "liên tục", không tự dừng).
  useEffect(() => {
    if (!playing) return;
    timerRef.current = setInterval(() => {
      setIndex((i) => (total > 0 ? (i + 1) % total : i));
    }, intervalSec * 1000);
    return () => clearInterval(timerRef.current);
  }, [playing, intervalSec, total]);

  // Phím mũi tên trái/phải — chỉ bắt khi đang thao tác trong khung xem này.
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
    } else {
      containerRef.current?.requestFullscreen?.();
    }
  }

  if (total <= 0) return null;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        background: "#0B1220", borderRadius: isFullscreen ? 0 : "var(--radius)",
        padding: isFullscreen ? 0 : "16px", outline: "none",
        display: "flex", flexDirection: "column", gap: 12,
        height: isFullscreen ? "100vh" : undefined,
        justifyContent: isFullscreen ? "center" : undefined,
      }}
    >
      <div style={{
        position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: isFullscreen ? undefined : 320, flex: isFullscreen ? 1 : undefined,
      }}>
        {loading && <div style={{ color: "#B9C4D9", fontSize: 13 }}>Đang tải slide...</div>}
        {!loading && error && <div style={{ color: "#FF8A8A", fontSize: 13 }}>❌ {error}</div>}
        {!loading && !error && url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Slide ${index + 1}/${total}`}
            style={{ maxWidth: "100%", maxHeight: isFullscreen ? "92vh" : "70vh", borderRadius: 4, boxShadow: "0 8px 30px rgba(0,0,0,0.4)" }}
          />
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={goPrev} style={slideBtnStyle}>◀ Trước</button>
        <span style={{ color: "#E5EAF3", fontSize: 13, fontWeight: 700, minWidth: 60, textAlign: "center" }}>
          {index + 1} / {total}
        </span>
        <button onClick={goNext} style={slideBtnStyle}>Sau ▶</button>
        <button
          onClick={() => setPlaying((p) => !p)}
          style={{ ...slideBtnStyle, background: playing ? "#C0392B" : "#2E7D32", borderColor: "transparent", color: "#fff" }}
        >
          {playing ? "⏸ Tạm dừng" : "▶️ Trình bày liên tục"}
        </button>
        {playing && (
          <select
            value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))}
            style={{ ...slideBtnStyle, cursor: "pointer" }}
          >
            {INTERVAL_OPTIONS.map((s) => <option key={s} value={s}>{s} giây/slide</option>)}
          </select>
        )}
        <button onClick={toggleFullscreen} style={slideBtnStyle}>
          {isFullscreen ? "🗗 Thoát toàn màn hình" : "⛶ Toàn màn hình"}
        </button>
      </div>
    </div>
  );
}

const slideBtnStyle = {
  background: "#1B2740", border: "1px solid #2C3B5C", color: "#E5EAF3",
  borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};
