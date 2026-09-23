const { execSync } = require("child_process");

// Chốt 23/09 — lấy mã commit ngắn + thời gian commit gần nhất lúc BUILD
// (chạy trên Vercel mỗi lần deploy, hoặc "npm run build" cục bộ) để hiện
// "Ver + ngày giờ cập nhật" ngay cạnh tên tài khoản (xem Layout.js) — anh
// Thiện dùng để biết chắc 1 lần deploy đã thực sự lên chưa, khỏi phải
// đoán qua cảm giác như các lần trước. Lấy lỗi (VD build trong môi trường
// không có git) thì trả rỗng, Layout.js tự ẩn phần này thay vì crash cả trang.
function safeGit(cmd) {
  try {
    return execSync(cmd, { cwd: __dirname }).toString().trim();
  } catch (e) {
    return "";
  }
}

const APP_VERSION = safeGit("git rev-parse --short HEAD");
const APP_COMMIT_TIME = safeGit("git log -1 --format=%cI"); // ISO 8601, giờ commit (không phải giờ build)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
    NEXT_PUBLIC_APP_COMMIT_TIME: APP_COMMIT_TIME,
  },
  // Đổi URL /lich-lam-viec-v2 -> /lich-lam-viec (bỏ chữ "V2", chốt 30/08) —
  // redirect để link/bookmark cũ không bị lỗi 404.
  async redirects() {
    return [
      { source: "/lich-lam-viec-v2", destination: "/lich-lam-viec", permanent: true },
    ];
  },
};

module.exports = nextConfig;
