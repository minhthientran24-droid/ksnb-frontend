import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import {
  getUser, listChuDeJobsV2, createChuDeJobV2, updateChuDeJobV2, deleteChuDeJobV2,
  claimChuDeJobV2, unclaimChuDeJobV2, addChuDeJobV2Supporters, listKsnbForChuDeV2,
  completeChuDeJobV2, downloadChuDeJobV2File, downloadChuDeJobV2ResultFile,
  bulkUploadChuDeJobsV2, downloadChuDeJobV2BulkUploadTemplate, lookupChuDeShop,
  getChuDeJobV2Months, exportChuDeJobsV2,
  listChuDeTopicsV2, createChuDeTopicV2, deleteChuDeTopicV2, getChuDeTopicV2Stats,
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

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Mặc định chọn tháng hiện tại (chốt 06/09) — nhưng danh sách `months` chỉ
// liệt kê tháng nào ĐÃ có job, nên tháng hiện tại (chưa có job) sẽ không
// nằm trong đó — nếu không tự thêm option riêng, <select> hiện sai (rơi về
// option đầu tiên "Tất cả các tháng" dù state vẫn đúng), gây hiểu nhầm.
function MonthSelect({ thang, setThang, months }) {
  const hasCurrent = thang && months.includes(thang);
  return (
    <select className="month-select" value={thang} onChange={(e) => setThang(e.target.value)}>
      <option value="">Tất cả các tháng</option>
      {thang && !hasCurrent && <option value={thang}>{thang}</option>}
      {months.map((m) => <option key={m} value={m}>{m}</option>)}
    </select>
  );
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

// ---------- Popup "Chọn Tên chủ đề" (chốt 06/09) — liệt kê mọi tên trong
// combo box kèm số case theo 3 tình trạng, tháng chọn ở góc trên-phải
// (mặc định tháng hiện tại, dùng CHUNG state `thang` với bảng chính nên
// đổi tháng ở đây lọc luôn bảng chính). Bấm 1 dòng để lọc theo đúng tên đó,
// bấm "Tất cả chủ đề" để bỏ lọc. ----------
function TopicPickerModal({ stats, loading, thang, setThang, months, selectedTopic, onSelect, onClose }) {
  const grandTotal = stats.reduce(
    (acc, s) => ({
      "Chưa nhận": acc["Chưa nhận"] + s["Chưa nhận"],
      "Đang xử lý": acc["Đang xử lý"] + s["Đang xử lý"],
      "Hoàn tất": acc["Hoàn tất"] + s["Hoàn tất"],
      total: acc.total + s.total,
    }),
    { "Chưa nhận": 0, "Đang xử lý": 0, "Hoàn tất": 0, total: 0 }
  );

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: 620 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>🏷️ Chọn Tên chủ đề</h3>
          <MonthSelect thang={thang} setThang={setThang} months={months} />
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: "var(--text-400)", padding: "20px 0", textAlign: "center" }}>Đang tải thống kê...</div>
        ) : (
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            <table style={{ fontSize: 12.5, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Tên chủ đề</th>
                  <th>Chưa nhận</th>
                  <th>Đang xử lý</th>
                  <th>Hoàn tất</th>
                  <th>Tổng</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  onClick={() => onSelect("")}
                  style={{ cursor: "pointer", fontWeight: 700, background: !selectedTopic ? "#E8EFFC" : undefined }}
                >
                  <td style={{ textAlign: "left" }}>🔷 Tất cả chủ đề</td>
                  <td>{grandTotal["Chưa nhận"]}</td>
                  <td>{grandTotal["Đang xử lý"]}</td>
                  <td>{grandTotal["Hoàn tất"]}</td>
                  <td>{grandTotal.total}</td>
                </tr>
                {stats.map((s) => (
                  <tr
                    key={s.ten_chu_de}
                    onClick={() => onSelect(s.ten_chu_de)}
                    style={{ cursor: "pointer", background: selectedTopic === s.ten_chu_de ? "#E8EFFC" : undefined }}
                  >
                    <td style={{ textAlign: "left" }}>{s.ten_chu_de}</td>
                    <td>{s["Chưa nhận"]}</td>
                    <td>{s["Đang xử lý"]}</td>
                    <td>{s["Hoàn tất"]}</td>
                    <td style={{ fontWeight: 700 }}>{s.total}</td>
                  </tr>
                ))}
                {stats.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-400)", padding: 16 }}>Chưa có Tên chủ đề nào trong danh sách.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 16, textAlign: "right" }}>
          <button onClick={onClose} style={deleteBtnStyle}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Popup "Quản lý chủ đề" (chốt 06/09) — CHỈ super_admin gọi
// được (nút mở popup này cũng chỉ super_admin thấy, xem BulkUploadCard) —
// thêm/xóa tên trong combo box "Tên chủ đề". Xóa 1 tên KHÔNG ảnh hưởng job
// cũ đã dùng tên đó, chỉ không còn chọn được cho job mới. ----------
function TopicManagementModal({ topics, onClose, onChanged }) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      await createChuDeTopicV2(newName.trim());
      setNewName("");
      onChanged();
    } catch (err) {
      setMsg("❌ " + (err.message || "Thêm thất bại"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(topic) {
    if (!confirm(`Xóa tên chủ đề "${topic.ten_chu_de}" khỏi danh sách? (Job cũ đã dùng tên này không bị ảnh hưởng)`)) return;
    setBusy(true);
    setMsg("");
    try {
      await deleteChuDeTopicV2(topic.id);
      onChanged();
    } catch (err) {
      setMsg("❌ " + (err.message || "Xóa thất bại"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>🏷️ Quản lý chủ đề</h3>
        <p style={{ fontSize: 12.5, color: "var(--text-600)", marginBottom: 14 }}>
          Danh sách "Tên chủ đề" cho phép chọn khi đăng/sửa chủ đề hoặc upload Excel — chỉ super_admin sửa được.
        </p>
        <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input
            style={{ ...inputStyle, flex: 1 }} placeholder="Nhập tên chủ đề mới..."
            value={newName} onChange={(e) => setNewName(e.target.value)} disabled={busy}
          />
          <button type="submit" className="login-btn" style={{ width: "auto", padding: "9px 18px", margin: 0 }} disabled={busy || !newName.trim()}>
            + Thêm
          </button>
        </form>
        {msg && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{msg}</div>}
        <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
          {topics.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--text-400)", padding: 14, textAlign: "center" }}>Chưa có tên chủ đề nào.</div>
          )}
          {topics.map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <span>{t.ten_chu_de}</span>
              <button onClick={() => handleDelete(t)} disabled={busy} style={deleteBtnStyle}>🗑️ Xóa</button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <button onClick={onClose} style={deleteBtnStyle}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Form đăng / sửa job ----------
function JobFormCard({ editingJob, onDone, onCancel, topics }) {
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
      setError("Cần chọn Tên chủ đề");
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
          <select style={inputStyle} value={form.ten_chu_de} onChange={(e) => setForm({ ...form, ten_chu_de: e.target.value })}>
            <option value="">— Chọn tên chủ đề —</option>
            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            {/* Job đang sửa dùng tên đã bị xóa khỏi combo box — vẫn hiện thêm
                để không vô tình đổi mất tên cũ khi lưu (chỉ xảy ra lúc Sửa). */}
            {editingJob && form.ten_chu_de && !topics.includes(form.ten_chu_de) && (
              <option value={form.ten_chu_de}>{form.ten_chu_de} (đã bị xóa khỏi danh sách)</option>
            )}
          </select>
          {topics.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>
              Chưa có tên chủ đề nào — nhờ super_admin vào &quot;Quản lý chủ đề&quot; thêm trước.
            </div>
          )}
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
function BulkUploadCard({ onDone, onOpenForm, thang, setThang, months, exporting, exportError, onExport, isSuperAdmin, onOpenTopicMgmt }) {
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
      let msg = `✅ Đã thêm ${r.count} task.`;
      if (r.skipped_count) {
        msg += ` ⚠️ Bỏ qua ${r.skipped_count} dòng có Tên Chủ Đề không có trong danh sách: ${r.invalid_topic_names.join(", ")} — sửa lại tên rồi upload lại các dòng đó.`;
      }
      setResultMsg(msg);
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
          {isSuperAdmin && (
            <button className="fbtn" onClick={onOpenTopicMgmt} style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              🏷️ Quản lý chủ đề
            </button>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
            <MonthSelect thang={thang} setThang={setThang} months={months} />
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
  // Mặc định tháng hiện tại (chốt 06/09) — dùng CHUNG 1 bộ lọc thang cho cả
  // bảng chính LẪN popup "Chọn Tên chủ đề" (đồng bộ, tránh xem nhầm 2 tháng
  // khác nhau cùng lúc).
  const [thang, setThang] = useState(currentMonthStr());
  const [months, setMonths] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const sort = useSort();

  // Combo box "Tên chủ đề" (chốt 06/09) — topics = [{id, ten_chu_de}] toàn
  // bộ danh sách; selectedTopic = "" nghĩa là xem tất cả (mặc định).
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [topicPickerOpen, setTopicPickerOpen] = useState(false);
  const [topicStats, setTopicStats] = useState([]);
  const [topicStatsLoading, setTopicStatsLoading] = useState(false);
  const [topicMgmtOpen, setTopicMgmtOpen] = useState(false);
  const isSuperAdmin = me?.role === "super_admin";
  const topicNames = topics.map((t) => t.ten_chu_de);

  useEffect(() => {
    const user = getUser();
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      window.location.replace("/");
      return;
    }
    setMe(user);
    setChecked(true);
  }, []);

  function loadTopics() {
    listChuDeTopicsV2().then(setTopics).catch(() => {});
  }

  function load(thangFilter = thang, topicFilter = selectedTopic) {
    setLoading(true);
    listChuDeJobsV2(thangFilter || undefined, topicFilter || undefined)
      .then(setJobs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!checked) return;
    getChuDeJobV2Months().then(setMonths).catch(() => {});
    loadTopics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked]);

  useEffect(() => {
    if (!checked) return;
    load(thang, selectedTopic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, thang, selectedTopic]);

  // Popup "Chọn Tên chủ đề" — tự tải lại thống kê mỗi khi mở popup hoặc đổi
  // tháng (o góc trên-phải popup, dùng chung state `thang` với bảng chính).
  useEffect(() => {
    if (!topicPickerOpen) return;
    setTopicStatsLoading(true);
    getChuDeTopicV2Stats(thang || undefined)
      .then(setTopicStats)
      .catch(() => setTopicStats([]))
      .finally(() => setTopicStatsLoading(false));
  }, [topicPickerOpen, thang]);

  async function handleExport() {
    setExporting(true);
    setExportError("");
    try {
      await exportChuDeJobsV2(thang || undefined, selectedTopic || undefined);
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
    vung: (j) => j.vung || "",
    ma_shop: (j) => j.ma_shop || "",
    ten_shop: (j) => j.ten_shop || "",
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
            <MonthSelect thang={thang} setThang={setThang} months={months} />
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
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <button className="fbtn" onClick={() => setTopicPickerOpen(true)} style={{ background: "var(--surface)", border: "1px solid var(--border)", fontWeight: 700 }}>
            🏷️ {selectedTopic || "Tất cả chủ đề"}
          </button>
          {selectedTopic && (
            <button className="fbtn" onClick={() => setSelectedTopic("")}>✕ Bỏ lọc</button>
          )}
        </div>
      )}

      {!showForm && (
        <BulkUploadCard
          onDone={load} onOpenForm={() => setShowForm(true)}
          thang={thang} setThang={setThang} months={months}
          exporting={exporting} exportError={exportError} onExport={handleExport}
          isSuperAdmin={isSuperAdmin} onOpenTopicMgmt={() => setTopicMgmtOpen(true)}
        />
      )}

      {showForm && (
        <JobFormCard editingJob={editingJob} onDone={afterSave} onCancel={closeForm} topics={topicNames} />
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
                  <SortTh label="Vùng" sortKey="vung" sortState={sort.state} onSort={sort.onSort} />
                  <SortTh label="Mã Shop" sortKey="ma_shop" sortState={sort.state} onSort={sort.onSort} />
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
                      <td>{job.vung || "-"}</td>
                      <td>{job.ma_shop || "-"}</td>
                      <td style={{ textAlign: "left" }}>{job.ten_shop || "-"}</td>
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
      {topicPickerOpen && (
        <TopicPickerModal
          stats={topicStats} loading={topicStatsLoading}
          thang={thang} setThang={setThang} months={months}
          selectedTopic={selectedTopic}
          onSelect={(name) => { setSelectedTopic(name); setTopicPickerOpen(false); }}
          onClose={() => setTopicPickerOpen(false)}
        />
      )}
      {topicMgmtOpen && isSuperAdmin && (
        <TopicManagementModal topics={topics} onClose={() => setTopicMgmtOpen(false)} onChanged={loadTopics} />
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
