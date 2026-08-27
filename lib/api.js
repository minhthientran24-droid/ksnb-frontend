const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_KEY = "ksnb_token";
const USER_KEY = "ksnb_user";
export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Phiên đăng nhập đã hết hạn");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi API: ${res.status}`);
  }

  return res.json();
}

export async function login(email, password) {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  saveSession(data.access_token, {
    id: data.id,
    full_name: data.full_name,
    role: data.role,
    must_change_password: data.must_change_password,
  });
  return data;
}

export function changePassword(newPassword) {
  return apiFetch("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ new_password: newPassword }),
  });
}

// ---------- Nội dung trang chủ (admin/super_admin sửa được) ----------

export function getHomepageContent() {
  return apiFetch("/homepage");
}

export function updateHomepageContent(data) {
  return apiFetch("/homepage", { method: "PUT", body: JSON.stringify(data) });
}

export function listReports() {
  return apiFetch("/reports");
}

export function getReport(periodLabel) {
  return apiFetch(`/reports/${periodLabel}`);
}

// Xóa hẳn báo cáo của 1 kỳ (chỉ admin/super_admin)
export function deleteReport(periodLabel) {
  return apiFetch(`/reports/${periodLabel}`, { method: "DELETE" });
}

// "Sửa nhanh" báo cáo tháng (chỉ admin/super_admin)
export function updateReportKiemKe(periodLabel, report_kiem_ke) {
  return apiFetch(`/reports/${periodLabel}`, {
    method: "PATCH",
    body: JSON.stringify({ report_kiem_ke }),
  });
}

// Upload ảnh đại diện từ máy — trả về URL đầy đủ để lưu vào avatar_url
export async function uploadAvatar(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/personnel/avatar`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi upload ảnh: ${res.status}`);
  }

  const data = await res.json();
  return `${API_URL}${data.url}`; // ghép thành URL đầy đủ để lưu/hiển thị
}

export function listPersonnel() {
  return apiFetch("/personnel");
}

// Tự tạo/cập nhật hồ sơ của chính mình (mỗi tài khoản 1 hồ sơ)
export function saveOwnPersonnel(data) {
  return apiFetch("/personnel", { method: "POST", body: JSON.stringify(data) });
}

// Sửa hồ sơ theo id — dùng khi admin/super_admin sửa hồ sơ người khác
export function updatePersonnel(id, data) {
  return apiFetch(`/personnel/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deletePersonnel(id) {
  return apiFetch(`/personnel/${id}`, { method: "DELETE" });
}

// ---------- Chữ ký mail (riêng tư — chỉ chủ hồ sơ + admin) ----------
// Mỗi NV KSNB tự thiết lập chữ ký + thông tin liên hệ dùng khi gửi mail
// BCKS — KHÁC hồ sơ "giới thiệu" công khai ở trên, người khác không xem
// được (server tự chặn, không chỉ ẩn ở UI).

export function getMySignature() {
  return apiFetch("/personnel/my-signature");
}

async function putFormField(path, fieldName, value) {
  const token = getToken();
  const formData = new FormData();
  formData.append(fieldName, value);
  const res = await fetch(`${API_URL}${path}`, {
    method: "PUT",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi API: ${res.status}`);
  }
  return res.json();
}

export function saveMySignature(signature) {
  return putFormField("/personnel/my-signature", "signature", signature);
}

// Admin — xem/sửa chữ ký của TẤT CẢ mọi người (server tự chặn user thường)
export function listAllSignatures() {
  return apiFetch("/personnel/signatures");
}

export function adminSaveSignature(personnelId, signature) {
  return putFormField(`/personnel/${personnelId}/signature`, "signature", signature);
}

// Tab "Thống kê" — menu Phân công KSNB kiểm kê (chốt 27/08). Dùng thẳng
// JWT web chính (apiFetch, KHÔNG qua bridge app1_ như các API khác của
// menu này — xem lib/llv2Api.js) để mở được cho role "editor" mà không
// cấp thêm quyền gì bên hệ app1_.
export function getLlvThongKeThang(group, month) {
  return apiFetch(`/lichlamviec/v2/thong-ke-thang?group=${encodeURIComponent(group)}&month=${encodeURIComponent(month)}`);
}

// Nút tải về tab "Thống kê" (chốt 27/08 lần 2) — file 2 sheet (theo Vùng +
// chi tiết shop), đúng tháng/group đang xem. Cùng quyền xem tab.
export async function downloadLlvThongKeThang(group, month) {
  const token = getToken();
  const res = await fetch(`${API_URL}/lichlamviec/v2/thong-ke-thang/export?group=${encodeURIComponent(group)}&month=${encodeURIComponent(month)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi tải file: ${res.status}`);
  }
  const filename = filenameFromContentDisposition(res, "thong_ke.xlsx");
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

