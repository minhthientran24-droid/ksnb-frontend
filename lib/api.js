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

export function listReports() {
  return apiFetch("/reports");
}

export function getReport(periodLabel) {
  return apiFetch(`/reports/${periodLabel}`);
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

export function getKiemKePeriods() {
  return apiFetch("/tracking/kiem-ke/periods");
}

export function listKiemKe(period) {
  return apiFetch(`/tracking/kiem-ke?period=${encodeURIComponent(period)}`);
}

export function updateKiemKeGhiChu(id, ghi_chu) {
  return apiFetch(`/tracking/kiem-ke/${id}/ghi-chu`, {
    method: "PATCH",
    body: JSON.stringify({ ghi_chu }),
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
