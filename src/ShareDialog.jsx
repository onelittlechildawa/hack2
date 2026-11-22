import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Download, Share2, X } from "lucide-react";
import { renderShareCard } from "./shareCard.js";

export default function ShareDialog({ mascot, line, open, onClose }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const [card, setCard] = useState(null);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState("idle");
  const [shareNote, setShareNote] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Light-dismiss fallback when <dialog closedby="any"> is unsupported (e.g., Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;
    let pressedOutside = false;
    const outside = (event) => {
      const r = dialog.getBoundingClientRect();
      return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
    };
    const onDown = (event) => { pressedOutside = outside(event); };
    const onUp = (event) => { if (pressedOutside && outside(event)) dialog.close(); };
    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, []);

  useEffect(() => {
    if (!open || !mascot) return;
    let active = true;
    setCard(null);
    setError("");
    setCopyState("idle");
    setShareNote("");
    renderShareCard(mascot, { line })
      .then((result) => { if (active) setCard(result); })
      .catch((failure) => { if (active) setError(failure.message || "生成分享图失败，请重试。"); });
    return () => { active = false; };
  }, [open, mascot, line]);

  function handleClose() {
    if (dialogRef.current) dialogRef.current.returnValue = "";
    onClose?.();
  }

  function downloadImage() {
    if (!card) return;
    const link = document.createElement("a");
    link.href = card.dataUrl;
    link.download = card.filename;
    link.click();
    setShareNote("已导出带二维码的分享图");
  }

  async function systemShare() {
    if (!card?.blob || !navigator.share) return;
    try {
      const file = new File([card.blob], card.filename, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: `${mascot.name} · 电子布洛芬`, text: mascot.quote, files: [file] });
      } else {
        await navigator.share({ title: `${mascot.name} · 电子布洛芬`, text: mascot.quote, url: card.shareUrl });
      }
      setShareNote("已调起转发");
    } catch (failure) {
      if (failure?.name !== "AbortError") setShareNote("可以直接点「保存分享图」发送给朋友。");
    }
  }

  async function copyLink() {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.shareUrl);
      setCopyState("done");
    } catch {
      setCopyState("error");
    }
  }

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return <dialog ref={dialogRef} className="share-dialog" aria-labelledby={titleId}
    {...({ closedby: "any" })} onClose={handleClose}>
    <div className="share-dialog-head">
      <h2 id={titleId}>转发分享图</h2>
      <form method="dialog">
        <button type="submit" className="share-close" aria-label="关闭转发窗口">
          <X size={18} strokeWidth={2.3} aria-hidden="true" />
        </button>
      </form>
    </div>
    <div className="share-preview-box">
      {card ? <img src={card.dataUrl} alt={`${mascot?.name || "吉祥物"}的带二维码分享海报`} />
        : error ? <p className="problem" role="alert">{error}</p>
        : <p className="share-loading" role="status"><span className="spinner" aria-hidden="true" /> 正在合成带二维码的分享图…</p>}
    </div>
    {card && <div className="share-dialog-actions">
      <button type="button" className="button primary" autoFocus onClick={downloadImage}>
        <Download size={17} strokeWidth={2.3} aria-hidden="true" /> 保存分享图
      </button>
      {canNativeShare && <button type="button" className="button secondary" onClick={systemShare}>
        <Share2 size={17} strokeWidth={2.3} aria-hidden="true" /> 系统转发
      </button>}
      <button type="button" className="button" onClick={copyLink}>
        {copyState === "done" ? <Check size={16} strokeWidth={2.4} aria-hidden="true" /> : <Copy size={16} strokeWidth={2.3} aria-hidden="true" />}
        {copyState === "done" ? "已复制链接" : copyState === "error" ? "复制失败" : "复制链接"}
      </button>
    </div>}
    {shareNote && <p className="share-note" role="status">{shareNote}</p>}
    <p className="share-hint">
      {mascot?.published || mascot?.seed
        ? "二维码指向这只吉祥物的 3D 档案页，扫码即可互动。"
        : "当前作品仅自己可见，二维码指向情绪画板；发布到情绪图鉴后再导出将直达本作品。"}
    </p>
  </dialog>;
}
