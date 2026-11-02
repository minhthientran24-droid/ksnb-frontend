import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import {
  getKiemKeLabPublic, searchKiemKeLabPublic, getKiemKeLabPublicItem, saveKiemKeLabPublicItem,
  listKiemKeLabPublicDaKiem, hoanTatKiemKeLabPublic, xoaKiemKeLabPublicItem,
} from "../../lib/api";

// Trang CÔNG KHAI (chốt 02/11) — KHÔNG dùng Layout/Sidebar, KHÔNG cần đăng nhập. Người kiểm kê sản phẩm LAB (không có barcode)
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
const fmtNum = (n) => (n === null || n === undefined ? "-" : Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 3 }));

export default function KiemKeLabPublicPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : null;

  const [phieu, setPhieu] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState("search"); // search | detail
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState(null); // {items, tong, gan_dung, q} | null (chưa tìm)
  const [item, setItem] = useState(null);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [ghiDe, setGhiDe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [history, setHistory] = useState(null); // lịch sử kiểm kê (mới nhất trước) | null (đang tải)
  const [deletingId, setDeletingId] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [camError, setCamError] = useState("");
  const videoRef = useRef(null);
  const handledRef = useRef(false);
  const camModeRef = useRef(false); // đang kiểm bằng camera -> lưu xong tự mở lại camera cho sản phẩm kế
  const runSearchRef = useRef(null);
  const [completing, setCompleting] = useState(false);

  const searchRef = useRef(null);
  const qtyRef = useRef(null);
  const done = phieu?.trang_thai === "hoan_tat";

  useEffect(() => {
    if (!router.isReady || !token) return;
    getKiemKeLabPublic(token).then(setPhieu).catch((e) => setLoadError(e.message || "Không tải được phiếu kiểm kê"));
    loadHistory();
  }, [router.isReady, token]);

  function loadHistory() {
    if (!token) return;
    listKiemKeLabPublicDaKiem(token).then((r) => setHistory(r.items)).catch(() => {});
  }

  // ---- Camera quét barcode ----
  // Dùng @zxing/browser + TRY_HARDER (html5-qrcode đọc mã vạch 1D khi quét trực tiếp rất kém — đã thử, không ra mã Code128).
  useEffect(() => {
    if (!scanOpen) return undefined;
    let cancelled = false;
    let controls = null;
    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        if (cancelled) return;
        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.CODABAR, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });
        const onResult = (res, _err, ctl) => {
          if (!res || handledRef.current) return;
          handledRef.current = true;
          const text = res.getText();
          try { ctl.stop(); } catch {}
          beep();
          setScanOpen(false);
          setQ(text);
          runSearchRef.current?.(text);
        };
        const video = videoRef.current;
        try {
          controls = await reader.decodeFromConstraints({ video: { facingMode: "environment", width: { ideal: 1600 }, height: { ideal: 900 } } }, video, onResult);
        } catch (e1) {
          if (String(e1?.name || e1).includes("NotAllowed")) throw e1;
          controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video, onResult); // máy từ chối cấu hình nâng cao -> lùi về mặc định
        }
        if (cancelled) { try { controls.stop(); } catch {} }
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
      try { controls?.stop(); } catch {}
    };
  }, [scanOpen]);

  function startScan() {
    if (done) return;
    setErr("");
    setToast("");
    setCamError("");
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
        setQty(""); // lần kiểm mới: nhập số đếm thêm, hệ thống cộng dồn vào số đã kiểm trước đó
        setNote("");
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
    const raw = qty.trim().replace(",", ".");
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n) || n < 0) { setErr("Nhập số lượng kiểm kê hợp lệ (số ≥ 0)."); return; }
    setSaving(true);
    setErr("");
    try {
      const r = await saveKiemKeLabPublicItem(token, item.id, n, note, ghiDe);
      setPhieu(r.phieu);
      setToast(`✅ Đã lưu: ${item.ten_hang || item.ma_hang} — ${item.da_kiem && !ghiDe ? `+${fmtNum(n)}, tổng đã kiểm ${fmtNum(r.item.sl_kiem)}` : fmtNum(r.item.sl_kiem)} ${item.don_vi || ""}`);
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

  function backToSearch() {
    setErr("");
    setItem(null);
    setView("search");
  }

  async function doXoaDong(it) {
    if (!confirm(`Xoá dòng kiểm kê “${it.ten_hang || it.ma_hang}” (${fmtNum(it.sl_kiem)} ${it.don_vi || ""})? Số lượng và ghi chú đã nhập sẽ bị xoá, sản phẩm quay về trạng thái chưa kiểm.`)) return;
    setDeletingId(it.id);
    try {
      const r = await xoaKiemKeLabPublicItem(token, it.id);
      setPhieu(r.phieu);
      setHistory((h) => (h || []).filter((x) => x.id !== it.id));
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
  const fixedView = !!phieu && view === "search";
  const pct = phieu && phieu.so_sp ? Math.round((phieu.so_da_kiem / phieu.so_sp) * 100) : 0;

  return (
    <div style={fixedView ? { ...pageStyle, height: "100dvh", minHeight: 0, boxSizing: "border-box", overflow: "hidden", paddingBottom: 14 } : pageStyle}>
      <Head>
        <title>Kiểm kê LAB</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <div style={fixedView ? { ...wrapStyle, height: "100%" } : wrapStyle}>
        {loadError && <div style={{ ...card, color: "#B42318", textAlign: "center" }}>{loadError}</div>}
        {!loadError && !phieu && <div style={{ ...card, textAlign: "center", color: "#667085" }}>Đang tải...</div>}

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
              <div style={{ ...card, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#16365C", marginBottom: 10, flexShrink: 0 }}>🕘 Lịch sử kiểm kê{history ? ` (${history.length})` : ""}</div>
                {history === null && <div style={{ color: "#667085", fontSize: 14 }}>Đang tải...</div>}
                {history && history.length === 0 && <div style={{ color: "#667085", fontSize: 14 }}>Chưa kiểm sản phẩm nào — bấm 📷 để quét mã hoặc gõ mã/tên để tìm sản phẩm.</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", paddingRight: 2 }}>
                  {(history || []).map((it) => (
                    <div key={it.id} style={{ ...resultBtn, display: "flex", gap: 8, alignItems: "center", cursor: "default" }}>
                      <div style={{ minWidth: 0, flex: 1, cursor: done ? "default" : "pointer" }} onClick={() => { if (!done) openItem(it.id); }}>
                        <div style={{ fontSize: 12, color: "#667085" }}>{it.ma_hang} · {fmtTime(it.kiem_at)}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#16365C" }}>{it.ten_hang || "(không có tên)"}</div>
                        {it.ghi_chu && <div style={{ fontSize: 12, color: "#8A5A00", marginTop: 2, wordBreak: "break-word" }}>📝 {it.ghi_chu}</div>}
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 800, flexShrink: 0, textAlign: "right" }}>{fmtNum(it.sl_kiem)}<div style={{ fontSize: 11.5, fontWeight: 500, color: "#667085" }}>{it.don_vi}</div></div>
                      {!done && (
                        <button style={btnDel} disabled={deletingId === it.id} onClick={() => doXoaDong(it)} aria-label="Xoá dòng kiểm kê">{deletingId === it.id ? "…" : "🗑"}</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === "detail" && item && (
              <div style={card}>
                <div style={{ fontSize: 12.5, color: "#667085" }}>Mã sản phẩm</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{item.ma_hang}</div>
                <div style={{ fontSize: 12.5, color: "#667085" }}>Tên sản phẩm</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#16365C", marginBottom: 12 }}>{item.ten_hang || "-"}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div style={infoBox}><div style={infoLbl}>Đơn vị tính</div><div style={infoVal}>{item.don_vi || "-"}</div></div>
                  <div style={infoBox}><div style={infoLbl}>Số lượng tồn kho</div><div style={infoVal}>{fmtNum(item.ton_kho)}</div></div>
                  <div style={{ ...infoBox, gridColumn: "1 / -1" }}><div style={infoLbl}>Phân loại hàng hóa</div><div style={infoVal}>{item.phan_loai || "-"}</div></div>
                </div>

                {item.da_kiem && (
                  <div style={{ marginBottom: 12, padding: "10px 12px", background: "#FFF4D6", border: "1px solid #F0D58A", borderRadius: 10, color: "#6B4700" }}>
                    <div style={{ fontSize: 13 }}>Đã kiểm trước đó</div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtNum(item.sl_kiem)} <span style={{ fontSize: 13, fontWeight: 600 }}>{item.don_vi}</span></div>
                    {item.ghi_chu && <div style={{ fontSize: 13, marginTop: 2 }}>📝 {item.ghi_chu}</div>}
                    <div style={{ fontSize: 12.5, marginTop: 4 }}>Nhập số lượng kiểm <b>thêm</b> lần này — hệ thống sẽ <b>cộng dồn</b> vào số trên.</div>
                  </div>
                )}
                <label style={lbl}>{item.da_kiem && !ghiDe ? "Số lượng kiểm thêm lần này" : "Số lượng kiểm kê"}{item.don_vi ? ` (${item.don_vi})` : ""}</label>
                <input
                  ref={qtyRef} value={qty} onChange={(e) => setQty(e.target.value)} disabled={done}
                  onKeyDown={(e) => { if (e.key === "Enter" && !done) doSave(); }}
                  inputMode="decimal" placeholder="Nhập số lượng đếm được" autoComplete="off"
                  style={{ ...inputStyle, fontSize: 22, fontWeight: 700, textAlign: "center" }}
                />
                <label style={{ ...lbl, marginTop: 14 }}>Ghi chú (nếu có)</label>
                <textarea
                  value={note} onChange={(e) => setNote(e.target.value)} disabled={done} rows={3} maxLength={1000}
                  placeholder="VD: hộp móp, hết hạn, thiếu nắp..." style={{ ...inputStyle, fontSize: 15, resize: "vertical", fontFamily: "inherit" }}
                />
                {item.da_kiem && !done && (() => {
                  const n = Number(qty.trim().replace(",", "."));
                  const ok = qty.trim() !== "" && Number.isFinite(n) && n >= 0;
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
              : <div style={{ color: "#C9D6EA", fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>Đưa mã vạch trên tem vào khung, giữ máy ổn định cách tem khoảng 15–25cm. Quét được sẽ tự rung/bíp và mở sản phẩm.</div>}
            <button style={{ ...btnGhost, width: "100%", marginTop: 14, padding: "12px" }} onClick={closeScan}>⌨️ Nhập mã bằng tay</button>
          </div>
        </div>
      )}
    </div>
  );
}

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
