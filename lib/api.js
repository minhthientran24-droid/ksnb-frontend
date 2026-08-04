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

export function getKiemKePeriods(loai) {
  return apiFetch(`/tracking/kiem-ke/periods?loai=${encodeURIComponent(loai)}`);
}

export function listKiemKe(period, loai) {
  return apiFetch(`/tracking/kiem-ke?period=${encodeURIComponent(period)}&loai=${encodeURIComponent(loai)}`);
}

// Nút "Đồng bộ ngay" trên web (chỉ admin/super_admin) — đọc trực tiếp file
// Excel local đã mount vào server, không cần chờ tới 23h
export function syncKiemKeNow() {
  return apiFetch("/tracking/kiem-ke/sync-now", { method: "POST" });
}

export function updateKiemKeGhiChu(id, ghi_chu) {
  return apiFetch(`/tracking/kiem-ke/${id}/ghi-chu`, {
    method: "PATCH",
    body: JSON.stringify({ ghi_chu }),
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

export function getLatestChuDe() {
  return apiFetch("/tracking/chu-de/latest");
}

export function getChuDeHistory() {
  return apiFetch("/tracking/chu-de/history");
}

export function listActivities() {
  return apiFetch("/activities");
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
