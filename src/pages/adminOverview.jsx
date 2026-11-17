import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { fetchAllReservationsAdminAPI, fetchReservationsAPI } from "../api";
import { bookingAmounts, isOpenRequest, money, formatDateTime } from "../features/booking/utils";
import { DEADLINE_CONFIG } from "../config";

const DAY = 86400000;

// 管理總覽：一進後台就知道今天要處理什麼。
// 只讀取資料，不做任何修改；各項目連到對應的管理頁 (報名審核的分頁用 ?tab= 指定)。
export default function AdminOverview() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [reservations, setReservations] = useState(null);
  const [exams, setExams] = useState(null);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState(0); // 資料讀取的時間，統計以這個時間點計算

  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    setError("");
    try {
      const [resList, examList] = await Promise.all([fetchAllReservationsAdminAPI(), fetchReservationsAPI()]);
      setReservations(Array.isArray(resList) ? resList : []);
      setExams(Array.isArray(examList) ? examList : []);
      setLoadedAt(Date.now());
    } catch (err) {
      setError(err.message || "資料讀取失敗，請稍後再試。");
      setReservations([]); setExams([]); setLoadedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    if (!user) { navigate("/login"); return; }
    if (!isAdmin) { navigate("/examManager"); return; }
    Promise.resolve().then(load);
  }, [user, isAdmin, navigate, load]);

  const stats = useMemo(() => {
    if (!reservations) return null;
    const now = loadedAt;
    const active = reservations.filter((res) => res.reservationStatus !== "cancelled");
    const by = (badge) => active.filter((res) => res.statusInfo?.badge === badge);
    const unpaid = by("warning");
    const dueSoon = unpaid.filter((res) => {
      const deadline = new Date(res.paymentDeadline || 0).getTime();
      return deadline && deadline - now <= DEADLINE_CONFIG.URGENT_DAYS * DAY;
    });
    const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthPaid = active
      .filter((res) => new Date(res.examInfo?.examStartTime || 0) >= monthStart)
      .reduce((sum, res) => { const a = bookingAmounts(res); return sum + a.paid - a.refunded; }, 0);
    return {
      reviewing: by("info").length,
      paymentReview: by("primary").length,
      unpaid: unpaid.length,
      dueSoon: dueSoon.length,
      refunds: reservations.filter((res) => res.request?.type === "refund" && isOpenRequest(res.request)).length,
      monthPaid,
    };
  }, [reservations, loadedAt]);

  const upcoming = useMemo(() => {
    if (!exams) return null;
    const now = loadedAt;
    return exams
      .filter((exam) => {
        const start = new Date(exam.startTimeISO).getTime();
        return start >= now && start - now <= 14 * DAY && String(exam.status).toUpperCase() !== "CANCELLED";
      })
      .sort((a, b) => new Date(a.startTimeISO) - new Date(b.startTimeISO))
      .slice(0, 6);
  }, [exams, loadedAt]);

  const loading = !stats;

  const kpis = [
    { label: "待審核報名", value: stats?.reviewing, icon: "fa-hourglass-half", to: "/reservationManager?tab=reviewing", tone: "info" },
    { label: "待審核付款", value: stats?.paymentReview, icon: "fa-money-check-dollar", to: "/reservationManager?tab=payment_review", tone: "primary" },
    { label: `待付款（${DEADLINE_CONFIG.URGENT_DAYS} 天內到期）`, value: stats?.dueSoon, sub: stats ? `共 ${stats.unpaid} 筆待付款` : "", icon: "fa-clock", to: "/reservationManager?tab=unpaid", tone: "warning" },
    { label: "待處理退費", value: stats?.refunds, icon: "fa-hand-holding-dollar", to: "/reservationManager?tab=refund", tone: "danger" },
  ];

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <p className="admin-eyebrow">管理後台</p>
          <h1>總覽</h1>
        </div>
        <div className="admin-page-actions">
          <button type="button" className="btn btn-secondary" onClick={() => { setReservations(null); setExams(null); load(); }} disabled={loading}>
            <i className={`fa-solid fa-rotate-right ${loading ? "fa-spin" : ""}`} aria-hidden="true"></i>重新整理
          </button>
          <Link to="/examManager" className="btn btn-primary"><i className="fa-solid fa-plus" aria-hidden="true"></i>新增場次</Link>
        </div>
      </header>

      {error && <div className="exam-notice danger" role="alert"><i className="fa-solid fa-triangle-exclamation"></i>{error}</div>}

      <section className="kpi-grid" aria-label="待辦統計">
        {kpis.map((kpi) => (
          <Link key={kpi.label} to={kpi.to} className={`kpi-card tone-${kpi.tone}`}>
            <span className="kpi-icon"><i className={`fa-solid ${kpi.icon}`} aria-hidden="true"></i></span>
            <span className="kpi-label">{kpi.label}</span>
            {loading ? <span className="skeleton skeleton-num"></span> : <strong className="kpi-value num">{kpi.value}</strong>}
            {kpi.sub && !loading && <small className="kpi-sub">{kpi.sub}</small>}
          </Link>
        ))}
      </section>

      <div className="overview-grid">
        <section className="admin-card">
          <div className="admin-card-head">
            <h2>近兩週場次</h2>
            <Link to="/examManager" className="text-link">管理場次 <i className="fa-solid fa-arrow-right" aria-hidden="true"></i></Link>
          </div>
          {!upcoming ? (
            <ul className="session-list">{[0, 1, 2].map((i) => <li key={i} className="skeleton skeleton-row"></li>)}</ul>
          ) : upcoming.length === 0 ? (
            <div className="empty-state compact"><i className="fa-regular fa-calendar"></i><p>近兩週沒有場次</p></div>
          ) : (
            <ul className="session-list">
              {upcoming.map((exam) => {
                const start = new Date(exam.startTimeISO);
                const percent = exam.capacity ? Math.min(100, Math.round((exam.registeredCount / exam.capacity) * 100)) : 0;
                return (
                  <li key={exam.id} className="session-row">
                    <span className="date-chip num">
                      <small>{start.getMonth() + 1} 月</small><b>{start.getDate()}</b><small>週{"日一二三四五六"[start.getDay()]}</small>
                    </span>
                    <span className="session-main">
                      <strong>{exam.title}</strong>
                      <small className="num">{exam.startTime}–{exam.endTime}・{exam.location}</small>
                      <span className="seat-bar" aria-hidden="true"><i style={{ width: `${percent}%` }}></i></span>
                    </span>
                    <span className="session-side num">
                      {exam.registeredCount} / {exam.capacity}
                      {String(exam.status).toUpperCase() === "DRAFT" && <span className="tag tag-muted">未開放</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="admin-card">
          <div className="admin-card-head"><h2>本月收款</h2></div>
          {loading ? <span className="skeleton skeleton-num big"></span> : <strong className="money-big num">{money(stats.monthPaid)}</strong>}
          <p className="muted small">本月考試場次已確認的收款，扣除已退款。詳細明細與 CSV 匯出請到「名單與統計」。</p>
          <Link to="/reservationReport" className="btn btn-secondary btn-block"><i className="fa-solid fa-chart-column" aria-hidden="true"></i>名單與統計</Link>
          <div className="admin-card-head spaced"><h2>快速前往</h2></div>
          <div className="quick-links">
            <Link to="/memberManager"><i className="fa-solid fa-users" aria-hidden="true"></i>會員</Link>
            <Link to="/subjectManager"><i className="fa-solid fa-book" aria-hidden="true"></i>科目</Link>
            <Link to="/roomManager"><i className="fa-solid fa-building" aria-hidden="true"></i>考場</Link>
            <Link to="/notificationManager"><i className="fa-solid fa-paper-plane" aria-hidden="true"></i>通知</Link>
          </div>
          {loadedAt > 0 && <p className="muted small">資料更新於 {formatDateTime(new Date(loadedAt))}</p>}
        </section>
      </div>
    </div>
  );
}
