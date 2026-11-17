import React, { useState, useEffect, useRef } from "react";
import { NavLink, Link } from "react-router-dom";
import nutsLogo from "../assets/image/nuts.png";
import { STORAGE_KEYS } from "../config";
import { logoutUser } from "../api";
import { useTheme, toggleTheme as toggleStoredTheme } from "../theme";
import { confirmDialog } from "../dialog";
import Tooltip from "./Tooltip";

// --- SVG 圖示元件 ---
const IconUser = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
);
const IconCalendar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
);
const IconLogout = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
);
const IconMail = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
);
const IconChart = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
);
const IconBell = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
);
const IconHelp = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
);
const IconSun = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
);
const IconMoon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
);
const IconMenu = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>
);
const IconClose = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
);
const IconUserPlaceholder = () => (
  <svg
    width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    className="icon-user-placeholder"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);


export default function Header({ user, page }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false); // 手機/平板的漢堡選單
  const [imgError, setImgError] = useState(false);
  const theme = useTheme();
  const menuRef = useRef(null);
  const headerRef = useRef(null);

  const activeClass = ({ isActive }) => (isActive ? "dark-background" : undefined);

  const toggleTheme = (e) => {
    e.stopPropagation();
    toggleStoredTheme();
  };

  // --- 權限判斷外提 ---
  const isAdmin = user?.role === "admin";
  const isTeacherOrAdmin = user?.role === "teacher" || isAdmin;
  const showAvatarImage = user?.picture?.trim() && !imgError;
  const displayName = `${user?.lastname || ""}${user?.firstname || ""}` || user?.nickname || user?.email || "";

  // 點擊外部關閉選單
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
      if (headerRef.current && !headerRef.current.contains(event.target)) {
        setIsNavOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const logout = async () => {
    setIsMenuOpen(false);
    const ok = await confirmDialog("確定要登出嗎？", { title: "登出", confirmText: "登出", tone: "warning" });
    // 已經在這裡確認過，傳 true 讓 api.js 略過它自己的確認
    if (ok) logoutUser(true);
  };

  const handleLinkClick = () => setIsMenuOpen(false);

  // 點擊側邊選單中的任一連結後收合
  const handleNavClick = (e) => {
    if (e.target.closest("a")) setIsNavOpen(false);
  };

  // 頁面導覽項目：考生端只放常用功能；管理功能集中到「管理後台」的側邊欄
  const navItems = [
    { to: "/", label: "找考試", icon: "fa-calendar-days", end: true },
    { to: "/myReserve", label: "我的考試", icon: "fa-clipboard-list" },
    { to: "/guidelines", label: "考試須知", icon: "fa-circle-question" },
    { to: "/contact", label: "聯絡我們", icon: "fa-envelope" },
    isTeacherOrAdmin && { to: isAdmin ? "/admin" : "/examManager", label: "管理後台", icon: "fa-gauge-high", staff: true },
  ].filter(Boolean);

  const themeLabel = theme === "light" ? "切換為深色模式" : "切換為淺色模式";

  // header 上的主題切換圖示。登入後在平板/手機會隱藏 (改放側邊選單底部)，避免右上角太擠
  const renderThemeButton = (className) => (
    <Tooltip content={themeLabel} side="left">
      <button type="button" className={className} onClick={toggleTheme} aria-label={themeLabel}>
        {theme === "light" ? <IconMoon /> : <IconSun />}
      </button>
    </Tooltip>
  );

  return (
    <header id="header" ref={headerRef}>
      <div className="inner">

        {/* 左側 Logo */}
        <div className="left">
          <h2>
            <Link to="/" className="logo">
              <img src={nutsLogo} alt="" className="logoIMG" />
              <span className="logo-text">核果資訊學苑<span className="logo-sub">考試報名</span></span>
            </Link>
          </h2>
        </div>

        {/* 頁面導覽 (登入後才有)：桌機版排成一列；平板/手機是從右側滑出的側邊選單 */}
        {user && (
          <>
            {isNavOpen && <div className="nav-scrim" onClick={() => setIsNavOpen(false)}></div>}
            <nav className={`right ${isNavOpen ? "open" : ""}`} aria-label="主選單">
              <div className="nav-drawer-head">
                <span>選單</span>
                <button type="button" className="nav-close" aria-label="關閉選單" onClick={() => setIsNavOpen(false)}>
                  <IconClose />
                </button>
              </div>
              <ul onClick={handleNavClick}>
                {navItems.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} end={item.end} className={(state) => [activeClass(state), item.staff ? "nav-staff" : ""].filter(Boolean).join(" ") || undefined}>
                      <i className={`nav-icon fa-solid ${item.icon}`}></i>
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>

              {/* 主題切換：平板/手機放在側邊選單底部 (桌機版是 header 上的圖示) */}
              <div className="nav-drawer-foot">
                <button type="button" className="drawer-theme-toggle" role="switch" aria-checked={theme === "dark"} onClick={toggleTheme}>
                  <IconMoon />
                  <span>深色模式</span>
                  <div className={`theme-switch ${theme}`}>
                    <div className="switch-handle"></div>
                  </div>
                </button>
              </div>
            </nav>
          </>
        )}

        {/* 右上角：帳號與選單按鈕，任何寬度都顯示 */}
        <div className="header-actions">
          {user ? (
            <>
              {renderThemeButton("theme-icon-btn desktop-only")}

              {/* --- 大頭貼與帳號選單 --- */}
              <div className="user-menu" ref={menuRef}>
                <Tooltip content={isMenuOpen ? "關閉帳號選單" : "開啟帳號選單"} side="left">
                  <button
                    type="button"
                    className={`user-menu-btn ${isMenuOpen ? 'active' : ''}`}
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    aria-label="帳號選單"
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                  >
                    {showAvatarImage ? (
                      <img
                        src={user.picture}
                        alt="avatar"
                        className="user-avatar"
                        onError={() => setImgError(true)}
                      />
                    ) : (
                      <IconUserPlaceholder />
                    )}
                  </button>
                </Tooltip>

                {isMenuOpen && (
                  <div className="dropdown-menu">
                    <div className="menu-profile">
                      <span className="user-menu-name">{displayName}</span>
                      {user.email && user.email !== displayName && <span className="user-menu-email">{user.email}</span>}
                    </div>

                    <div className="menu-divider"></div>

                    <Link to="/account" className="menu-item" onClick={handleLinkClick}>
                      <span className="menu-icon"><IconUser /></span>
                      <span>我的資料</span>
                    </Link>

                    <Link to="/myReserve" className="menu-item" onClick={handleLinkClick}>
                      <span className="menu-icon"><IconCalendar /></span>
                      <span>我的考試</span>
                    </Link>

                    <Link to="/notifications" className="menu-item" onClick={handleLinkClick}>
                      <span className="menu-icon"><IconBell /></span>
                      <span>通知中心</span>
                    </Link>

                    {isTeacherOrAdmin && (
                      <Link to={isAdmin ? "/admin" : "/examManager"} className="menu-item" onClick={handleLinkClick}>
                        <span className="menu-icon"><IconChart /></span>
                        <span>管理後台</span>
                      </Link>
                    )}

                    <div className="menu-divider"></div>

                    <Link to="/guidelines" className="menu-item" onClick={handleLinkClick}>
                      <span className="menu-icon"><IconHelp /></span>
                      <span>考試須知</span>
                    </Link>

                    <Link to="/contact" className="menu-item" onClick={handleLinkClick}>
                      <span className="menu-icon"><IconMail /></span>
                      <span>聯絡我們</span>
                    </Link>

                    <div className="menu-divider"></div>

                    <button type="button" className="menu-item logout" onClick={logout}>
                      <span className="menu-icon"><IconLogout /></span>
                      <span>登出</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 選單按鈕 (僅在平板/手機顯示) */}
              <button
                type="button"
                className="nav-toggle"
                aria-label="開啟選單"
                aria-expanded={isNavOpen}
                onClick={() => setIsNavOpen(true)}
              >
                <IconMenu />
              </button>
            </>
          ) : (
            <>
              {/* 未登入：沒有帳號選單，首頁、主題切換與登入直接放在右上角 */}
              <NavLink to="/" end className="header-link">找考試</NavLink>
              <NavLink to="/guidelines" className="header-link">考試須知</NavLink>
              {renderThemeButton("theme-icon-btn")}
              {page !== "login" && <NavLink to="/login" className="header-link btn">登入 / 註冊</NavLink>}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
