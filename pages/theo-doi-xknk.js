import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import {
  getUser, getXknkCanTon, uploadXknkCanTon, checkXknkCanTonRow, downloadXknkCanTonRow, updateXknkCanTonResult,
} from "../lib/api";

const ADMIN_ROLES = ["admin", "super_admin"];

const TABS = [
  { key: "can_ton", label: "Theo dõi cân tồn" },
  { key: "xuat_su_dung", label: "Theo dõi Xuất sử dụng" },
];

const KET_QUA_OPTIONS = [
  { value: "khong_sai_sot", label: "Không sai sót" },
  { value: "co_sai_sot", label: "Có sai sót" },
];

function fmtMoney(n) {
  if (n === undefined || n === null) return "-";
  return n.toLocaleString("vi-VN");
}

function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString("vi-VN");
}

function KetQuaBadge({ trangThai, ghiChu }) {
  if (!trangThai) return <span style={{ color: "var(--text-400)" }}>-</span>;
  const isSaiSot = trangThai === "co_sai_sot";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <span className={`pill ${isSaiSot ? "danger" : "ok"}`}>
        {isSaiSot ? "⚠️ Có sai sót" : "✅ Không sai sót"}
      </span>
      {ghiChu && (
        <span style={{ fontSize: 11, color: "var(--text-600)", maxWidth: 160, textAlign: "center" }} title={ghiChu}>
          {ghiChu.length > 40 ? `${ghiChu.slice(0, 40)}…` : ghiChu}
        </span>
      )}
    </div>
  );
}

