import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import {
  getUser, listChuDeJobsV2, createChuDeJobV2, updateChuDeJobV2, deleteChuDeJobV2,
  claimChuDeJobV2, unclaimChuDeJobV2, addChuDeJobV2Supporters, listKsnbForChuDeV2,
  completeChuDeJobV2, downloadChuDeJobV2File, downloadChuDeJobV2ResultFile,
  bulkUploadChuDeJobsV2, downloadChuDeJobV2BulkUploadTemplate, lookupChuDeShop,
  getChuDeJobV2Months, exportChuDeJobsV2,
} from "../lib/api";

// "Theo dõi chủ đề Ver2" (chốt 03/09) — bản sao pages/theo-doi-chu-de.js
// dùng để thiết kế/thử tính năng mới, KHÔNG đụng dữ liệu thật (API riêng
// /chu-de-jobs-v2, bảng chu_de_jobs_v2 riêng — xem routers/chu_de_jobs_v2.py).
// Menu này CHỈ admin/super_admin xem/dùng được (chặn ở Layout.js theo
// allowed_menus + guard riêng bên dưới) nên KHÔNG cần hệ thống phân quyền
// cấp 2/3 (useAllowedKeys/can) như bản thật — mọi thứ luôn hiện đủ cho
// admin, không có role nào khác cần ẩn/hiện.
//
// Chốt 04/09 — BỎ phân loại "nhom" (Long Châu/Vaccine, 2 nút lọc + chọn
// khi đăng/sửa job + cột "Nhóm" trong file mẫu/bảng/export) từng thêm ở
// chốt 03/09 — giờ view chung tất cả chủ đề, y hệt bản thật.
const ADMIN_ROLES = ["admin", "super_admin"];

const emptyForm = { ten_chu_de: "", vung: "", ma_shop: "", ten_shop: "", noi_dung_vi_pham: "" };

function shopDisplay(job) {
  if (job.ma_shop && job.ten_shop) return `${job.ma_shop} - ${job.ten_shop}`;
  return job.ma_shop || job.ten_shop || "-";
}

function fmtDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("vi-VN");
}

