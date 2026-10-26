import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { TruyThuShopCard, TruyThuNhanVienCard } from "../components/TruyThuCards";
import { getUser, thongKeKiemKeInfo, truyThuGuestShop, truyThuGuestTimShop, truyThuGuestNhanVien } from "../lib/api";

// Menu RIÊNG của Guest Account (chốt 26/10) — giống "Tra cứu thông tin" nhưng CHỈ hiện Truy thu thực tế:
// không có thông tin shop (ASM/Quản lý/Ngày mở bán...) và không có 3 kỳ kiểm kê gần nhất.
const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-600)", display: "block", marginBottom: 6 };
const inputStyle = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, boxSizing: "border-box" };

export default function TraCuuTruyThuPage() {
  const [checked, setChecked] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // {found, ma_shop, ten_shop, truy_thu}
  const [searched, setSearched] = useState("");
  const [candidates, setCandidates] = useState(null);

  const [nvInput, setNvInput] = useState("");
  const [nvLoading, setNvLoading] = useState(false);
  const [nvError, setNvError] = useState("");
  const [nvResult, setNvResult] = useState(null);
  const [nvSearched, setNvSearched] = useState("");
  const [info, setInfo] = useState(null); // {vung, gioi_han}

  useEffect(() => {
    if (!getUser()) {
      window.location.replace("/");
      return;
    }
    setChecked(true);
    thongKeKiemKeInfo().then(setInfo).catch(() => {});
  }, []);

  async function loadShopByCode(code) {
    setSearched(code);
    setLoading(true);
    setError("");
    setCandidates(null);
    setNvResult(null);
    setNvSearched("");
    try {
      setResult(await truyThuGuestShop(code));
    } catch (err) {
      setResult(null);
      setSearched("");
      setError(err.message || "Tra cứu thất bại");
    } finally {
      setLoading(false);
    }
  }

  // Ô nhập nhận Mã shop (toàn chữ số) HOẶC tên shop gần đúng.
  async function handleLookup() {
    const q = input.trim();
    if (!q || q === searched) return;
    if (/^\d{1,5}$/.test(q)) {
      await loadShopByCode(q);
      return;
    }
    setSearched(q);
    setLoading(true);
    setError("");
    setResult(null);
    setCandidates(null);
    setNvResult(null);
    setNvSearched("");
    try {
      const r = await truyThuGuestTimShop(q);
      if (r.matches.length === 1) {
        setInput(r.matches[0].ma_shop);
        await loadShopByCode(r.matches[0].ma_shop);
        return;
      }
      if (r.matches.length === 0) {
        setSearched("");
        setError(`Không tìm thấy shop nào có tên gần đúng "${q}".`);
      } else {
        setCandidates(r);
      }
    } catch (err) {
      setSearched("");
      setError(err.message || "Tra cứu thất bại");
    } finally {
      setLoading(false);
    }
  }

  function pickCandidate(ma) {
    setInput(ma);
    loadShopByCode(ma);
  }

  async function handleLookupNv() {
    const q = nvInput.trim();
    if (!q || q === nvSearched) return;
    setNvSearched(q);
    setNvLoading(true);
    setNvError("");
    setResult(null);
    setSearched("");
    setError("");
    setCandidates(null);
    try {
      setNvResult(await truyThuGuestNhanVien(q));
    } catch (err) {
      setNvResult(null);
      setNvSearched("");
      setNvError(err.message || "Tra cứu thất bại");
    } finally {
      setNvLoading(false);
    }
  }

  if (!checked) return null;

  return (
    <Layout crumb="Tra cứu thông tin Truy thu">
      <div className="page-head">
        <h1>💰 Tra cứu thông tin Truy thu</h1>
        <p>
          Nhập Mã shop hoặc tên shop để xem truy thu thực tế (tối đa 12 tháng gần nhất) — hoặc tìm theo tên nhân viên để
          xem truy thu của từng người. Bấm Tab hoặc Enter để tra cứu.
        </p>
      </div>

      {info && (
        <div style={{ fontSize: 13.5, margin: "0 2px 12px" }}>
          Vùng của bạn: <strong>{info.vung || "chưa được gán"}</strong>
          {info.gioi_han && <span style={{ color: "var(--text-600)" }}> — chỉ tra cứu được shop và nhân viên thuộc vùng này.</span>}
        </div>
      )}
      <div className="card">
        <div className="card-body" style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 280px", maxWidth: 380 }}>
            <label style={labelStyle}>Mã shop hoặc tên shop</label>
            <input
              type="text"
              autoFocus
              placeholder="VD: 80834 hoặc Nguyễn Văn Cừ"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onBlur={handleLookup}
              onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: "1 1 280px", maxWidth: 380 }}>
            <label style={labelStyle}>Tên nhân viên (hoặc Mã nhân viên)</label>
            <input
              type="text"
              placeholder="VD: Nguyễn Thị Hương"
              value={nvInput}
              onChange={(e) => setNvInput(e.target.value)}
              onBlur={handleLookupNv}
              onKeyDown={(e) => { if (e.key === "Enter") handleLookupNv(); }}
              style={inputStyle}
            />
          </div>
          {(loading || nvLoading) && <span style={{ fontSize: 13, color: "var(--text-400)", paddingBottom: 10 }}>Đang tra cứu...</span>}
        </div>
      </div>

      {candidates && (
        <div className="card">
          <div className="card-head">
            <h3>Chọn shop</h3>
            <span className="note">
              {candidates.mode === "fuzzy"
                ? `Không có shop khớp chính xác — gợi ý ${candidates.total} shop gần giống "${candidates.q}"`
                : `Có ${candidates.total} shop khớp "${candidates.q}"${candidates.total > candidates.matches.length ? ` (hiện ${candidates.matches.length} shop đầu — gõ cụ thể hơn để thu hẹp)` : ""}`}
            </span>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {candidates.matches.map((m) => (
              <div
                key={m.ma_shop}
                onClick={() => pickCandidate(m.ma_shop)}
                style={{ cursor: "pointer", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14 }}
              >
                <strong>{m.ma_shop}</strong> - {m.ten_shop}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="placeholder-box" style={{ color: "var(--danger)", fontWeight: 700, fontSize: 17 }}>{error}</div>}
      {!error && result && result.found === false && (
        <div className="placeholder-box">Không tìm thấy shop có Mã shop "{searched}".</div>
      )}
      {result && result.found && (
        <>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy-900)", margin: "4px 2px 12px" }}>
            {result.ma_shop} - {result.ten_shop || "—"}
          </div>
          <TruyThuShopCard data={result.truy_thu || []} />
        </>
      )}

      {nvError && <div className="placeholder-box">{nvError}</div>}
      {!nvError && nvResult && nvResult.found === false && (
        <div className="placeholder-box">Không tìm thấy nhân viên nào có tên (hoặc mã) "{nvSearched}" trong dữ liệu truy thu thực tế.</div>
      )}
      {nvResult && nvResult.found && (
        <>
          <div style={{ fontSize: 13, color: "var(--text-600)", margin: "4px 2px 12px" }}>
            {nvResult.mode === "exact"
              ? <>Có <strong>{nvResult.total_matches}</strong> nhân viên tên "{nvSearched}"{nvResult.total_matches > 1 ? " — tách riêng theo Mã nhân viên bên dưới." : "."}</>
              : <>Không có nhân viên tên đúng "{nvSearched}" — hiện <strong>{nvResult.total_matches}</strong> nhân viên có tên chứa cụm này, tách riêng theo Mã nhân viên.</>}
            {nvResult.truncated && <span style={{ color: "var(--danger)" }}> (chỉ hiện 50 người đầu — hãy nhập tên đầy đủ hơn)</span>}
          </div>
          {nvResult.nhan_vien.map((nv) => <TruyThuNhanVienCard key={nv.ma_nv} nv={nv} />)}
        </>
      )}
    </Layout>
  );
}
