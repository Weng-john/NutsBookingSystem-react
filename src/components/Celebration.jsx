// 完成重要步驟時的慶祝動畫 (報名送出、繳費審核通過)：Logo 三色的彩紙加上勾勾描邊。
// 純 CSS，約 1.2 秒；使用者偏好減少動態時只顯示靜態的勾勾 (見 redesign.css R8)。
const PIECES = Array.from({ length: 14 }, (_, i) => i);

export default function Celebration() {
  return (
    <div className="celebration" aria-hidden="true">
      {PIECES.map((i) => <i key={i} className="confetti" style={{ "--i": i }}></i>)}
      <svg className="celebration-check" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r="24" />
        <path d="M15 27 l7 7 l15 -16" />
      </svg>
    </div>
  );
}
