import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import {
  getUser, getXknkCanTon, uploadXknkCanTon, checkXknkCanTonRow, downloadXknkCanTonRow,
} from "../lib/api";

const ADMIN_ROLES = ["admin", "super_admin"];

const TABS = [
  { key: "can_ton", label: "Theo dõi cân tồn" },
  { key: "xuat_su_dung", label: "Theo dõi Xuất sử dụng" },
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

function CanTonTable({ title, rows, onCheck, onDownload, busyId }) {
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
              <th>Kiểm tra</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
                  {r.checked_by_name ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 11, color: "var(--text-600)" }}>
                        {r.checked_by_me ? "Bạn đã kiểm tra" : `Đã kiểm tra bởi ${r.checked_by_name}`}
                      </span>
                      {r.can_download && (
                        <button className="fbtn" onClick={() => onDownload(r)}>📥 Tải data</button>
                      )}
                    </div>
                  ) : (
                    <button className="fbtn" disabled={busyId === r.id} onClick={() => onCheck(r.id)}>
                      {busyId === r.id ? "Đang xử lý..." : "🔍 Kiểm tra"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-400)" }}>Không có dữ liệu</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CanTonTab({ isAdmin }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [busyId, setBusyId] = useState(null);
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
          <CanTonTable title="Sản phẩm thuộc danh mục cắt liều" rows={data.cat_lieu} onCheck={handleCheck} onDownload={handleDownload} busyId={busyId} />
          <CanTonTable title="Sản phẩm còn lại (không cắt liều)" rows={data.con_lai} onCheck={handleCheck} onDownload={handleDownload} busyId={busyId} />
        </>
      ) : (
        !error && <div className="placeholder-box">Chưa có dữ liệu — admin upload file báo cáo Xuất Khác - Nhập Khác để bắt đầu.</div>
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

      {tab === "can_ton" && <CanTonTab isAdmin={isAdmin} />}

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