export function getKiemKePeriods(loai, nhom) {
  const nhomQs = nhom ? `&nhom=${encodeURIComponent(nhom)}` : "";
  return apiFetch(`/tracking/kiem-ke/periods?loai=${encodeURIComponent(loai)}${nhomQs}`);
}

export function listKiemKe(period, loai, nhom) {
  const nhomQs = nhom ? `&nhom=${encodeURIComponent(nhom)}` : "";
  return apiFetch(`/tracking/kiem-ke?period=${encodeURIComponent(period)}&loai=${encodeURIComponent(loai)}${nhomQs}`);
}

export function updateKiemKeGhiChu(id, ghi_chu) {
  return apiFetch(`/tracking/kiem-ke/${id}/ghi-chu`, {
    method: "PATCH",
    body: JSON.stringify({ ghi_chu }),
  });
}

function filenameFromContentDisposition(res, fallback) {
  const cd = res.headers.get("Content-Disposition") || "";
  // Ưu tiên filename* (RFC 5987, UTF-8 — tên file tiếng Việt có dấu),
  // filename= thường chỉ là bản ASCII dự phòng (chốt 26/08 lần 8).
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try { return decodeURIComponent(star[1]); } catch { /* rơi xuống bản thường */ }
  }
  const m = cd.match(/filename="?([^"]+)"?/);
  return m ? m[1] : fallback;
}

// Tab "Đã kiểm" — file log kết quả kiểm kê ghi liên tục mỗi lần gửi mail
// BCKS (chốt 21/08, lưu theo tháng từ 25/08), chỉ admin tải được.
export function getKetQuaKiemKeGuiMailMonths() {
  return apiFetch("/tracking/kiem-ke/ket-qua-gui-mail/months");
}

export async function downloadKetQuaKiemKeGuiMail(thang) {
  const token = getToken();
  const qs = thang ? `?thang=${encodeURIComponent(thang)}` : "";
  const res = await fetch(`${API_URL}/tracking/kiem-ke/ket-qua-gui-mail${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi tải file: ${res.status}`);
  }
  const filename = filenameFromContentDisposition(res, "ket_qua_kiem_ke_gui_mail.xlsx");
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

// Tab "Đã kiểm" — file log kết quả kiểm kê Vaccine, bản song song riêng
// (chốt 26/08 lần 7) — 4 sheet (Thống kê tổng hợp báo cáo + Kiểm Kê
// VPKM/VTYT/VX), nút tải riêng với bản Long Châu ở trên.
export function getKetQuaKiemKeGuiMailVaccineMonths() {
  return apiFetch("/tracking/kiem-ke/ket-qua-gui-mail-vaccine/months");
}

export async function downloadKetQuaKiemKeGuiMailVaccine(thang) {
  const token = getToken();
  const qs = thang ? `?thang=${encodeURIComponent(thang)}` : "";
  const res = await fetch(`${API_URL}/tracking/kiem-ke/ket-qua-gui-mail-vaccine${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi tải file: ${res.status}`);
  }
  const filename = filenameFromContentDisposition(res, "ket_qua_kiem_ke_gui_mail_vaccine.xlsx");
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

// Tab "Đã kiểm" — "LCNB Thanh Lý về Kho Tổng" (24/08, lưu theo tháng + cắt
// file >500 dòng từ 25/08), 2 file riêng theo kho nhận, chỉ admin. Trả về
// {soDong, soPhan, chuaXacDinh} đọc từ header để báo cho admin biết ngay.
// >500 dòng thì server trả .zip gộp nhiều file — tên file lấy từ chính
// Content-Disposition server trả (kèm tháng, .xlsx hoặc .zip).
export function getLcnbThanhLyMonths(kho) {
  return apiFetch(`/tracking/kiem-ke/lcnb-thanh-ly/${kho}/months`);
}

async function downloadLcnbThanhLy(kho, thang, fallbackName) {
  const token = getToken();
  const qs = thang ? `?thang=${encodeURIComponent(thang)}` : "";
  const res = await fetch(`${API_URL}/tracking/kiem-ke/lcnb-thanh-ly/${kho}${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi tải file: ${res.status}`);
  }
  const soDong = Number(res.headers.get("X-So-Dong") || 0);
  const soPhan = Number(res.headers.get("X-So-Phan") || 1);
  const chuaXacDinh = Number(res.headers.get("X-Chua-Xac-Dinh") || 0);
  const filename = filenameFromContentDisposition(res, fallbackName);
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
  return { soDong, soPhan, chuaXacDinh };
}

export function downloadLcnbThanhLyHni(thang) {
  return downloadLcnbThanhLy("hni", thang, "LCNB_Thanh_Ly_HNI.xlsx");
}

export function downloadLcnbThanhLyHcm(thang) {
  return downloadLcnbThanhLy("hcm", thang, "LCNB_Thanh_Ly_HCM.xlsx");
}

