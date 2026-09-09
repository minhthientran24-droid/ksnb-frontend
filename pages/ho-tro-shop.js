import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { useAllowedKeys } from "../lib/permissions";

// Menu "Hỗ trợ shop" (chốt 09/09) — dành cho TẤT CẢ role (không giới hạn
// như "Hỗ Trợ Kiểm Kê"), gồm nhiều tab hỗ trợ xử lý cho shop. Tab đầu
// tiên "Hỗ trợ check lệch tồn VX" mới dựng khung — rule xử lý thật sẽ bổ
// sung sau khi anh mô tả chi tiết. Theo đúng pattern nhiều tab đã dùng ở
// ho-tro-kiem-ke.js (TAB_KEYS + useAllowedKeys tự chuyển tab khi mất quyền).
const TAB_KEYS = ["check_lech_ton_vx"];
const TAB_LABELS = {
  check_lech_ton_vx: "Hỗ trợ check lệch tồn VX",
};

export default function HoTroShopPage() {
  const { can, ready: permReady } = useAllowedKeys();
  const [tab, setTab] = useState("check_lech_ton_vx");

  // Tự chuyển tab đầu tiên còn quyền nếu tab đang mở bị super_admin gỡ
  // quyền qua "Quản lý phân quyền" — cùng cách làm với ho-tro-kiem-ke.js.
  useEffect(() => {
    if (!permReady || can(`/ho-tro-shop::${tab}`)) return;
    const first = TAB_KEYS.find((k) => can(`/ho-tro-shop::${k}`));
    if (first) setTab(first);
  }, [permReady, tab]);

  return (
    <Layout crumb="Hỗ trợ shop">
      <div className="page-head">
        <h1>Hỗ trợ shop</h1>
      </div>

      <div className="month-tabs">
        {TAB_KEYS.filter((k) => can(`/ho-tro-shop::${k}`)).map((k) => (
          <div key={k} className={`month-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            {TAB_LABELS[k]}
          </div>
        ))}
      </div>

      {tab === "check_lech_ton_vx" && (
        <div className="card">
          <div className="card-head"><h3>🔎 Hỗ trợ check lệch tồn VX</h3></div>
          <div className="card-body">
            <div className="placeholder-box">
              Tab đang được xây dựng — nội dung/rule xử lý sẽ được bổ sung sau.
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
