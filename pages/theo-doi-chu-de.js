import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import {
  getUser, listChuDeJobs, createChuDeJob, updateChuDeJob, deleteChuDeJob,
  claimChuDeJob, unclaimChuDeJob, addChuDeJobSupporters, listKsnbForChuDe,
  completeChuDeJob, downloadChuDeJobFile, downloadChuDeJobResultFile,
  bulkUploadChuDeJobs, downloadChuDeJobBulkUploadTemplate, lookupChuDeShop,
  getChuDeJobMonths, exportChuDeJobs,
} from "../lib/api";

const ADMIN_ROLES = ["admin", "super_admin"];

const emptyForm = { ten_chu_de: "", vung: "", ma_shop: "", ten_shop: "", noi_dung_vi_pham: "" };

// Cột "Tên Shop" hiển thị "Mã Shop - Tên Shop" (25/08) khi có ma_shop.
function shopDisplay(job) {
  if (job.ma_shop && job.ten_shop) return `${job.ma_shop} - ${job.ten_shop}`;
  return job.ma_shop || job.ten_shop || "-";
}

const STATUS_STYLE = {
  "Chưa nhận": { background: "#FFF1E1", color: "var(--orange)" },
  "Đang xử lý": { background: "#E8EFFC", color: "var(--blue-accent)" },
  "Hoàn tất": { background: "#EAF6E5", color: "#4C9A2A" },
};
function statusPill(trangThai) {
  const style = STATUS_STYLE[trangThai] || { background: "var(--bg)", color: "var(--text-600)" };
  return (
    <span style={{ ...style, padding: "3px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>
      {trangThai}
    </span>
  );
}

function fmtDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("vi-VN");
}

// Số ngày xử lý = hôm nay - ngày giờ nhận job (chưa nhận thì không tính).
function soNgayXuLy(ngayBatDauCheck) {
  if (!ngayBatDauCheck) return null;
  const ms = Date.now() - new Date(ngayBatDauCheck).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

const VI_PHAM_OPTIONS = ["Không vi phạm", "Có vi phạm"];

// ---------- Popup: Nhận Job — xác nhận, hoặc "Nhận + thêm người hỗ trợ"
// mở tiếp màn hình tick chọn 1/nhiều KSNB (chốt 25/08) ----------
function ClaimJobModal({ job, meId, onDone, onCancel }) {
  const [step, setStep] = useState("confirm"); // "confirm" | "pick-supporters"
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
      listKsnbForChuDe()
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
      await claimChuDeJob(job.id, supporterIds);
      onDone();
    } catch (err) {
      setError(err.message || "Nhận job thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {step === "confirm" && (
          <>
            <h3 style={{ marginBottom: 4 }}>📌 Nhận Job</h3>
            <p style={{ fontSize: 13, color: "var(--text-600)", marginBottom: 18 }}>
              Xác nhận nhận xử lý job <strong>"{job.ten_chu_de}"</strong>
              {job.ten_shop ? ` — shop ${job.ten_shop}` : ""}?
            </p>
            {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 14 }}>{error}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              <button disabled={saving} className="login-btn" style={{ width: "auto", padding: "9px 22px", margin: 0 }} onClick={() => submit([])}>
                {saving ? "Đang nhận..." : "✅ Xác nhận Nhận Job"}
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
              Job <strong>"{job.ten_chu_de}"</strong> — chọn 1 hoặc nhiều KSNB cùng hỗ trợ xử lý (anh/chị vẫn là người phụ trách chính).
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

// ---------- Popup: Thêm người hỗ trợ cho job ĐÃ nhận (chốt 25/08) — loại
// người phụ trách chính + người hỗ trợ đã có sẵn khỏi danh sách chọn. ----------
function AddSupportersModal({ job, onDone, onCancel }) {
  const [ksnbList, setKsnbList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const excluded = new Set([job.claimed_by_user_id, ...(job.supporters || []).map((s) => s.user_id)]);
    listKsnbForChuDe()
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
      await addChuDeJobSupporters(job.id, [...selected]);
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
          Job <strong>"{job.ten_chu_de}"</strong> — chọn thêm 1 hoặc nhiều KSNB cùng hỗ trợ xử lý.
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

// ---------- Popup: đánh dấu Hoàn tất — chọn kết quả + upload file kết quả ----------
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
      await completeChuDeJob(job.id, { ket_qua_vi_pham: ketQua, file });
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

// ---------- Admin: form đăng / sửa job ----------
function JobFormCard({ editingJob, onDone, onCancel }) {
  const [form, setForm] = useState(editingJob ? { ...emptyForm, ...editingJob } : emptyForm);
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");

  // Gõ Mã shop rồi bấm Tab (onBlur) là tự tra cứu, điền Tên Shop/Vùng
  // (chốt 25/08) — dùng ShopInfo, tra được shop cả nước.
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
        await updateChuDeJob(editingJob.id, { ...form, file });
      } else {
        await createChuDeJob({ ...form, file });
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
        <h3>{editingJob ? `✏️ Sửa job: ${editingJob.ten_chu_de}` : "Thêm chủ đề mới"}</h3>
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
            {saving ? "Đang lưu..." : editingJob ? "Lưu thay đổi" : "Đăng job"}
          </button>
          <button type="button" onClick={onCancel} style={{ ...deleteBtnStyle, color: "var(--text-600)", padding: "10px 20px" }}>
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- Admin: thêm chủ đề mới — nhập tay 1 job (mở form bên dưới)
// hoặc đăng NHIỀU job cùng lúc bằng Excel (KHÔNG đính kèm được file data
// cho từng dòng, khác đăng 1 job qua form). 2 nút nằm chung 1 hàng. ----------
function BulkUploadCard({ onDone, onOpenForm }) {
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
      const r = await bulkUploadChuDeJobs(file);
      setResultMsg(`✅ Đã thêm ${r.count} job.`);
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
      await downloadChuDeJobBulkUploadTemplate();
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
        <p style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 12, lineHeight: 1.6 }}>
          Thêm từng chủ đề bằng tay, hoặc đăng nhiều cùng lúc bằng Excel đúng mẫu cột (dòng 1):{" "}
          <strong>Tên Chủ Đề | Vùng | Mã Shop | Tên Shop | Nội Dung Vi Phạm</strong> — chỉ bắt buộc cột Tên Chủ Đề, các cột
          khác để trống cũng được. Lưu ý: đăng hàng loạt bằng Excel{" "}
          <strong>không tự tra Tên Shop/Vùng theo Mã Shop</strong> (khác đăng 1 job qua form) và{" "}
          <strong>không đính kèm được file data check</strong> cho từng dòng — cần bấm "Sửa" từng job sau khi đăng
          nếu muốn thêm file.
        </p>
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
        </div>
        {resultMsg && <div style={{ fontSize: 12, color: "#4C9A2A", marginTop: 10 }}>{resultMsg}</div>}
        {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 10 }}>{error}</div>}
      </div>
    </div>
  );
}

export default function TheoDoiChuDePage() {
  const [me, setMe] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [completingJob, setCompletingJob] = useState(null);
  const [claimingJob, setClaimingJob] = useState(null);
  const [addingSupportersJob, setAddingSupportersJob] = useState(null);
  // Bộ chọn tháng + xuất data (chốt 27/08).
  const [thang, setThang] = useState("");
  const [months, setMonths] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  function load(thangFilter = thang) {
    setLoading(true);
    listChuDeJobs(thangFilter || undefined)
      .then(setJobs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setMe(getUser());
    getChuDeJobMonths().then(setMonths).catch(() => {});
  }, []);

  useEffect(() => {
    load(thang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thang]);

  async function handleExport() {
    setExporting(true);
    setExportError("");
    try {
      await exportChuDeJobs(thang || undefined);
    } catch (err) {
      setExportError(err.message || "Xuất data thất bại");
    } finally {
      setExporting(false);
    }
  }

  const isAdmin = me && ADMIN_ROLES.includes(me.role);
  // Đăng job (đơn lẻ + hàng loạt bằng Excel) mở thêm cho editor (chốt
  // 24/08) — Sửa/Xóa job đã đăng vẫn chỉ admin/super_admin.
  const canUpload = isAdmin || me?.role === "editor";

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

  // Trả job về "Chưa nhận" (25/08, admin/editor) — người đã nhận gặp rủi
  // ro/không xử lý được, để người khác vào nhận lại.
  async function handleUnclaim(job) {
    if (!confirm(`Trả job "${job.ten_chu_de}" về trạng thái "Chưa nhận"? Người hỗ trợ (nếu có) cũng sẽ bị gỡ.`)) return;
    setBusyId(job.id);
    try {
      await unclaimChuDeJob(job.id);
      load();
    } catch (err) {
      alert(err.message || "Trả job thất bại");
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
      await downloadChuDeJobFile(job.id, job.data_file_name);
    } catch (err) {
      alert(err.message || "Tải file thất bại");
    }
  }

  async function handleDownloadResult(job) {
    try {
      await downloadChuDeJobResultFile(job.id, job.result_file_name);
    } catch (err) {
      alert(err.message || "Tải file thất bại");
    }
  }

  async function handleDelete(job) {
    if (!confirm(`Xóa job "${job.ten_chu_de}"?`)) return;
    try {
      await deleteChuDeJob(job.id);
      load();
    } catch (err) {
      alert(err.message || "Xóa thất bại");
    }
  }

  return (
    <Layout crumb="Theo dõi chủ đề">
      <div className="page-head">
        <h1>Theo dõi chủ đề</h1>
        <p>
          {canUpload
            ? "Đăng job chủ đề cần kiểm tra lên đây — NV KSNB tự bấm \"Nhận Job\" để nhận xử lý."
            : "Bấm \"Nhận Job\" để nhận xử lý — job có file data check sẽ hiện nút tải về."}
        </p>
      </div>

      {/* Bộ chọn tháng + Xuất data (chốt 27/08) — chọn tháng lọc theo Ngày
          Upload, "Tất cả các tháng" = không lọc. Nút Xuất data chỉ admin/editor. */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "14px 18px" }}>
          <select className="month-select" value={thang} onChange={(e) => setThang(e.target.value)}>
            <option value="">Tất cả các tháng</option>
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {canUpload && (
            <button
              className="fbtn" disabled={exporting} onClick={handleExport}
              style={{ background: "#EAF6E5", borderColor: "#4C9A2A", color: "#3E7A2A" }}
            >
              {exporting ? "Đang xuất..." : "📤 Xuất data"}
            </button>
          )}
          {exportError && <div style={{ fontSize: 12, color: "var(--danger)" }}>{exportError}</div>}
        </div>
      </div>

      {canUpload && !showForm && <BulkUploadCard onDone={load} onOpenForm={() => setShowForm(true)} />}

      {canUpload && showForm && (
        <JobFormCard editingJob={editingJob} onDone={afterSave} onCancel={closeForm} />
      )}

      {error && <div className="placeholder-box">Không tải được dữ liệu: {error}</div>}
      {!error && !loading && jobs.length === 0 && (
        <div className="placeholder-box">Chưa có job chủ đề nào được đăng.</div>
      )}

      {!error && jobs.length > 0 && (
        <div className="card">
          <div className="card-body" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Ngày Upload</th>
                  <th>Tên Chủ Đề</th>
                  <th>Vùng</th>
                  <th>Tên Shop</th>
                  <th>Nội Dung Vi Phạm</th>
                  <th>NV Check</th>
                  <th>Ngày Check</th>
                  <th>Số ngày xử lý</th>
                  <th>Tình trạng</th>
                  <th>Kết quả</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const supporters = job.supporters || [];
                  const mine = me && job.claimed_by_user_id === me.id;
                  const isSupporter = me && supporters.some((s) => s.user_id === me.id);
                  const canAccessFiles = mine || isSupporter || isAdmin; // chỉ NV đã nhận đúng job này (chính/hỗ trợ, hoặc admin) mới tải file được
                  const canComplete = (mine || isSupporter || isAdmin) && job.trang_thai === "Đang xử lý";
                  const canUnclaim = canUpload && job.trang_thai === "Đang xử lý"; // admin/editor — job gặp rủi ro, trả về Chưa nhận
                  // Thêm người hỗ trợ (25/08): CHỈ người phụ trách chính thấy được (không
                  // phải người hỗ trợ, không phải user khác) — admin/editor thấy ở mọi job.
                  const canAddSupporters = (mine || canUpload) && job.trang_thai === "Đang xử lý";
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
                      <td>{statusPill(job.trang_thai)}</td>
                      <td>{job.ket_qua_vi_pham || "-"}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch" }}>
                          {job.trang_thai === "Chưa nhận" && (
                            <button className="fbtn" onClick={() => setClaimingJob(job)}>
                              Nhận Job
                            </button>
                          )}
                          {job.has_data_file && canAccessFiles && (
                            <button className="fbtn" onClick={() => handleDownload(job)}>
                              📥 Tải data check
                            </button>
                          )}
                          {job.has_result_file && canAccessFiles && (
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
                          {isAdmin && (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="fbtn" onClick={() => { setEditingJob(job); setShowForm(true); }}>Sửa</button>
                              <button className="fbtn danger" onClick={() => handleDelete(job)}>Xóa</button>
                            </div>
                          )}
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
