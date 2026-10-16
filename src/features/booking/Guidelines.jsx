import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getGuidelines } from "./api";
import { Chips, EmptyState, ServicePage } from "./ServiceUI";

export default function Guidelines() {
  const [items, setItems] = useState([]), [query, setQuery] = useState(""), [category, setCategory] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    getGuidelines().then(data => { if (active) setItems(data.items); }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const categories = [...new Set(items.map(item => item.category))];
  const filtered = items.filter(item => (!category || item.category === category) && `${item.title} ${item.content}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <ServicePage
      title="考試須知與常見問題" subtitle="實際證件要求、報到時間與退費規則，請以學苑及考場正式公告為準。" open
      toolbar={
        <div className="svc-toolbar">
          <div className="svc-search">
            <i className="fa-solid fa-magnifying-glass"></i>
            <input id="faq-query" type="search" aria-label="搜尋問題" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜尋：帳號、證件、付款、改期…" />
          </div>
          {categories.length > 0 && <Chips label="分類" value={category} onChange={setCategory} options={[["", "全部"], ...categories.map(value => [value, value])]} />}
        </div>
      }
      footer={
        <footer className="svc-pager">
          <Link to="/" className="svc-btn"><i className="fa-solid fa-calendar-days"></i>查看考試場次</Link>
          <Link to="/contact" className="svc-btn"><i className="fa-regular fa-envelope"></i>還有疑問？聯絡我們</Link>
        </footer>
      }
    >
      {loading && <div className="svc-loading" role="status"><span className="svc-spinner"></span>載入須知中…</div>}
      {error && <div className="exam-notice danger" role="alert"><i className="fa-solid fa-triangle-exclamation"></i>須知讀取失敗：{error}。請聯絡學苑確認。</div>}
      {!loading && !error && !filtered.length && <EmptyState icon="fa-magnifying-glass" text="找不到符合條件的問題。" />}
      <div className="svc-list dense">
        {filtered.map(item => (
          <details key={item.id} className="svc-faq">
            <summary>
              <span className="svc-faq-tag">{item.category}</span>
              <strong>{item.title}</strong>
              <i className="fa-solid fa-chevron-down"></i>
            </summary>
            <div className="svc-faq-body">
              <p>{item.content}</p>
              {item.link && <a href={item.link} target="_blank" rel="noreferrer" className="svc-btn"><i className="fa-solid fa-arrow-up-right-from-square"></i>前往 Certiport 建立帳號</a>}
            </div>
          </details>
        ))}
      </div>
    </ServicePage>
  );
}
