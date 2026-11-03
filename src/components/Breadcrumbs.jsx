import { Link } from "react-router-dom";

/** 顯示目前頁面的簡短路徑 */
export default function Breadcrumbs({ items = [] }) {
  if (!items.length) return null;

  return (
    <nav className="ui-breadcrumbs" aria-label="目前位置">
      <ol>
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {isCurrent || !item.to ? (
                <span aria-current={isCurrent ? "page" : undefined}>{item.label}</span>
              ) : (
                <Link to={item.to}>{item.label}</Link>
              )}
              {!isCurrent && <i className="fa-solid fa-chevron-right" aria-hidden="true"></i>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
