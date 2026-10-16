import { useState } from "react";
import { sendToGAS } from "../../api";
import { STORAGE_KEYS } from "../../config";
import { notify } from "../../dialog";

/** 付款證明：檔案是私人存取，按下後才透過後端讀出圖片 (不會有公開連結) */
export default function PaymentProof({ reserveID }) {
  const [image, setImage] = useState(""), [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try {
      const response = await sendToGAS("getPaymentProof", { reserveID, idToken: localStorage.getItem(STORAGE_KEYS.TOKEN) });
      const url = response.data?.dataUrl;
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(url || "")) throw new Error("付款證明格式不正確");
      setImage(url);
    } catch (error) { notify(`讀取付款證明失敗：${error.message}`); } finally { setBusy(false); }
  };
  return (
    <div className="payment-proof-container svc-proof">
      {image
        ? <img className="payment-proof-img" src={image} alt="付款證明" />
        : (
          <button type="button" className="svc-btn svc-proof-load" disabled={busy} onClick={load}>
            <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-image"}`}></i>{busy ? "讀取中…" : "查看付款證明"}
          </button>
        )}
    </div>
  );
}
