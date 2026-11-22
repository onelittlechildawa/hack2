import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";

export default function FullscreenButton() {
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    function update() { setFullscreen(Boolean(document.fullscreenElement)); }
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  if (!document.fullscreenEnabled || denied) return null;
  const label = fullscreen ? "退出全屏" : "全屏演示";
  const Icon = fullscreen ? Minimize : Maximize;
  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setDenied(true);
    }
  }

  return <button className="scene-button scene-icon" type="button" aria-label={label} title={label} onClick={toggle}>
    <Icon size={19} aria-hidden="true" />
  </button>;
}
