import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import {
  getUser,
  lookupDeXuatShop, listDeXuatShops, createDeXuatShop, deleteDeXuatShop,
  listDeXuatKsnb, createDeXuatKsnb, deleteDeXuatKsnb, downloadDeXuatKiemKe,
} from "../lib/api";

const ALLOWED_ROLES = ["admin", "editor", "super_admin"];

function formatDateVn(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const EMPTY_SHOP_FORM = { ma_shop: "", ten_shop: "", vung: "", tinh: "", huyen: "", loai_shop: "", thang_kiem_ke: "", ghi_chu: "" };
const EMPTY_KSNB_FORM = { ten_ksnb: "", so_luong_shop: "", thang_kiem_ke: "", ghi_chu: "" };

function formatThangKiemKe(v) {
  if (!v) return "—";
  const [y, m] = v.split("-");
  return m && y ? `${m}/${y}` : v;
}

export default function DeXuatKiemKePage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);
  const [dlMsg, setDlMsg] = useState("");

  useEffect(() => {
    const user = getUser();
    if (!user || !ALLOWED_ROLES.includes(user.role)) {
      router.replace("/");
      return;
    }
    setChecked(true);
  }, []);

  async function handleDownload() {
    setDlBusy(true);
    setDlMsg("");
    try {
      await downloadDeXuatKiemKe();
    } catch (e) {
      setDlMsg("❌ " + e.message);
    } finally {
      setDlBusy(false);
    }
  }

  if (!checked) return null;

  return (
    <Layout crumb="Đề xuất kiểm kê">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1>Đề xuất kiểm kê</h1>
          <p>Đề xuất shop cần kiểm kê trực tiếp và KSNB đi kiểm kê trực tiếp.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <button className="upload-btn" disabled={dlBusy} onClick={handleDownload}>
            {dlBusy ? "Đang tải..." : "📥 Tải về data"}
          </button>
          {dlMsg && <div style={{ fontSize: 12, color: "var(--danger)" }}>{dlMsg}</div>}
        </div>
      </div>

      <div className="grid-2" style={{ gap: 18, alignItems: "start" }}>
        <ShopProposalPanel />
        <KsnbProposalPanel />
      </div>
    </Layout>
  );
}

