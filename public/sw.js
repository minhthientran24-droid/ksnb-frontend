// Service worker tối giản — CHỈ để web đủ điều kiện "Cài đặt như app" (PWA
// installability). Cố tình KHÔNG cache trang HTML hay API (api.ksnblongchau.com)
// vì đây là dữ liệu nghiệp vụ thay đổi liên tục (báo cáo, kiểm kê, chat...) —
// cache nhầm sẽ khiến user thấy số liệu cũ. Chỉ cache tài nguyên TĨNH cùng gốc,
// có hash tên file theo nội dung (an toàn để cache dài hạn: nội dung đổi thì
// tên file đổi theo, không bao giờ trả nhầm bản cũ).
const CACHE_NAME = "ksnb-static-v1";
const STATIC_PATTERNS = [/^\/_next\/static\//, /^\/icons\//, /^\/favicon\.png$/];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // không đụng tới api.ksnblongchau.com
  if (!STATIC_PATTERNS.some((re) => re.test(url.pathname))) return; // không đụng tới trang HTML

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
  );
});
