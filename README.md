# KSNB Long Châu — Frontend (Next.js)

Web thật, gọi vào API backend (`ksnb-backend`) — không còn dữ liệu cứng như bản demo HTML.

## Chạy thử ở local

```bash
npm install
cp .env.local.example .env.local     # chỉnh NEXT_PUBLIC_API_URL nếu backend chạy chỗ khác
npm run dev
```

Mở `http://localhost:3000` → sẽ tự chuyển tới `/login` nếu chưa đăng nhập.
Đăng nhập bằng tài khoản đã tạo qua `create_user.py` ở phần backend.

## Cấu trúc

```
pages/
  login.js              trang đăng nhập
  index.js               trang chủ (KPI tổng quan)
  gioi-thieu.js           giới thiệu phòng ban
  bao-cao/index.js        danh sách báo cáo hàng tháng
  bao-cao/[period].js     chi tiết 1 kỳ báo cáo
components/
  Sidebar.js, Layout.js
lib/
  api.js                  gọi API + quản lý phiên đăng nhập (JWT lưu ở localStorage)
```

## Lưu ý quan trọng

- **Chưa chạy thử build được trong môi trường tạo file này** vì không có kết nối
  mạng để `npm install`. Anh nhớ chạy `npm run dev` và test kỹ trước khi deploy,
  báo lại nếu gặp lỗi để em sửa tiếp.
- Trang "Dashboard tra cứu" (lọc/biểu đồ) **chưa làm** — đây là bước tiếp theo.
- Deploy: đẩy code này lên GitHub → import vào Vercel → set biến môi trường
  `NEXT_PUBLIC_API_URL` trỏ tới backend thật → trỏ domain KSNBlongchau.com vào
  project Vercel đó.
