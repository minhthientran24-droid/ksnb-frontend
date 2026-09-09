import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { useAllowedKeys } from "../lib/permissions";
import {
  getUser,
  createCheckLechTonVxPhieu, listCheckLechTonVxPhieu, getCheckLechTonVxPhieu,
  reopenCheckLechTonVxPhieu, deleteCheckLechTonVxPhieu,
} from "../lib/api";

// Menu "Hỗ trợ shop" (chốt 09/09) — dành cho TẤT CẢ role (không giới hạn
// như "Hỗ Trợ Kiểm Kê"), gồm nhiều tab hỗ trợ xử lý cho shop. Tab đầu
// tiên "Hỗ trợ check lệch tồn VX" (chốt 09/09 lần 2, rule đầy đủ):
//
// NV nội bộ tạo 1 "phiếu" gồm danh sách mã sản phẩm CẦN CÓ (dán từ Excel
// 2 cột "mã - tên") -> hệ thống sinh 1 link công khai (KHÔNG cần đăng
// nhập). NV cửa hàng vào link, bật camera quét QR dán trên từng sản
// phẩm (QR = đúng mã sản phẩm) -> khớp thì xanh (tồn), không khớp thì đỏ
// (không tồn). Bấm "Hoàn tất" -> phiếu khoá lại, trả về 2 danh sách:
// mã ĐÃ quét mà KHÔNG có trong phiếu ("không tồn"), và mã CÓ trong phiếu
// mà CHƯA quét lần nào ("chưa bắn"). Xem đầy đủ rule + code xử lý ở
// backend/app/routers/check_lech_ton_vx.py.
const TAB_KEYS = ["check_lech_ton_vx"];
const TAB_LABELS = {
  check_lech_ton_vx: "Hỗ trợ check lệch tồn VX",
};

// Dán từ Excel (2 cột mã/tên) sẽ tự phân cách bằng TAB — ưu tiên tách
// theo tab trước, các kiểu gõ tay khác (phẩy / " - " / nhiều khoảng
// trắng) hỗ trợ thêm cho tiện.
function parsePasteText(text) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      let parts;
      if (line.includes("\t")) parts = line.split("\t");
      else if (line.includes(",")) parts = line.split(",");
      else if (line.includes(" - ")) parts = line.split(" - ");
      else parts = line.split(/\s{2,}/);
      return { ma_sp: (parts[0] || "").trim(), ten_sp: (parts.slice(1).join(" ") || "").trim() };
    })
    .filter((it) => it.ma_sp);
}

