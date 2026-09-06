import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import {
  getUser, lookupChuDeShop, listChuDeTopicsV2,
  listViPhamCasesV2, createViPhamCaseV2, updateViPhamCaseV2, deleteViPhamCaseV2, downloadViPhamCaseV2File,
} from "../lib/api";

// "Ghi nhận case vi phạm Ver2" (chốt 06/09) — menu THỬ NGHIỆM, chỉ
// admin/super_admin xem được, dùng để thiết kế/thử tính năng mới trước
// khi đưa vào bản thật "Ghi nhận case vi phạm" (đang chạy thật cho mọi
// NV KSNB). ĐỘC LẬP hoàn toàn với "Theo dõi chủ đề Ver2" — không dùng
// chung rule/data/component nào với menu đó.
// NGOẠI LỆ DUY NHẤT (chốt 06/09 lần 2): trường "Chủ Đề vi phạm" dùng
// CHUNG danh sách "Tên chủ đề" ở "Quản lý chủ đề" (Theo dõi chủ đề Ver2,
// combo box do super_admin quản lý) — CHỈ ĐỌC (listChuDeTopicsV2()),
// không sửa/xóa/thêm gì vào danh sách đó từ trang này. Không cho nhập tự
// do ngoài danh sách này nữa.
// Bảo vệ 2 lớp giống các trang admin-only khác (vd nhat-ky-hoat-dong.js):
// Layout.js đã chặn theo allowed_menus ở cấp trung tâm, đây là lớp phòng
// hờ ngay tại trang phòng khi truy cập trước khi allowed_menus tải xong.
const ADMIN_ROLES = ["admin", "super_admin"];

// Sắp xếp "Tên chủ đề" A→Z (locale "vi"), "Khác" luôn cuối — y hệt rule
// đang dùng ở "Theo dõi chủ đề Ver2" (sortTopics trong theo-doi-chu-de-v2.js),
// copy riêng ở đây để KHÔNG import chéo giữa 2 trang thử nghiệm độc lập.
function sortTopicNames(names) {
  return [...names].sort((a, b) => {
    const aKhac = a.trim() === "Khác";
    const bKhac = b.trim() === "Khác";
    if (aKhac && !bKhac) return 1;
    if (!aKhac && bKhac) return -1;
    return a.localeCompare(b, "vi");
  });
}

// "Trạng thái"/"Hình thức kỷ luật" (chốt 06/09) — tạm lấy đúng bộ giá trị
// đang dùng ở "Ghi nhận case vi phạm" bản thật cho quen thuộc, đổi được
// sau vì đây là menu thử nghiệm, không có rule cố định.
const TRANG_THAI_OPTIONS = [
  { value: "dang_xu_ly", label: "Đang xử lý" },
  { value: "cho_hop", label: "Chờ họp XLKL" },
  { value: "da_xu_ly", label: "Đã xử lý" },
];
const HINH_THUC_KY_LUAT_OPTIONS = [
  { value: "", label: "(Chưa xác định)" },
  { value: "sa_thai", label: "Sa thải" },
  { value: "phat_tien", label: "Phạt tiền" },
  { value: "canh_cao_nhac_nho", label: "Cảnh cáo nhắc nhở" },
  { value: "cho_hop_xlkl", label: "Chờ họp XLKL" },
];

function trangThaiInfo(value) {
  return TRANG_THAI_OPTIONS.find((t) => t.value === value) || TRANG_THAI_OPTIONS[0];
}
function hinhThucKyLuatLabel(value) {
  return HINH_THUC_KY_LUAT_OPTIONS.find((h) => h.value === value)?.label || "(Chưa xác định)";
}
function fmtMoney(n) {
  if (n === null || n === undefined || n === "") return "-";
  return Number(n).toLocaleString("vi-VN");
}

const EMPTY_FORM = {
  chu_de_vi_pham: "", loai_vi_pham: "", ma_shop: "", ten_shop: "", vung: "",
  nhan_vien_vi_pham: "", dien_giai_vi_pham: "", gia_tri_vi_pham: "", sl_so_vi_pham: "",
  trang_thai: "dang_xu_ly", hinh_thuc_ky_luat: "",
};