function ResultModal({ row, onClose, onSave }) {
  const [trangThai, setTrangThai] = useState(row.ket_qua_trang_thai || "khong_sai_sot");
  const [ghiChu, setGhiChu] = useState(row.ket_qua_ghi_chu || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ trang_thai: trangThai, ghi_chu: ghiChu });
      onClose();
    } catch (err) {
      setError(err.message || "Cập nhật thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>📝 Cập nhật kết quả kiểm tra</h3>
        <p style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 16 }}>
          Shop {row.ma_shop} - {row.ten_shop}
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Kết quả kiểm tra *</label>
            <div style={{ display: "flex", gap: 18 }}>
              {KET_QUA_OPTIONS.map((opt) => (
                <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="radio" name="ket_qua" checked={trangThai === opt.value} onChange={() => setTrangThai(opt.value)} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Ghi chú</label>
            <textarea
              style={{ ...inputStyle, minHeight: 80, fontFamily: "inherit", resize: "vertical" }}
              placeholder="Kết luận/nguyên nhân sau khi kiểm tra..."
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
            />
          </div>
          {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 14 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={saving} className="login-btn" style={{ width: "auto", padding: "9px 22px", margin: 0 }}>
              {saving ? "Đang lưu..." : "Lưu kết quả"}
            </button>
            <button type="button" onClick={onClose} style={deleteBtnStyle}>Hủy</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CanTonTable({ title, rows, me, isAdmin, onCheck, onDownload, onOpenResult, busyId }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <h3>{title}</h3>
        <span className="note">Top {rows.length} shop lệch nhiều nhất</span>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Vùng</th>
              <th>Mã shop</th>
              <th>Tên shop</th>
              <th>Tổng Xuất Khác</th>
              <th>Tổng Nhập Khác</th>
              <th>Chênh lệch</th>
              <th>Người kiểm tra</th>
              <th>Kết quả</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const claimed = !!r.checked_by_name;
              return (
                <tr key={r.id}>
                  <td>{r.rank}</td>
                  <td style={{ textAlign: "left" }}>{r.vung || "-"}</td>
                  <td>{r.ma_shop}</td>
                  <td style={{ textAlign: "left" }}>{r.ten_shop || "-"}</td>
                  <td className="num neg">{fmtMoney(r.tong_xuat_khac)}</td>
                  <td className="num">{fmtMoney(r.tong_nhap_khac)}</td>
                  <td className="num" style={{ fontWeight: 700, color: r.chenh_lech < 0 ? "var(--danger)" : "inherit" }}>
                    {fmtMoney(r.chenh_lech)}
                  </td>
                  <td>
                    {claimed ? (r.checked_by_me ? "Bạn" : r.checked_by_name) : "-"}
                  </td>
                  <td>
                    <KetQuaBadge trangThai={r.ket_qua_trang_thai} ghiChu={r.ket_qua_ghi_chu} />
                  </td>
                  <td>
                    {!claimed ? (
                      <button className="fbtn" disabled={busyId === r.id} onClick={() => onCheck(r.id)}>
                        {busyId === r.id ? "Đang xử lý..." : "🔍 Kiểm tra"}
                      </button>
                    ) : r.can_edit_result ? (
                      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                        <button className="fbtn" onClick={() => onOpenResult(r)}>📝 Cập nhật kết quả</button>
                        <button className="fbtn" onClick={() => onDownload(r)}>📥 Tải data</button>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-400)", fontSize: 12 }}>-</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--text-400)" }}>Không có dữ liệu</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CanTonTab({ isAdmin, me }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [resultRow, setResultRow] = useState(null); // dòng đang mở modal Cập nhật kết quả
  const fileInputRef = useRef(null);

  function load() {
    getXknkCanTon().then(setData).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    setError("");
    try {
      const result = await uploadXknkCanTon(file);
      setData(result);
      setUploadMsg(`✅ Đã xử lý xong — ${result.matched_rows.toLocaleString("vi-VN")}/${result.total_rows.toLocaleString("vi-VN")} dòng khớp "Xử lý kiểm kê tự động".`);
    } catch (err) {
      setUploadMsg(`❌ ${err.message || "Upload thất bại"}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleCheck(rowId) {
    setBusyId(rowId);
    try {
      const result = await checkXknkCanTonRow(rowId);
      setData(result);
    } catch (err) {
      alert(err.message || "Kiểm tra thất bại");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDownload(row) {
    try {
      await downloadXknkCanTonRow(row.id, `XKNK_can_ton_shop_${row.ma_shop}.xlsx`);
    } catch (err) {
      alert(err.message || "Tải file thất bại");
    }
  }

  async function handleSaveResult({ trang_thai, ghi_chu }) {
    const result = await updateXknkCanTonResult(resultRow.id, { trang_thai, ghi_chu });
    setData(result);
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, padding: "16px 20px" }}>
          <div>
            {data?.uploaded_at ? (
              <span className="note">
                Cập nhật lúc {fmtDateTime(data.uploaded_at)} bởi {data.uploaded_by || "-"} · file "{data.source_filename}" ·{" "}
                {data.matched_rows?.toLocaleString("vi-VN")}/{data.total_rows?.toLocaleString("vi-VN")} dòng khớp
              </span>
            ) : (
              <span className="note">Chưa có dữ liệu — admin upload file báo cáo Xuất Khác - Nhập Khác để bắt đầu.</span>
            )}
          </div>
          {isAdmin && (
            <div style={{ textAlign: "right" }}>
              <button className="upload-btn" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? "Đang xử lý..." : "📤 Upload file XK-NK"}
              </button>
              <input ref={fileInputRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleFileChange} />
              {uploadMsg && (
                <div style={{ fontSize: 12.5, marginTop: 6, color: uploadMsg.startsWith("❌") ? "var(--danger)" : "var(--text-600)" }}>
                  {uploadMsg}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <div className="placeholder-box">Không tải được dữ liệu: {error}</div>}

      {data && (data.cat_lieu.length > 0 || data.con_lai.length > 0) ? (
        <>
          <CanTonTable
            title="Sản phẩm thuộc danh mục cắt liều" rows={data.cat_lieu} me={me} isAdmin={isAdmin}
            onCheck={handleCheck} onDownload={handleDownload} onOpenResult={setResultRow} busyId={busyId}
          />
          <CanTonTable
            title="Sản phẩm còn lại (không cắt liều)" rows={data.con_lai} me={me} isAdmin={isAdmin}
            onCheck={handleCheck} onDownload={handleDownload} onOpenResult={setResultRow} busyId={busyId}
          />
        </>
      ) : (
        !error && <div className="placeholder-box">Chưa có dữ liệu — admin upload file báo cáo Xuất Khác - Nhập Khác để bắt đầu.</div>
      )}

      {resultRow && (
        <ResultModal row={resultRow} onClose={() => setResultRow(null)} onSave={handleSaveResult} />
      )}
    </>
  );
}

export default function TheoDoiXknkPage() {
  const me = getUser();
  const isAdmin = me && ADMIN_ROLES.includes(me.role);
  const [tab, setTab] = useState("can_ton");

  return (
    <Layout crumb="Theo dõi XK-NK">
      <div className="page-head">
        <h1>Theo dõi XK-NK</h1>
        <p>Theo dõi cân tồn và tình hình xuất sử dụng (Xuất Khác - Nhập Khác) — dữ liệu cập nhật qua file do admin upload.</p>
      </div>

      <div className="month-tabs">
        {TABS.map((t) => (
          <div key={t.key} className={`month-tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      {tab === "can_ton" && <CanTonTab isAdmin={isAdmin} me={me} />}

      {tab === "xuat_su_dung" && (
        <div className="card">
          <div className="card-body">
            <div className="placeholder-box">
              Chưa có dữ liệu — đang chờ file mẫu để hoàn thiện tính năng này.
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-600)", display: "block", marginBottom: 6 };
const inputStyle = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13.5, background: "#FAFBFD", boxSizing: "border-box" };
const deleteBtnStyle = { background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "var(--text-600)", cursor: "pointer" };
const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(10,20,40,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
};
const modalStyle = {
  background: "#fff", borderRadius: 12, padding: "24px 26px", width: 440, maxWidth: "100%",
  boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
};
