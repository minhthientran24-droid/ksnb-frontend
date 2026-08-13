// Client cho hệ "Phân công & Quản lý" (app1_...). Backend vẫn dùng cơ chế
// token app1_ riêng (nhiều nghiệp vụ đã build trên đó), nhưng NGƯỜI DÙNG
// đăng nhập chung với web KSNB — token app1_ được "bridge" ngầm từ JWT web
// hiện có (chỉ admin/super_admin mới bridge được), không cần tài khoản
// riêng. Xem lib/api.js cho JWT web (getToken/getUser).
import { getToken as getWebToken } from "./api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_KEY = "llv2_token";
const USER_KEY = "llv2_user";

export function llv2SaveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function llv2GetToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function llv2GetUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}
export function llv2ClearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function llv2Fetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Lỗi ${res.status}`);
  return body;
}

// Bridge phiên đăng nhập web KSNB hiện tại (JWT) thành phiên app1_ —
// không cần username/password riêng. Chỉ admin/super_admin bridge được.
export async function llv2BridgeLogin() {
  const webToken = getWebToken();
  if (!webToken) throw new Error("Chưa đăng nhập web KSNB");
  const res = await fetch(`${API_URL}/app-auth/bridge-login`, {
    method: "POST",
    headers: { Authorization: `Bearer ${webToken}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Lỗi ${res.status}`);
  llv2SaveSession(body.token, body.user);
  return body;
}

export function llv2Logout() {
  const token = llv2GetToken();
  llv2ClearSession();
  if (token) llv2Fetch("/app-auth/logout", { method: "POST", body: JSON.stringify({ token }) }).catch(() => {});
}

function withToken(path, params = {}) {
  const qs = new URLSearchParams({ ...params, token: llv2GetToken() || "" }).toString();
  return `${path}?${qs}`;
}

export function llv2GetShops(group, month = "", through = "") {
  return llv2Fetch(withToken("/lichlamviec/v2/shops", { group, month, through }));
}
export function llv2GetCandidates(group, scanDate = "") {
  return llv2Fetch(withToken("/lichlamviec/v2/candidates", { group, scan_date: scanDate }));
}
export function llv2GetMyShops() {
  return llv2Fetch(withToken("/lichlamviec/v2/my-shops"));
}
export function llv2GetScheduledToday(group) {
  return llv2Fetch(withToken("/lichlamviec/v2/scheduled-today", { group }));
}
export function llv2GetBatches(group) {
  return llv2Fetch(withToken("/lichlamviec/v2/batches", { group }));
}
export function llv2GetBatchRows(id) {
  return llv2Fetch(withToken("/lichlamviec/v2/batch-rows", { id }));
}
export function llv2GetForecast(group, month) {
  return llv2Fetch(withToken("/lichlamviec/v2/forecast", { group, month }));
}
export function llv2GetHistory(maShop, month = "") {
  return llv2Fetch(withToken("/lichlamviec/v2/history", { ma_shop: maShop, month }));
}

function post(path, body) {
  return llv2Fetch(path, { method: "POST", body: JSON.stringify({ ...body, token: llv2GetToken() || "" }) });
}
export function llv2Schedule(payload) {
  return post("/lichlamviec/v2/schedule", payload);
}
export function llv2Reschedule(payload) {
  return post("/lichlamviec/v2/reschedule", payload);
}
export function llv2SetClass(payload) {
  return post("/lichlamviec/v2/classification", payload);
}
export function llv2DeleteCycle(payload) {
  return post("/lichlamviec/v2/delete-cycle", payload);
}

// Upload file Excel "danh sách shop + lịch sử kiểm kê" (đúng layout file
// TrangThaiTheoBoLoc) — thêm shop mới + cập nhật cột kết quả kiểm gần nhất.
export async function llv2UploadDanhSach(file) {
  const fd = new FormData();
  fd.append("token", llv2GetToken() || "");
  fd.append("file", file);
  const res = await fetch(`${API_URL}/lichlamviec/v2/upload-danh-sach`, { method: "POST", body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Lỗi ${res.status}`);
  return body;
}

// URL tải xuống file trạng thái hiện tại (server tự regenerate nếu chưa có).
export function llv2DownloadDanhSachUrl() {
  return withToken("/lichlamviec/v2/download-danh-sach");
}

// Upload file mẫu "Tên KSNB - Số lượng shop" -> điền nhanh form Chia lịch.
export async function llv2UploadQuota(file) {
  const fd = new FormData();
  fd.append("token", llv2GetToken() || "");
  fd.append("file", file);
  const res = await fetch(`${API_URL}/lichlamviec/v2/parse-quota-upload`, { method: "POST", body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Lỗi ${res.status}`);
  return body;
}