function ShopProposalPanel() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_SHOP_FORM);
  const [lookupMsg, setLookupMsg] = useState("");
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function load() {
    listDeXuatShops().then(setRows).catch((err) => setError(err.message));
  }
  useEffect(load, []);

  // Gõ Mã shop HOẶC Tên shop đầy đủ rồi bấm Tab (onBlur) ở đúng ô đó là tự
  // tra cứu và điền các trường còn lại — cả 2 ô Mã shop/Tên shop đều kích
  // hoạt tra cứu, dùng chung 1 hàm.
  async function handleLookup(query) {
    const q = (query || "").trim();
    if (!q) return;
    setLooking(true);
    setLookupMsg("");
    try {
      const res = await lookupDeXuatShop(q);
      if (res.found) {
        setForm((f) => ({
          ...f,
          ma_shop: res.ma_shop || "", ten_shop: res.ten_shop || "",
          vung: res.vung || "", tinh: res.tinh || "", huyen: res.huyen || "", loai_shop: res.loai_shop || "",
        }));
        setLookupMsg("✅ Đã tìm thấy shop, tự điền thông tin bên dưới.");
      } else {
        setLookupMsg("⚠️ Không khớp shop nào trong hệ thống — anh tự nhập tay các trường bên dưới (có thể đề xuất shop mới).");
      }
    } catch (err) {
      setLookupMsg("❌ " + err.message);
    } finally {
      setLooking(false);
    }
  }

  function openForm() {
    setShowForm(true);
    setForm(EMPTY_SHOP_FORM);
    setLookupMsg("");
    setSaveError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.ten_shop.trim()) {
      setSaveError("Cần có Tên shop.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await createDeXuatShop({
        ma_shop: form.ma_shop, ten_shop: form.ten_shop, vung: form.vung,
        tinh: form.tinh, huyen: form.huyen, loai_shop: form.loai_shop,
        thang_kiem_ke: form.thang_kiem_ke, ghi_chu: form.ghi_chu,
      });
      setShowForm(false);
      load();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Xóa đề xuất shop này?")) return;
    try {
      await deleteDeXuatShop(id);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="card">
      <div className="card-head"><h3>🏪 Đề xuất shop kiểm kê trực tiếp</h3></div>
      <div className="card-body">
        {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{error}</div>}

        {!showForm && (
          <button className="upload-btn" onClick={openForm}>➕ Đề xuất shop kiểm kê trực tiếp</button>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 11.5, color: "var(--text-400)", marginBottom: 10 }}>
              Gõ Mã shop hoặc Tên shop đầy đủ rồi bấm Tab — nếu khớp data shop có sẵn sẽ tự điền các trường còn lại.
            </div>
            {looking && <div style={{ fontSize: 11.5, color: "var(--text-400)", marginBottom: 8 }}>Đang tra cứu...</div>}
            {lookupMsg && !looking && <div style={{ fontSize: 11.5, marginBottom: 8 }}>{lookupMsg}</div>}

            <div className="form-grid-2">
              <div className="field">
                <label className="flabel">Mã shop</label>
                <input
                  className="finput" style={{ width: "100%" }} autoFocus
                  value={form.ma_shop}
                  onChange={(e) => setForm({ ...form, ma_shop: e.target.value })}
                  onBlur={(e) => handleLookup(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="flabel">Tên shop *</label>
                <input
                  className="finput" style={{ width: "100%" }}
                  value={form.ten_shop}
                  onChange={(e) => setForm({ ...form, ten_shop: e.target.value })}
                  onBlur={(e) => handleLookup(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="flabel">Vùng</label>
                <input className="finput" style={{ width: "100%" }} value={form.vung} onChange={(e) => setForm({ ...form, vung: e.target.value })} />
              </div>
              <div className="field">
                <label className="flabel">Tỉnh</label>
                <input className="finput" style={{ width: "100%" }} value={form.tinh} onChange={(e) => setForm({ ...form, tinh: e.target.value })} />
              </div>
              <div className="field">
                <label className="flabel">Huyện</label>
                <input className="finput" style={{ width: "100%" }} value={form.huyen} onChange={(e) => setForm({ ...form, huyen: e.target.value })} />
              </div>
              <div className="field">
                <label className="flabel">Loại shop</label>
                <input className="finput" style={{ width: "100%" }} value={form.loai_shop} onChange={(e) => setForm({ ...form, loai_shop: e.target.value })} />
              </div>
              <div className="field">
                <label className="flabel">Tháng kiểm kê</label>
                <input type="month" className="finput" style={{ width: "100%" }} value={form.thang_kiem_ke} onChange={(e) => setForm({ ...form, thang_kiem_ke: e.target.value })} />
              </div>
            </div>

            <div className="field" style={{ marginTop: 10 }}>
              <label className="flabel">Ghi chú (không bắt buộc)</label>
              <textarea className="finput" rows={2} style={{ width: "100%", resize: "vertical" }} value={form.ghi_chu} onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} />
            </div>

            {saveError && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{saveError}</div>}

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button type="submit" className="login-btn" style={{ width: "auto", padding: "9px 20px" }} disabled={saving}>
                {saving ? "Đang lưu..." : "Thêm đề xuất"}
              </button>
              <button type="button" className="fbtn" onClick={() => setShowForm(false)}>Hủy</button>
            </div>
          </form>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={thStyle}>Mã shop</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Tên shop</th>
                <th style={thStyle}>Vùng</th>
                <th style={thStyle}>Tháng kiểm kê</th>
                <th style={thStyle}>Người đề xuất</th>
                <th style={thStyle}>Ngày cập nhật</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={tdStyle}>{r.ma_shop || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "left" }}>
                    <div style={{ fontWeight: 600 }}>{r.ten_shop}</div>
                    {(r.tinh || r.huyen) && <div style={{ fontSize: 10.5, color: "var(--text-400)" }}>{[r.huyen, r.tinh].filter(Boolean).join(", ")}</div>}
                    {r.ghi_chu && <div style={{ fontSize: 10.5, color: "var(--text-400)", marginTop: 2 }}>📝 {r.ghi_chu}</div>}
                  </td>
                  <td style={tdStyle}>{r.vung || "—"}</td>
                  <td style={tdStyle}>{formatThangKiemKe(r.thang_kiem_ke)}</td>
                  <td style={tdStyle}>{r.de_xuat_boi || "—"}</td>
                  <td style={tdStyle}>{formatDateVn(r.updated_at)}</td>
                  <td style={tdStyle}><button className="fbtn danger" onClick={() => handleDelete(r.id)}>Xóa</button></td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={7} style={{ color: "var(--text-400)", padding: 18 }}>Chưa có đề xuất shop nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KsnbProposalPanel() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_KSNB_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function load() {
    listDeXuatKsnb().then(setRows).catch((err) => setError(err.message));
  }
  useEffect(load, []);

  function openForm() {
    setShowForm(true);
    setForm(EMPTY_KSNB_FORM);
    setSaveError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const soLuong = parseInt(form.so_luong_shop, 10);
    if (!form.ten_ksnb.trim()) {
      setSaveError("Cần nhập Tên KSNB.");
      return;
    }
    if (!soLuong || soLuong <= 0) {
      setSaveError("Số lượng shop cần kiểm phải lớn hơn 0.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await createDeXuatKsnb({ ten_ksnb: form.ten_ksnb, so_luong_shop: soLuong, thang_kiem_ke: form.thang_kiem_ke, ghi_chu: form.ghi_chu });
      setShowForm(false);
      load();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Xóa đề xuất KSNB này?")) return;
    try {
      await deleteDeXuatKsnb(id);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="card">
      <div className="card-head"><h3>🧑‍💼 Đề xuất KSNB kiểm kê trực tiếp</h3></div>
      <div className="card-body">
        {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{error}</div>}

        {!showForm && (
          <button className="upload-btn" onClick={openForm}>➕ Đề xuất KSNB kiểm kê trực tiếp</button>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
            <div className="form-grid-2">
              <div className="field">
                <label className="flabel">Tên KSNB *</label>
                <input className="finput" style={{ width: "100%" }} autoFocus value={form.ten_ksnb} onChange={(e) => setForm({ ...form, ten_ksnb: e.target.value })} />
              </div>
              <div className="field">
                <label className="flabel">Số lượng shop cần kiểm *</label>
                <input type="number" min={1} className="finput" style={{ width: "100%" }} value={form.so_luong_shop} onChange={(e) => setForm({ ...form, so_luong_shop: e.target.value })} />
              </div>
              <div className="field">
                <label className="flabel">Tháng kiểm kê</label>
                <input type="month" className="finput" style={{ width: "100%" }} value={form.thang_kiem_ke} onChange={(e) => setForm({ ...form, thang_kiem_ke: e.target.value })} />
              </div>
            </div>

            <div className="field" style={{ marginTop: 10 }}>
              <label className="flabel">Ghi chú (không bắt buộc)</label>
              <textarea className="finput" rows={2} style={{ width: "100%", resize: "vertical" }} value={form.ghi_chu} onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} />
            </div>

            {saveError && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{saveError}</div>}

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button type="submit" className="login-btn" style={{ width: "auto", padding: "9px 20px" }} disabled={saving}>
                {saving ? "Đang lưu..." : "Thêm đề xuất"}
              </button>
              <button type="button" className="fbtn" onClick={() => setShowForm(false)}>Hủy</button>
            </div>
          </form>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "left" }}>Tên KSNB</th>
                <th style={thStyle}>Số lượng shop</th>
                <th style={thStyle}>Tháng kiểm kê</th>
                <th style={thStyle}>Người đề xuất</th>
                <th style={thStyle}>Ngày cập nhật</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...tdStyle, textAlign: "left" }}>
                    <div style={{ fontWeight: 600 }}>{r.ten_ksnb}</div>
                    {r.ghi_chu && <div style={{ fontSize: 10.5, color: "var(--text-400)", marginTop: 2 }}>📝 {r.ghi_chu}</div>}
                  </td>
                  <td className="num" style={{ ...tdStyle, fontWeight: 700 }}>{r.so_luong_shop}</td>
                  <td style={tdStyle}>{formatThangKiemKe(r.thang_kiem_ke)}</td>
                  <td style={tdStyle}>{r.de_xuat_boi || "—"}</td>
                  <td style={tdStyle}>{formatDateVn(r.updated_at)}</td>
                  <td style={tdStyle}><button className="fbtn danger" onClick={() => handleDelete(r.id)}>Xóa</button></td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={6} style={{ color: "var(--text-400)", padding: 18 }}>Chưa có đề xuất KSNB nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const thStyle = { fontSize: 10.5, padding: "8px 10px", whiteSpace: "normal", lineHeight: 1.3 };
const tdStyle = { fontSize: 11.5, padding: "8px 10px" };
