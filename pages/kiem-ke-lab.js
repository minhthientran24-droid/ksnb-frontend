import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import {
  getUser,
  listKiemKeLabPhieu, getKiemKeLabPhieu, reopenKiemKeLabPhieu, deleteKiemKeLabPhieu,
  importKiemKeLabExcel, downloadKiemKeLabTemplate, exportKiemKeLabPhieu,
} from "../lib/api";

// Menu "Kiểm kê LAB" (chốt 02/11) — dành cho TẤT CẢ role. Kiểm kê tay (nhập số lượng) cho sản phẩm không có barcode để quét.
// NV nội bộ import file "Tồn kho cần kiểm" (Mã hàng / Tên hàng / Đơn vị / Số lượng tồn / Phân loại tài sản) -> sinh 1 phiếu + link
// công khai /kiem-ke-lab/{token} (không cần đăng nhập). Người kiểm vào link tìm sản phẩm theo mã/tên rồi nhập số lượng kiểm kê.
// Xuất Excel đối chiếu được bất kỳ lúc nào, kể cả phiếu chưa hoàn tất. Xem backend/app/routers/kiem_ke_lab.py.
function fmtDateTime(s) {
  if (!s) return "-";
  const d = new Date(s);
  if (isNaN(d)) return "-";
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
const fmtNum = (n) => (n === null || n === undefined ? "-" : Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 3 }));

