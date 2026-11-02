import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import {
  getKiemKeLabPublic, searchKiemKeLabPublic, getKiemKeLabPublicItem, saveKiemKeLabPublicItem,
  listKiemKeLabPublicDaKiem, hoanTatKiemKeLabPublic,
} from "../../lib/api";

// Trang CÔNG KHAI (chốt 02/11) — KHÔNG dùng Layout/Sidebar, KHÔNG cần đăng nhập. Người kiểm kê sản phẩm LAB (không có barcode)
// gõ mã / tên sản phẩm + Enter -> chọn đúng sản phẩm (chỉ 1 kết quả thì vào thẳng) -> xem thông tin + tồn kho -> nhập TAY số
// lượng kiểm kê -> Lưu -> quay lại màn tìm kiếm. Xác thực DUY NHẤT bằng `token` trong URL (xem backend/app/routers/kiem_ke_lab.py).
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
  const [daKiem, setDaKiem] = useState(null); // danh sách đã kiểm (popup) | null
  const [completing, setCompleting] = useState(false);

  const searchRef = useRef(null);
  const qtyRef = useRef(null);
  const done = phieu?.trang_thai === "hoan_tat";

  useEffect(() => {
    if (!router.isReady || !token) return;
    getKiemKeLabPublic(token).then(setPhieu).catch((e) => setLoadError(e.message || "Không tải được phiếu kiểm kê"));
  }, [router.isReady, token]);

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
        setDaKiem(null);
      })
      .catch((e) => setErr(e.message));
  }

  async function doSearch() {
    const text = q.trim();
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

  async function openDaKiem() {
    try { setDaKiem((await listKiemKeLabPublicDaKiem(token)).items); } catch (e) { setErr(e.message); }
  }

  async function doHoanTat() {
    const chua = (phieu?.so_sp || 0) - (phieu?.so_da_kiem || 0);
    if (!confirm(`Hoàn tất kiểm kê?${chua > 0 ? ` Còn ${chua} sản phẩm chưa kiểm.` : ""} Sau khi hoàn tất sẽ không nhập thêm được nữa (trừ khi được mở lại).`)) return;
    setCompleting(true);
    try { setPhieu(await hoanTatKiemKeLabPublic(token)); } catch (e) { setErr(e.message); } finally { setCompleting(false); }
  }

  const pct = phieu && phieu.so_sp ? Math.round((phieu.so_da_kiem / phieu.so_sp) * 100) : 0;

  return (
    <div style={pageStyle}>
      <Head>
        <title>Kiểm kê LAB</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <div style={wrapStyle}>
        {loadError && <div style={{ ...card, color: "#B42318", textAlign: "center" }}>{loadError}</div>}
        {!loadError && !phieu && <div style={{ ...card, textAlign: "center", color: "#667085" }}>Đang tải...</div>}

        {phieu && (
          <>
            <div style={card}>
              <div style={{ fontSize: 12, color: "#667085", fontWeight: 600 }}>🧪 KIỂM KÊ LAB</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#16365C", margin: "2px 0 8px" }}>{phieu.ten_phieu}</div>
              <div style={{ height: 8, background: "#E6EBF2", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: done ? "#3E7A2A" : "#1F6FD6", transition: "width .3s" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 13, gap: 8, flexWrap: "wrap" }}>
                <span>Đã kiểm <b>{phieu.so_da_kiem}</b>/{phieu.so_sp} sản phẩm ({pct}%)</span>
                <span style={{ display: "flex", gap: 6 }}>
                  <button style={btnGhost} onClick={openDaKiem}>📋 Đã kiểm</button>
                  {!done && <button style={btnGhost} disabled={completing} onClick={doHoanTat}>{completing ? "..." : "🏁 Hoàn tất"}</button>}
                </span>
              </div>
              {done && <div style={{ marginTop: 10, padding: "8px 10px", background: "#E6F6E1", color: "#2f6b1a", borderRadius: 8, fontSize: 13 }}>✅ Phiếu đã hoàn tất — không nhập thêm được. Nhờ admin bấm “Mở lại” nếu cần chỉnh sửa.</div>}
            </div>

            {view === "search" && (
              <div style={card}>
                {toast && <div style={{ marginBottom: 10, padding: "8px 10px", background: "#E6F6E1", color: "#2f6b1a", borderRadius: 8, fontSize: 13.5, fontWeight: 600 }}>{toast}</div>}
                <label style={lbl}>Tìm sản phẩm (mã hoặc tên)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    ref={searchRef} value={q} onChange={(e) => { setQ(e.target.value); setToast(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
                    placeholder="Gõ mã hoặc tên rồi nhấn Enter" enterKeyHint="search" autoComplete="off" autoCapitalize="none"
                    style={inputStyle}
                  />
                  <button style={btnPrimary} disabled={searching || !q.trim()} onClick={doSearch}>{searching ? "..." : "Tìm"}</button>
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
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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

      {daKiem && (
        <div style={overlay} onClick={() => setDaKiem(null)}>
          <div style={sheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <b style={{ fontSize: 15 }}>Đã kiểm ({daKiem.length})</b>
              <button style={btnGhost} onClick={() => setDaKiem(null)}>Đóng</button>
            </div>
            {daKiem.length === 0 && <div style={{ color: "#667085", fontSize: 14 }}>Chưa kiểm sản phẩm nào.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {daKiem.map((it) => (
                <button key={it.id} style={{ ...resultBtn, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }} onClick={() => openItem(it.id)}>
                  <span style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#667085" }}>{it.ma_hang}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#16365C" }}>{it.ten_hang}</div>
                    {it.ghi_chu && <div style={{ fontSize: 12, color: "#8A5A00", marginTop: 2 }}>📝 {it.ghi_chu}</div>}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{fmtNum(it.sl_kiem)} <span style={{ fontSize: 11.5, fontWeight: 500, color: "#667085" }}>{it.don_vi}</span></span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
const overlay = { position: "fixed", inset: 0, background: "rgba(10,20,40,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 };
const sheet = { background: "#fff", width: "100%", maxWidth: 560, maxHeight: "80vh", overflowY: "auto", borderRadius: "16px 16px 0 0", padding: "16px 16px 28px" };
