import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { listUsersAPI, setUserRoleAPI, setUserMembershipAPI, adminDeleteUserAPI } from "../api";

export default function MemberManager() {
  const { user, setGlobalLoading, globalLoading, setLoadingText, setSubmit, requestCaptcha } = useOutletContext();
  const navigate = useNavigate();

  // 👉 將狀態改為儲存「所有」使用者
  const [allUsers, setAllUsers] = useState([]);
  
  // --- 篩選器狀態 ---
  const [query, setQuery] = useState("");
  const [tempQuery, setTempQuery] = useState(""); 
  const [roleFilter, setRoleFilter] = useState("");
  const [openFilterMenu, setOpenFilterMenu] = useState(null);

  const isAdmin = useMemo(() => user?.role === "admin", [user]);

  // 1. 取得使用者清單 (👉 移除篩選參數，一次抓取全部)
  const fetchUsers = useCallback(async () => {
    setLoadingText("正在取得使用者清單...");
    setSubmit(false); 
    setGlobalLoading(true);
    try {
      // 假設 listUsersAPI 不帶參數時會回傳所有人
      const res = await listUsersAPI({});

      const list = res?.data?.users || [];
      if (Array.isArray(list)) setAllUsers(list);
    } catch (err) {
      console.error("Fetch users error:", err);
      alert("讀取使用者清單失敗：" + err.message);
    } finally {
      setGlobalLoading(false);
      setLoadingText("");
    }
  }, [setGlobalLoading, setLoadingText, setSubmit]); // 👉 移除了 query, roleFilter 的依賴

  // 權限檢查與初始化 (只在剛進入或權限確認後抓取一次)
  useEffect(() => {
    if (user && !isAdmin) {
      alert("權限不足，將返回首頁");
      navigate("/");
      return;
    }
    if (user && isAdmin) {
      fetchUsers();
    }
  }, [user, isAdmin, navigate, fetchUsers]);

  // 👉 新增：前端過濾邏輯 (利用 useMemo 避免不必要的重新計算)
  const filteredUsers = useMemo(() => {
    return allUsers.filter((u) => {
      // 1. 檢查角色
      const matchRole = roleFilter ? u.role === roleFilter : true;
      
      // 2. 檢查關鍵字 (Email 或 姓名)
      const searchQ = query.toLowerCase().trim();
      const email = String(u.email || "").toLowerCase();
      const name = (String(u.lastname || "") + String(u.firstname || "") || String(u.nickname || "")).toLowerCase();
      
      const matchQuery = searchQ 
        ? (email.includes(searchQ) || name.includes(searchQ)) 
        : true;

      return matchRole && matchQuery;
    });
  }, [allUsers, query, roleFilter]);

  // 同步 tempQuery 與 query
  useEffect(() => {
    setTempQuery(query);
  }, [query]);

  // 點擊外部關閉標題列的篩選器
  useEffect(() => {
    const closeMenu = () => setOpenFilterMenu(null);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

  // 2. 變更 Role
  async function handleChangeRole(name, targetEmail, newRole) {
    if (!window.confirm(`確定要將 ${name} 的角色改為「${newRole}」嗎？`)) return;

    const token = await requestCaptcha();
    if (!token) return; 

    setLoadingText("正在更新使用者角色...");
    setSubmit(true); 
    setGlobalLoading(true);
    try {
      const res = await setUserRoleAPI(targetEmail, newRole, token); 
      if (res.ok) {
        alert("✅ 角色已更新！");
        await fetchUsers(); // 👉 更新資料庫後，重新抓取最新狀態
      } else {
        alert("❌ 更新失敗：" + (res.message || "未知錯誤"));
      }
    } catch (err) {
      console.error(err);
      alert("⚠️ 系統錯誤，更新失敗：" + err.message);
    } finally {
      setSubmit(false); 
      setGlobalLoading(false);
      setLoadingText("");
    }
  }

  // 3. 變更 Membership
  async function handleChangeMembership(targetEmail, membership) {
    const trimmed = String(membership || "").trim();
    if (!trimmed) return alert("membership 不能為空");

    if (!window.confirm(`確定要將 ${targetEmail} 的 membership 改為「${trimmed}」嗎？`)) return;

    const token = await requestCaptcha();
    if (!token) return;

    setLoadingText("正在更新會員狀態...");
    setSubmit(true); 
    setGlobalLoading(true);
    try {
      const res = await setUserMembershipAPI(targetEmail, trimmed, token); 
      if (res.ok) {
        alert("✅ membership 已更新！");
        await fetchUsers();
      } else {
        alert("❌ 更新失敗：" + (res.message || "未知錯誤"));
      }
    } catch (err) {
      console.error(err);
      alert("⚠️ 系統錯誤，更新失敗：" + err.message);
    } finally {
      setSubmit(false); 
      setGlobalLoading(false);
      setLoadingText("");
    }
  }

  // 4. 管理員刪除 User
  async function handleAdminDelete(targetEmail) {
    const ok = window.confirm(
      `⚠️ 確定要刪除使用者？\n\n${targetEmail}\n\n` +
      `此操作會：\n- 刪除 Users 帳號\n- 取消該使用者所有預約（名額扣回）\n- 金流資料不會刪除\n`
    );
    if (!ok) return;

    const token = await requestCaptcha();
    if (!token) return;

    setLoadingText("正在刪除使用者...");
    setSubmit(true); 
    setGlobalLoading(true);
    try {
      const res = await adminDeleteUserAPI(targetEmail, token); 
      if (res.ok) {
        alert("✅ 使用者已刪除（預約已取消、金流保留）");
        await fetchUsers();
      } else {
        alert("❌ 刪除失敗：" + (res.message || "未知錯誤"));
      }
    } catch (err) {
      console.error(err);
      alert("⚠️ 系統錯誤，刪除失敗：" + err.message);
    } finally {
      setSubmit(false); 
      setGlobalLoading(false);
      setLoadingText("");
    }
  }

  const handleApplySearch = () => {
    setQuery(tempQuery);
    setOpenFilterMenu(null);
  };

  if (!user || !isAdmin) return null;

  return (
        <div className="centered-form userManage">
          
          <div className="list-panel-header">
            <h3>會員與權限管理</h3>
            {(query || roleFilter) && (
              <button className="clear-filter-btn" onClick={() => { setQuery(""); setRoleFilter(""); }}>
                清除篩選
              </button>
            )}
          </div>

          {/* 表格化的標題與篩選器 */}
          <div className="list-header-row userManage-col">
            
            <div className="header-cell cell-user filterable" onClick={(e) => { e.stopPropagation(); setOpenFilterMenu(openFilterMenu === 'user' ? null : 'user'); }}>
              使用者 <i className="fa-solid fa-filter" style={{ color: query ? "#d9534f" : "#ccc" }}></i>
              {openFilterMenu === 'user' && (
                <div className="header-filter-dropdown filter-search" onClick={(e) => e.stopPropagation()}>
                  <input 
                    type="text" 
                    value={tempQuery} 
                    onChange={(e) => setTempQuery(e.target.value)} 
                    placeholder="搜尋 Email 或 姓名" 
                    onKeyDown={(e) => { if (e.key === 'Enter') handleApplySearch(); }}
                    className="search-input"
                  />
                  <button onClick={handleApplySearch} className="btn-primary">搜尋</button>
                </div>
              )}
            </div>

            <div className="header-cell cell-phone">
              聯絡電話
            </div>

            <div className="header-cell cell-role filterable" onClick={(e) => { e.stopPropagation(); setOpenFilterMenu(openFilterMenu === 'role' ? null : 'role'); }}>
              角色 <i className="fa-solid fa-filter" style={{ color: roleFilter ? "#d9534f" : "#ccc" }}></i>
              {openFilterMenu === 'role' && (
                <div className="header-filter-dropdown" onClick={(e) => e.stopPropagation()}>
                  <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setOpenFilterMenu(null); }}>
                    <option value="">全部角色</option>
                    <option value="admin">Admin</option>
                    <option value="teacher">Teacher</option>
                    <option value="user">User</option>
                  </select>
                </div>
              )}
            </div>

            <div className="header-cell cell-membership">
              會員狀態 (按 Enter 更新)
            </div>

            <div className="header-cell cell-action">
              操作
            </div>
            
          </div>

          <div className="scroll-area user-content">
            {/* 👉 這裡改用 filteredUsers 來判斷和渲染 */}
            {filteredUsers.length === 0 && !globalLoading ? (
              <p className="empty-text">找不到符合條件的使用者</p>
            ) : (
              <ul className="modern-list manager-list">
                {filteredUsers.map((u) => {
                  const email = String(u.email || "");
                  const phone = String(u.phoneNumber || "");
                  const name = (String(u.lastname || "") + String(u.firstname || "")) || String(u.nickname || "") || "(未命名)";
                  const role = String(u.role || "user");
                  const membership = String(u.membership || "");

                  const isSelf = email && user?.user?.email 
                                  ? email === user.user.email 
                                  : email === user?.email || email === user?.profile?.email;

                  return (
                    <li key={email} className="list-item">
                      <div className="text-group userManage-col">
                        
                        {/* 1. 使用者資訊 */}
                        <div className="user-col">
                          <span className="name">
                            {name} {isSelf && <span className="self-label">(您自己)</span>}
                          </span>
                          <span className="id">{email}</span>
                        </div>

                        <div className="phone-col">
                          <span className="phone">{phone}</span>
                        </div>

                        {/* 2. 角色修改 */}
                        <div className="role-col">
                          <select
                            value={role}
                            disabled={globalLoading || isSelf}
                            title={isSelf ? "不可修改自己的角色" : "切換角色"}
                            onChange={(e) => handleChangeRole(name, email, e.target.value)}
                            className="edit-input select-role"
                          >
                            <option value="admin">admin</option>
                            <option value="teacher">teacher</option>
                            <option value="user">user</option>
                          </select>
                        </div>

                        {/* 3. 會員狀態修改 */}
                        <div className="membership-col">
                          <input
                            type="text"
                            defaultValue={membership}
                            disabled={globalLoading || isSelf}
                            placeholder="如: basic"
                            className="edit-input input-membership"
                            title="輸入後按 Enter 儲存"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleChangeMembership(email, e.currentTarget.value);
                              }
                            }}
                          />
                        </div>

                        {/* 4. 操作按鈕 */}
                        <div className="action-col">
                          <button
                            className="btn-icon btn-delete"
                            onClick={() => handleAdminDelete(email)}
                            title="刪除使用者"
                            disabled={globalLoading || isSelf}
                          >
                            <i className="fa-solid fa-trash-can"></i>
                          </button>
                        </div>

                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
  );
}