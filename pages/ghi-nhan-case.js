import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import {
  listViolationCases, createViolationCase, updateViolationCase, deleteViolationCase,
  importViolationCasesFiles, completeChuDeJob, getUser,
} from "../lib/api";
import { useAllowedKeys } from "../lib/permissions";

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const now = new Date();
const CURRENT_MONTH = String(now.getMonth() + 1).padStart(2, "0");
const CURRENT_YEAR = now.getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

const MUC_DO_OPTIONS = [
  { value: "nhe", label: "Nhẹ", color: "#4C9A2A", bg: "#EAF6E5" },
  { value: "vua", label: "Vừa", color: "#DC7738", bg: "#FFF1E1" },
  { value: "nghiem_trong", label: "Nghiêm trọng", color: "#D64545", bg: "#FDEAEA" },
  { value: "rat_nghiem_trong", label: "Rất nghiêm trọng", color: "#fff", bg: "#7A1F1F" },
];
const TRANG_THAI_OPTIONS = [
  { value: "dang_xu_ly", label: "Đang xử lý" },
  { value: "cho_hop", label: "Chờ họp XLKL" },
  { value: "da_xu_ly", label: "Đã xử lý" },
];
const HINH_THUC_XLKL_OPTIONS = [
  { value: "", label: "(Chưa xác định)" },
  { value: "sa_thai", label: "Sa thải" },
  { value: "phat_tien", label: "Phạt tiền" },
  { value: "canh_cao_nhac_nho", label: "Cảnh cáo nhắc nhở" },
  { value: "cho_hop_xlkl", label: "Chờ họp XLKL" },
];

const EMPTY_FORM = {
  chu_de: "", doi_tuong: "", vung: "", ngay_ghi_nhan: "",
  muc_do: "vua", trang_thai: "dang_xu_ly", hinh_thuc_xlkl: "", mo_ta: "",
};

function mucDoInfo(value) {
  return MUC_DO_OPTIONS.find((m) => m.value === value) || MUC_DO_OPTIONS[1];
}
function trangThaiLabel(value) {
  return TRANG_THAI_OPTIONS.find((t) => t.value === value)?.label || value;
}
function hinhThucXlklLabel(value) {
  return HINH_THUC_XLKL_OPTIONS.find((h) => h.value === value)?.label || value;
}

