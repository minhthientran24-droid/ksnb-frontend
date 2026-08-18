// Logo FPT (3 khối lệch màu xanh dương/cam/xanh lá, chữ F-P-T) — dùng ở
// Sidebar + trang đăng nhập. Vẽ bằng SVG (không cần file ảnh riêng), dùng
// đúng bộ màu thương hiệu đã khai báo sẵn trong globals.css.
export default function FptLogo({ height = 28 }) {
  return (
    <svg
      viewBox="-8 -2 100 36"
      height={height}
      style={{ display: "block", flexShrink: 0 }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="FPT"
    >
      <g transform="skewX(-12)">
        <rect x="0" y="0" width="26" height="32" rx="4" fill="#295098" />
        <text x="13" y="23" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="19" fill="#fff" textAnchor="middle">F</text>
        <rect x="30" y="0" width="26" height="32" rx="4" fill="#DC7738" />
        <text x="43" y="23" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="19" fill="#fff" textAnchor="middle">P</text>
        <rect x="60" y="0" width="26" height="32" rx="4" fill="#70B256" />
        <text x="73" y="23" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="19" fill="#fff" textAnchor="middle">T</text>
      </g>
    </svg>
  );
}
