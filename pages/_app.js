import { useEffect } from "react";
import Head from "next/head";
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  // Đăng ký service worker để web đủ điều kiện "Cài đặt như app" trên
  // điện thoại (PWA) — xem public/sw.js, không cache dữ liệu nghiệp vụ.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <>
      <Head>
        <title>KSNB Long Châu</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#1B3B80" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="KSNB Long Châu" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