export default function GhiNhanCasePage() {
  const router = useRouter();
  const [period, setPeriod] = useState({ month: CURRENT_MONTH, year: CURRENT_YEAR });
  const [cases, setCases] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const fileInputRef = useRef(null);
  const me = getUser();
  const isAdmin = ["admin", "super_admin"].includes(me?.role);
  const canCreate = ["editor", "editor_base", "admin", "super_admin"].includes(me?.role);
  const { can } = useAllowedKeys();

  // Sang từ popup "Cập nhật kết quả xử lý" bên Theo dõi chủ đề khi chọn "Có
  // vi phạm" (chốt 02/09, xem CompleteJobModal trong theo-doi-chu-de.js) —
  // điền sẵn Chủ đề/Đối tượng/Vùng theo đúng job, bắt buộc nhập đủ case rồi
  // Lưu; job đó sẽ TỰ ĐỘNG được đánh dấu Hoàn tất + Có vi phạm ngay sau đó.
  const [linkedJobId, setLinkedJobId] = useState(null);
  const [linkedJobDone, setLinkedJobDone] = useState(false);
  useEffect(() => {
    if (!router.isReady) return;
    const { jobId, chu_de, doi_tuong, vung } = router.query;
    if (!jobId) return;
    setLinkedJobId(jobId);
    setForm((f) => ({
      ...f,
      chu_de: chu_de || f.chu_de,
      doi_tuong: doi_tuong || f.doi_tuong,
      vung: vung || f.vung,
    }));
  }, [router.isReady]);

  const periodLabel = `${period.year}-${period.month}`;

  function load() {
    listViolationCases(periodLabel).then(setCases).catch((err) => setError(err.message));
  }

  useEffect(load, [periodLabel]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.chu_de.trim()) return;
    setSaving(true);
    try {
      await createViolationCase({
        ...form, period_label: periodLabel,
        ngay_ghi_nhan: form.ngay_ghi_nhan || null,
        hinh_thuc_xlkl: form.hinh_thuc_xlkl || null,
      });
      setForm(EMPTY_FORM);
      load();
      if (linkedJobId) {
        try {
          await completeChuDeJob(linkedJobId, { ket_qua_vi_pham: "Có vi phạm" });
          setLinkedJobDone(true);
        } catch (err) {
          alert(
            "Đã ghi nhận case thành công, nhưng đánh dấu Hoàn tất task bên Theo dõi chủ đề bị lỗi: " +
            (err.message || "không rõ nguyên nhân") + " — anh vào Theo dõi chủ đề đánh dấu tay giúp em."
          );
        } finally {
          setLinkedJobId(null);
        }
      }
    } catch (err) {
      alert(err.message || "Ghi nhận thất bại");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEditForm({
      chu_de: c.chu_de, doi_tuong: c.doi_tuong || "", vung: c.vung || "",
      ngay_ghi_nhan: c.ngay_ghi_nhan || "", muc_do: c.muc_do, trang_thai: c.trang_thai,
      hinh_thuc_xlkl: c.hinh_thuc_xlkl || "", mo_ta: c.mo_ta || "",
    });
  }

  async function saveEdit(id) {
    try {
      await updateViolationCase(id, { ...editForm, hinh_thuc_xlkl: editForm.hinh_thuc_xlkl || null });
      setEditingId(null);
      load();
    } catch (err) {
      alert(err.message || "Lưu thất bại");
    }
  }

  async function handleImportFiles(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImporting(true);
    setImportError("");
    setImportMsg("");
    try {
      const created = await importViolationCasesFiles(periodLabel, files);
      setImportMsg(`Đã ghi nhận thêm ${created.length} case từ ${files.length} file. Mời anh xem lại bên dưới.`);
      load();
    } catch (err) {
      setImportError(err.message || "Xử lý file thất bại");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id) {
    if (!confirm("Xóa case này? Không thể hoàn tác.")) return;
    try {
      await deleteViolationCase(id);
      load();
    } catch (err) {
      alert(err.message || "Xóa thất bại");
    }
  }

  return (
    <Layout crumb="Ghi nhận case vi phạm">
      <div className="page-head">
        <h1>Ghi nhận case vi phạm</h1>
        <p>
          Không có biểu mẫu cố định — ghi nhận từng case theo diễn biến thực tế trong tháng.
          Cuối tháng, các case này sẽ được gom lại thành báo cáo kiểm soát theo chủ đề.
        </p>
      </div>

      {linkedJobId && canCreate && (
        <div className="placeholder-box" style={{ borderColor: "var(--orange)", color: "var(--orange)", marginBottom: 16 }}>
          🔗 Đang ghi nhận case cho task "Có vi phạm" bên Theo dõi chủ đề — điền đủ thông tin bên dưới rồi bấm
          "+ Ghi nhận case" là task đó sẽ tự động được đánh dấu <strong>Hoàn tất</strong>.
        </div>
      )}
      {linkedJobId && !canCreate && (
        <div className="placeholder-box" style={{ borderColor: "var(--danger)", color: "var(--danger)", marginBottom: 16 }}>
          ⚠️ Tài khoản của anh (Viewer) không có quyền ghi nhận case — task bên Theo dõi chủ đề vẫn đang ở "Đang xử lý",
          chưa được đánh dấu Hoàn tất. Nhờ Editor/Admin ghi nhận case cho task này giúp.
        </div>
      )}
      {linkedJobDone && (
        <div className="placeholder-box" style={{ borderColor: "#4C9A2A", color: "#4C9A2A", marginBottom: 16 }}>
          ✅ Đã ghi nhận case và đánh dấu Hoàn tất task bên Theo dõi chủ đề.
        </div>
      )}

      <div className="month-tabs">
        {MONTH_OPTIONS.map((m) => (
          <div key={m} className={`month-tab ${m === period.month ? "active" : ""}`}
            onClick={() => setPeriod({ ...period, month: m })}>
            Tháng {m}
          </div>
        ))}
      </div>
      <div className="month-tabs">
        {YEAR_OPTIONS.map((y) => (
          <div key={y} className={`month-tab ${y === period.year ? "active" : ""}`}
            onClick={() => setPeriod({ ...period, year: y })}>
            {y}
          </div>
        ))}
      </div>

      {canCreate && (
        <div className="card">
          <div className="card-head"><h3>📤 Tải file lên (Kỳ {periodLabel})</h3></div>
          <div className="card-body" style={{ padding: "16px 20px" }}>
            <p style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 6 }}>
              <strong>Excel</strong>: phải đúng mẫu có sẵn (đọc thẳng theo cột, không qua AI — nhanh, miễn phí, chuẩn xác).{" "}
              <a href="/templates/mau-ghi-nhan-case-vi-pham.xlsx" download style={{ color: "var(--blue-accent)", fontWeight: 700 }}>
                📥 Tải template Excel mẫu
              </a>
            </p>
            <p style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 12 }}>
              <strong>PDF hoặc ảnh chụp màn hình</strong> (chat, email...): không có mẫu cố định, AI sẽ tự đọc và tách ra từng case.
              Có thể chọn nhiều file cùng lúc, trộn cả Excel lẫn PDF/ảnh. Sau khi tách xong, anh nên xem lại/chỉnh sửa từng case bên dưới cho chính xác.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".xlsx,.xls,.xlsm,.pdf,image/png,image/jpeg,image/webp"
              onChange={handleImportFiles}
              disabled={importing}
              style={{ display: "none" }}
            />
            <button className="upload-btn" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              📤 Chọn file để tải lên
            </button>
            {importing && <div style={{ fontSize: 12.5, color: "var(--text-600)", marginTop: 8 }}>Đang xử lý file, vui lòng đợi...</div>}
            {importMsg && <div style={{ fontSize: 12.5, color: "#4C9A2A", marginTop: 8 }}>{importMsg}</div>}
            {importError && <div style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 8 }}>{importError}</div>}
          </div>
        </div>
      )}

      {canCreate && (
        <div className="card">
          <div className="card-head"><h3>+ Ghi nhận case mới (nhập tay) — Kỳ {periodLabel}</h3></div>
          <form onSubmit={handleAdd} className="card-body" style={{ padding: "16px 20px" }}>
            <div className="form-grid-3" style={{ gap: 12 }}>
              <div>
                <label style={labelStyle}>Chủ đề / nhóm vi phạm *</label>
                <input required className="finput" style={inputStyle} value={form.chu_de}
                  onChange={(e) => setForm({ ...form, chu_de: e.target.value })}
                  placeholder="VD: Bán hàng không xuất hóa đơn" />
              </div>
              <div>
                <label style={labelStyle}>Đối tượng liên quan (NV/Shop)</label>
                <input className="finput" style={inputStyle} value={form.doi_tuong}
                  onChange={(e) => setForm({ ...form, doi_tuong: e.target.value })}
                  placeholder="NV [tên đầy đủ] – [tên đầy đủ shop]" />
              </div>
              <div>
                <label style={labelStyle}>Vùng</label>
                <input className="finput" style={inputStyle} value={form.vung}
                  onChange={(e) => setForm({ ...form, vung: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Ngày ghi nhận</label>
                <input type="date" className="finput" style={inputStyle} value={form.ngay_ghi_nhan}
                  onChange={(e) => setForm({ ...form, ngay_ghi_nhan: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Mức độ</label>
                <select className="finput" style={inputStyle} value={form.muc_do}
                  onChange={(e) => setForm({ ...form, muc_do: e.target.value })}>
                  {MUC_DO_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Trạng thái</label>
                <select className="finput" style={inputStyle} value={form.trang_thai}
                  onChange={(e) => setForm({ ...form, trang_thai: e.target.value })}>
                  {TRANG_THAI_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Hình thức XLKL</label>
                <select className="finput" style={inputStyle} value={form.hinh_thuc_xlkl}
                  onChange={(e) => setForm({ ...form, hinh_thuc_xlkl: e.target.value })}>
                  {HINH_THUC_XLKL_OPTIONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Mô tả diễn biến (tự do)</label>
              <textarea className="finput" style={{ ...inputStyle, width: "100%" }} rows={3} value={form.mo_ta}
                onChange={(e) => setForm({ ...form, mo_ta: e.target.value })}
                placeholder="Ghi lại diễn biến, bằng chứng, hướng xử lý... tự do theo tình huống thực tế" />
            </div>
            <button type="submit" disabled={saving} style={addBtnStyle}>
              {saving ? "Đang lưu..." : "+ Ghi nhận case"}
            </button>
          </form>
        </div>
      )}

      {error && <div className="placeholder-box">{error}</div>}
      {!error && cases.length === 0 && (
        <div className="placeholder-box">Chưa có case nào được ghi nhận trong kỳ {periodLabel}.</div>
      )}

      {cases.map((c) => {
        const md = mucDoInfo(c.muc_do);
        const canEdit = (isAdmin && can("/ghi-nhan-case::sua-xoa-nguoi-khac")) || c.created_by_user_id === me?.id;
        const editing = editingId === c.id;
        return (
          <div className="card" key={c.id}>
            <div className="card-body" style={{ padding: "16px 20px", borderLeft: `4px solid ${md.color}` }}>
              {editing ? (
                <>
                  <div className="form-grid-3" style={{ gap: 12 }}>
                    <input className="finput" style={inputStyle} value={editForm.chu_de}
                      onChange={(e) => setEditForm({ ...editForm, chu_de: e.target.value })} />
                    <input className="finput" style={inputStyle} value={editForm.doi_tuong}
                      onChange={(e) => setEditForm({ ...editForm, doi_tuong: e.target.value })} />
                    <input className="finput" style={inputStyle} value={editForm.vung}
                      onChange={(e) => setEditForm({ ...editForm, vung: e.target.value })} />
                    <input type="date" className="finput" style={inputStyle} value={editForm.ngay_ghi_nhan || ""}
                      onChange={(e) => setEditForm({ ...editForm, ngay_ghi_nhan: e.target.value })} />
                    <select className="finput" style={inputStyle} value={editForm.muc_do}
                      onChange={(e) => setEditForm({ ...editForm, muc_do: e.target.value })}>
                      {MUC_DO_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <select className="finput" style={inputStyle} value={editForm.trang_thai}
                      onChange={(e) => setEditForm({ ...editForm, trang_thai: e.target.value })}>
                      {TRANG_THAI_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <select className="finput" style={inputStyle} value={editForm.hinh_thuc_xlkl}
                      onChange={(e) => setEditForm({ ...editForm, hinh_thuc_xlkl: e.target.value })}>
                      {HINH_THUC_XLKL_OPTIONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                    </select>
                  </div>
                  <textarea className="finput" style={{ ...inputStyle, width: "100%", marginTop: 12 }} rows={3}
                    value={editForm.mo_ta} onChange={(e) => setEditForm({ ...editForm, mo_ta: e.target.value })} />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => saveEdit(c.id)} style={addBtnStyle}>💾 Lưu</button>
                    <button onClick={() => setEditingId(null)} className="fbtn">✖ Hủy</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <span style={{ ...pillStyle, background: md.bg, color: md.color }}>{md.label}</span>{" "}
                      <strong style={{ fontSize: 14.5, color: "var(--navy-900)" }}>{c.chu_de}</strong>
                      <div style={{ fontSize: 12, color: "var(--text-600)", marginTop: 4 }}>
                        {c.doi_tuong && <>Đối tượng: <strong>{c.doi_tuong}</strong> · </>}
                        {c.vung && <>Vùng: {c.vung} · </>}
                        {c.ngay_ghi_nhan && <>Ngày: {c.ngay_ghi_nhan} · </>}
                        Trạng thái: <strong>{trangThaiLabel(c.trang_thai)}</strong>
                        {c.hinh_thuc_xlkl && <> · Hình thức XLKL: <strong>{hinhThucXlklLabel(c.hinh_thuc_xlkl)}</strong></>}
                      </div>
                    </div>
                    {canEdit && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => startEdit(c)} className="fbtn">Sửa</button>
                        <button onClick={() => handleDelete(c.id)} className="fbtn danger">Xóa</button>
                      </div>
                    )}
                  </div>
                  {c.mo_ta && <p style={{ fontSize: 13, marginTop: 10, whiteSpace: "pre-line", color: "var(--text-900)" }}>{c.mo_ta}</p>}
                </>
              )}
            </div>
          </div>
        );
      })}
    </Layout>
  );
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-600)", display: "block", marginBottom: 5 };
const inputStyle = { width: "100%" };
const addBtnStyle = {
  marginTop: 14, padding: "9px 20px", borderRadius: 8, border: "none",
  background: "var(--navy-800)", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
};
const pillStyle = { display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 700 };