// Tab "Shop được chia hôm nay" — dữ liệu từ Phân công KSNB kiểm kê (LLV v2),
// admin xem tất cả, các role khác chỉ thấy shop của chính mình.
export function getShopChiaHomNay() {
  return apiFetch("/tracking/shop-chia-hom-nay");
}

// Tab "Đang kiểm" — cùng nguồn LLV v2, không giới hạn theo ngày được chia,
// chỉ lấy shop đã tới/qua Ngày kiểm (đang thật sự "Đang kiểm kê").
export function getDangKiem() {
  return apiFetch("/tracking/dang-kiem");
}

// Dời lịch tự phục vụ ngay tại tab này — chỉ được dời shop của chính mình
// (trừ admin dời được của mọi người); hệ thống tự chọn 1 shop thay thế.
export function doiLichShopChiaHomNay(id, ngay_can_kiem, ly_do) {
  return apiFetch("/tracking/shop-chia-hom-nay/doi-lich", {
    method: "POST",
    body: JSON.stringify({ id, ngay_can_kiem, ly_do }),
  });
}

// Huỷ kiểm kê cho shop đang ở trạng thái "Đang kiểm" (chỉ admin/super_admin) —
// bắt buộc lý do + ngày dời lịch, chốt 25/08.
export function huyDangKiem(id, ngay_can_kiem, ly_do) {
  return apiFetch("/tracking/dang-kiem/huy", {
    method: "POST",
    body: JSON.stringify({ id, ngay_can_kiem, ly_do }),
  });
}

// ---------- Ghi nhận case vi phạm (tự do, không mẫu cố định) ----------

export function listViolationCases(periodLabel) {
  return apiFetch(`/violation-cases?period_label=${encodeURIComponent(periodLabel)}`);
}

export function createViolationCase(data) {
  return apiFetch("/violation-cases", { method: "POST", body: JSON.stringify(data) });
}

export function updateViolationCase(id, data) {
  return apiFetch(`/violation-cases/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function deleteViolationCase(id) {
  return apiFetch(`/violation-cases/${id}`, { method: "DELETE" });
}

// Các tác vụ gọi AI (import file, tổng hợp báo cáo) chạy NỀN trên server —
// request đầu chỉ trả về job_id ngay lập tức, tránh giữ 1 request mở quá lâu
// (Cloudflare/trình duyệt tự ngắt kết nối sau ~100s, báo "Failed to fetch"
// dù server vẫn đang xử lý). Hàm này tự hỏi lại (poll) cho tới khi xong.
async function pollJob(statusPath, { intervalMs = 3000, timeoutMs = 10 * 60 * 1000 } = {}) {
  const startedAt = Date.now();
  while (true) {
    const job = await apiFetch(statusPath);
    if (job.status === "done") return job.result;
    if (job.status === "error") throw new Error(job.error || "Xử lý thất bại");
    if (Date.now() - startedAt > timeoutMs) throw new Error("Quá thời gian chờ xử lý — thử lại sau");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// Up nhiều file (Excel/PDF/CSV/ảnh chụp màn hình) — AI tự đọc và tách thành
// từng case, tạo hàng loạt luôn (không cần nhập tay từng cái)
export async function importViolationCasesFiles(periodLabel, fileList) {
  const token = getToken();
  const formData = new FormData();
  formData.append("period_label", periodLabel);
  Array.from(fileList).forEach((f) => formData.append("files", f));

  const res = await fetch(`${API_URL}/violation-cases/import`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi upload: ${res.status}`);
  }
  const { job_id } = await res.json();
  return pollJob(`/violation-cases/import/${job_id}`);
}

// Sinh báo cáo "Kiểm soát theo chủ đề" tự động từ các case đã ghi (chỉ admin/super_admin)
export function generateChuDeReport(periodLabel) {
  return apiFetch(`/reports/${periodLabel}/generate-chu-de`, { method: "POST" });
}

// Nhờ AI (Claude) tổng hợp + tự chọn cách trình bày — CHỈ trả bản nháp để
// xem trước, chưa lưu vào báo cáo (admin phải xác nhận lưu riêng)
export async function synthesizeChuDeReport(periodLabel) {
  const { job_id } = await apiFetch(`/reports/${periodLabel}/synthesize-chu-de`, { method: "POST" });
  return pollJob(`/reports/synthesize-chu-de-jobs/${job_id}`);
}

// Lưu bản nháp report_chu_de (sau khi xem trước, kể cả bản do AI tổng hợp)
export function updateReportChuDe(periodLabel, report_chu_de) {
  return apiFetch(`/reports/${periodLabel}`, {
    method: "PATCH",
    body: JSON.stringify({ report_chu_de }),
  });
}

// ---------- Theo dõi chủ đề — job board (thay hẳn cơ chế quét dữ liệu cũ) ----------
// Mọi user đăng nhập xem được toàn bộ job; chỉ admin đăng/sửa/xóa job.

