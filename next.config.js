/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Đổi URL /lich-lam-viec-v2 -> /lich-lam-viec (bỏ chữ "V2", chốt 30/08) —
  // redirect để link/bookmark cũ không bị lỗi 404.
  async redirects() {
    return [
      { source: "/lich-lam-viec-v2", destination: "/lich-lam-viec", permanent: true },
    ];
  },
};

module.exports = nextConfig;
