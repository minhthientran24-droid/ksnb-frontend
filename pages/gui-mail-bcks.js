import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import SignatureEditor, { GREETING_FONT_SIZES } from "../components/SignatureEditor";
import {
  getUser,
  previewGuiMailBcks, sendGuiMailBcks, getMySmtpCredential, saveMySmtpCredential,
} from "../lib/api";

// "Dữ liệu tham chiếu (Admin)" (ShopInfo/CC theo vùng) đã dời sang menu
// "Tải lên dữ liệu" (chốt 27/08 lần 19) — xem components/ReferenceFilesPanel.js.

const fieldBoxStyle = {
  border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 12,
};
const fieldLabelStyle = { fontSize: 11.5, fontWeight: 700, color: "var(--text-600)", display: "block", marginBottom: 6 };
const textInputStyle = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px",
  fontSize: 12.5, fontFamily: "inherit", boxSizing: "border-box",
};

function SmtpCredentialPanel({ onConfigured }) {
  const [status, setStatus] = useState(null); // { configured, sender_email }
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [senderEmail, setSenderEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  function load() {
    setLoading(true);
    getMySmtpCredential()
      .then((s) => {
        setStatus(s);
        setEditing(!s.configured); // chưa cấu hình -> mở sẵn form để nhập lần đầu
        setSenderEmail(s.sender_email || "");
        onConfigured && onConfigured(s);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSavedMsg("");
    try {
      const s = await saveMySmtpCredential(senderEmail, appPassword);
      setStatus(s);
      setEditing(false);
      setAppPassword("");
      setSavedMsg("✅ Đã lưu.");
      onConfigured && onConfigured(s);
    } catch (err) {
      setError(err.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>🔐 Cấu hình email gửi (cá nhân)</h3>
        <span className="note">Email + mật khẩu ứng dụng là bảo mật riêng của anh/chị — chỉ dùng cho mail do chính anh/chị gửi</span>
      </div>
      <div className="card-body">
        <p style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 14, lineHeight: 1.6 }}>
          Nhập email dùng để gửi báo cáo và <strong>mật khẩu ứng dụng</strong> (App Password) của email đó — nhập 1
          lần rồi dùng cho các lần gửi sau, không phải mật khẩu đăng nhập email thường. Có thay đổi thì bấm "Cập
          nhật lại" để nhập lại từ đầu.
        </p>

        {loading && <div style={{ fontSize: 12.5, color: "var(--text-600)" }}>Đang tải...</div>}

        {!loading && !editing && status?.configured && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
            background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px",
          }}>
            <span style={{ fontSize: 12.5 }}>✅ Đang dùng email gửi: <strong>{status.sender_email}</strong></span>
            <button className="fbtn" onClick={() => { setEditing(true); setAppPassword(""); setSavedMsg(""); }}>
              Cập nhật lại
            </button>
          </div>
        )}

        {!loading && editing && (
          <>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ flex: "1 1 220px", minWidth: 200 }}>
                <label style={fieldLabelStyle}>Email gửi đi</label>
                <input
                  style={textInputStyle} type="email" value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)} placeholder="ten.nv@fpt.com"
                />
              </div>
              <div style={{ flex: "1 1 220px", minWidth: 200 }}>
                <label style={fieldLabelStyle}>Mật khẩu ứng dụng (App Password)</label>
                <input
                  style={textInputStyle} type="password" value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)} placeholder="•••• •••• •••• ••••"
                />
              </div>
              <button
                className="login-btn" style={{ width: "auto", padding: "9px 22px", flex: "0 0 auto" }}
                onClick={handleSave} disabled={saving || !senderEmail.trim() || !appPassword.trim()}
              >
                {saving ? "Đang lưu..." : "Lưu"}
              </button>
              {status?.configured && (
                <button className="fbtn" style={{ flex: "0 0 auto" }} onClick={() => { setEditing(false); setError(""); }}>
                  Hủy
                </button>
              )}
            </div>

            {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>{error}</div>}
          </>
        )}

        {!loading && !editing && savedMsg && (
          <div style={{ fontSize: 12, color: "#4C9A2A", marginTop: 10 }}>{savedMsg}</div>
        )}
      </div>
    </div>
  );
}

