import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { getMailDigestStatus, testMailDigest, getMailDigestToday, runMailDigest } from "../lib/api";

// Menu "Tổng hợp mail AI" (chốt 06/11) — dùng email + mật khẩu ứng dụng cá nhân đã lưu ở menu "Gửi mail BCKS" để ĐỌC hộp thư (IMAP, chỉ đọc),
// nhờ AI (Claude) tóm tắt mail HÔM NAY: tổng quan, việc cần xử lý, từng mail xếp theo mức độ. Chỉ lưu bản tóm tắt, không lưu nội dung mail gốc.
// Xem backend/app/services/mail_digest.py.
const MUC_DO = {
  khan: { label: "Khẩn / cần xử lý ngay", color: "#B42318", bg: "#FDE8E6" },
  can_tra_loi: { label: "Cần phản hồi", color: "#B54708", bg: "#FFF4D6" },
  de_biet: { label: "Để biết", color: "#1F4E79", bg: "#E8F1FD" },
  tu_dong: { label: "Mail tự động / bản tin", color: "#667085", bg: "#F2F4F7" },
};
const ORDER = ["khan", "can_tra_loi", "de_biet", "tu_dong"];

function fmtDateTime(s) {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TongHopMailPage() {
  const [status, setStatus] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [testMsg, setTestMsg] = useState(null);
  const [open, setOpen] = useState({ tu_dong: false });

  useEffect(() => {
    Promise.all([getMailDigestStatus(), getMailDigestToday()])
      .then(([s, d]) => { setStatus(s); setData(d); })
      .catch((e) => setErr(e.message || "Không tải được dữ liệu"))
      .finally(() => setLoading(false));
  }, []);

  async function doTest() {
    setBusy("test"); setErr(""); setTestMsg(null);
    try {
      const r = await testMailDigest();
      setTestMsg({ ok: true, text: `Kết nối hộp thư thành công (${r.host}) — ${r.so_mail_gan_day} mail trong 2 ngày gần đây.` });
    } catch (e) { setTestMsg({ ok: false, text: e.message }); } finally { setBusy(""); }
  }
  async function doRun() {
    setBusy("run"); setErr(""); setTestMsg(null);
    try { setData(await runMailDigest()); } catch (e) { setErr(e.message || "Tổng hợp thất bại"); } finally { setBusy(""); }
  }

  const groups = ORDER.map((k) => [k, (data?.mails || []).filter((m) => m.muc_do === k)]).filter(([, l]) => l.length);
  const today = new Date().toLocaleDateString("vi-VN");

  return (
    <Layout crumb="Tổng hợp mail AI">
      <div className="page-head">
        <h1>🤖 Tổng hợp mail AI</h1>
        <p>AI đọc mail hôm nay ({today}) trong hộp thư của anh/chị và tóm tắt: việc cần xử lý, mail quan trọng, mail chỉ để biết.</p>
      </div>

      <div className="card">
        <div className="card-body">
          {loading && <div className="placeholder-box">Đang tải...</div>}
          {!loading && status && !status.configured && (
            <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
              Anh/chị chưa cấu hình email. Vào menu <a href="/gui-mail-bcks" style={{ fontWeight: 700 }}>Gửi mail BCKS</a> → mục “Cấu hình email gửi (cá nhân)” nhập email + mật khẩu ứng dụng
              (dùng chung cho cả gửi mail và tổng hợp mail), rồi quay lại đây.
            </div>
          )}
          {!loading && status && status.configured && (
            <>
              <div style={{ fontSize: 13.5, marginBottom: 12 }}>
                Hộp thư: <b>{status.sender_email}</b> <span style={{ color: "var(--text-600)" }}>({status.imap_host})</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <button className="upload-btn" disabled={!!busy} onClick={doRun}>{busy === "run" ? "AI đang đọc và tổng hợp mail… (có thể mất 30–60 giây)" : data ? "Tổng hợp lại hôm nay" : "Tổng hợp mail hôm nay"}</button>
                <button className="fbtn" disabled={!!busy} onClick={doTest}>{busy === "test" ? "Đang kiểm tra..." : "Kiểm tra kết nối hộp thư"}</button>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-600)", lineHeight: 1.6 }}>
                Chỉ ĐỌC hộp thư (không đánh dấu đã đọc, không xoá, không gửi). Nội dung mail hôm nay được gửi tới dịch vụ AI (Claude) để tóm tắt;
                hệ thống chỉ lưu bản tóm tắt, không lưu nội dung mail gốc.
              </div>
            </>
          )}
          {testMsg && <div style={{ marginTop: 12, fontSize: 13, color: testMsg.ok ? "#2f6b1a" : "var(--danger)" }}>{testMsg.ok ? "✅" : "❌"} {testMsg.text}</div>}
          {err && <div style={{ marginTop: 12, fontSize: 13, color: "var(--danger)" }}>❌ {err}</div>}
        </div>
      </div>

      {data && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head"><h3>Tổng quan</h3></div>
            <div className="card-body">
              <div style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 8 }}>
                Tổng hợp lúc {fmtDateTime(data.tao_luc)} · {data.so_mail} mail{data.tong_mail > data.so_mail ? ` (hôm nay có ${data.tong_mail} mail, AI đọc ${data.so_mail} mail mới nhất)` : ""}
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.7 }}>{data.tong_quan || "-"}</div>
            </div>
          </div>

          {(data.viec_can_xu_ly || []).length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-head"><h3>Việc cần xử lý ({data.viec_can_xu_ly.length})</h3></div>
              <div className="card-body">
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.viec_can_xu_ly.map((v, i) => (
                    <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{v.viec}</div>
                      <div style={{ fontSize: 12, color: "var(--text-600)", marginTop: 3 }}>
                        {v.han ? <b style={{ color: "#B42318" }}>Hạn: {v.han} · </b> : null}Mail: {v.subject} — {v.from}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {groups.map(([k, list]) => {
            const m = MUC_DO[k];
            const collapsed = k === "tu_dong" && !open.tu_dong;
            return (
              <div className="card" key={k} style={{ marginTop: 16 }}>
                <div className="card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3><span style={{ background: m.bg, color: m.color, borderRadius: 99, padding: "2px 10px", fontSize: 13 }}>{m.label}</span> <span style={{ fontSize: 13, color: "var(--text-600)" }}>({list.length})</span></h3>
                  {k === "tu_dong" && <button className="fbtn" onClick={() => setOpen({ ...open, tu_dong: !open.tu_dong })}>{open.tu_dong ? "Thu gọn" : "Xem"}</button>}
                </div>
                {!collapsed && (
                  <div className="card-body">
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {list.map((x) => (
                        <div key={x.stt} style={{ borderLeft: `4px solid ${m.color}`, background: m.bg, borderRadius: 6, padding: "9px 12px" }}>
                          <div style={{ fontSize: 12, color: "var(--text-600)" }}>{x.time} · {x.from}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy-900)" }}>{x.subject}</div>
                          <div style={{ fontSize: 13.5, marginTop: 3, lineHeight: 1.6 }}>{x.tom_tat}</div>
                          {x.files && x.files.length > 0 && <div style={{ fontSize: 12, color: "var(--text-600)", marginTop: 3 }}>Đính kèm: {x.files.join(", ")}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </Layout>
  );
}