export function listChuDeJobs(thang) {
  const qs = thang ? `?thang=${encodeURIComponent(thang)}` : "";
  return apiFetch(`/chu-de-jobs${qs}`);
}

// Bộ chọn tháng (chốt 27/08) — danh sách tháng đã có job, mới nhất trước.
export function getChuDeJobMonths() {
  return apiFetch("/chu-de-jobs/months");
}

// Xuất data ra Excel (chốt 27/08) — chỉ admin/editor/super_admin (backend
// tự kiểm tra lại quyền). `thang` tuỳ chọn — xuất đúng theo bộ lọc đang xem.
export async function exportChuDeJobs(thang) {
  const token = getToken();
  const qs = thang ? `?thang=${encodeURIComponent(thang)}` : "";
  const res = await fetch(`${API_URL}/chu-de-jobs/export${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi tải file: ${res.status}`);
  }
  const filename = filenameFromContentDisposition(res, "theo_doi_chu_de.xlsx");
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

// Gõ Mã shop (hoặc Tên shop đầy đủ) rồi bấm Tab (onBlur) là tự tra cứu —
// dùng ShopInfo (phủ cả 3 miền), khác "Đề xuất kiểm kê" chỉ tra được
// shop Nam/Trung (llv_shops).
export function lookupChuDeShop(q) {
  return apiFetch(`/chu-de-jobs/shop-lookup?q=${encodeURIComponent(q)}`);
}

async function chuDeJobFormRequest(url, method, { ten_chu_de, vung, ma_shop, ten_shop, noi_dung_vi_pham, file }) {
  const token = getToken();
  const formData = new FormData();
  formData.append("ten_chu_de", ten_chu_de || "");
  formData.append("vung", vung || "");
  formData.append("ma_shop", ma_shop || "");
  formData.append("ten_shop", ten_shop || "");
  formData.append("noi_dung_vi_pham", noi_dung_vi_pham || "");
  if (file) formData.append("file", file);
  const res = await fetch(`${API_URL}${url}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi API: ${res.status}`);
  }
  return res.json();
}

export function createChuDeJob(data) {
  return chuDeJobFormRequest("/chu-de-jobs", "POST", data);
}

export function updateChuDeJob(id, data) {
  return chuDeJobFormRequest(`/chu-de-jobs/${id}`, "PUT", data);
}

export function deleteChuDeJob(id) {
  return apiFetch(`/chu-de-jobs/${id}`, { method: "DELETE" });
}

// Đăng NHIỀU job cùng lúc bằng file Excel (mẫu cột: Tên Chủ Đề | Vùng |
// Tên Shop | Nội Dung Vi Phạm) — KHÔNG đính kèm được file data cho từng
// dòng (khác đăng 1 job qua form, vẫn kèm được 1 file).
export async function bulkUploadChuDeJobs(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/chu-de-jobs/bulk-upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi API: ${res.status}`);
  }
  return res.json();
}

// Tải file mẫu (template) để đăng nhiều job cùng lúc (25/08) — đúng cột
// Tên Chủ Đề | Vùng | Tên Shop | Nội Dung Vi Phạm, kèm 1 dòng ví dụ.
export function downloadChuDeJobBulkUploadTemplate() {
  return downloadChuDeJobBlob("/chu-de-jobs/bulk-upload/template", "Mau_dang_chu_de_hang_loat.xlsx");
}

// supporterUserIds (tuỳ chọn, 25/08): id các KSNB được chọn thêm làm
// "người hỗ trợ" — 1 job giờ có thể nhiều người cùng nhận.
export function claimChuDeJob(id, supporterUserIds = []) {
  return apiFetch(`/chu-de-jobs/${id}/claim`, {
    method: "POST",
    body: JSON.stringify({ supporter_user_ids: supporterUserIds }),
  });
}

// Trả job về "Chưa nhận" (25/08, chỉ admin/editor) — dùng khi người đã
// nhận gặp rủi ro/không xử lý được, để người khác vào nhận lại.
export function unclaimChuDeJob(id) {
  return apiFetch(`/chu-de-jobs/${id}/unclaim`, { method: "POST" });
}

// Thêm người hỗ trợ cho job ĐÃ nhận (25/08) — chỉ người phụ trách chính
// hoặc admin/editor được gọi (backend tự kiểm tra lại quyền).
export function addChuDeJobSupporters(id, supporterUserIds) {
  return apiFetch(`/chu-de-jobs/${id}/add-supporters`, {
    method: "POST",
    body: JSON.stringify({ supporter_user_ids: supporterUserIds }),
  });
}

// Danh sách KSNB (mọi user đã đăng nhập) phục vụ popup chọn người hỗ trợ.
export function listKsnbForChuDe() {
  return apiFetch("/chu-de-jobs/ksnb-list");
}

export async function completeChuDeJob(id, { ket_qua_vi_pham, file }) {
  const token = getToken();
  const formData = new FormData();
  formData.append("ket_qua_vi_pham", ket_qua_vi_pham || "");
  if (file) formData.append("file", file);
  const res = await fetch(`${API_URL}/chu-de-jobs/${id}/complete`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi API: ${res.status}`);
  }
  return res.json();
}

