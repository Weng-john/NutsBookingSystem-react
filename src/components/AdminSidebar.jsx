import { useEffect, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import nutsLogo from "../assets/image/nuts.png";
import { useTheme, toggleTheme } from "../theme";
import { confirmDialog } from "../dialog";
import { logoutUser } from "../api";

// 管理後台的側邊欄。所有管理功能集中在這裡，依「每日作業／資料管理／報表與紀錄」分組，
// 並依角色過濾 (老師只看得到考試場次與考場)。
// 電腦版固定在左側；1024px 以下收合成只剩圖示；640px 以下改為從左側滑出的抽屜。

const groups = [
  { label: null, items: [{ to: "/admin", label: "總覽", icon: "fa-gauge-high", admin: true, end: true }] },
  {
    label: "每日作業", items: [
      { to: "/reservationManager", label: "報名審核", icon: "fa-clipboard-check", admin: true },
    ],
  },
  {
    label: "資料管理", items: [
      { to: "/examManager", label: "考試場次", icon: "fa-calendar-days" },
      { to: "/subjectManager", label: "科目", icon: "fa-book", admin: true },
      { to: "/roomManager", label: "考場", icon: "fa-building" },
      { to: "/memberManager", label: "會員", icon: "fa-users", admin: true },
    ],
  },
  {
    label: "報表與紀錄", items: [
      { to: "/reservationReport", label: "名單與統計", icon: "fa-chart-column", admin: true },
      { to: "/notificationManager", label: "通知管理", icon: "fa-paper-plane", admin: true },
      { to: "/auditLogs", label: "操作紀錄", icon: "fa-clock-rotate-left", admin: true },
    ],
  },
];

const titles = Object.fromEntries(groups.flatMap((group) => group.items.map((item) => [item.to, item.label])));

export default function AdminSidebar({ user }) {
  const location = useLocation();
  // 抽屜只在開啟它的那一頁保持開啟，換頁後自然收起
  const [openAt, setOpenAt] = useState(null);
  const open = openAt === location.pathname;
  const setOpen = (value) => setOpenAt(value ? location.pathname : null);
  const theme = useTheme();
  const isAdmin = user?.role === "admin";
  const displayName = `${user?.lastname || ""}${user?.firstname || ""}` || user?.nickname || user?.email || "";

  // 抽屜開啟時按 Esc 關閉
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpenAt(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const logout = async () => {
    const ok = await confirmDialog("確定要登出嗎？", { title: "登出", confirmText: "登出", tone: "warning" });
    if (ok) logoutUser(true);
  };

  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => isAdmin || !item.admin) }))
    .filter((group) => group.items.length);

  return (
    <>
      {/* 手機的頂部列：選單按鈕與目前頁面名稱 */}
      <div className="admin-topbar">
        <button type="button" className="admin-icon-btn" aria-label="開啟管理選單" aria-expanded={open} onClick={() => setOpen(true)}>
          <i className="fa-solid fa-bars" aria-hidden="true"></i>
        </button>
        <span className="admin-topbar-title">{titles[location.pathname] || "管理後台"}</span>
        <Link to="/" className="admin-icon-btn" aria-label="回到考生頁面"><i className="fa-solid fa-house" aria-hidden="true"></i></Link>
      </div>

      {open && <div className="admin-scrim" onClick={() => setOpen(false)}></div>}

      <aside className={`admin-sidebar ${open ? "open" : ""}`} aria-label="管理選單">
        <div className="admin-brand">
          <Link to={isAdmin ? "/admin" : "/examManager"} className="admin-brand-link">
            <img src={nutsLogo} alt="" />
            <span><strong>核果學苑</strong><small>管理後台</small></span>
          </Link>
          <button type="button" className="admin-icon-btn admin-close" aria-label="關閉管理選單" onClick={() => setOpen(false)}>
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        <nav className="admin-nav">
          {visibleGroups.map((group) => (
            <div className="admin-nav-group" key={group.label || "top"}>
              {group.label && <div className="admin-nav-label">{group.label}</div>}
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className="admin-nav-item" title={item.label}>
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true"></i>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-foot">
          <Link to="/" className="admin-nav-item" title="回到考生頁面">
            <i className="fa-solid fa-arrow-left" aria-hidden="true"></i><span>回到考生頁面</span>
          </Link>
          <button type="button" className="admin-nav-item" onClick={toggleTheme} title={theme === "dark" ? "切換為淺色模式" : "切換為深色模式"}>
            <i className={`fa-solid ${theme === "dark" ? "fa-sun" : "fa-moon"}`} aria-hidden="true"></i>
            <span>{theme === "dark" ? "淺色模式" : "深色模式"}</span>
          </button>
          <div className="admin-user">
            <span className="admin-avatar" aria-hidden="true">{displayName.slice(0, 1)}</span>
            <span className="admin-user-text"><strong>{displayName}</strong><small>{isAdmin ? "管理員" : "老師"}</small></span>
            <button type="button" className="admin-icon-btn" aria-label="登出" title="登出" onClick={logout}>
              <i className="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
