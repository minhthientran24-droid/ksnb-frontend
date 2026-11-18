import { useEffect } from "react";
import { useRouter } from "next/router";

// Đã chuyển vào menu LAB HOUSE (tab "Giám sát GPS") — giữ đường dẫn cũ để link/bookmark cũ vẫn dùng được.
export default function GiamSatGpsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/lab-house"); }, []);
  return null;
}
