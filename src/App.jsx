import { Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { ensureGASAwake } from "./api.js";

import "./config.js"

import MainLayout from "./layouts/Mainlayout";
import Login from "./pages/login";
import Home from "./pages/home";
import Account from "./pages/account";
import Contact from "./pages/contact.jsx";
import SubjectManager from "./pages/subjectManager.jsx";
import MyReserve from "./pages/myReserve.jsx";
import MemberManager from "./pages/memberManager.jsx";
import ExamManager from "./pages/examManager.jsx";
import RoomManager from "./pages/roomManager.jsx";
import ReservationManager from "./pages/reservationManager.jsx";

export default function App() {
  useEffect(() => {
    // 網頁載入時，發送背景請求喚醒 GAS
    ensureGASAwake();
  }, []);

  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/account" element={<Account />} />
        <Route path="/myReserve" element={<MyReserve />} />
        <Route path="/login" element={<Login />} />
        <Route path="/contact" element={<Contact />} />

        {/* 管理員頁面 */}
        <Route path="/memberManager" element={<MemberManager />} />
        <Route path="/examManager" element={<ExamManager />} />
        <Route path="/reservationManager" element={<ReservationManager />} />
        <Route path="/subjectManager" element={<SubjectManager />} />
        <Route path="/roomManager" element={<RoomManager />} />
      </Route>
    </Routes>
  );
}