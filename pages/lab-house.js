import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import GpsMonitorTab from "../components/GpsMonitorTab";
import { getUser } from "../lib/api";

// LAB HOUSE — khu vực thử nghiệm, chỉ super_admin. Mỗi tính năng là 1 tab con (thêm tab mới: bổ sung vào TABS).
const TABS = [
  { key: "gps", icon: "🛰️", label: "Giám sát GPS", render: () => <GpsMonitorTab /> },
];

export default function LabHousePage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState(TABS[0].key);

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "super_admin") {
      router.replace("/");
      return;
    }
    try {
      const saved = window.localStorage.getItem("labhouse_tab");
      if (saved && TABS.some((t) => t.key === saved)) setTab(saved);
    } catch {}
    setChecked(true);
  }, []);

  function pick(k) {
    setTab(k);
    try { window.localStorage.setItem("labhouse_tab", k); } catch {}
  }

  if (!checked) return null;
  const cur = TABS.find((t) => t.key === tab) || TABS[0];

  return (
    <Layout crumb="LAB HOUSE">
      <div className="page-head">
        <h1>🧪 LAB HOUSE</h1>
        <p>Khu vực thử nghiệm các tính năng mới (chỉ super_admin).</p>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        {TABS.map((t) => {
          const on = t.key === cur.key;
          return (
            <button
              key={t.key}
              onClick={() => pick(t.key)}
              style={{
                background: on ? "#E3F0FF" : "transparent", color: on ? "#1C64B4" : "var(--text-600)", border: "none",
                borderBottom: on ? "3px solid #1C64B4" : "3px solid transparent", padding: "9px 16px", fontSize: 13.5,
                fontWeight: 700, cursor: "pointer", borderRadius: "8px 8px 0 0", marginBottom: -1,
              }}
            >
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>
      {cur.render()}
    </Layout>
  );
}
