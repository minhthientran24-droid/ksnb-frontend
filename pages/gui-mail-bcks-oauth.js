import { useEffect } from "react";
import { useRouter } from "next/router";

// Đã gộp thành tab "Outlook" trong menu "Gửi mail BCKS". Giữ đường dẫn này vì Microsoft/backend callback vẫn quay về đây kèm ?ms=...
export default function GuiMailBcksOauthRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    const q = new URLSearchParams();
    q.set("tab", "outlook");
    Object.entries(router.query || {}).forEach(([k, v]) => q.set(k, Array.isArray(v) ? v[0] : v));
    router.replace(`/gui-mail-bcks?${q.toString()}`);
  }, [router.isReady]);
  return null;
}
