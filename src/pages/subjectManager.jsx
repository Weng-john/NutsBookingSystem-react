import {TOKEN_EXPIRED} from "../config"
import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { 
  fetchSubjectsRawAPI, 
  addSubjectAPI, 
  deleteSubjectAPI, 
  // regenerateColorAPI 
} from "../api";

export default function SubjectManager() {
  // 👉 補上 requestCaptcha
  const { user, globalLoading, setGlobalLoading, setLoadingText, setSubmit, requestCaptcha } = useOutletContext(); 
  const navigate = useNavigate();

  const [subjects, setSubjects] = useState([]);
  const [subjectName, setSubjectName] = useState("");

  const isTeacher = useMemo(() => user?.role === "admin" || user?.role === "teacher", [user]);

  // 1. 取得所有科目
  async function fetchSubjects() {
    setSubmit(false); // 👉 確保拉取資料時關閉 Submit 狀態
    setLoadingText("正在取得科目清單...");
    setGlobalLoading(true);
    try {
      const data = await fetchSubjectsRawAPI();
      if (Array.isArray(data)) {
        setSubjects(data);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      alert("讀取科目清單失敗：" + err.message);
    } finally {
      setGlobalLoading(false); // 呼叫全域 Loading 結束
      setLoadingText("");
    }
  }

  // 權限檢查與初始化
  useEffect(() => {
    if (user && !isTeacher) {
      alert("權限不足，將返回首頁");
      navigate("/");
      return;
    }
    if (user && isTeacher) {
      fetchSubjects();
    }
  }, [user, isTeacher, navigate]);

  // 2. 新增科目
  async function handleAdd(e) {
    e.preventDefault();
    const trimmedName = subjectName.trim();
    if (!trimmedName) return;
    
    if (!window.confirm(`確定要新增科目「${trimmedName}」嗎？`)) return;

    // 👉 呼叫全域驗證
    const token = await requestCaptcha();
    if (!token) return;

    setLoadingText("正在進行安全驗證與新增科目...");
    setSubmit(true);
    setGlobalLoading(true);
    try {
      // 若後端需要驗證 token，請在 API 傳入 token。如：addSubjectAPI(trimmedName, token)
      const res = await addSubjectAPI(trimmedName, token);
      if (res.ok) {
        alert("✅ 新增成功！");
        setSubjectName(""); 
        await fetchSubjects(); 
      } else {
        alert("❌ 新增失敗：" + (res.message || "未知錯誤"));
      }
    } catch (err) {
      console.error(err.message);
      alert("⚠️ 系統錯誤，新增失敗：" + err.message);
    } finally {
      setGlobalLoading(false);
      setSubmit(false);
      setLoadingText("");
    }
  }

  // 3. 刪除科目
  async function handleDelete(subjectId, subjectName) {
    if (!window.confirm(`確定要刪除 ${subjectName} 嗎？\nID為 ${subjectId}`)) return;
    
    // 👉 呼叫全域驗證
    const token = await requestCaptcha();
    if (!token) return;

    setLoadingText(`正在進行安全驗證與刪除 ${subjectName} ...`);
    setSubmit(true);
    setGlobalLoading(true);
    try {
      // 若後端需要驗證 token，請在 API 傳入 token。如：deleteSubjectAPI(subjectId, token)
      const res = await deleteSubjectAPI(subjectId, token);
      if (res.ok) {
        alert("科目刪除成功！");
        await fetchSubjects();
      } else {
        alert("刪除失敗：" + (res.message || "無法刪除該科目"));
      }
    } catch (err) {
      console.error(err);
      alert("⚠️ 系統錯誤，刪除失敗：" + err.message);
    } finally {
      setGlobalLoading(false);
      setSubmit(false);
      setLoadingText("");
    }
  }

  // // 4. 重新生成顏色
  // async function handleRegenerateColor(subjectId, subjectName) {
  //   if (!window.confirm("確定要重新隨機生成該科目的顏色嗎？")) return;

  //   const token = await requestCaptcha();
  //   if (!token) return;

  //   setLoadingText(`正在更新 ${subjectName} 的顏色...`);
  //   setSubmit(true);
  //   setGlobalLoading(true);
  //   try {
  //     const res = await regenerateColorAPI(subjectId, token);
  //     if (res.ok) {
  //       alert("✅ 顏色已成功更新！");
  //       await fetchSubjects();
  //     } else {
  //       alert("❌ 顏色更新失敗：" + (res.message || "請稍後再試"));
  //     }
  //   } catch (err) {
  //     console.error(err);
  //     alert("⚠️ 系統錯誤，顏色更新失敗：" + err.message);
  //   } finally {
  //     setGlobalLoading(false);
  //     setSubmit(false);
  //     setLoadingText("");
  //   }
  // }

  if (!user || !isTeacher) return null;

  return (
    <div className="manager-wrapper">
      <div className="manager-container">
        {/* 左側：新增區塊 */}
        <div className="centered-form side-panel add-panel">
          <h3>新增科目</h3>
          <form onSubmit={handleAdd} className="modern-form">
            <div className="input-field">
              <label>科目名稱</label>
              <input
                type="text"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="請輸入新的科目名稱"
                required
                disabled={globalLoading} // 使用全域狀態
              />
            </div>
            <div className="button-container">
                <button type="submit" className="btn-primary full-width" disabled={globalLoading}>
                {globalLoading ? "處理中..." : "確認新增"}
                </button>
            </div>
          </form>
        </div>

        {/* 右側：列表區塊 */}
        <div className="centered-form side-panel list-panel">
            <h3>現有科目清單</h3>
            <div className="scroll-area subject-content">
                {/* 既然有全域動畫，這裡可以簡化判斷 */}
                {subjects.length === 0 && !globalLoading ? (
                  <p className="empty-text">目前尚無任何科目</p>
                ) : (
                <ul className="modern-list">
                    {subjects.map((sub) => (
                    <li key={sub.subjectID} className="list-item">
                        <div className="item-info">
                        <span 
                            className="color-indicator" 
                            style={{ backgroundColor: sub.color }}
                            title="目前顏色範例"
                        />
                        <div className="text-group">
                            <span className="id">{sub.subjectID}</span>
                            <span className="name">{sub.subjectName}</span>
                        </div>
                        </div>
                        <div className="item-actions">
                        {/* <button 
                            className="btn-icon btn-refresh" 
                            onClick={() => handleRegenerateColor(sub.subjectID, sub.subjectName)}
                            title="重新生成顏色"
                            disabled={globalLoading}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                                <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                                <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
                            </svg>
                        </button> */}
                        
                        <button 
                            className="btn-icon btn-delete" 
                            onClick={() => handleDelete(sub.subjectID, sub.subjectName)}
                            title="刪除科目"
                            disabled={globalLoading}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                                <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                            </svg>
                        </button>
                        </div>
                    </li>
                    ))}
                </ul>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}