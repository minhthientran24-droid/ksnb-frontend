import { useRef, useState } from "react";
import Layout from "../components/Layout";
import {
  checkKiemKeCanDate, capNhatKetQuaKiemKe, tongHopBcksFromXknk, processHoTroVx, tongHopBcksTttc,
  getUser,
} from "../lib/api";

// TOÀN BỘ "Dữ liệu tham chiếu (Admin)" (mặc định + Cắt liều + VX) đã dời
// sang menu "Tải lên dữ liệu" (chốt 27/08 lần 18-20) — xem
// components/ReferenceFilesPanel.js.

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function HoTroKiemKePage() {
  const [tab, setTab] = useState("thanh-ly"); // "thanh-ly" | "khac" | "vx"
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null); // { filename, blob } | null
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const me = getUser();
  // Tải lên kết quả kiểm kê thanh lý: mọi role được dùng, trừ viewer.
  const canUploadKetQua = me?.role && me.role !== "viewer";
  // Cập nhật kết quả kiểm kê thanh lý -> xuất file Xuất Khác Tính Giá Trị
  const [ketQuaProcessing, setKetQuaProcessing] = useState(false);
  const [ketQuaResult, setKetQuaResult] = useState(null); // { filename, blob, soDong } | null
  const [ketQuaError, setKetQuaError] = useState("");
  const ketQuaFileInputRef = useRef(null);

  // Tổng hợp Báo cáo Kiểm Soát Sau Kiểm Kê — bước 1 (đã có rule + code
  // thật): điền sheet KIEM KE từ file "Xuất Khác - Nhập Khác". Sheet
  // THANH LY (từ file kết quả kiểm kê thanh lý) chờ rule bổ sung sau —
  // ô chọn file đó vẫn để sẵn nhưng chưa được xử lý.
  const [xknkFile, setXknkFile] = useState(null); // File | null
  const [tlKetQuaFile, setTlKetQuaFile] = useState(null); // File | null
  const [tongHopProcessing, setTongHopProcessing] = useState(false);
  const [tongHopResult, setTongHopResult] = useState(null); // { filename, blob, soDong, soDongThieuGia } | null
  const [tongHopError, setTongHopError] = useState("");
  const xknkFileInputRef = useRef(null);
  const tlKetQuaFileInputRef = useRef(null);

  // Hỗ trợ kiểm kê shop VX (chốt 25/08 — rule xử lý thật). Upload file tồn
  // kho thô (TonKhoProductItem*.csv) -> lọc + xuất 3 file kết quả riêng
  // (VPKM / Kiểm Kê VX / Kiểm kê VTYT), bấm 1 nút tải cả 3 để shop điền
  // tay + đối chiếu.
  const [vxFile, setVxFile] = useState(null); // File | null
  const [vxProcessing, setVxProcessing] = useState(false);
  const [vxResult, setVxResult] = useState(null); // { files: [{filename, blob}], stats } | null
  const [vxError, setVxError] = useState("");
  const vxFileInputRef = useRef(null);

  // Tổng hợp BCKS TTTC (25/08 — rule + code xử lý thật). Cho chọn 1-3 file
  // kiểm kê (đã kiểm kê thật, tải về từ mục "Hỗ trợ kiểm kê shop VX" phía
  // trên rồi shop điền tay) để ráp thành 1 báo cáo kiểm soát hoàn chỉnh
  // (tối đa 4 sheet: tối đa 3 sheet kiểm kê + 1 sheet Tổng hợp Kiểm Kê
  // TTTC). Chọn nhiều hơn 3 file -> cảnh báo, không cho xử lý.
  const [bcksTttcFiles, setBcksTttcFiles] = useState([]); // File[]
  const [bcksTttcWarning, setBcksTttcWarning] = useState("");
  const [bcksTttcProcessing, setBcksTttcProcessing] = useState(false);
  const [bcksTttcResult, setBcksTttcResult] = useState(null); // { files: [{filename, blob}] } | null
  const [bcksTttcError, setBcksTttcError] = useState("");
  // Popup cảnh báo "2 file cần import EHO" (chốt 27/08 lần 13) — hiện khi
  // file NKXK bị cắt làm 2 (cả "Xuất truy thu TTTC" lẫn "Xử lý NKXK TTTC"
  // cùng có trong kết quả trả về, xem services/tong_hop_bcks_tttc.py).
  const [showEhoWarning, setShowEhoWarning] = useState(false);
  const bcksTttcFileInputRef = useRef(null);

  async function handleVxUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVxFile(file);
    setVxResult(null);
    setVxError("");
    setVxProcessing(true);
    try {
      const { files, stats } = await processHoTroVx(file);
      setVxResult({ files, stats });
    } catch (err) {
      setVxError(err.message || "Xử lý thất bại");
    } finally {
      setVxProcessing(false);
    }
  }

  // Bấm 1 lần tải cả 3 file — không đóng gói zip, trigger 3 lượt tải liên
  // tiếp (mỗi lượt cách nhau 1 chút) từ cùng 1 thao tác bấm nút của người
  // dùng để trình duyệt không chặn tải nhiều file.
  function handleVxDownload() {
    if (!vxResult?.files?.length) return;
    vxResult.files.forEach(({ filename, blob }, i) => {
      setTimeout(() => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }, i * 400);
    });
  }

  // Chọn 1 hoặc nhiều file cùng lúc (input multiple) — >3 file thì cảnh
  // báo và huỷ chọn, không cho xử lý.
  function handleBcksTttcFileSelect(e) {
    const files = Array.from(e.target.files || []);
    setBcksTttcResult(null);
    if (files.length > 3) {
      setBcksTttcFiles([]);
      setBcksTttcWarning(`Chỉ được chọn tối đa 3 file kiểm kê — anh vừa chọn ${files.length} file, vui lòng chọn lại.`);
    } else if (files.length > 0) {
      setBcksTttcFiles(files);
      setBcksTttcWarning("");
    }
    e.target.value = ""; // cho phép chọn lại đúng những file vừa gỡ/đổi
  }

  function handleBcksTttcRemoveFile(idx) {
    setBcksTttcFiles((prev) => prev.filter((_, i) => i !== idx));
    setBcksTttcResult(null);
  }

  // Bấm 1 lần tải cả (các) file kết quả — trigger tải liên tiếp (cách
  // nhau 1 chút) từ cùng 1 thao tác của người dùng để trình duyệt không
  // chặn tải nhiều file, giống hệt cách làm ở "Hỗ trợ kiểm kê shop VX".
  function downloadBcksTttcFiles(files) {
    (files || []).forEach(({ filename, blob }, i) => {
      setTimeout(() => downloadBlob(blob, filename), i * 400);
    });
  }

  async function handleBcksTttcProcess() {
    if (!bcksTttcFiles.length) return;
    setBcksTttcProcessing(true);
    setBcksTttcResult(null);
    setBcksTttcError("");
    try {
      const { files } = await tongHopBcksTttc(bcksTttcFiles);
      setBcksTttcResult({ files });
      // Tự động tải về ngay khi xử lý xong — bấm nút "Tổng hợp báo cáo
      // kiểm soát" là đủ, không cần bấm thêm nút tải.
      downloadBcksTttcFiles(files);
      // File NKXK bị cắt làm 2 (chốt 27/08 lần 13) -> cảnh báo đỏ nhắc NV
      // đừng bỏ sót bước import EHO cho cả 2 file.
      const hasTruyThu = files.some((f) => f.filename.startsWith("Xuất truy thu TTTC"));
      const hasXuLyNkxk = files.some((f) => f.filename.startsWith("Xử lý NKXK TTTC"));
      if (hasTruyThu && hasXuLyNkxk) setShowEhoWarning(true);
    } catch (err) {
      setBcksTttcError(err.message || "Xử lý thất bại");
    } finally {
      setBcksTttcProcessing(false);
    }
  }

  async function handleTongHopProcess() {
    if (!xknkFile) {
      alert("Vui lòng chọn file Báo cáo Xuất Khác - Nhập Khác trước khi xử lý.");
      return;
    }
    setTongHopProcessing(true);
    setTongHopResult(null);
    setTongHopError("");
    try {
      const { blob, soDong, soDongThieuGia, soDongGoc, soDongCatLieu, soDongThanhLy, tenFile } = await tongHopBcksFromXknk(xknkFile, tlKetQuaFile);
      setTongHopResult({
        filename: `${tenFile || `BaoCaoKiemSoatSauKiemKe_${xknkFile.name.replace(/\.[^.]+$/, "")}`}.xlsx`,
        blob,
        soDong,
        soDongThieuGia,
        soDongGoc,
        soDongCatLieu,
        soDongThanhLy,
      });
    } catch (err) {
      setTongHopError(err.message || "Xử lý thất bại");
    } finally {
      setTongHopProcessing(false);
    }
  }

  async function handleTonKhoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    setResult(null);
    setError("");
    try {
      const { blob, filename } = await checkKiemKeCanDate(file);
      setResult({ filename, blob });
    } catch (err) {
      setError(err.message || "Xử lý thất bại");
    } finally {
      setProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleKetQuaUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setKetQuaProcessing(true);
    setKetQuaResult(null);
    setKetQuaError("");
    try {
      const { blob, soDong } = await capNhatKetQuaKiemKe(file);
      setKetQuaResult({
        filename: `XuatKhacTinhGiaTri_${file.name.replace(/\.[^.]+$/, "")}.xlsx`,
        blob,
        soDong,
      });
    } catch (err) {
      setKetQuaError(err.message || "Xử lý thất bại");
    } finally {
      setKetQuaProcessing(false);
      if (ketQuaFileInputRef.current) ketQuaFileInputRef.current.value = "";
    }
  }

  return (
    <Layout crumb="Hỗ Trợ Kiểm Kê">
      <div className="page-head">
        <h1>Hỗ Trợ Kiểm Kê</h1>
      </div>

      <div className="month-tabs">
        <div className={`month-tab ${tab === "thanh-ly" ? "active" : ""}`} onClick={() => setTab("thanh-ly")}>
          Kiểm kê Thanh Lý
        </div>
        <div className={`month-tab ${tab === "khac" ? "active" : ""}`} onClick={() => setTab("khac")}>
          Tổng hợp Báo cáo Kiểm Soát Sau Kiểm Kê
        </div>
        <div className={`month-tab ${tab === "vx" ? "active" : ""}`} onClick={() => setTab("vx")}>
          Hỗ trợ kiểm kê shop VX
        </div>
      </div>

      {tab === "thanh-ly" && (
        <>
          <div className="grid-2" style={{ gap: 18, alignItems: "start" }}>
            <div className="card">
              <div className="card-head"><h3>🛠️ Hỗ trợ xử lý tồn kho thanh lý</h3></div>
              <div className="card-body">
                <p style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 12, lineHeight: 1.6 }}>
                  Chọn file tồn kho (TonKhoProductItem*.csv) từ máy tính — hệ thống kiểm tra kỳ kiểm kê cận
                  date cho toàn bộ hàng trong kho thanh lý (060), rồi trả file kết quả để tải về ngay.
                </p>
                <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleTonKhoUpload} />
                <button className="upload-btn" onClick={() => fileInputRef.current?.click()} disabled={processing}>
                  📤 Tải lên file tồn kho
                </button>

                {processing && (
                  <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-600)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="tiny-spinner" />
                    Đang xử lý file, vui lòng đợi...
                  </div>
                )}

                {error && !processing && (
                  <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--danger)" }}>{error}</div>
                )}

                {result && !processing && (
                  <div style={resultBoxStyle}>
                    <span style={{ fontSize: 12.5, color: "#3E7A2A", fontWeight: 600 }}>
                      ✅ Đã xử lý xong
                    </span>
                    <button style={downloadBtnStyle} onClick={() => downloadBlob(result.blob, result.filename)}>
                      📥 Tải file kết quả về
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h3>📋 Cập nhật kết quả kiểm kê thanh lý</h3></div>
              <div className="card-body">
                {canUploadKetQua ? (
                  <>
                    <p style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 12, lineHeight: 1.6 }}>
                      Tải lên file kết quả kiểm kê thanh lý (đã điền SL Xử lý, Lý Do, Xác định truy thu).
                      Hệ thống tách các dòng có <b>Xác định truy thu = XK tính giá trị</b> để trả về file import{" "}
                      <b>Xuất Khác Tính Giá Trị</b>.
                    </p>
                    <input
                      ref={ketQuaFileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      style={{ display: "none" }}
                      onChange={handleKetQuaUpload}
                    />
                    <button
                      className="upload-btn"
                      onClick={() => ketQuaFileInputRef.current?.click()}
                      disabled={ketQuaProcessing}
                    >
                      📤 Tải lên file kết quả kiểm kê
                    </button>

                    {ketQuaProcessing && (
                      <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-600)", display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="tiny-spinner" />
                        Đang xử lý file, vui lòng đợi...
                      </div>
                    )}

                    {ketQuaError && !ketQuaProcessing && (
                      <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--danger)" }}>{ketQuaError}</div>
                    )}

                    {ketQuaResult && !ketQuaProcessing && (
                      <div style={resultBoxStyle}>
                        <span style={{ fontSize: 12.5, color: "#3E7A2A", fontWeight: 600 }}>
                          ✅ Đã xử lý xong — {ketQuaResult.soDong} dòng xuất khác tính giá trị
                        </span>
                        <button
                          style={downloadBtnStyle}
                          onClick={() => downloadBlob(ketQuaResult.blob, ketQuaResult.filename)}
                        >
                          📥 Tải file import truy thu
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={lockedBoxStyle}>
                    <span style={{ fontSize: 19, lineHeight: 1.1 }}>🔒</span>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-900)", marginBottom: 3 }}>
                        Không có quyền cập nhật kết quả kiểm kê thanh lý
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-600)", lineHeight: 1.55 }}>
                        Tài khoản <b>Viewer</b> chỉ xem báo cáo, không tải lên được mục này.
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </>
      )}

      {tab === "khac" && (
        <>
          <div className="card">
          <div className="card-head"><h3>🛠️ Tổng hợp Báo cáo Kiểm Soát Sau Kiểm Kê</h3></div>
          <div className="card-body">
            <p style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 16, lineHeight: 1.6 }}>
              Tải lên báo cáo Xuất Khác - Nhập Khác (bắt buộc) để điền sheet KIEM KE. Có thêm file kết quả
              kiểm kê thanh lý (tuỳ chọn) thì hệ thống ghép nguyên dữ liệu file đó vào 1 sheet mới
              "Kiểm kê Thanh Lý" trong cùng file kết quả — không chỉnh sửa gì.
            </p>

            <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--navy-900)", marginBottom: 8 }}>
                  1. Báo cáo Xuất Khác - Nhập Khác
                </div>
                <input
                  ref={xknkFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: "none" }}
                  onChange={(e) => setXknkFile(e.target.files?.[0] || null)}
                />
                <button className="upload-btn" onClick={() => xknkFileInputRef.current?.click()}>
                  {xknkFile ? "Đổi file khác" : "📤 Tải lên báo cáo Xuất Khác - Nhập Khác"}
                </button>
                <div style={{ fontSize: 11, color: xknkFile ? "#4C9A2A" : "var(--text-400)", marginTop: 8 }}>
                  {xknkFile ? `✅ ${xknkFile.name}` : "Chưa chọn file"}
                </div>
              </div>

              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--navy-900)", marginBottom: 8 }}>
                  2. Kết quả kiểm kê thanh lý <span style={{ fontWeight: 400, color: "var(--text-400)" }}>(tuỳ chọn)</span>
                </div>
                <input
                  ref={tlKetQuaFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: "none" }}
                  onChange={(e) => setTlKetQuaFile(e.target.files?.[0] || null)}
                />
                <button className="upload-btn" onClick={() => tlKetQuaFileInputRef.current?.click()}>
                  {tlKetQuaFile ? "Đổi file khác" : "📤 Tải lên kết quả kiểm kê thanh lý"}
                </button>
                <div style={{ fontSize: 11, color: tlKetQuaFile ? "#4C9A2A" : "var(--text-400)", marginTop: 8 }}>
                  {tlKetQuaFile ? `✅ ${tlKetQuaFile.name}` : "Chưa chọn file — có thể bỏ qua, chỉ điền sheet KIEM KE"}
                </div>
              </div>
            </div>

            <button
              onClick={handleTongHopProcess}
              disabled={tongHopProcessing || !xknkFile}
              style={actionBtnStyle}
            >
              {tongHopProcessing ? "Đang xử lý..." : "🚀 Bắt đầu xử lý Báo Cáo"}
            </button>

            {tongHopProcessing && (
              <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-600)", display: "flex", alignItems: "center", gap: 8 }}>
                <span className="tiny-spinner" />
                Đang xử lý file, vui lòng đợi...
              </div>
            )}

            {tongHopError && !tongHopProcessing && (
              <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--danger)" }}>{tongHopError}</div>
            )}

            {tongHopResult && !tongHopProcessing && (
              <div style={resultBoxStyle}>
                <span style={{ fontSize: 12.5, color: "#3E7A2A", fontWeight: 600 }}>
                  ✅ Đã điền {tongHopResult.soDong} dòng vào sheet KIEM KE
                  {tongHopResult.soDongGoc > tongHopResult.soDong &&
                    ` (đã lọc từ ${tongHopResult.soDongGoc} dòng gốc — chỉ lấy "Xử lý kiểm kê allshop", bỏ kho thanh lý)`}
                  {tongHopResult.soDongThieuGia > 0 && ` — ${tongHopResult.soDongThieuGia} dòng thiếu giá bán (Đơn giá = 0)`}
                  {tongHopResult.soDongCatLieu > 0 && ` — ${tongHopResult.soDongCatLieu} dòng thuộc hàng cắt liều`}
                  {tongHopResult.soDongThanhLy > 0 && (
                    <>
                      <br />
                      + Đã ghép {tongHopResult.soDongThanhLy} dòng vào sheet mới "Kiểm kê Thanh Lý" (giữ nguyên dữ liệu gốc)
                    </>
                  )}
                </span>
                <button style={downloadBtnStyle} onClick={() => downloadBlob(tongHopResult.blob, tongHopResult.filename)}>
                  📥 Tải file kết quả về
                </button>
              </div>
            )}
          </div>
          </div>
        </>
      )}

      {tab === "vx" && (
        <>
          <div className="grid-2" style={{ gap: 18, alignItems: "start" }}>
          <div className="card">
            <div className="card-head"><h3>💉 Hỗ trợ kiểm kê shop VX</h3></div>
            <div className="card-body">
              <p style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 16, lineHeight: 1.6 }}>
                Chọn file tồn kho shop VX từ máy tính (TonKhoProductItem*.csv) — hệ thống lọc theo Ngành
                và xuất 1 file kết quả gồm 3 sheet <strong>VPKM / Kiểm Kê VX / Kiểm kê VTYT</strong> để
                shop tự điền "Số lượng shop điền" đối chiếu.
              </p>

              <input ref={vxFileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleVxUpload} />
              <button className="upload-btn" onClick={() => vxFileInputRef.current?.click()} disabled={vxProcessing}>
                📤 Tải lên file tồn kho
              </button>
              {vxFile && (
                <div style={{ fontSize: 11, color: "#4C9A2A", marginTop: 8 }}>✅ {vxFile.name}</div>
              )}

              {vxProcessing && (
                <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-600)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="tiny-spinner" />
                  Đang xử lý file, vui lòng đợi...
                </div>
              )}

              {vxError && !vxProcessing && (
                <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--danger)" }}>❌ {vxError}</div>
              )}

              {vxResult && !vxProcessing && (
                <div style={{ ...resultBoxStyle, flexDirection: "column", alignItems: "stretch" }}>
                  <span style={{ fontSize: 12.5, color: "#3E7A2A", fontWeight: 600, marginBottom: 10 }}>
                    ✅ Đã xử lý xong — Kiểm Kê VPKM: {vxResult.stats["Kiểm Kê VPKM"] ?? 0} dòng · Kiểm Kê VX: {vxResult.stats["Kiểm Kê VX"] ?? 0} dòng ·
                    Kiểm kê VTYT: {vxResult.stats["Kiểm kê VTYT"] ?? 0} dòng
                  </span>
                  <button className="upload-btn" style={{ alignSelf: "flex-start" }} onClick={handleVxDownload}>
                    📥 Tải file kết quả (bấm 1 lần tải cả 3 file .xlsx)
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>📑 Tổng hợp BCKS TTTC</h3></div>
            <div className="card-body">
              <p style={{ fontSize: 12, color: "var(--text-600)", marginBottom: 16, lineHeight: 1.6 }}>
                Tải lên 1 hoặc nhiều file kiểm kê <b>đã kiểm kê thật</b> (file tải về từ mục "Hỗ trợ kiểm kê
                shop VX" phía trên, shop đã điền "Số lượng shop điền") — hệ thống gộp lại thành 1 báo cáo
                kiểm soát hoàn chỉnh. Chọn 1 file thì gộp 1, chọn 3 thì gộp 3; chọn nhiều hơn 3 file kiểm kê
                sẽ báo lỗi.
              </p>

              <input
                ref={bcksTttcFileInputRef}
                type="file"
                accept=".xlsx,.xls"
                multiple
                style={{ display: "none" }}
                onChange={handleBcksTttcFileSelect}
              />
              <button className="upload-btn" onClick={() => bcksTttcFileInputRef.current?.click()}>
                📤 Chọn file kiểm kê (tối đa 3 file)
              </button>

              {bcksTttcWarning && (
                <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--danger)" }}>⚠️ {bcksTttcWarning}</div>
              )}

              {bcksTttcFiles.length > 0 && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  {bcksTttcFiles.map((f, i) => (
                    <div
                      key={`${f.name}-${i}`}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                        fontSize: 11.5, color: "#3E7A2A", background: "#EAF6E5", border: "1px solid #CFE8C4",
                        borderRadius: 6, padding: "6px 10px",
                      }}
                    >
                      <span>✅ {f.name}</span>
                      <button
                        onClick={() => handleBcksTttcRemoveFile(i)}
                        style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                        title="Bỏ file này"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <button
                  onClick={handleBcksTttcProcess}
                  disabled={!bcksTttcFiles.length || bcksTttcProcessing}
                  style={actionBtnStyle}
                >
                  {bcksTttcProcessing ? "Đang xử lý..." : "🚀 Tổng hợp báo cáo kiểm soát"}
                </button>
              </div>

              {bcksTttcProcessing && (
                <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-600)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="tiny-spinner" />
                  Đang xử lý file, vui lòng đợi...
                </div>
              )}

              {bcksTttcError && !bcksTttcProcessing && (
                <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--danger)" }}>❌ {bcksTttcError}</div>
              )}

              {bcksTttcResult && !bcksTttcProcessing && (
                <div style={resultBoxStyle}>
                  <span style={{ fontSize: 12.5, color: "#3E7A2A", fontWeight: 600 }}>
                    ✅ Đã tổng hợp xong — đã tự động tải về {bcksTttcResult.files.length} file
                    {bcksTttcResult.files.length > 1 ? " (báo cáo tổng hợp + file Import NKXK)" : ""}
                  </span>
                  <button
                    style={downloadBtnStyle}
                    onClick={() => downloadBcksTttcFiles(bcksTttcResult.files)}
                  >
                    📥 Tải lại
                  </button>
                </div>
              )}
            </div>
          </div>
          </div>
        </>
      )}

      {showEhoWarning && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(10,20,40,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20,
          }}
          onClick={() => setShowEhoWarning(false)}
        >
          <div
            style={{
              background: "#fff", borderRadius: 12, padding: "22px 26px", width: 440, maxWidth: "100%",
              boxShadow: "0 24px 60px rgba(0,0,0,0.3)", border: "2px solid #D6362F", position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowEhoWarning(false)}
              aria-label="Đóng"
              style={{
                position: "absolute", top: 10, right: 12, border: "none", background: "none",
                fontSize: 18, cursor: "pointer", color: "var(--text-600)", lineHeight: 1,
              }}
            >
              ✕
            </button>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#D6362F", marginBottom: 10, paddingRight: 20 }}>
              ⚠️ Chú Ý
            </div>
            <p style={{ fontSize: 13.5, color: "#D6362F", lineHeight: 1.6, marginBottom: 18 }}>
              Có 2 file Cần thực hiện import trên EHO đối với TTTC này, Bạn Đừng Bỏ Sót nhé ^^
            </p>
            <button
              className="login-btn"
              style={{ width: "auto", padding: "9px 26px", margin: 0, background: "#D6362F" }}
              onClick={() => setShowEhoWarning(false)}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}

// Chỉ còn dùng cho nút hành động chính (submit/xử lý) — nút "chọn/tải file
// lên" đã đổi qua class dùng chung ".upload-btn" (nền trắng, chữ xanh đậm).
const actionBtnStyle = {
  background: "var(--navy-800)", color: "#fff", border: "none", borderRadius: 8,
  padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 8,
};
const resultBoxStyle = {
  marginTop: 14, background: "#EAF6E5", border: "1px solid #CFE8C4", borderRadius: 8,
  padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
};
const downloadBtnStyle = {
  background: "#fff", border: "1px solid #4C9A2A", color: "#3E7A2A", borderRadius: 8,
  padding: "8px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
};
const lockedBoxStyle = {
  border: "1.5px dashed var(--border)", borderRadius: 8, padding: "20px 16px",
  display: "flex", alignItems: "flex-start", gap: 12, background: "#F7F9FD",
};