async function downloadChuDeJobBlob(url, filename) {
  const token = getToken();
  const res = await fetch(`${API_URL}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi tải file: ${res.status}`);
  }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename || "file.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

export function downloadChuDeJobFile(id, filename) {
  return downloadChuDeJobBlob(`/chu-de-jobs/${id}/download`, filename || "data_check.xlsx");
}

export function downloadChuDeJobResultFile(id, filename) {
  return downloadChuDeJobBlob(`/chu-de-jobs/${id}/download-result`, filename || "ket_qua.xlsx");
}

export function listActivities() {
  return apiFetch("/activities");
}

// ---------- Chat nhóm ----------

export function getChatWsUrl() {
  const token = getToken();
  const wsBase = API_URL.replace(/^http/, "ws"); // http->ws, https->wss
  return `${wsBase}/chat/ws?token=${encodeURIComponent(token || "")}`;
}

export function listChatGroups() {
  return apiFetch("/chat/groups");
}

export function getChatGroupMembers(groupId) {
  return apiFetch(`/chat/groups/${groupId}/members`);
}

export function listChatMessages(groupId, beforeId) {
  const q = beforeId ? `?before_id=${beforeId}` : "";
  return apiFetch(`/chat/groups/${groupId}/messages${q}`);
}

async function chatFormRequest(url, method, formData) {
  const token = getToken();
  const res = await fetch(`${API_URL}${url}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi API: ${res.status}`);
  }
  return res.json();
}

export function sendChatMessage(groupId, { content, file, replyToId }) {
  const formData = new FormData();
  formData.append("content", content || "");
  if (file) formData.append("file", file);
  if (replyToId) formData.append("reply_to_id", replyToId);
  return chatFormRequest(`/chat/groups/${groupId}/messages`, "POST", formData);
}

export function createChatGroup({ name, memberIds }) {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("member_ids", (memberIds || []).join(","));
  return chatFormRequest("/chat/groups", "POST", formData);
}

export function updateChatGroup(groupId, { name, memberIds }) {
  const formData = new FormData();
  if (name !== undefined) formData.append("name", name);
  if (memberIds !== undefined) formData.append("member_ids", memberIds.join(","));
  return chatFormRequest(`/chat/groups/${groupId}`, "PATCH", formData);
}

export function deleteChatGroup(groupId) {
  return apiFetch(`/chat/groups/${groupId}`, { method: "DELETE" });
}

export function downloadChatMessageFile(messageId, filename) {
  return downloadChuDeJobBlob(`/chat/messages/${messageId}/file`, filename || "file");
}

export function reactToChatMessage(messageId, emoji) {
  const formData = new FormData();
  formData.append("emoji", emoji);
  return chatFormRequest(`/chat/messages/${messageId}/react`, "POST", formData);
}

export function getMyChatNickname() {
  return apiFetch("/chat/my-nickname");
}

export function updateMyChatNickname({ nickname, enabled }) {
  const formData = new FormData();
  formData.append("nickname", nickname || "");
  formData.append("enabled", enabled ? "true" : "false");
  return chatFormRequest("/chat/my-nickname", "PATCH", formData);
}

