import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import {
  getUser, listChuDeJobs, createChuDeJob, updateChuDeJob, deleteChuDeJob,
  claimChuDeJob, completeChuDeJob, downloadChuDeJobFile, downloadChuDeJobResultFile,
} from "../lib/api";

const ADMIN_ROLES = ["admin", "super_admin"];

const emptyForm = { ten_chu_de: "", vung: "", ten_shop: "", noi_dung_vi_pham: "" };

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
        <h3>{editingJob ? `✏️ Sửa job: ${editingJob.ten_chu_de}` : "+ Đăng job chủ đề mới"}</h3>
      </div>
      <form onSubmit={handleSubmit} style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={labelStyle}>Tên chủ đề *</label>
          <input style={inputStyle} value={form.ten_chu_de} onChange={(e) => setForm({ ...form, ten_chu_de: e.target.value })} />
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

export default function TheoDoiChuDePage() {
  const [me, setMe] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [completingJob, setCompletingJob] = useState(null);

  function load() {
    setLoading(true);
    listChuDeJobs()
      .then(setJobs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setMe(getUser());
    load();
  }, []);

  const isAdmin = me && ADMIN_ROLES.includes(me.role);

  function closeForm() {
    setShowForm(false);
    setEditingJob(null);
  }

  function afterSave() {
    closeForm();
    load();
  }

  async function handleClaim(job) {
    setBusyId(job.id);
    try {
      await claimChuDeJob(job.id);
      load();
    } catch (err) {
      alert(err.message || "Nhận job thất bại");
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
          {isAdmin
            ? "Đăng job chủ đề cần kiểm tra lên đây — NV KSNB tự bấm \"Nhận Job\" để nhận xử lý."
            : "Bấm \"Nhận Job\" để nhận xử lý — job có file data check sẽ hiện nút tải về."}
        </p>
      </div>

      {isAdmin && !showForm && (
        <div className="card">
          <div className="card-body" style={{ padding: "16px 20px" }}>
            <button className="login-btn" style={{ width: "auto", padding: "10px 24px" }} onClick={() => setShowForm(true)}>
              + Đăng job chủ đề mới
            </button>
          </div>
        </div>
      )}

      {isAdmin && showForm && (
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
                  const mine = me && job.claimed_by_user_id === me.id;
                  const canAccessFiles = mine || isAdmin; // chỉ NV đã nhận đúng job này (hoặc admin) mới tải file được
                  const canComplete = (mine || isAdmin) && job.trang_thai === "Đang xử lý";
                  const busy = busyId === job.id;
                  const soNgay = soNgayXuLy(job.ngay_bat_dau_check);
                  return (
                    <tr key={job.id}>
                      <td>{job.upload_date}</td>
                      <td style={{ textAlign: "left" }}>{job.ten_chu_de}</td>
                      <td>{job.vung || "-"}</td>
                      <td>{job.ten_shop || "-"}</td>
                      <td style={{ textAlign: "left" }}>{job.noi_dung_vi_pham || "-"}</td>
                      <td>{job.nhan_vien_phu_trach || "-"}</td>
                      <td>{fmtDateTime(job.ngay_bat_dau_check) || "-"}</td>
                      <td>{soNgay === null ? "-" : `${soNgay} ngày`}</td>
                      <td>{statusPill(job.trang_thai)}</td>
                      <td>{job.ket_qua_vi_pham || "-"}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch" }}>
                          {job.trang_thai === "Chưa nhận" && (
                            <button className="fbtn" disabled={busy} onClick={() => handleClaim(job)}>
                              {busy ? "Đang nhận..." : "Nhận Job"}
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
