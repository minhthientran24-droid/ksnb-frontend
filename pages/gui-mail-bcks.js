import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import {
  getUser, getKiemKeThanhLyReferenceFiles, uploadKiemKeThanhLyReferenceFile,
} from "../lib/api";

// 6 file tham chiếu riêng cho "Gửi mail BCKS" — 2 mục đầu dùng chung ổ lưu
// với "Hỗ Trợ Kiểm Kê" (cùng key backend), 4 mục sau là mới.
const REFERENCE_ITEMS = [
  { key: "danh_sach_nhan_vien", label: "Danh sách nhân viên" },
  { key: "gia_ban", label: "Giá bán" },
  { key: "dmsp_cat_lieu", label: "DM sản phẩm cắt liều" },
  { key: "shopinfo", label: "ShopInfo (email ASM + Vùng)" },
  { key: "cc_by_vung", label: "CC theo vùng" },
  { key: "kiemke_allshop", label: "Xử lý kiểm kê AllShop (đợt hiện tại)" },
];

function ReferenceFilesPanel() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [uploadingKey, setUploadingKey] = useState(null);
  const fileInputRefs = useRef({});

  function load() {
    getKiemKeThanhLyReferenceFiles().then(setStatus).catch((err) => setError(err.message));
  }
  useEffect(load, []);

  async function handleUpload(key, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingKey(key);
    setError("");
    try {
      const updated = await uploadKiemKeThanhLyReferenceFile(key, file);
      setStatus(updated);
    } catch (err) {
      setError(err.message || "Upload thất bại");
    } finally {
      setUploadingKey(null);
      if (fileInputRefs.current[key]) fileInputRefs.current[key].value = "";
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>⚙️ Dữ liệu tham chiếu (Admin)</h3>
        <span className="note">Cập nhật ở đây — mọi NV KSNB dùng chung khi gửi mail báo cáo</span>
      </div>
      <div className="card-body">
        {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
          {REFERENCE_ITEMS.map((item) => {
            const info = status?.[item.key];
            const uploading = uploadingKey === item.key;
            return (
              <div key={item.key} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--navy-900)", marginBottom: 6 }}>{item.label}</div>
                {info?.uploaded ? (
                  <div style={{ fontSize: 11, color: "#4C9A2A", marginBottom: 8 }}>
                    ✅ Đã có — cập nhật {new Date(info.updated_at).toLocaleString("vi-VN")}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--text-400)", marginBottom: 8 }}>Chưa có file</div>
                )}
                <input
                  ref={(el) => (fileInputRefs.current[item.key] = el)}
                  type="file"
                  style={{ display: "none" }}
                  onChange={(e) => handleUpload(item.key, e)}
                />
                <button className="fbtn" disabled={uploading} onClick={() => fileInputRefs.current[item.key]?.click()}>
                  {uploading ? "Đang tải lên..." : info?.uploaded ? "Thay file mới" : "Tải file lên"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MailLogPanel() {
  return (
    <div className="card">
      <div className="card-head">
        <h3>📜 Nhật ký gửi mail BCKS</h3>
        <span className="note">Toàn hệ thống — Admin chỉ xem lại, không gửi thay</span>
      </div>
      <div className="card-body">
        <div className="placeholder-box">
          Chức năng xử lý &amp; gửi mail đang được hoàn thiện — nhật ký sẽ hiện ở đây sau khi có shop đầu tiên được gửi.
        </div>
      </div>
    </div>
  );
}

function comingSoon() {
  alert("Tính năng đang được hoàn thiện, sẽ sớm ra mắt.");
}

function SelfServicePanel() {
  return (
    <div className="card">
      <div className="card-head">
        <h3>📧 Gửi báo cáo BCKS — shop của tôi</h3>
        <span className="note">Tự phục vụ — chỉ hiện shop bạn phụ trách kiểm kê</span>
      </div>
      <div className="card-body">
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
          padding: "10px 14px", marginBottom: 16, fontSize: 12.5,
        }}>
          <label style={{ fontWeight: 700, color: "var(--text-600)" }}>Shop</label>
          <select className="finput" disabled style={{ minWidth: 280, opacity: 0.6 }}>
            <option>Đang hoàn thiện — chưa lấy được danh sách shop bạn phụ trách</option>
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <div>
            <label className="flabel" style={{ display: "block", marginBottom: 6 }}>File template TTTC của shop</label>
            <button className="fbtn" onClick={comingSoon} style={{ width: "100%" }}>📤 Chọn file TTTC</button>
          </div>
          <div>
            <label className="flabel" style={{ display: "block", marginBottom: 6 }}>File DSTL Nhà thuốc của shop</label>
            <button className="fbtn" onClick={comingSoon} style={{ width: "100%" }}>📤 Chọn file DSTL</button>
          </div>
        </div>

        <div style={{ fontSize: 11, color: "var(--text-400)", marginBottom: 14, lineHeight: 1.6 }}>
          Sau khi chọn đủ 2 file, hệ thống sẽ điền báo cáo, hiện trước người nhận (ASM vùng + quản lý shop),
          rồi gửi mail — mỗi lần 1 shop, không cần chờ Admin xử lý giúp.
        </div>

        <button
          className="login-btn"
          style={{ width: "auto", padding: "10px 24px" }}
          onClick={comingSoon}
        >
          Xử lý &amp; gửi mail
        </button>

        <div style={{ borderTop: "1px solid var(--border)", margin: "20px 0 14px" }} />

        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-900)", marginBottom: 10 }}>
          Lịch sử gửi mail của tôi
        </div>
        <div className="placeholder-box">Chưa có báo cáo nào được gửi.</div>
      </div>
    </div>
  );
}

export default function GuiMailBcksPage() {
  const me = getUser();
  const isAdmin = ["admin", "super_admin"].includes(me?.role);

  return (
    <Layout crumb="Gửi mail BCKS">
      <div className="page-head">
        <h1>Gửi mail BCKS</h1>
        <p>
          Điền dữ liệu kiểm kê vào file Báo Cáo Kiểm Soát TTTC theo từng shop, tính lại công thức, rồi gửi mail
          thẳng cho quản lý vùng (ASM) và quản lý shop — không cần thao tác tay qua Excel + Outlook.
        </p>
      </div>

      {isAdmin && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 14 }}>
          <ReferenceFilesPanel />
          <MailLogPanel />
        </div>
      )}

      <SelfServicePanel />
    </Layout>
  );
}
