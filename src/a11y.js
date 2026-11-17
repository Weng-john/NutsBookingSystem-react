// 鍵盤可及性的小工具。
// 不是 <button> 但可以點的元素 (表頭篩選、清單列、自訂下拉選項) 加上
// role="button" tabIndex={0} onKeyDown={activateOnKey}，用 Enter 或空白鍵就等於點一下。
export function activateOnKey(event) {
  if (event.target !== event.currentTarget) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.currentTarget.click();
  }
}
