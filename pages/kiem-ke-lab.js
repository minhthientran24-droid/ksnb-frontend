import { useEffect } from "react";
import { useRouter } from "next/router";

// Đã chuyển vào menu LAB HOUSE (tab "Kiểm kê LAB"). Link kiểm cho người kiểm /kiem-ke-lab/{token} vẫn dùng như cũ.
export default function KiemKeLabRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/lab-house"); }, []);
  return null;
}