function SelfServicePanel({ smtpConfigured }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [preview, setPreview] = useState(null); // { ma_shop, ten_shop, report_type, warnings, attachment_name, summary_image_base64 } từ API
  const [toText, setToText] = useState("");
  const [ccText, setCcText] = useState("");
  const [subject, setSubject] = useState("");
  const [greeting, setGreeting] = useState("");
  const [signature, setSignature] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sent, setSent] = useState(false);

  async function handlePickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(null);
    setPreviewError("");
    setSendError("");
    setSent(false);
    setPreviewing(true);
    try {
      const p = await previewGuiMailBcks(f);
      setPreview(p);
      setToText(p.to.join(", "));
      setCcText(p.cc.join(", "));
      setSubject(p.subject);
      setGreeting(p.greeting);
      setSignature(p.signature);
    } catch (err) {
      setPreviewError(err.message || "Không đọc được file");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSend() {
    if (!file) return;
    setSending(true);
    setSendError("");
    try {
      await sendGuiMailBcks(file, { to: toText, cc: ccText, subject, greeting, signature });
      setSent(true);
    } catch (err) {
      setSendError(err.message || "Gửi mail thất bại");
    } finally {
      setSending(false);
    }
  }

  function resetAll() {
    setFile(null);
    setPreview(null);
    setPreviewError("");
    setSendError("");
    setSent(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>📧 Gửi báo cáo BCKS</h3>
        <span className="note">Tự phục vụ — đính kèm file báo cáo đã hoàn chỉnh, xem trước rồi gửi</span>
      </div>
      <div className="card-body">
        <p style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 16, lineHeight: 1.6 }}>
          Đính kèm file báo cáo kiểm soát <strong>đã hoàn chỉnh</strong> (xuất ra từ mục Hỗ Trợ Kiểm Kê &gt; Tổng hợp
          Báo cáo Kiểm Soát Sau Kiểm Kê — đủ 3 sheet: Tổng hợp BCKS, Kiểm Kê Hàng Hóa, Kiểm kê Thanh Lý). Hệ thống
          không xử lý lại file này — chỉ đọc tên shop để tra người nhận, anh/chị xem trước nội dung mail rồi gửi.
        </p>

        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handlePickFile} />
        <button className="upload-btn" onClick={() => fileInputRef.current?.click()} disabled={previewing}>
          {file ? "Đổi file khác" : "📤 Chọn file báo cáo kiểm soát"}
        </button>
        <div style={{ fontSize: 11, color: file ? "#4C9A2A" : "var(--text-400)", marginTop: 8, marginBottom: 16 }}>
          {file ? `✅ ${file.name}` : "Chưa chọn file"}
        </div>

        {previewing && (
          <div style={{ fontSize: 12.5, color: "var(--text-600)", display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span className="tiny-spinner" />
            Đang đọc file để xác định shop...
          </div>
        )}

        {previewError && !previewing && (
          <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 14 }}>{previewError}</div>
        )}

        {preview && !previewing && !sent && (
          <>
            <div style={{
              background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
              padding: "10px 14px", marginBottom: 14, fontSize: 12.5,
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            }}>
              <span><strong>Shop:</strong> {preview.ma_shop} - {preview.ten_shop}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                ...(preview.report_type === "vaccine"
                  ? { background: "#E6F4FF", color: "#0B5FA5", border: "1px solid #A9D6F5" }
                  : { background: "#EAF6E5", color: "#3E7A2A", border: "1px solid #CFE8C4" }),
              }}>
                {preview.report_type === "vaccine" ? "💉 Shop Vaccine" : "🏪 Shop Long Châu"}
              </span>
            </div>

            {preview.warnings?.length > 0 && (
              <div style={{
                background: "#FFF7E6", border: "1px solid #F5C542", borderRadius: 8,
                padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#8A6200", lineHeight: 1.6,
              }}>
                {preview.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
                <div style={{ marginTop: 4 }}>Anh/chị có thể tự điền/sửa người nhận bên dưới trước khi gửi.</div>
              </div>
            )}

            <div style={fieldBoxStyle}>
              <label style={fieldLabelStyle}>Người nhận (To) — cách nhau bởi dấu phẩy</label>
              <input style={textInputStyle} value={toText} onChange={(e) => setToText(e.target.value)} placeholder="asm.vung1@fptlongchau.vn" />
            </div>
            <div style={fieldBoxStyle}>
              <label style={fieldLabelStyle}>CC — cách nhau bởi dấu phẩy</label>
              <input style={textInputStyle} value={ccText} onChange={(e) => setCcText(e.target.value)} placeholder="(tuỳ chọn)" />
            </div>
            <div style={fieldBoxStyle}>
              <label style={fieldLabelStyle}>Tiêu đề mail</label>
              <input
                style={{ ...textInputStyle, ...(preview?.dang_kiem_not_found ? { borderColor: "var(--danger)" } : {}) }}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
              {preview?.dang_kiem_not_found && (
                <div style={{ fontSize: 11.5, color: "var(--danger)", marginTop: 6, fontWeight: 600 }}>
                  ⚠️ Không tìm thấy Mã Shop {preview.ma_shop} trong danh sách "Đang kiểm" (Theo dõi kiểm kê) — Hình
                  thức + Ngày Kiểm đang để trống trong tiêu đề, anh/chị tự điền hoặc kiểm tra lại danh sách trước
                  khi gửi.
                </div>
              )}
            </div>
            <div style={fieldBoxStyle}>
              <label style={fieldLabelStyle}>Nội dung mail</label>
              <SignatureEditor value={greeting} onChange={setGreeting} minHeight={90} fontSizes={GREETING_FONT_SIZES} />
            </div>

            <div style={{ ...fieldBoxStyle, background: "var(--bg)" }}>
              <label style={fieldLabelStyle}>Ảnh tóm tắt Tổng hợp BCKS (tự động chèn vào mail, trước chữ ký)</label>
              {preview.summary_image_base64 ? (
                <img
                  src={`data:image/png;base64,${preview.summary_image_base64}`}
                  alt="Tổng hợp BCKS"
                  style={{ maxWidth: "100%", border: "1px solid var(--border)", borderRadius: 4 }}
                />
              ) : (
                <div style={{ fontSize: 11.5, color: "var(--text-400)" }}>Không cắt được ảnh từ file này.</div>
              )}
            </div>

            <div style={fieldBoxStyle}>
              <label style={fieldLabelStyle}>Chữ ký</label>
              <SignatureEditor value={signature} onChange={setSignature} minHeight={70} />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-400)", marginBottom: 16 }}>
              📎 Đính kèm: {preview.attachment_name}
            </div>

            {!smtpConfigured && (
              <div style={{ fontSize: 12.5, color: "#8A6200", marginBottom: 14 }}>
                ⚠️ Anh/chị chưa cấu hình email gửi cá nhân ở mục phía trên — cấu hình xong mới gửi được.
              </div>
            )}
            {sendError && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 14 }}>{sendError}</div>}

            <button
              className="login-btn"
              style={{ width: "auto", padding: "10px 24px" }}
              onClick={handleSend}
              disabled={sending || !toText.trim() || !smtpConfigured}
            >
              {sending ? "Đang gửi..." : "Gửi mail"}
            </button>
          </>
        )}

        {sent && (
          <div style={{
            background: "#F0FFF4", border: "1px solid #4C9A2A", borderRadius: 8,
            padding: "12px 14px", fontSize: 12.5, color: "#3E7A2A", display: "flex",
            alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          }}>
            <span>✅ Đã gửi mail báo cáo shop {preview?.ma_shop} - {preview?.ten_shop}.</span>
            <button className="fbtn" onClick={resetAll}>Gửi báo cáo khác</button>
          </div>
        )}

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
  const [smtpConfigured, setSmtpConfigured] = useState(false);

  return (
    <Layout crumb="Gửi mail BCKS">
      <div className="page-head">
        <h1>Gửi mail BCKS</h1>
      </div>

      <div style={{ marginBottom: 14 }}>
        <SmtpCredentialPanel onConfigured={(s) => setSmtpConfigured(s.configured)} />
      </div>

      <SelfServicePanel smtpConfigured={smtpConfigured} />
    </Layout>
  );
}