function publicLink(token) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/kiem-ke-lab/${token}`;
}
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function KiemKeLabPage() {
  const me = getUser();
  const isAdmin = ["admin", "super_admin"].includes(me?.role);

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  function reload() {
    setLoading(true);
    listKiemKeLabPhieu()
      .then((rows) => { setList(rows); setLoadError(""); })
      .catch((err) => setLoadError(err.message || "Không tải được danh sách phiếu"))
      .finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);

  // ---- Import ----
  const importRef = useRef(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFile, setNewFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [created, setCreated] = useState(null);
  const [templateBusy, setTemplateBusy] = useState(false);

  function openCreate() {
    setShowCreate(true);
    setNewName("");
    setNewFile(null);
    setImportError("");
    setCreated(null);
  }
  function closeCreate() {
    if (importing) return;
    setShowCreate(false);
  }
  function handlePickFile(e) {
    const file = e.target.files?.[0] || null;
    setNewFile(file);
    setImportError("");
    if (file && !newName.trim()) setNewName(file.name.replace(/\.xlsx?$/i, ""));
  }
  async function handleCreate() {
    if (!newName.trim()) { setImportError("Vui lòng nhập tên phiếu kiểm kê"); return; }
    if (!newFile) { setImportError("Vui lòng đính kèm file Excel tồn kho cần kiểm"); return; }
    setImporting(true);
    setImportError("");
    try {
      const p = await importKiemKeLabExcel(newFile, newName.trim());
      setShowCreate(false);
      setCreated(p);
      reload();
    } catch (err) {
      setImportError(err.message || "Tạo phiếu thất bại");
    } finally {
      setImporting(false);
    }
  }
  async function handleTemplate() {
    setTemplateBusy(true);
    try { await downloadKiemKeLabTemplate(); } catch (err) { alert(err.message || "Tải template thất bại"); } finally { setTemplateBusy(false); }
  }

  // ---- Link / xuất / mở lại / xoá ----
  const [copiedId, setCopiedId] = useState(null);
  async function handleCopyLink(id, token) {
    const ok = await copyToClipboard(publicLink(token));
    if (ok) {
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800);
    } else {
      alert("Không copy được — anh copy tay link này nhé:\n" + publicLink(token));
    }
  }
  const [exportingId, setExportingId] = useState(null);
  async function handleExport(id) {
    setExportingId(id);
    try { await exportKiemKeLabPhieu(id); } catch (err) { alert(err.message || "Xuất Excel thất bại"); } finally { setExportingId(null); }
  }
  async function handleReopen(id) {
    try {
      await reopenKiemKeLabPhieu(id);
      reload();
      if (viewId === id) openView(id);
    } catch (err) { alert(err.message || "Mở lại phiếu thất bại"); }
  }
  async function handleDelete(id) {
    if (!confirm("Xoá phiếu này? Toàn bộ số liệu đã kiểm sẽ mất, không thể hoàn tác.")) return;
    try {
      await deleteKiemKeLabPhieu(id);
      if (viewId === id) setViewId(null);
      reload();
    } catch (err) { alert(err.message || "Xoá phiếu thất bại"); }
  }

  // ---- Xem chi tiết ----
  const [viewId, setViewId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [viewError, setViewError] = useState("");
  const [filter, setFilter] = useState("all"); // all | da | chua | lech
  const [dq, setDq] = useState("");
  function openView(id) {
    setViewId(id);
    setDetail(null);
    setViewError("");
    setFilter("all");
    setDq("");
    getKiemKeLabPhieu(id).then(setDetail).catch((err) => setViewError(err.message));
  }
  const shown = (detail?.items || []).filter((it) => {
    if (filter === "da" && !it.da_kiem) return false;
    if (filter === "chua" && it.da_kiem) return false;
    if (filter === "lech" && !(it.da_kiem && (it.sl_kiem || 0) !== (it.ton_kho || 0))) return false;
    const q = dq.trim().toLowerCase();
    return !q || `${it.ma_hang} ${it.ten_hang || ""} ${it.vi_tri || ""} ${it.ghi_chu || ""}`.toLowerCase().includes(q);
  });

  return (
    <Layout crumb="Kiểm kê LAB">
      <div className="page-head">
        <h1>🧪 Kiểm kê LAB</h1>
        <p>Kiểm kê tay (nhập số lượng) cho sản phẩm không có barcode. Bấm “Tạo phiếu kiểm kê”, đặt tên phiếu và đính kèm file tồn kho cần kiểm — hệ thống sinh link công khai (không cần đăng nhập) gửi cho người kiểm.</p>
      </div>

      <div className="card">
        <div className="card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h3>Danh sách phiếu kiểm kê</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="upload-btn" disabled={templateBusy} onClick={handleTemplate}>{templateBusy ? "Đang tải..." : "📄 Tải template"}</button>
            <button className="upload-btn" onClick={openCreate}>➕ Tạo phiếu kiểm kê</button>
          </div>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 14, lineHeight: 1.6 }}>
            File gồm các cột <b>Mã hàng / Tên hàng / Đơn vị / Số lượng tồn / Phân loại tài sản</b> (mỗi lần tạo = 1 file = 1 phiếu mới, mã phiếu tăng dần LAB-0001, LAB-0002...).
            Người kiểm mở link, gõ mã hoặc tên sản phẩm rồi nhấn Enter để tìm, nhập số lượng kiểm kê và bấm Lưu.
          </p>
          {loadError && <div className="placeholder-box">Không tải được dữ liệu: {loadError}</div>}
          {!loadError && loading && <div className="placeholder-box">Đang tải...</div>}
          {!loadError && !loading && (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Mã phiếu</th>
                    <th style={{ textAlign: "left" }}>Tên phiếu</th>
                    <th>Người tạo</th>
                    <th>Ngày tạo</th>
                    <th>Số SP</th>
                    <th>Đã kiểm</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id}>
                      <td style={{ whiteSpace: "nowrap" }}><b>{p.ma_phieu}</b></td>
                      <td style={{ textAlign: "left" }}>{p.ten_phieu || "-"}</td>
                      <td>{p.created_by_name || "-"}</td>
                      <td>{fmtDateTime(p.created_at)}</td>
                      <td>{p.so_sp}</td>
                      <td>{p.so_da_kiem}/{p.so_sp}</td>
                      <td><span className={`pill ${p.trang_thai === "hoan_tat" ? "ok" : "warn"}`}>{p.trang_thai === "hoan_tat" ? "Đã hoàn tất" : "Đang kiểm"}</span></td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                          <button className="fbtn" onClick={() => openView(p.id)}>Xem</button>
                          <button className="fbtn" onClick={() => handleCopyLink(p.id, p.token)}>{copiedId === p.id ? "✅ Đã copy" : "🔗 Copy link"}</button>
                          <button className="fbtn" disabled={exportingId === p.id} onClick={() => handleExport(p.id)}>{exportingId === p.id ? "Đang xuất..." : "📥 Xuất Excel"}</button>
                          {p.trang_thai === "hoan_tat" && isAdmin && <button className="fbtn" onClick={() => handleReopen(p.id)}>🔓 Mở lại</button>}
                          {(isAdmin || p.created_by_name === me?.full_name) && (
                            <button className="fbtn" style={{ color: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => handleDelete(p.id)}>Xoá</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {list.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-400)" }}>Chưa có phiếu nào — bấm “Tạo phiếu kiểm kê” để tạo phiếu đầu tiên</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Popup xem chi tiết phiếu */}
      {viewId && (
        <div style={overlayStyle} onClick={() => setViewId(null)}>
          <div style={{ ...modalStyle, width: 900 }} onClick={(e) => e.stopPropagation()}>
            {viewError && <div style={{ color: "var(--danger)", fontSize: 13 }}>{viewError}</div>}
            {!viewError && !detail && <div style={{ fontSize: 13, color: "var(--text-600)" }}>Đang tải...</div>}
            {detail && (
              <>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--navy-900)", marginBottom: 4 }}>Phiếu {detail.ma_phieu} — {detail.ten_phieu}</h3>
                <div style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 12 }}>
                  Tạo lúc {fmtDateTime(detail.created_at)} bởi {detail.created_by_name || "-"} {" · "}
                  <span className={`pill ${detail.trang_thai === "hoan_tat" ? "ok" : "warn"}`}>{detail.trang_thai === "hoan_tat" ? "Đã hoàn tất" : "Đang kiểm"}</span>
                  {detail.completed_at ? ` · lúc ${fmtDateTime(detail.completed_at)}` : ""} {" · "}
                  <b>{detail.so_da_kiem}/{detail.so_sp}</b> sản phẩm đã kiểm
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <input readOnly className="finput" style={{ flex: 1, fontSize: 11.5 }} value={publicLink(detail.token)} onFocus={(e) => e.target.select()} />
                  <button className="fbtn" onClick={() => handleCopyLink(detail.id, detail.token)}>{copiedId === detail.id ? "✅ Đã copy" : "🔗 Copy"}</button>
                  <button className="fbtn" disabled={exportingId === detail.id} onClick={() => handleExport(detail.id)}>{exportingId === detail.id ? "Đang xuất..." : "📥 Xuất Excel"}</button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
                  <input className="finput" placeholder="Tìm mã / tên / vị trí / ghi chú..." value={dq} onChange={(e) => setDq(e.target.value)} style={{ width: 240 }} />
                  {[["all", "Tất cả"], ["da", "Đã kiểm"], ["chua", "Chưa kiểm"], ["lech", "Có chênh lệch"]].map(([k, l]) => (
                    <button key={k} className="fbtn" style={filter === k ? { background: "#EAF1FC", borderColor: "#1F4E79", fontWeight: 700 } : {}} onClick={() => setFilter(k)}>{l}</button>
                  ))}
                  <span style={{ fontSize: 12.5, color: "var(--text-600)" }}>{shown.length} dòng</span>
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, maxHeight: 400, overflow: "auto", marginBottom: 14 }}>
                  <table style={{ width: "100%", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: "#FAFAFA" }}>
                        <th style={{ padding: "6px 10px" }}>Mã hàng</th>
                        <th style={{ padding: "6px 10px", textAlign: "left" }}>Tên hàng</th>
                        <th style={{ padding: "6px 10px" }}>ĐVT</th>
                        <th style={{ padding: "6px 10px" }}>Phân loại</th>
                        <th style={{ padding: "6px 10px", textAlign: "right" }}>Tồn kho</th>
                        <th style={{ padding: "6px 10px", textAlign: "right" }}>SL kiểm kê</th>
                        <th style={{ padding: "6px 10px", textAlign: "right" }}>Chênh lệch</th>
                        <th style={{ padding: "6px 10px", textAlign: "left" }}>Vị trí kiểm kê</th>
                        <th style={{ padding: "6px 10px", textAlign: "left" }}>Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((it) => {
                        const chenh = it.da_kiem ? (it.sl_kiem || 0) - (it.ton_kho || 0) : null;
                        return (
                          <tr key={it.id}>
                            <td style={{ padding: "5px 10px", textAlign: "center" }}>{it.ma_hang}</td>
                            <td style={{ padding: "5px 10px", textAlign: "left" }}>{it.ten_hang || "-"}</td>
                            <td style={{ padding: "5px 10px", textAlign: "center" }}>{it.don_vi || "-"}</td>
                            <td style={{ padding: "5px 10px", textAlign: "center" }}>{it.phan_loai || "-"}</td>
                            <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtNum(it.ton_kho)}</td>
                            <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: it.da_kiem ? 700 : 400, color: it.da_kiem ? "inherit" : "var(--text-400)" }}>{it.da_kiem ? fmtNum(it.sl_kiem) : "chưa kiểm"}</td>
                            <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700, color: chenh === null ? "var(--text-400)" : chenh === 0 ? "#3E7A2A" : "var(--danger)" }}>
                              {chenh === null ? "-" : `${chenh > 0 ? "+" : ""}${fmtNum(chenh)}`}
                            </td>
                            <td style={{ padding: "5px 10px", textAlign: "left", maxWidth: 200 }}>{it.vi_tri || ""}</td>
                            <td style={{ padding: "5px 10px", textAlign: "left", maxWidth: 260 }}>{it.ghi_chu || ""}</td>
                          </tr>
                        );
                      })}
                      {shown.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 14, color: "var(--text-400)" }}>Không có dòng nào</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {detail.trang_thai === "hoan_tat" && isAdmin && <button className="fbtn" onClick={() => handleReopen(detail.id)}>🔓 Mở lại</button>}
                  <button className="fbtn" onClick={() => setViewId(null)}>Đóng</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Popup tạo phiếu */}
      {showCreate && (
        <div style={overlayStyle} onClick={closeCreate}>
          <div style={{ ...modalStyle, width: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--navy-900)", marginBottom: 14 }}>➕ Tạo phiếu kiểm kê</h3>
            <label style={{ fontSize: 12.5, fontWeight: 700, display: "block", marginBottom: 4 }}>Tên phiếu kiểm kê <span style={{ color: "var(--danger)" }}>*</span></label>
            <input className="finput" style={{ width: "100%", marginBottom: 14 }} placeholder="VD: Kiểm kê LAB tháng 11" value={newName} maxLength={200}
              onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} autoFocus />
            <label style={{ fontSize: 12.5, fontWeight: 700, display: "block", marginBottom: 4 }}>File Excel tồn kho cần kiểm <span style={{ color: "var(--danger)" }}>*</span></label>
            <input ref={importRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handlePickFile} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
              <button className="fbtn" disabled={importing} onClick={() => importRef.current?.click()}>📎 Đính kèm file Excel</button>
              <span style={{ fontSize: 12.5, color: newFile ? "var(--text-900)" : "var(--text-400)", wordBreak: "break-all" }}>{newFile ? newFile.name : "Chưa chọn file"}</span>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--text-600)", marginBottom: 14, lineHeight: 1.5 }}>
              File gồm các cột Mã hàng / Tên hàng / Đơn vị / Số lượng tồn / Phân loại tài sản. Chưa có file mẫu? Đóng popup và bấm “Tải template”.
            </p>
            {importError && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>❌ {importError}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="login-btn" style={{ width: "auto", padding: "9px 20px" }} disabled={importing} onClick={handleCreate}>{importing ? "Đang tạo..." : "Tạo phiếu"}</button>
              <button className="fbtn" disabled={importing} onClick={closeCreate}>Huỷ</button>
            </div>
          </div>
        </div>
      )}

      {/* Popup kết quả tạo phiếu */}
      {created && (
        <div style={overlayStyle} onClick={() => setCreated(null)}>
          <div style={{ ...modalStyle, width: 560 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: "#3E7A2A", marginBottom: 6 }}>✅ Đã tạo phiếu {created.ma_phieu}</h3>
            <p style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 12 }}>
              {created.ten_phieu} · {created.so_sp} sản phẩm. Gửi link này cho người kiểm (không cần đăng nhập):
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input readOnly className="finput" style={{ flex: 1, fontSize: 11.5 }} value={publicLink(created.token)} onFocus={(e) => e.target.select()} />
              <button className="fbtn" onClick={() => handleCopyLink(created.id, created.token)}>{copiedId === created.id ? "✅ Đã copy" : "🔗 Copy"}</button>
            </div>
            <button className="login-btn" style={{ width: "auto", padding: "9px 20px", marginTop: 16 }} onClick={() => setCreated(null)}>Đóng</button>
          </div>
        </div>
      )}
    </Layout>
  );
}

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(10,20,40,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
};
const modalStyle = {
  background: "#fff", borderRadius: 12, padding: "24px 26px", width: 440, maxWidth: "100%",
  maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
};