function soNgayXuLy(ngayBatDauCheck) {
  if (!ngayBatDauCheck) return null;
  const ms = Date.now() - new Date(ngayBatDauCheck).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

const VI_PHAM_OPTIONS = ["Không vi phạm", "Có vi phạm"];

function useSort(defaultKey = null, defaultDir = "asc") {
  const [state, setState] = useState({ key: defaultKey, dir: defaultDir });
  function onSort(key) {
    setState((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }
  return { state, onSort };
}

function applySort(rows, sortState, getters) {
  if (!sortState?.key) return rows;
  const getter = getters[sortState.key] || ((r) => r[sortState.key]);
  const sorted = [...rows].sort((a, b) => {
    const av = getter(a);
    const bv = getter(b);
    const bothNum = typeof av === "number" && typeof bv === "number";
    const cmp = bothNum ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""), "vi");
    return sortState.dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

function SortTh({ label, sortKey, sortState, onSort, align }) {
  const active = sortState?.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        cursor: "pointer", userSelect: "none", textAlign: align || "center", whiteSpace: "nowrap",
        background: active ? (sortState.dir === "asc" ? "#EAF6E5" : "#FFF1E1") : undefined,
      }}
      title="Bấm để sắp xếp"
    >
      {label}
      <span style={{ marginLeft: 4, fontSize: 10, opacity: active ? 1 : 0.5 }}>
        {active ? (sortState.dir === "asc" ? "▲" : "▼") : "⇅"}
      </span>
    </th>
  );
}

// ---------- Popup: Nhận Task ----------
function ClaimJobModal({ job, meId, onDone, onCancel }) {
  const [step, setStep] = useState("confirm");
  const [ksnbList, setKsnbList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openPickSupporters() {
    setStep("pick-supporters");
    setError("");
    if (ksnbList.length === 0) {
      setLoadingList(true);
      listKsnbForChuDeV2()
        .then((list) => setKsnbList(list.filter((u) => u.id !== meId)))
        .catch((err) => setError(err.message || "Không tải được danh sách KSNB"))
        .finally(() => setLoadingList(false));
    }
  }

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit(supporterIds) {
    setSaving(true);
    setError("");
    try {
      await claimChuDeJobV2(job.id, supporterIds);
      onDone();
    } catch (err) {
      setError(err.message || "Nhận task thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {step === "confirm" && (
          <>
            <h3 style={{ marginBottom: 4 }}>📌 Nhận Task</h3>
            <p style={{ fontSize: 13, color: "var(--text-600)", marginBottom: 18 }}>
              Xác nhận nhận xử lý task <strong>"{job.ten_chu_de}"</strong>
              {job.ten_shop ? ` — shop ${job.ten_shop}` : ""}?
            </p>
            {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 14 }}>{error}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              <button disabled={saving} className="login-btn" style={{ width: "auto", padding: "9px 22px", margin: 0 }} onClick={() => submit([])}>
                {saving ? "Đang nhận..." : "✅ Xác nhận Nhận Task"}
              </button>
              <button type="button" disabled={saving} className="upload-btn" onClick={openPickSupporters}>
                ➕ Nhận + thêm người hỗ trợ
              </button>
              <button type="button" onClick={onCancel} style={deleteBtnStyle}>Hủy</button>
            </div>
          </>
        )}
        {step === "pick-supporters" && (
          <>
            <h3 style={{ marginBottom: 4 }}>👥 Chọn người hỗ trợ</h3>
            <p style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 14 }}>
              Task <strong>"{job.ten_chu_de}"</strong> — chọn 1 hoặc nhiều KSNB cùng hỗ trợ xử lý (anh/chị vẫn là người phụ trách chính).
            </p>
            <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 2px", marginBottom: 14 }}>
              {loadingList && <div style={{ fontSize: 12.5, color: "var(--text-400)", padding: 10 }}>Đang tải danh sách...</div>}
              {!loadingList && ksnbList.length === 0 && (
                <div style={{ fontSize: 12.5, color: "var(--text-400)", padding: 10 }}>Không có KSNB nào khác trong hệ thống</div>
              )}
              {ksnbList.map((u) => (
                <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                  {u.full_name}
                </label>
              ))}
            </div>
            {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 14 }}>{error}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button disabled={saving} className="login-btn" style={{ width: "auto", padding: "9px 22px", margin: 0 }} onClick={() => submit([...selected])}>
                {saving ? "Đang nhận..." : `Xác nhận (${selected.size} người hỗ trợ)`}
              </button>
              <button type="button" onClick={() => setStep("confirm")} style={deleteBtnStyle}>Quay lại</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Popup: Thêm người hỗ trợ cho job ĐÃ nhận ----------
function AddSupportersModal({ job, onDone, onCancel }) {
  const [ksnbList, setKsnbList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const excluded = new Set([job.claimed_by_user_id, ...(job.supporters || []).map((s) => s.user_id)]);
    listKsnbForChuDeV2()
      .then((list) => setKsnbList(list.filter((u) => !excluded.has(u.id))))
      .catch((err) => setError(err.message || "Không tải được danh sách KSNB"))
      .finally(() => setLoadingList(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await addChuDeJobV2Supporters(job.id, [...selected]);
      onDone();
    } catch (err) {
      setError(err.message || "Thêm người hỗ trợ thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>➕ Thêm người hỗ trợ</h3>
        <p style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 14 }}>
          Task <strong>"{job.ten_chu_de}"</strong> — chọn thêm 1 hoặc nhiều KSNB cùng hỗ trợ xử lý.
        </p>
        <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 2px", marginBottom: 14 }}>
          {loadingList && <div style={{ fontSize: 12.5, color: "var(--text-400)", padding: 10 }}>Đang tải danh sách...</div>}
          {!loadingList && ksnbList.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--text-400)", padding: 10 }}>Không còn KSNB nào khác để thêm</div>
          )}
          {ksnbList.map((u) => (
            <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
              {u.full_name}
            </label>
          ))}
        </div>
        {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 14 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button disabled={saving || selected.size === 0} className="login-btn" style={{ width: "auto", padding: "9px 22px", margin: 0 }} onClick={submit}>
            {saving ? "Đang lưu..." : `Xác nhận (${selected.size} người)`}
          </button>
          <button type="button" onClick={onCancel} style={deleteBtnStyle}>Hủy</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Popup: đánh dấu Hoàn tất — chọn kết quả + upload file kết quả.
// Khác bản thật: KHÔNG chuyển sang "Ghi nhận case vi phạm" khi chọn "Có
// vi phạm" (tránh trộn dữ liệu test Ver2 vào bảng case thật) — hoàn tất
// ngay tại popup cho cả 2 lựa chọn, giống bản thật TRƯỚC khi có luồng đó. ----------
function CompleteJobModal({ job, onDone, onCancel }) {
  const [ketQua, setKetQua] = useState("Không vi phạm");
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await completeChuDeJobV2(job.id, { ket_qua_vi_pham: ketQua, file });
      onDone();
    } catch (err) {
      setError(err.message || "Cập nhật thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>✅ Cập nhật kết quả xử lý</h3>
        <p style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 16 }}>{job.ten_chu_de}</p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Kết quả xử lý *</label>
            <div style={{ display: "flex", gap: 18 }}>
              {VI_PHAM_OPTIONS.map((opt) => (
                <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="radio" name="ket_qua_vi_pham" checked={ketQua === opt} onChange={() => setKetQua(opt)} />
                  {opt}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>File kết quả (tuỳ chọn)</label>
            <div>
              <input
                ref={fileInputRef} type="file" style={{ display: "none" }}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <button type="button" className="upload-btn" onClick={() => fileInputRef.current?.click()}>
                📤 {file ? "Đổi file khác" : "Chọn file kết quả"}
              </button>
              {file && <span style={{ fontSize: 11, color: "var(--text-400)", marginLeft: 10 }}>{file.name}</span>}
            </div>
          </div>

          {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 14 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={saving} className="login-btn" style={{ width: "auto", padding: "9px 22px" }}>
              {saving ? "Đang lưu..." : "Xác nhận hoàn tất"}
            </button>
            <button type="button" onClick={onCancel} style={{ ...deleteBtnStyle, padding: "9px 18px" }}>Hủy</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Form đăng / sửa job ----------
function JobFormCard({ editingJob, onDone, onCancel }) {
  const [form, setForm] = useState(editingJob ? { ...emptyForm, ...editingJob } : emptyForm);
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");

  async function handleLookup(query) {
    const q = (query || "").trim();
    if (!q) return;
    setLooking(true);
    setLookupMsg("");
    try {
      const res = await lookupChuDeShop(q);
      if (res.found) {
        setForm((f) => ({ ...f, ma_shop: res.ma_shop || "", ten_shop: res.ten_shop || "", vung: res.vung || f.vung }));
        setLookupMsg("✅ Đã tìm thấy shop, tự điền Tên Shop/Vùng.");
      } else {
        setLookupMsg("⚠️ Không khớp shop nào trong hệ thống — có thể tự nhập tay Tên Shop.");
      }
    } catch (err) {
      setLookupMsg("❌ " + err.message);
    } finally {
      setLooking(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.ten_chu_de.trim()) {
      setError("Cần nhập Tên chủ đề");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingJob) {
        await updateChuDeJobV2(editingJob.id, { ...form, file });
      } else {
        await createChuDeJobV2({ ...form, file });
      }
      onDone();
    } catch (err) {
      setError(err.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>{editingJob ? `✏️ Sửa task: ${editingJob.ten_chu_de}` : "Thêm chủ đề mới"}</h3>
      </div>
      <form onSubmit={handleSubmit} className="form-grid-2" style={{ padding: "16px 20px" }}>
        {(looking || lookupMsg) && (
          <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: looking ? "var(--text-400)" : undefined }}>
            {looking ? "Đang tra cứu..." : lookupMsg}
          </div>
        )}
        <div>
          <label style={labelStyle}>Tên chủ đề *</label>
          <input style={inputStyle} value={form.ten_chu_de} onChange={(e) => setForm({ ...form, ten_chu_de: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Mã shop</label>
          <input
            style={inputStyle} value={form.ma_shop}
            onChange={(e) => setForm({ ...form, ma_shop: e.target.value })}
            onBlur={(e) => handleLookup(e.target.value)}
            placeholder="Gõ mã shop rồi bấm Tab..."
          />
        </div>
        <div>
          <label style={labelStyle}>Vùng</label>
          <input style={inputStyle} value={form.vung} onChange={(e) => setForm({ ...form, vung: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Tên Shop</label>
          <input style={inputStyle} value={form.ten_shop} onChange={(e) => setForm({ ...form, ten_shop: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>File data check (tuỳ chọn)</label>
          <input
            ref={fileInputRef} type="file" style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button type="button" className="upload-btn" onClick={() => fileInputRef.current?.click()}>
            📤 {file ? "Đổi file khác" : editingJob?.has_data_file ? "Thay file mới" : "Chọn file"}
          </button>
          <span style={{ fontSize: 11, color: "var(--text-400)", marginLeft: 10 }}>
            {file ? file.name : editingJob?.data_file_name || "Chưa có file"}
          </span>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Nội dung vi phạm</label>
          <textarea
            style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
            value={form.noi_dung_vi_pham}
            onChange={(e) => setForm({ ...form, noi_dung_vi_pham: e.target.value })}
          />
        </div>

        {error && <div style={{ gridColumn: "1 / -1", fontSize: 12.5, color: "var(--danger)" }}>{error}</div>}
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
          <button type="submit" disabled={saving} className="login-btn" style={{ width: "auto", padding: "10px 24px" }}>
            {saving ? "Đang lưu..." : editingJob ? "Lưu thay đổi" : "Đăng task"}
          </button>
          <button type="button" onClick={onCancel} style={{ ...deleteBtnStyle, color: "var(--text-600)", padding: "10px 20px" }}>
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- Thêm chủ đề mới / Upload chủ đề bằng Excel ----------
function BulkUploadCard({ onDone, onOpenForm, thang, setThang, months, exporting, exportError, onExport }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [error, setError] = useState("");
  const [resultMsg, setResultMsg] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    setResultMsg("");
    try {
      const r = await bulkUploadChuDeJobsV2(file);
      setResultMsg(`✅ Đã thêm ${r.count} task.`);
      onDone();
    } catch (err) {
      setError(err.message || "Upload thất bại");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownloadTemplate() {
    setDownloadingTemplate(true);
    setError("");
    try {
      await downloadChuDeJobV2BulkUploadTemplate();
    } catch (err) {
      setError(err.message || "Tải template thất bại");
    } finally {
      setDownloadingTemplate(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Cập nhập chủ đề mới</h3>
      </div>
      <div className="card-body">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button className="login-btn" style={{ width: "auto", padding: "10px 24px", margin: 0, fontSize: 13 }} onClick={onOpenForm}>
            Thêm chủ đề mới
          </button>
          <button className="upload-btn" onClick={handleDownloadTemplate} disabled={downloadingTemplate}>
            📥 {downloadingTemplate ? "Đang tải..." : "Tải template Excel"}
          </button>
          <input
            ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
            onChange={handleFile} disabled={uploading}
          />
          <button className="upload-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            📤 {uploading ? "Đang xử lý..." : "Chọn file Excel"}
          </button>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
            <select className="month-select" value={thang} onChange={(e) => setThang(e.target.value)}>
              <option value="">Tất cả các tháng</option>
              {months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <button
              className="fbtn" disabled={exporting} onClick={onExport}
              style={{ background: "#EAF6E5", borderColor: "#4C9A2A", color: "#3E7A2A" }}
            >
              {exporting ? "Đang xuất..." : "📤 Xuất data"}
            </button>
          </div>
        </div>
        {exportError && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 10 }}>{exportError}</div>}
        {resultMsg && <div style={{ fontSize: 12, color: "#4C9A2A", marginTop: 10 }}>{resultMsg}</div>}
        {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 10 }}>{error}</div>}
      </div>
    </div>
  );
}

const CHU_DE_TABS = [
  { key: "Chưa nhận", label: "Chủ Đề Mới - Chưa nhận", color: "var(--orange)", bg: "#FFF1E1" },
  { key: "Đang xử lý", label: "Đang xử lý", color: "var(--blue-accent)", bg: "#E8EFFC" },
  { key: "Hoàn tất", label: "Hoàn tất", color: "#4C9A2A", bg: "#EAF6E5" },
];

export default function TheoDoiChuDeV2Page() {
  const [checked, setChecked] = useState(false);
  const [me, setMe] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [activeTab, setActiveTab] = useState("Chưa nhận");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [completingJob, setCompletingJob] = useState(null);
  const [claimingJob, setClaimingJob] = useState(null);
  const [addingSupportersJob, setAddingSupportersJob] = useState(null);
  const [thang, setThang] = useState("");
  const [months, setMonths] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const sort = useSort();

  useEffect(() => {
    const user = getUser();
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      window.location.replace("/");
      return;
    }
    setMe(user);
    setChecked(true);
  }, []);

  function load(thangFilter = thang) {
    setLoading(true);
    listChuDeJobsV2(thangFilter || undefined)
      .then(setJobs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!checked) return;
    getChuDeJobV2Months().then(setMonths).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked]);

  useEffect(() => {
    if (!checked) return;
    load(thang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, thang]);

  async function handleExport() {
    setExporting(true);
    setExportError("");
    try {
      await exportChuDeJobsV2(thang || undefined);
    } catch (err) {
      setExportError(err.message || "Xuất data thất bại");
    } finally {
      setExporting(false);
    }
  }

  function jobMatchesTab(job, tabKey) {
    return job.trang_thai === tabKey;
  }
  const visibleJobs = jobs.filter((job) => jobMatchesTab(job, activeTab));
  const sortedJobs = applySort(visibleJobs, sort.state, {
    upload_date: (j) => j.upload_date || "",
    ten_chu_de: (j) => j.ten_chu_de || "",
    vung: (j) => j.vung || "",
    ten_shop: (j) => shopDisplay(j),
    noi_dung_vi_pham: (j) => j.noi_dung_vi_pham || "",
    nhan_vien_phu_trach: (j) => j.nhan_vien_phu_trach || "",
    ngay_bat_dau_check: (j) => (j.ngay_bat_dau_check ? new Date(j.ngay_bat_dau_check).getTime() : -Infinity),
    so_ngay_xu_ly: (j) => soNgayXuLy(j.ngay_bat_dau_check) ?? -Infinity,
    ket_qua_vi_pham: (j) => j.ket_qua_vi_pham || "",
    nguoi_upload: (j) => j.nguoi_upload || "",
  });

  function closeForm() {
    setShowForm(false);
    setEditingJob(null);
  }

  function afterSave() {
    closeForm();
    load();
  }

  function afterClaim() {
    setClaimingJob(null);
    load();
  }

  function afterAddSupporters() {
    setAddingSupportersJob(null);
    load();
  }

  async function handleUnclaim(job) {
    if (!confirm(`Trả task "${job.ten_chu_de}" về trạng thái "Chưa nhận"? Người hỗ trợ (nếu có) cũng sẽ bị gỡ.`)) return;
    setBusyId(job.id);
    try {
      await unclaimChuDeJobV2(job.id);
      load();
    } catch (err) {
      alert(err.message || "Trả task thất bại");
    } finally {
      setBusyId(null);
    }
  }

  function afterComplete() {
    setCompletingJob(null);
    load();
  }

  async function handleDownload(job) {
    try {
      await downloadChuDeJobV2File(job.id, job.data_file_name);
    } catch (err) {
      alert(err.message || "Tải file thất bại");
    }
  }

  async function handleDownloadResult(job) {
    try {
      await downloadChuDeJobV2ResultFile(job.id, job.result_file_name);
    } catch (err) {
      alert(err.message || "Tải file thất bại");
    }
  }

  async function handleDelete(job) {
    if (!confirm(`Xóa task "${job.ten_chu_de}"?`)) return;
    try {
      await deleteChuDeJobV2(job.id);
      load();
    } catch (err) {
      alert(err.message || "Xóa thất bại");
    }
  }

  if (!checked) return null;

  return (
    <Layout crumb="Theo dõi chủ đề Ver2">
      <div className="page-head">
        <h1>🧪 Theo dõi chủ đề Ver2</h1>
        <p>Menu thử nghiệm — chỉ admin/super_admin xem được, dữ liệu riêng biệt với "Theo dõi chủ đề" thật.</p>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-body" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "14px 18px" }}>
            <select className="month-select" value={thang} onChange={(e) => setThang(e.target.value)}>
              <option value="">Tất cả các tháng</option>
              {months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <button
              className="fbtn" disabled={exporting} onClick={handleExport}
              style={{ background: "#EAF6E5", borderColor: "#4C9A2A", color: "#3E7A2A" }}
            >
              {exporting ? "Đang xuất..." : "📤 Xuất data"}
            </button>
            {exportError && <div style={{ fontSize: 12, color: "var(--danger)" }}>{exportError}</div>}
          </div>
        </div>
      )}

      {!showForm && (
        <BulkUploadCard
          onDone={load} onOpenForm={() => setShowForm(true)}
          thang={thang} setThang={setThang} months={months}
          exporting={exporting} exportError={exportError} onExport={handleExport}
        />
      )}

      {showForm && (
        <JobFormCard editingJob={editingJob} onDone={afterSave} onCancel={closeForm} />
      )}

      <div className="month-tabs">
        {CHU_DE_TABS.map((t) => {
          const count = jobs.filter((j) => jobMatchesTab(j, t.key)).length;
          const isActive = activeTab === t.key;
          return (
            <div
              key={t.key}
              className="month-tab"
              onClick={() => setActiveTab(t.key)}
              style={isActive
                ? { background: t.color, borderColor: t.color, color: "#fff" }
                : { background: t.bg, borderColor: t.color, color: t.color }}
            >
              {t.label} ({count})
            </div>
          );
        })}
      </div>

      {error && <div className="placeholder-box">Không tải được dữ liệu: {error}</div>}
      {!error && !loading && jobs.length === 0 && (
        <div className="placeholder-box">Chưa có task chủ đề nào được đăng.</div>
      )}

      {!error && jobs.length > 0 && (
        <div className="card">
          <div className="card-body" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <SortTh label="Ngày Upload" sortKey="upload_date" sortState={sort.state} onSort={sort.onSort} />
                  <SortTh label="Tên Chủ Đề" sortKey="ten_chu_de" sortState={sort.state} onSort={sort.onSort} align="left" />
                  <SortTh label="Vùng" sortKey="vung" sortState={sort.state} onSort={sort.onSort} />
                  <SortTh label="Tên Shop" sortKey="ten_shop" sortState={sort.state} onSort={sort.onSort} align="left" />
                  <SortTh label="Nội Dung Vi Phạm" sortKey="noi_dung_vi_pham" sortState={sort.state} onSort={sort.onSort} align="left" />
                  <SortTh label="NV Check" sortKey="nhan_vien_phu_trach" sortState={sort.state} onSort={sort.onSort} align="left" />
                  <SortTh label="Ngày Check" sortKey="ngay_bat_dau_check" sortState={sort.state} onSort={sort.onSort} />
                  <SortTh label="Số ngày xử lý" sortKey="so_ngay_xu_ly" sortState={sort.state} onSort={sort.onSort} />
                  <SortTh label="Kết quả" sortKey="ket_qua_vi_pham" sortState={sort.state} onSort={sort.onSort} />
                  <SortTh label="Người upload" sortKey="nguoi_upload" sortState={sort.state} onSort={sort.onSort} align="left" />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleJobs.length === 0 && (
                  <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--text-400)" }}>Không có task nào ở tình trạng này.</td></tr>
                )}
                {sortedJobs.map((job) => {
                  const supporters = job.supporters || [];
                  const canComplete = job.trang_thai === "Đang xử lý";
                  const canUnclaim = job.trang_thai === "Đang xử lý";
                  const canAddSupporters = job.trang_thai === "Đang xử lý";
                  const busy = busyId === job.id;
                  const soNgay = soNgayXuLy(job.ngay_bat_dau_check);
                  return (
                    <tr key={job.id}>
                      <td>{job.upload_date}</td>
                      <td style={{ textAlign: "left" }}>{job.ten_chu_de}</td>
                      <td>{job.vung || "-"}</td>
                      <td style={{ textAlign: "left" }}>{shopDisplay(job)}</td>
                      <td style={{ textAlign: "left" }}>{job.noi_dung_vi_pham || "-"}</td>
                      <td style={{ textAlign: "left" }}>
                        {job.nhan_vien_phu_trach || "-"}
                        {supporters.length > 0 && (
                          <div style={{ fontSize: 11, color: "var(--text-400)", marginTop: 2 }}>
                            + hỗ trợ: {supporters.map((s) => s.full_name).join(", ")}
                          </div>
                        )}
                      </td>
                      <td>{fmtDateTime(job.ngay_bat_dau_check) || "-"}</td>
                      <td>{soNgay === null ? "-" : `${soNgay} ngày`}</td>
                      <td>{job.ket_qua_vi_pham || "-"}</td>
                      <td style={{ textAlign: "left" }}>{job.nguoi_upload || "-"}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch" }}>
                          {job.trang_thai === "Chưa nhận" && (
                            <button className="fbtn" onClick={() => setClaimingJob(job)}>
                              Nhận Task
                            </button>
                          )}
                          {job.has_data_file && (
                            <button className="fbtn" onClick={() => handleDownload(job)}>
                              📥 Tải data check
                            </button>
                          )}
                          {job.has_result_file && (
                            <button className="fbtn" onClick={() => handleDownloadResult(job)}>
                              📥 Tải kết quả
                            </button>
                          )}
                          {canComplete && (
                            <button className="fbtn" onClick={() => setCompletingJob(job)}>
                              ✅ Đánh dấu hoàn tất
                            </button>
                          )}
                          {canAddSupporters && (
                            <button className="fbtn" onClick={() => setAddingSupportersJob(job)}>
                              ➕ Thêm người hỗ trợ
                            </button>
                          )}
                          {canUnclaim && (
                            <button className="fbtn" disabled={busy} onClick={() => handleUnclaim(job)}>
                              {busy ? "Đang trả..." : "↩️ Trả lại (chờ nhận)"}
                            </button>
                          )}
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="fbtn" onClick={() => { setEditingJob(job); setShowForm(true); }}>Sửa</button>
                            <button className="fbtn danger" onClick={() => handleDelete(job)}>Xóa</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {claimingJob && (
        <ClaimJobModal job={claimingJob} meId={me?.id} onDone={afterClaim} onCancel={() => setClaimingJob(null)} />
      )}
      {addingSupportersJob && (
        <AddSupportersModal job={addingSupportersJob} onDone={afterAddSupporters} onCancel={() => setAddingSupportersJob(null)} />
      )}
      {completingJob && (
        <CompleteJobModal job={completingJob} onDone={afterComplete} onCancel={() => setCompletingJob(null)} />
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
