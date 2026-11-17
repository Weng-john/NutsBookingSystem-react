import { useEffect, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { useTheme, toggleTheme } from "../theme";
import { confirmDialog } from "../dialog";
import { logoutUser } from "../api";

// 手機版 (640px 以下) 的底部分頁列，取代原本右上角的漢堡選單。
// 外觀參考 iOS 的 Liquid Glass：浮動膠囊、半透明加背景模糊；
// 不支援模糊或使用者偏好減少透明度時改為實色 (見 redesign.css 的 .tabbar)。
// 「更多」打開底部面板，放比較少用的功能。
export default function BottomTabBar({ user }) {
  const location = useLocation();
  // 「更多」面板只在開啟它的那一頁保持開啟，換頁後自然收起
  const [openAt, setOpenAt] = useState(null);
  const moreOpen = openAt === location.pathname;
  const setMoreOpen = (value) => setOpenAt((typeof value === "function" ? value(moreOpen) : value) ? location.pathname : null);
  const theme = useTheme();
  const isAdmin = user?.role === "admin";
  const isStaff = isAdmin || user?.role === "teacher";

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e) => e.key === "Escape" && setOpenAt(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const logout = async () => {
    setMoreOpen(false);
    const ok = await confirmDialog("確定要登出嗎？", { title: "登出", confirmText: "登出", tone: "warning" });
    if (ok) logoutUser(true);
  };

  const tabs = user
    ? [
      { to: "/", label: "找考試", icon: "fa-calendar-days", end: true },
      { to: "/myReserve", label: "我的考試", icon: "fa-clipboard-list" },
      { to: "/notifications", label: "通知", icon: "fa-bell" },
    ]
    : [
      { to: "/", label: "找考試", icon: "fa-calendar-days", end: true },
      { to: "/guidelines", label: "考試須知", icon: "fa-circle-question" },
      { to: "/login", label: "登入", icon: "fa-right-to-bracket" },
    ];

  return (
    <>
      <nav className="tabbar" aria-label="主要分頁">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="tabbar-item">
            <i className={`fa-solid ${tab.icon}`} aria-hidden="true"></i>
            <span>{tab.label}</span>
          </NavLink>
        ))}
        <button type="button" className={`tabbar-item ${moreOpen ? "active" : ""}`} aria-expanded={moreOpen} aria-haspopup="dialog" onClick={() => setMoreOpen((v) => !v)}>
          <i className="fa-solid fa-ellipsis" aria-hidden="true"></i>
          <span>更多</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <div className="sheet-scrim" onClick={() => setMoreOpen(false)}></div>
          <div className="sheet more-sheet" role="dialog" aria-modal="true" aria-label="更多功能">
            <div className="sheet-handle" aria-hidden="true"></div>
            <ul className="more-list">
              {user && <li><Link to="/account"><i className="fa-solid fa-user" aria-hidden="true"></i>我的資料</Link></li>}
              <li><Link to="/guidelines"><i className="fa-solid fa-circle-question" aria-hidden="true"></i>考試須知與常見問題</Link></li>
              <li><Link to="/contact"><i className="fa-solid fa-envelope" aria-hidden="true"></i>聯絡我們</Link></li>
              {isStaff && <li><Link to={isAdmin ? "/admin" : "/examManager"}><i className="fa-solid fa-gauge-high" aria-hidden="true"></i>管理後台</Link></li>}
              <li>
                <button type="button" role="switch" aria-checked={theme === "dark"} onClick={toggleTheme}>
                  <i className="fa-solid fa-moon" aria-hidden="true"></i>深色模式
                  <span className={`mini-switch ${theme === "dark" ? "on" : ""}`} aria-hidden="true"></span>
                </button>
              </li>
              {user && <li><button type="button" className="danger" onClick={logout}><i className="fa-solid fa-right-from-bracket" aria-hidden="true"></i>登出</button></li>}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