function fmtDateTime(s) {
  if (!s) return "-";
  const d = new Date(s);
  if (isNaN(d)) return "-";
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function publicLink(token) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/kiem-tra-ton/${token}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function HoTroShopPage() {
  const { can, ready: permReady } = useAllowedKeys();
  const [tab, setTab] = useState("check_lech_ton_vx");
  const me = getUser();
  const isAdmin = ["admin", "super_admin"].includes(me?.role);

  useEffect(() => {
    if (!permReady || can(`/ho-tro-shop::${tab}`)) return;
    const first = TAB_KEYS.find((k) => can(`/ho-tro-shop::${k}`));
    if (first) setTab(first);
  }, [permReady, tab]);

  const [list, setList] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  function reload() {
    setLoading(true);
    listCheckLechTonVxPhieu()
      .then((rows) => { setList(rows); setLoadError(""); })
      .catch((err) => setLoadError(err.message || "Không tải được danh sách phiếu"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (tab === "check_lech_ton_vx") reload();
  }, [tab]);

  // ---- Tạo phiếu mới ----
  const [showCreate, setShowCreate] = useState(false);
  const [formShop, setFormShop] = useState({ ma_shop: "", ten_shop: "", ghi_chu: "" });
  const [pasteText, setPasteText] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [justCreated, setJustCreated] = useState(null); // phiếu vừa tạo — hiện link nổi bật

  const parsedItems = parsePasteText(pasteText);

  function openCreate() {
    setFormShop({ ma_shop: "", ten_shop: "", ghi_chu: "" });
    setPasteText("");
    setCreateError("");
    setJustCreated(null);
    setShowCreate(true);
  }

  async function submitCreate() {
    if (parsedItems.length === 0) {
      setCreateError("Chưa có mã sản phẩm nào — dán danh sách (mỗi dòng 1 mã, có thể kèm tên) vào ô bên dưới.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const phieu = await createCheckLechTonVxPhieu({
        ma_shop: formShop.ma_shop, ten_shop: formShop.ten_shop, ghi_chu: formShop.ghi_chu,
        items: parsedItems,
      });
      setJustCreated(phieu);
      reload();
    } catch (err) {
      setCreateError(err.message || "Tạo phiếu thất bại");
    } finally {
      setCreating(false);
    }
  }

  // ---- Xem chi tiết 1 phiếu ----
  const [viewingId, setViewingId] = useState(null);
  const [viewingDetail, setViewingDetail] = useState(null);
  const [viewError, setViewError] = useState("");

  function openView(id) {
    setViewingId(id);
    setViewingDetail(null);
    setViewError("");
    getCheckLechTonVxPhieu(id).then(setViewingDetail).catch((err) => setViewError(err.message));
  }

  async function handleReopen(id) {
    try {
      await reopenCheckLechTonVxPhieu(id);
      reload();
      if (viewingId === id) openView(id);
    } catch (err) {
      alert(err.message || "Mở lại phiếu thất bại");
    }
  }

  async function handleDelete(id) {
    if (!confirm("Xoá phiếu này? Không thể hoàn tác.")) return;
    try {
      await deleteCheckLechTonVxPhieu(id);
      if (viewingId === id) setViewingId(null);
      reload();
    } catch (err) {
      alert(err.message || "Xoá phiếu thất bại");
    }
  }

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

  return (
    <Layout crumb="Hỗ trợ shop">
      <div className="page-head">
        <h1>Hỗ trợ shop</h1>
      </div>

      <div className="month-tabs">
        {TAB_KEYS.filter((k) => can(`/ho-tro-shop::${k}`)).map((k) => (
          <div key={k} className={`month-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            {TAB_LABELS[k]}
          </div>
        ))}
      </div>

      {tab === "check_lech_ton_vx" && (
        <div className="card">
          <div className="card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>🔎 Hỗ trợ check lệch tồn VX</h3>
            <button className="upload-btn" onClick={openCreate}>➕ Tạo phiếu kiểm tra</button>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 14, lineHeight: 1.6 }}>
              Tạo phiếu gồm danh sách mã sản phẩm cần kiểm — hệ thống sinh 1 link công khai (không cần đăng
              nhập) để NV cửa hàng mở link đó, bật camera quét QR từng sản phẩm đối chiếu với danh sách.
            </p>

            {loadError && <div className="placeholder-box">Không tải được dữ liệu: {loadError}</div>}
            {!loadError && loading && <div className="placeholder-box">Đang tải...</div>}
            {!loadError && !loading && (
              <table>
                <thead>
                  <tr>
                    <th>Mã phiếu</th>
                    <th style={{ textAlign: "left" }}>Cửa hàng</th>
                    <th>Người tạo</th>
                    <th>Ngày tạo</th>
                    <th>Số SP</th>
                    <th>Đã quét</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id}>
                      <td>#{p.id}</td>
                      <td style={{ textAlign: "left" }}>
                        {p.ma_shop ? `${p.ma_shop} - ` : ""}{p.ten_shop || "-"}
                      </td>
                      <td>{p.created_by_name || "-"}</td>
                      <td>{fmtDateTime(p.created_at)}</td>
                      <td>{p.so_sp}</td>
                      <td>{p.so_da_quet}/{p.so_sp}</td>
                      <td>
                        <span className={`pill ${p.trang_thai === "hoan_tat" ? "ok" : "warn"}`}>
                          {p.trang_thai === "hoan_tat" ? "Đã hoàn tất" : "Đang kiểm"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                          <button className="fbtn" onClick={() => openView(p.id)}>Xem</button>
                          <button className="fbtn" onClick={() => handleCopyLink(p.id, p.token)}>
                            {copiedId === p.id ? "✅ Đã copy" : "🔗 Copy link"}
                          </button>
                          {p.trang_thai === "hoan_tat" && isAdmin && (
                            <button className="fbtn" onClick={() => handleReopen(p.id)}>🔓 Mở lại</button>
                          )}
                          {(isAdmin || p.created_by_name === me?.full_name) && (
                            <button className="fbtn" style={{ color: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => handleDelete(p.id)}>
                              Xoá
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {list.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-400)" }}>Chưa có phiếu nào</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Popup tạo phiếu mới */}
      {showCreate && (
        <div style={overlayStyle} onClick={() => setShowCreate(false)}>
          <div style={{ ...modalStyle, width: 640 }} onClick={(e) => e.stopPropagation()}>
            {!justCreated ? (
              <>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--navy-900)", marginBottom: 16 }}>
                  ➕ Tạo phiếu kiểm tra lệch tồn VX
                </h3>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label className="flabel">Mã shop</label>
                  <input className="finput" style={{ width: "100%" }} value={formShop.ma_shop}
                    onChange={(e) => setFormShop((f) => ({ ...f, ma_shop: e.target.value }))} />
                </div>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label className="flabel">Tên shop</label>
                  <input className="finput" style={{ width: "100%" }} value={formShop.ten_shop}
                    onChange={(e) => setFormShop((f) => ({ ...f, ten_shop: e.target.value }))} />
                </div>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label className="flabel">Ghi chú (tuỳ chọn)</label>
                  <input className="finput" style={{ width: "100%" }} value={formShop.ghi_chu}
                    onChange={(e) => setFormShop((f) => ({ ...f, ghi_chu: e.target.value }))} />
                </div>
                <div className="field" style={{ marginBottom: 6 }}>
                  <label className="flabel">Danh sách mã sản phẩm cần kiểm</label>
                  <div style={{ fontSize: 11, color: "var(--text-600)", marginBottom: 6 }}>
                    Dán trực tiếp 2 cột "Mã sản phẩm" + "Tên sản phẩm" từ Excel (mỗi dòng 1 sản phẩm) — hoặc gõ tay mỗi dòng dạng "mã, tên".
                  </div>
                  <textarea
                    className="finput" style={{ width: "100%", fontFamily: "monospace", fontSize: 12.5 }}
                    rows={8} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
                    placeholder={"SP001\tTên sản phẩm 1\nSP002\tTên sản phẩm 2"}
                  />
                  <div style={{ fontSize: 11.5, color: parsedItems.length ? "#3E7A2A" : "var(--text-400)", marginTop: 6 }}>
                    {parsedItems.length > 0 ? `✅ Nhận diện ${parsedItems.length} mã sản phẩm` : "Chưa nhận diện được mã nào"}
                  </div>
                </div>

                {createError && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>{createError}</div>}

                <div className="llv-modal-actions" style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button className="login-btn" style={{ width: "auto", padding: "9px 20px" }} disabled={creating} onClick={submitCreate}>
                    {creating ? "Đang tạo..." : "Tạo phiếu"}
                  </button>
                  <button className="fbtn" onClick={() => setShowCreate(false)}>Hủy</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "#3E7A2A", marginBottom: 12 }}>
                  ✅ Đã tạo phiếu #{justCreated.id} — {justCreated.so_sp} sản phẩm
                </h3>
                <p style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 10 }}>
                  Gửi link dưới đây cho NV cửa hàng để bắt đầu quét — không cần đăng nhập:
                </p>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <input readOnly className="finput" style={{ flex: 1 }} value={publicLink(justCreated.token)} onFocus={(e) => e.target.select()} />
                  <button className="upload-btn" onClick={() => handleCopyLink(justCreated.id, justCreated.token)}>
                    {copiedId === justCreated.id ? "✅ Đã copy" : "🔗 Copy link"}
                  </button>
                </div>
                <button className="login-btn" style={{ width: "auto", padding: "9px 20px" }} onClick={() => setShowCreate(false)}>Đóng</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Popup xem chi tiết phiếu */}
      {viewingId && (
        <div style={overlayStyle} onClick={() => setViewingId(null)}>
          <div style={{ ...modalStyle, width: 640 }} onClick={(e) => e.stopPropagation()}>
            {viewError && <div style={{ color: "var(--danger)", fontSize: 13 }}>{viewError}</div>}
            {!viewError && !viewingDetail && <div style={{ fontSize: 13, color: "var(--text-600)" }}>Đang tải...</div>}
            {viewingDetail && (
              <>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--navy-900)", marginBottom: 4 }}>
                  Phiếu #{viewingDetail.id} — {viewingDetail.ma_shop ? `${viewingDetail.ma_shop} - ` : ""}{viewingDetail.ten_shop || "(chưa đặt tên shop)"}
                </h3>
                <div style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 14 }}>
                  Tạo lúc {fmtDateTime(viewingDetail.created_at)} bởi {viewingDetail.created_by_name || "-"}
                  {" · "}
                  <span className={`pill ${viewingDetail.trang_thai === "hoan_tat" ? "ok" : "warn"}`}>
                    {viewingDetail.trang_thai === "hoan_tat" ? "Đã hoàn tất" : "Đang kiểm"}
                  </span>
                  {viewingDetail.completed_at ? ` · lúc ${fmtDateTime(viewingDetail.completed_at)}` : ""}
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <input readOnly className="finput" style={{ flex: 1, fontSize: 11.5 }} value={publicLink(viewingDetail.token)} onFocus={(e) => e.target.select()} />
                  <button className="fbtn" onClick={() => handleCopyLink(viewingDetail.id, viewingDetail.token)}>
                    {copiedId === viewingDetail.id ? "✅ Đã copy" : "🔗 Copy"}
                  </button>
                </div>

                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                  Danh sách sản phẩm ({viewingDetail.so_da_quet}/{viewingDetail.so_sp} đã quét)
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, maxHeight: 220, overflow: "auto", marginBottom: 16 }}>
                  <table style={{ width: "100%", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: "#FAFAFA" }}>
                        <th style={{ padding: "6px 10px" }}>Mã SP</th>
                        <th style={{ padding: "6px 10px", textAlign: "left" }}>Tên SP</th>
                        <th style={{ padding: "6px 10px" }}>Đã quét</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingDetail.items.map((it) => (
                        <tr key={it.id} style={{ color: it.da_quet ? "#3E7A2A" : "var(--danger)" }}>
                          <td style={{ padding: "5px 10px", textAlign: "center" }}>{it.ma_sp}</td>
                          <td style={{ padding: "5px 10px", textAlign: "left" }}>{it.ten_sp || "-"}</td>
                          <td style={{ padding: "5px 10px", textAlign: "center" }}>{it.da_quet ? "✅ Có tồn" : "— Chưa bắn"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {viewingDetail.khong_ton.length > 0 && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: "var(--danger)" }}>
                      ⚠️ Mã đã quét nhưng KHÔNG có trong phiếu ({viewingDetail.khong_ton.length})
                    </div>
                    <div style={{ border: "1px solid var(--danger)", borderRadius: 8, padding: "8px 12px", marginBottom: 16, fontSize: 12.5, color: "var(--danger)" }}>
                      {viewingDetail.khong_ton.map((k) => (
                        <div key={k.ma_quet}>{k.ma_quet}{k.so_lan_quet > 1 ? ` (quét ${k.so_lan_quet} lần)` : ""}</div>
                      ))}
                    </div>
                  </>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  {viewingDetail.trang_thai === "hoan_tat" && isAdmin && (
                    <button className="fbtn" onClick={() => handleReopen(viewingDetail.id)}>🔓 Mở lại</button>
                  )}
                  <button className="fbtn" onClick={() => setViewingId(null)}>Đóng</button>
                </div>
              </>
            )}
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
