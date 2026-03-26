import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { fetchRoomsAPI, addRoomAPI, updateRoomAPI, deleteRoomAPI } from "../api";

export default function RoomManager() {
  const { user, setGlobalLoading, globalLoading, setLoadingText, setSubmit, requestCaptcha } = useOutletContext();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]);

  // --- 篩選器狀態 ---
  const [query, setQuery] = useState("");
  const [tempQuery, setTempQuery] = useState("");
  const [openFilterMenu, setOpenFilterMenu] = useState(null);

  // --- 新增考場狀態 (✅ 補上 email) ---
  const initialAddState = { placeName: "", email: "", roomNumber: "", capacity: "", address: "", phoneNumber: "" };
  const [addFormData, setAddFormData] = useState(initialAddState);

  // --- 編輯的狀態 ---
  const [editingRoomID, setEditingRoomID] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  const isTeacher = useMemo(() => user?.role === "admin" || user?.role === "teacher", [user]);

  // 1. 取得考場清單
  const fetchRooms = useCallback(async () => {
    setSubmit(false); 
    setLoadingText("正在取得考場資料...");
    setGlobalLoading(true);
    try {
      const list = await fetchRoomsAPI();
      setRooms(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Fetch rooms error:", err);
      alert("讀取考場清單失敗：" + err.message);
    } finally {
      setGlobalLoading(false);
      setLoadingText("");
    }
  }, [setGlobalLoading, setLoadingText, setSubmit]);

  useEffect(() => {
    if (user && !isTeacher) {
      alert("權限不足，將返回首頁");
      navigate("/");
      return;
    }
    if (user && isTeacher) {
      fetchRooms();
    }
  }, [user, isTeacher, navigate, fetchRooms]);

  useEffect(() => {
    setTempQuery(query);
  }, [query]);

  useEffect(() => {
    const closeMenu = () => setOpenFilterMenu(null);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

  // 2. 新增考場
  const handleAddChange = (e) => {
    setAddFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  async function handleAdd(e) {
    e.preventDefault();

    if (!addFormData.placeName || !addFormData.capacity) {
      return alert("請至少填寫「教室名稱」與「容量」！");
    }

    const token = await requestCaptcha();
    if (!token) return;

    setLoadingText("正在進行安全驗證與新增考場...");
    setSubmit(true); 
    setGlobalLoading(true);

    try {
      const res = await addRoomAPI({ ...addFormData, captchaToken: token });
      if (res.ok) {
        alert("✅ 新增成功！");
        setAddFormData(initialAddState);
        await fetchRooms(); 
      } else {
        alert("❌ 新增失敗：" + (res.message || "未知錯誤"));
      }
    } catch (err) {
      alert("⚠️ 系統錯誤，新增失敗：" + err.message);
    } finally {
      setGlobalLoading(false);
      setSubmit(false); 
      setLoadingText("");
    }
  }

  // 3. 觸發刪除 
  async function handleDeleteClick(roomID, placeName) {
    if (
      !window.confirm(
        `確定要刪除考場「${placeName}」嗎？\n注意：如果有考試已綁定此考場，建議先修改考試地點！`
      )
    ) {
      return;
    }

    const token = await requestCaptcha();
    if (!token) return;

    setLoadingText("正在刪除考場 ...");
    setSubmit(true); 
    setGlobalLoading(true);

    try {
      const res = await deleteRoomAPI({ roomID, captchaToken: token });
      if (res.ok) {
        alert("考場刪除成功！");
        await fetchRooms(); 
      } else {
        alert("刪除失敗：" + (res.message || "未知錯誤"));
      }
    } catch (err) {
      alert("⚠️ 系統錯誤，刪除失敗：" + err.message);
    } finally {
      setGlobalLoading(false);
      setSubmit(false); 
      setLoadingText("");
    }
  }

  // 4. 編輯與更新 
  const handleEditChange = (e) => {
    setEditFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const startEditing = (room) => {
    setEditingRoomID(room.roomID);
    setEditFormData({
      placeName: room.placeName || "",
      email: room.email || "", // ✅ 補上 email
      roomNumber: room.roomNumber || "",
      capacity: room.capacity || "",
      address: room.address || "",
      phoneNumber: room.phoneNumber || ""
    });
  };

  const cancelEditing = () => {
    setEditingRoomID(null);
    setEditFormData({});
  };

  const attemptSaveEdit = async (room) => {
    // ✅ 補上檢查 email 是否有更動
    const isChanged =
      room.placeName !== editFormData.placeName ||
      room.email !== editFormData.email ||
      room.roomNumber !== editFormData.roomNumber ||
      Number(room.capacity) !== Number(editFormData.capacity) ||
      room.address !== editFormData.address ||
      room.phoneNumber !== editFormData.phoneNumber;

    if (!isChanged) {
      cancelEditing();
      return;
    }

    if (!editFormData.placeName || !editFormData.capacity) {
      return alert("「教室名稱」與「容量」為必填！");
    }

    const token = await requestCaptcha();
    if (!token) return;

    setLoadingText("正在更新考場資料...");
    setSubmit(true); 
    setGlobalLoading(true);

    try {
      const res = await updateRoomAPI({
        roomID: editingRoomID,
        ...editFormData,
        captchaToken: token
      });

      if (res.ok) {
        alert("✅ 更新成功！");
        cancelEditing();
        await fetchRooms(); 
      } else {
        alert("❌ 更新失敗：" + (res.message || "未知錯誤"));
      }
    } catch (err) {
      alert("⚠️ 系統錯誤，更新失敗：" + err.message);
    } finally {
      setGlobalLoading(false);
      setSubmit(false); 
      setLoadingText("");
    }
  };

  const handleApplySearch = () => {
    setQuery(tempQuery);
    setOpenFilterMenu(null);
  };

  // --- 列表過濾 ---
  const filteredRooms = useMemo(() => {
    if (!query) return rooms;

    const lowerQuery = query.toLowerCase();
    return rooms.filter(
      (r) =>
        (r.placeName && r.placeName.toLowerCase().includes(lowerQuery)) ||
        (r.roomNumber && r.roomNumber.toLowerCase().includes(lowerQuery))
    );
  }, [rooms, query]);

  if (!user || !isTeacher) return null;

  return (
    <div className="manager-wrapper">
      <div className="manager-container">
        {/* 左側：新增區塊 */}
        <div className="centered-form side-panel add-panel room-panel">
          <h3>新增考場/教室</h3>

          <form onSubmit={handleAdd} className="modern-form">
            <div className="input-field">
              <label>教室名稱 </label>
              <input
                type="text"
                name="placeName"
                value={addFormData.placeName}
                onChange={handleAddChange}
                placeholder="例如：一般教室 A"
                required
                disabled={globalLoading}
              />
            </div>
            <div className="input-field">
              <label>負責人電子郵件</label>
              <input
                type="text"
                name="email"
                value={addFormData.email}
                onChange={handleAddChange}
                placeholder="例如：nutsHsinchu@google.com"
                required
                disabled={globalLoading}
              />
            </div>

            <div className="split-group">
              <div className="input-field">
                <label>教室代碼</label>
                <input
                  type="text"
                  name="roomNumber"
                  value={addFormData.roomNumber}
                  onChange={handleAddChange}
                  placeholder="例如：A101"
                  disabled={globalLoading}
                />
              </div>

              <div className="input-field">
                <label>容量人數 </label>
                <input
                  type="number"
                  name="capacity"
                  value={addFormData.capacity}
                  onChange={handleAddChange}
                  placeholder="例如：40"
                  min="1"
                  required
                  disabled={globalLoading}
                />
              </div>
            </div>

            <div className="input-field">
              <label>詳細地址</label>
              <input
                type="text"
                name="address"
                value={addFormData.address}
                onChange={handleAddChange}
                placeholder="例如：測試校區大樓 3 樓"
                disabled={globalLoading}
              />
            </div>

            <div className="input-field">
              <label>聯絡電話</label>
              <input
                type="text"
                name="phoneNumber"
                value={addFormData.phoneNumber}
                onChange={handleAddChange}
                placeholder="例如：02-12345678"
                disabled={globalLoading}
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
          <div className="list-panel-header">
            <h3>現有考場清單</h3>
            {query && (
              <button className="clear-filter-btn" onClick={() => setQuery("")}>
                清除搜尋
              </button>
            )}
          </div>

          {/* 標題列 */}
          <div className="list-header-row room-header room-column">
            <div
              className="header-cell"
              onClick={(e) => {
                e.stopPropagation();
                setOpenFilterMenu(openFilterMenu === "search" ? null : "search");
              }}
            >
              教室名稱 <i className="fa-solid fa-filter" style={{ color: query ? "#d9534f" : "#ccc" }}></i>

              {openFilterMenu === "search" && (
                <div
                  className="header-filter-dropdown filter-search"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={tempQuery}
                    onChange={(e) => setTempQuery(e.target.value)}
                    placeholder="搜尋名稱或代碼"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplySearch();
                    }}
                  />
                  <button onClick={handleApplySearch} className="btn-primary">
                    搜尋
                  </button>
                </div>
              )}
            </div>

            <div className="header-cell">Email</div>
            <div className="header-cell">地址</div>
            <div className="header-cell">電話</div>
            <div className="header-cell">容量</div>
            <div className="header-cell">操作</div>
          </div>

          {/* 內容列：依照標題欄位對齊 */}
          <div className="scroll-area room-content">
            {filteredRooms.length === 0 && !globalLoading ? (
              <p className="empty-text">找不到符合條件的考場</p>
            ) : (
              <ul className="modern-list manager-list">
                {filteredRooms.map((room) => {
                  const isEditing = editingRoomID === room.roomID;

                  return (
                    <li key={room.roomID} className={`list-item ${isEditing ? "editing-mode" : ""}`}>
                      <div className="text-group room-column">
                        {/* 教室名稱 */}
                        <div className="room-cell room-name-cell">
                          {isEditing ? (
                            <input
                              type="text"
                              name="roomNumber"
                              value={editFormData.roomNumber}
                              onChange={handleEditChange}
                              className="edit-input"
                              placeholder="教室代碼"
                            />
                          ) : (
                            <span>{room.roomNumber || "-"}</span>
                          )}
                          {isEditing ? (
                            <input
                              type="text"
                              name="placeName"
                              value={editFormData.placeName}
                              onChange={handleEditChange}
                              className="edit-input"
                              placeholder="教室名稱"
                            />
                          ) : (
                            <span className="room-main-text">{room.placeName || "-"}</span>
                          )}
                        </div>

                        {/* Email */}
                        <div className="room-cell room-code-cell">
                          {isEditing ? (
                            <input
                              type="text"
                              name="email" // ✅ 修改大小寫為 email
                              value={editFormData.email || ""} // ✅ 加入讀取綁定
                              onChange={handleEditChange}
                              className="edit-input"
                              placeholder="Email"
                            />
                          ) : (
                            <span>{room.email || "-"}</span>
                          )}
                        </div>

                        {/* 地址 */}
                        <div className="room-cell room-address-cell">
                          {isEditing ? (
                            <input
                              type="text"
                              name="address"
                              value={editFormData.address}
                              onChange={handleEditChange}
                              className="edit-input"
                              placeholder="詳細地址"
                            />
                          ) : (
                            <span>{room.address || <span className="text-placeholder">未設定地址</span>}</span>
                          )}
                        </div>

                        {/* 電話 */}
                        <div className="room-cell room-phone-cell">
                          {isEditing ? (
                            <input
                              type="text"
                              name="phoneNumber"
                              value={editFormData.phoneNumber}
                              onChange={handleEditChange}
                              className="edit-input"
                              placeholder="聯絡電話"
                            />
                          ) : (
                            <span>{room.phoneNumber || "-"}</span>
                          )}
                        </div>

                        {/* 容量 */}
                        <div className="room-cell room-capacity-cell">
                          {isEditing ? (
                            <input
                              type="number"
                              name="capacity"
                              value={editFormData.capacity}
                              onChange={handleEditChange}
                              className="edit-input"
                              min="1"
                              placeholder="容量"
                            />
                          ) : (
                            <span>
                              <i className="fa-solid fa-users"></i> {room.capacity || 0}
                            </span>
                          )}
                        </div>

                        {/* 操作 */}
                        <div className="room-cell action-col">
                          {isEditing ? (
                            <>
                              <button className="btn-icon btn-save" onClick={() => attemptSaveEdit(room)} title="儲存" type="button">
                                <i className="fa-solid fa-check"></i>
                              </button>
                              <button className="btn-icon btn-cancel" onClick={cancelEditing} title="取消" type="button">
                                <i className="fa-solid fa-xmark"></i>
                              </button>
                            </>
                          ) : (
                            <>
                              <button className="btn-icon btn-edit" onClick={() => startEditing(room)} title="編輯考場" type="button">
                                <i className="fa-solid fa-pen"></i>
                              </button>
                              <button
                                className="btn-icon btn-delete"
                                onClick={() => handleDeleteClick(room.roomID, room.placeName)}
                                title="刪除考場"
                                disabled={globalLoading}
                                type="button"
                              >
                                <i className="fa-solid fa-trash-can"></i>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}