// ---------- Form dùng chung cho cả "Ghi nhận case mới" và "Sửa case" ----------
function CaseForm({ form, setForm, file, setFile, existingFileName, onSubmit, onCancel, saving, error, submitLabel, topics, isEditing }) {
  const fileInputRef = useRef(null);
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
        setForm((f) => ({ ...f, ma_shop: res.ma_shop || f.ma_shop, ten_shop: res.ten_shop || "", vung: res.vung || f.vung }));
        setLookupMsg("✅ Đã tìm thấy shop, tự điền Tên Shop/Vùng.");
      } else {
        setLookupMsg("⚠️ Không khớp shop nào trong hệ thống — có thể tự nhập tay.");
      }
    } catch (err) {
      setLookupMsg("❌ " + err.message);
    } finally {
      setLooking(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card-body" style={{ padding: "16px 20px" }}>
      {(looking || lookupMsg) && (
        <div style={{ fontSize: 11.5, color: looking ? "var(--text-400)" : undefined, marginBottom: 8 }}>
          {looking ? "Đang tra cứu..." : lookupMsg}
        </div>
      )}
      <div className="form-grid-3" style={{ gap: 12 }}>
        <div>
          <label style={labelStyle}>Chủ Đề vi phạm *</label>
          <select required className="finput" style={inputStyle} value={form.chu_de_vi_pham}
            onChange={(e) => setForm({ ...form, chu_de_vi_pham: e.target.value })}>
            <option value="">— Chọn chủ đề —</option>
            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            {/* Case đang sửa dùng tên đã bị xóa khỏi combo box — vẫn hiện
                thêm để không vô tình đổi mất tên cũ khi lưu (chỉ lúc Sửa). */}
            {isEditing && form.chu_de_vi_pham && !topics.includes(form.chu_de_vi_pham) && (
              <option value={form.chu_de_vi_pham}>{form.chu_de_vi_pham} (đã bị xóa khỏi danh sách)</option>
            )}
          </select>
          {topics.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>
              Chưa có Tên chủ đề nào — nhờ super_admin vào "Theo dõi chủ đề Ver2" &gt; "Quản lý chủ đề" thêm trước.
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>Loại vi phạm</label>
          <input className="finput" style={inputStyle} value={form.loai_vi_pham}
            onChange={(e) => setForm({ ...form, loai_vi_pham: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Mã shop</label>
          <input className="finput" style={inputStyle} value={form.ma_shop}
            onChange={(e) => setForm({ ...form, ma_shop: e.target.value })}
            onBlur={(e) => handleLookup(e.target.value)}
            placeholder="Gõ mã shop rồi bấm Tab..." />
        </div>
        <div>
          <label style={labelStyle}>Tên Shop</label>
          <input className="finput" style={inputStyle} value={form.ten_shop}
            onChange={(e) => setForm({ ...form, ten_shop: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Vùng</label>
          <input className="finput" style={inputStyle} value={form.vung}
            onChange={(e) => setForm({ ...form, vung: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Nhân Viên Vi phạm</label>
          <input className="finput" style={inputStyle} value={form.nhan_vien_vi_pham}
            onChange={(e) => setForm({ ...form, nhan_vien_vi_pham: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Giá trị vi phạm (đồng)</label>
          <input type="number" className="finput" style={inputStyle} value={form.gia_tri_vi_pham}
            onChange={(e) => setForm({ ...form, gia_tri_vi_pham: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>SL SO Vi phạm</label>
          <input type="number" className="finput" style={inputStyle} value={form.sl_so_vi_pham}
            onChange={(e) => setForm({ ...form, sl_so_vi_pham: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Trạng thái</label>
          <select className="finput" style={inputStyle} value={form.trang_thai}
            onChange={(e) => setForm({ ...form, trang_thai: e.target.value })}>
            {TRANG_THAI_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Hình thức kỷ luật</label>
          <select className="finput" style={inputStyle} value={form.hinh_thuc_ky_luat}
            onChange={(e) => setForm({ ...form, hinh_thuc_ky_luat: e.target.value })}>
            {HINH_THUC_KY_LUAT_OPTIONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>Diễn giải vi phạm</label>
        <textarea className="finput" style={{ ...inputStyle, width: "100%" }} rows={3} value={form.dien_giai_vi_pham}
          onChange={(e) => setForm({ ...form, dien_giai_vi_pham: e.target.value })}
          placeholder="Diễn biến, bằng chứng, hướng xử lý... tự do theo tình huống thực tế" />
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>Đính kèm file (tuỳ chọn)</label>
        <div>
          <input ref={fileInputRef} type="file" style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button type="button" className="upload-btn" onClick={() => fileInputRef.current?.click()}>
            📤 {file ? "Đổi file khác" : existingFileName ? "Thay file mới" : "Chọn file"}
          </button>
          <span style={{ fontSize: 11, color: "var(--text-400)", marginLeft: 10 }}>
            {file ? file.name : existingFileName || "Chưa có file"}
          </span>
        </div>
      </div>

      {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button type="submit" disabled={saving} style={addBtnStyle}>
          {saving ? "Đang lưu..." : submitLabel}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="fbtn">✖ Hủy</button>}
      </div>
    </form>
  );
}

export default function GhiNhanCaseV2Page() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // "Chủ Đề vi phạm" (chốt 06/09 lần 2) — CHỈ ĐỌC danh sách "Tên chủ đề"
  // của "Theo dõi chủ đề Ver2" (Quản lý chủ đề), không sửa/thêm gì ở đây.
  const [topics, setTopics] = useState([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editFile, setEditFile] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    const user = getUser();
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      router.replace("/");
      return;
    }
    setChecked(true);
  }, []);

  function load() {
    setLoading(true);
    listViPhamCasesV2()
      .then(setCases)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!checked) return;
    load();
    listChuDeTopicsV2()
      .then((rows) => setTopics(sortTopicNames(rows.map((t) => t.ten_chu_de))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked]);

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    setAddError("");
    try {
      await createViPhamCaseV2({ ...form, file });
      setForm(EMPTY_FORM);
      setFile(null);
      load();
    } catch (err) {
      setAddError(err.message || "Ghi nhận thất bại");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEditFile(null);
    setEditError("");
    setEditForm({
      chu_de_vi_pham: c.chu_de_vi_pham, loai_vi_pham: c.loai_vi_pham || "",
      ma_shop: c.ma_shop || "", ten_shop: c.ten_shop || "", vung: c.vung || "",
      nhan_vien_vi_pham: c.nhan_vien_vi_pham || "", dien_giai_vi_pham: c.dien_giai_vi_pham || "",
      gia_tri_vi_pham: c.gia_tri_vi_pham ?? "", sl_so_vi_pham: c.sl_so_vi_pham ?? "",
      trang_thai: c.trang_thai, hinh_thuc_ky_luat: c.hinh_thuc_ky_luat || "",
    });
  }

  async function saveEdit(e, id) {
    e.preventDefault();
    setEditSaving(true);
    setEditError("");
    try {
      await updateViPhamCaseV2(id, { ...editForm, file: editFile });
      setEditingId(null);
      load();
    } catch (err) {
      setEditError(err.message || "Lưu thất bại");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(c) {
    if (!confirm(`Xóa case "${c.chu_de_vi_pham}"? Không thể hoàn tác.`)) return;
    try {
      await deleteViPhamCaseV2(c.id);
      load();
    } catch (err) {
      alert(err.message || "Xóa thất bại");
    }
  }

  async function handleDownload(c) {
    try {
      await downloadViPhamCaseV2File(c.id, c.file_name);
    } catch (err) {
      alert(err.message || "Tải file thất bại");
    }
  }

  if (!checked) return null;

  return (
    <Layout crumb="Ghi nhận case vi phạm Ver2">
      <div className="page-head">
        <h1>🧪 Ghi nhận case vi phạm Ver2</h1>
        <p>
          Menu thử nghiệm — chỉ admin/super_admin xem được. Dùng để thiết kế/thử tính năng mới
          trước khi đưa vào bản thật "Ghi nhận case vi phạm" đang chạy cho mọi NV KSNB.
        </p>
      </div>

      <div className="card">
        <div className="card-head"><h3>+ Ghi nhận case mới (nhập tay)</h3></div>
        <CaseForm
          form={form} setForm={setForm} file={file} setFile={setFile} existingFileName=""
          onSubmit={handleAdd} saving={saving} error={addError} submitLabel="+ Ghi nhận case"
          topics={topics} isEditing={false}
        />
      </div>

      {error && <div className="placeholder-box">Không tải được dữ liệu: {error}</div>}
      {!error && !loading && cases.length === 0 && (
        <div className="placeholder-box">Chưa có case nào được ghi nhận.</div>
      )}

      {cases.map((c) => {
        const st = trangThaiInfo(c.trang_thai);
        const editing = editingId === c.id;
        return (
          <div className="card" key={c.id}>
            {editing ? (
              <>
                <div className="card-head"><h3>✏️ Sửa case: {c.chu_de_vi_pham}</h3></div>
                <CaseForm
                  form={editForm} setForm={setEditForm} file={editFile} setFile={setEditFile}
                  existingFileName={c.file_name} onSubmit={(e) => saveEdit(e, c.id)}
                  onCancel={() => setEditingId(null)} saving={editSaving} error={editError}
                  submitLabel="💾 Lưu thay đổi" topics={topics} isEditing={true}
                />
              </>
            ) : (
              <div className="card-body" style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <span style={{ ...pillStyle, background: "#E8EFFC", color: "var(--blue-accent)" }}>{st.label}</span>{" "}
                    <strong style={{ fontSize: 14.5, color: "var(--navy-900)" }}>{c.chu_de_vi_pham}</strong>
                    {c.loai_vi_pham && <span style={{ fontSize: 12, color: "var(--text-600)" }}> · {c.loai_vi_pham}</span>}
                    <div style={{ fontSize: 12, color: "var(--text-600)", marginTop: 4 }}>
                      {(c.ma_shop || c.ten_shop) && <>Shop: <strong>{[c.ma_shop, c.ten_shop].filter(Boolean).join(" - ")}</strong> · </>}
                      {c.vung && <>Vùng: {c.vung} · </>}
                      {c.nhan_vien_vi_pham && <>NV vi phạm: <strong>{c.nhan_vien_vi_pham}</strong> · </>}
                      Giá trị: <strong>{fmtMoney(c.gia_tri_vi_pham)}</strong>
                      {c.sl_so_vi_pham !== null && c.sl_so_vi_pham !== undefined && <> · SL SO: {c.sl_so_vi_pham}</>}
                      {c.hinh_thuc_ky_luat && <> · Hình thức KL: <strong>{hinhThucKyLuatLabel(c.hinh_thuc_ky_luat)}</strong></>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {c.has_file && <button onClick={() => handleDownload(c)} className="fbtn">📥 Tải file</button>}
                    <button onClick={() => startEdit(c)} className="fbtn">Sửa</button>
                    <button onClick={() => handleDelete(c)} className="fbtn danger">Xóa</button>
                  </div>
                </div>
                {c.dien_giai_vi_pham && <p style={{ fontSize: 13, marginTop: 10, whiteSpace: "pre-line", color: "var(--text-900)" }}>{c.dien_giai_vi_pham}</p>}
                {c.nguoi_tao && <p style={{ fontSize: 11, color: "var(--text-400)", marginTop: 8 }}>Người tạo: {c.nguoi_tao}</p>}
              </div>
            )}
          </div>
        );
      })}
    </Layout>
  );
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-600)", display: "block", marginBottom: 5 };
const inputStyle = { width: "100%" };
const addBtnStyle = {
  padding: "9px 20px", borderRadius: 8, border: "none",
  background: "var(--navy-800)", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
};
const pillStyle = { display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 700 };