// Ảnh cần hiển thị TRỰC TIẾP trong khung chat (không phải tải về) — endpoint
// file yêu cầu Header Authorization nên không gán thẳng được vào <img src>,
// phải tự fetch kèm token rồi tạo blob URL cho <img> dùng.
export async function fetchChatMessageImageUrl(messageId) {
  const token = getToken();
  const res = await fetch(`${API_URL}/chat/messages/${messageId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Lỗi tải ảnh: ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function createActivity(data) {
  return apiFetch("/activities", { method: "POST", body: JSON.stringify(data) });
}

export function updateActivity(id, data) {
  return apiFetch(`/activities/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteActivity(id) {
  return apiFetch(`/activities/${id}`, { method: "DELETE" });
}

// ---------- Quản lý tài khoản đăng nhập (chỉ admin/super_admin) ----------

export function listUsers() {
  return apiFetch("/users");
}

export function createUserAccount(data) {
  return apiFetch("/users", { method: "POST", body: JSON.stringify(data) });
}

export function updateUserAccount(id, data) {
  return apiFetch(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function deleteUserAccount(id) {
  return apiFetch(`/users/${id}`, { method: "DELETE" });
}

export function exportUsersExcel() {
  return downloadChuDeJobBlob("/users/export-excel", "danh_sach_tai_khoan.xlsx");
}

// Danh sách nhân sự có quyền Kiểm Kê — dùng cho nút "Load danh sách KSNB"
// ở Phân công KSNB kiểm kê (thay cho phải upload Excel mỗi lần).
export function listKiemKeStaff() {
  return apiFetch("/users/kiem-ke-staff");
}

// ---------- Upload file Excel tạm (chỉ admin/super_admin, chờ PC xử lý) ----------

export async function uploadPendingFile(uploadType, note, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams({ upload_type: uploadType, note: note || "" });
  const res = await fetch(`${API_URL}/pending-uploads?${params.toString()}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi upload: ${res.status}`);
  }
  return res.json();
}

export function listPendingUploads() {
  return apiFetch("/pending-uploads");
}

// ---------- Báo cáo kiểm kê tháng: upload là xử lý NGAY, không qua PC ----------
export async function uploadKiemKeThangReport(periodLabel, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("period_label", periodLabel);
  formData.append("file", file);

  const res = await fetch(`${API_URL}/reports/upload-excel`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi upload: ${res.status}`);
  }
  return res.json();
}

export function deletePendingUpload(id) {
  return apiFetch(`/pending-uploads/${id}`, { method: "DELETE" });
}

// ---------- Hỗ trợ xử lý tồn kho thanh lý (kiểm kê cận date) ----------

// Trạng thái các file tham chiếu (chỉ admin/super_admin)
export function getKiemKeThanhLyReferenceFiles() {
  return apiFetch("/kiem-ke-thanh-ly/reference-files");
}

// Upload/thay thế 1 file tham chiếu: "nganh_loai" | "quydinh_can_date" | "gia_ban" | "kiemke_parquet"
export async function uploadKiemKeThanhLyReferenceFile(key, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/kiem-ke-thanh-ly/reference-files/${key}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi upload: ${res.status}`);
  }
  return res.json();
}

// Up file tồn kho -> chạy nền -> poll -> trả về { blob, filename } file Excel
// kết quả để tải về (filename do backend gợi ý, theo tên shop + ngày xử lý).
export async function checkKiemKeCanDate(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const startRes = await fetch(`${API_URL}/kiem-ke-thanh-ly/check-can-date`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!startRes.ok) {
    const body = await startRes.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi upload: ${startRes.status}`);
  }
  const { job_id } = await startRes.json();

  const startedAt = Date.now();
  while (true) {
    const job = await apiFetch(`/kiem-ke-thanh-ly/check-can-date/${job_id}`);
    if (job.status === "done") {
      const bin = atob(job.result.excel_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      return { blob, filename: job.result.filename || `KetQua_KiemKeCanDate_${file.name.replace(/\.[^.]+$/, "")}.xlsx` };
    }
    if (job.status === "error") throw new Error(job.error || "Xử lý thất bại");
    if (Date.now() - startedAt > 10 * 60 * 1000) throw new Error("Quá thời gian chờ xử lý — thử lại sau");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

// Hỗ trợ kiểm kê shop VX (25/08) — up file tồn kho thô -> chạy nền -> poll
// -> trả về { files, stats } (files = mảng { filename, blob } — 3 file
// .xlsx riêng từng sheet VPKM/VTYT/VX, KHÔNG đóng gói zip, để trigger 3
// lượt tải liên tiếp chỉ từ 1 lần bấm nút; stats = {"Kiểm Kê VPKM",
// "Kiểm Kê VX", "Kiểm kê VTYT"}: số dòng mỗi sheet)
export async function processHoTroVx(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const startRes = await fetch(`${API_URL}/kiem-ke-thanh-ly/ho-tro-vx`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!startRes.ok) {
    const body = await startRes.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi upload: ${startRes.status}`);
  }
  const { job_id } = await startRes.json();

  const startedAt = Date.now();
  while (true) {
    const job = await apiFetch(`/kiem-ke-thanh-ly/ho-tro-vx/${job_id}`);
    if (job.status === "done") {
      const files = (job.result.files || []).map(({ filename, content_base64 }) => {
        const bin = atob(content_base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        return { filename, blob };
      });
      return { files, stats: job.result.stats || {} };
    }
    if (job.status === "error") throw new Error(job.error || "Xử lý thất bại");
    if (Date.now() - startedAt > 10 * 60 * 1000) throw new Error("Quá thời gian chờ xử lý — thử lại sau");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

// Tổng hợp BCKS TTTC (25/08) — up 1-3 file kiểm kê VX đã kiểm kê thật ->
// chạy nền -> poll -> trả về { files } (files = mảng { filename, blob } —
// LUÔN có file báo cáo tổng hợp (tối đa 4 sheet: tối đa 3 sheet kiểm kê
// đã ráp + 1 sheet Tổng hợp BCKS); kèm thêm file "Import NKXK" thứ 2 nếu
// có dòng Chênh lệch khác 0 ở sheet VPKM/VTYT — tải cả 2 cùng lúc)
export async function tongHopBcksTttc(files) {
  const token = getToken();
  const formData = new FormData();
  for (const f of files) formData.append("files", f);
  const startRes = await fetch(`${API_URL}/kiem-ke-thanh-ly/tong-hop-bcks-tttc`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!startRes.ok) {
    const body = await startRes.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi upload: ${startRes.status}`);
  }
  const { job_id } = await startRes.json();

  const startedAt = Date.now();
  while (true) {
    const job = await apiFetch(`/kiem-ke-thanh-ly/tong-hop-bcks-tttc/${job_id}`);
    if (job.status === "done") {
      const files = (job.result.files || []).map(({ filename, content_base64 }) => {
        const bin = atob(content_base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        return { filename, blob };
      });
      return { files };
    }
    if (job.status === "error") throw new Error(job.error || "Xử lý thất bại");
    if (Date.now() - startedAt > 10 * 60 * 1000) throw new Error("Quá thời gian chờ xử lý — thử lại sau");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

// Up file "kết quả kiểm kê thanh lý" -> chạy nền -> poll -> trả về { blob, soDong }
// (file import Xuất Khác Tính Giá Trị, từ các dòng có Số lượng truy thu > 0)
export async function capNhatKetQuaKiemKe(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const startRes = await fetch(`${API_URL}/kiem-ke-thanh-ly/cap-nhat-ket-qua`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!startRes.ok) {
    const body = await startRes.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi upload: ${startRes.status}`);
  }
  const { job_id } = await startRes.json();

  const startedAt = Date.now();
  while (true) {
    const job = await apiFetch(`/kiem-ke-thanh-ly/cap-nhat-ket-qua/${job_id}`);
    if (job.status === "done") {
      const bin = atob(job.result.excel_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      return { blob, soDong: job.result.so_dong };
    }
    if (job.status === "error") throw new Error(job.error || "Xử lý thất bại");
    if (Date.now() - startedAt > 10 * 60 * 1000) throw new Error("Quá thời gian chờ xử lý — thử lại sau");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

// Tổng hợp Báo cáo Kiểm Soát Sau Kiểm Kê — điền sheet KIEM KE từ file Xuất
// Khác - Nhập Khác (bắt buộc) + sheet THANH LY từ file kết quả kiểm kê
// thanh lý (tuỳ chọn — có thì gộp, không thì bỏ qua sheet đó).
export async function tongHopBcksFromXknk(file, thanhLyFile) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  if (thanhLyFile) formData.append("thanh_ly_file", thanhLyFile);
  const startRes = await fetch(`${API_URL}/kiem-ke-thanh-ly/tong-hop-bcks`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!startRes.ok) {
    const body = await startRes.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi upload: ${startRes.status}`);
  }
  const { job_id } = await startRes.json();

  const startedAt = Date.now();
  while (true) {
    const job = await apiFetch(`/kiem-ke-thanh-ly/tong-hop-bcks/${job_id}`);
    if (job.status === "done") {
      const bin = atob(job.result.excel_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      return {
        blob,
        soDong: job.result.so_dong,
        soDongThieuGia: job.result.so_dong_thieu_gia,
        soDongGoc: job.result.so_dong_goc,
        soDongCatLieu: job.result.so_dong_cat_lieu,
        soDongThanhLy: job.result.so_dong_thanh_ly,
        tenFile: job.result.ten_file,
      };
    }
    if (job.status === "error") throw new Error(job.error || "Xử lý thất bại");
    if (Date.now() - startedAt > 10 * 60 * 1000) throw new Error("Quá thời gian chờ xử lý — thử lại sau");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

// ---------- Nhật ký hoạt động (chỉ admin/super_admin) ----------

export function getActivityLogSummary(date) {
  return apiFetch(`/activity-log/summary${date ? `?date=${encodeURIComponent(date)}` : ""}`);
}

export function getInactiveUsers(days) {
  return apiFetch(`/activity-log/inactive?days=${encodeURIComponent(days || 3)}`);
}

// ---------- Gửi mail BCKS (tự phục vụ — mọi user đăng nhập) ----------
// NV KSNB đính kèm thẳng file báo cáo kiểm soát ĐÃ HOÀN CHỈNH (3 sheet:
// Tổng hợp BCKS / Kiểm Kê Hàng Hóa / Kiểm kê Thanh Lý) — không xử lý gì
// thêm, chỉ đọc shop từ file để tra người nhận rồi soạn mail xem trước.

// Email gửi đi + mật khẩu ứng dụng là bảo mật CÁ NHÂN của từng NV KSNB —
// mỗi người tự nhập 1 lần, dùng lại cho các lần gửi sau; đổi thì bấm cập
// nhật lại. Server không bao giờ trả mật khẩu về, chỉ trả trạng thái.
export async function getMySmtpCredential() {
  const token = getToken();
  const res = await fetch(`${API_URL}/gui-mail-bcks/my-smtp-credential`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi tải cấu hình email gửi: ${res.status}`);
  }
  return res.json();
}

export async function saveMySmtpCredential(senderEmail, appPassword) {
  const token = getToken();
  const formData = new FormData();
  formData.append("sender_email", senderEmail);
  formData.append("app_password", appPassword);
  const res = await fetch(`${API_URL}/gui-mail-bcks/my-smtp-credential`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi lưu cấu hình email gửi: ${res.status}`);
  }
  return res.json();
}

export async function previewGuiMailBcks(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/gui-mail-bcks/preview`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi xem trước: ${res.status}`);
  }
  return res.json();
}

export async function sendGuiMailBcks(file, { to, cc, subject, greeting, signature }) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("to", to);
  formData.append("cc", cc || "");
  formData.append("subject", subject);
  formData.append("greeting", greeting);
  formData.append("signature", signature);
  const res = await fetch(`${API_URL}/gui-mail-bcks/send`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || `Lỗi gửi mail: ${res.status}`);
  }
  return res.json();
}

// ---------- Theo dõi XK-NK — tab "Theo dõi cân tồn" ----------

export function getXknkCanTon() {
  return apiFetch("/xknk/can-ton");
}

// File báo cáo XKNK gốc thường >100MB — vượt giới hạn upload mặc định của
// Cloudflare (chặn ngay lập tức, báo "Failed to fetch", request chưa từng
// tới server). Tự nén gzip trước khi gửi (giảm ~5 lần dung lượng, backend
// tự nhận diện qua magic bytes và giải nén lại) — trình duyệt không hỗ trợ
// CompressionStream (rất cũ) thì gửi thẳng file gốc, không chặn tính năng.
async function gzipFile(file) {
  if (typeof CompressionStream === "undefined") return file;
  try {
    const compressed = file.stream().pipeThrough(new CompressionStream("gzip"));
    return await new Response(compressed).blob();
  } catch {
    return file; // môi trường không hỗ trợ -> gửi thẳng file gốc
  }
}

export async function uploadXknkCanTon(file) {
  const token = getToken();
  const formData = new FormData();
  const uploadBody = await gzipFile(file);
  formData.append("file", uploadBody, file.name); // giữ tên gốc để hiển thị, dữ liệu bên trong có thể đã nén gzip
  const res = await fetch(`${API_URL}/xknk/can-ton/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || `Lỗi upload: ${res.status}`);
  }
  return res.json();
}

export function checkXknkCanTonRow(rowId) {
  return apiFetch(`/xknk/can-ton/rows/${rowId}/check`, { method: "POST" });
}

export function downloadXknkCanTonRow(rowId, filename) {
  return downloadChuDeJobBlob(`/xknk/can-ton/rows/${rowId}/download`, filename || "xknk_can_ton.xlsx");
}

export function updateXknkCanTonResult(rowId, { trang_thai, ghi_chu }) {
  const formData = new FormData();
  formData.append("trang_thai", trang_thai);
  formData.append("ghi_chu", ghi_chu || "");
  return chatFormRequest(`/xknk/can-ton/rows/${rowId}/result`, "PATCH", formData);
}

// ---------- Đề xuất kiểm kê (admin/editor/super_admin) ----------

export function lookupDeXuatShop(q) {
  return apiFetch(`/de-xuat-kiem-ke/shop-lookup?q=${encodeURIComponent(q)}`);
}
export function listDeXuatShops() {
  return apiFetch("/de-xuat-kiem-ke/shops");
}
export function createDeXuatShop(payload) {
  return apiFetch("/de-xuat-kiem-ke/shops", { method: "POST", body: JSON.stringify(payload) });
}
export function deleteDeXuatShop(id) {
  return apiFetch(`/de-xuat-kiem-ke/shops/${id}`, { method: "DELETE" });
}
// Import nhiều shop cùng lúc bằng Excel (25/08) — chỉ bắt buộc Mã Shop,
// Tên Shop trong file chỉ tham khảo (hệ thống tự tra lại theo Mã Shop).
export function downloadDeXuatShopBulkImportTemplate() {
  return downloadChuDeJobBlob("/de-xuat-kiem-ke/shops/bulk-import/template", "Mau_de_xuat_shop_kiem_ke_hang_loat.xlsx");
}
export async function bulkImportDeXuatShops(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/de-xuat-kiem-ke/shops/bulk-import`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lỗi API: ${res.status}`);
  }
  return res.json();
}
export function listDeXuatKsnb() {
  return apiFetch("/de-xuat-kiem-ke/ksnb");
}
export function createDeXuatKsnb(payload) {
  return apiFetch("/de-xuat-kiem-ke/ksnb", { method: "POST", body: JSON.stringify(payload) });
}
export function downloadDeXuatKiemKe() {
  return downloadChuDeJobBlob("/de-xuat-kiem-ke/export", "De_xuat_kiem_ke.xlsx");
}
export function deleteDeXuatKsnb(id) {
  return apiFetch(`/de-xuat-kiem-ke/ksnb/${id}`, { method: "DELETE" });
}
