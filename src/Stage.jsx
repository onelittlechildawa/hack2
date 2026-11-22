import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Flame, Pause, Play } from "lucide-react";

const Viewer = lazy(() => import("./Viewer.jsx"));

export function GridArtwork() {
  return <div className="grid-art" aria-hidden="true">
    <i className="comic-rays" />
    <i className="orbit-line" />
    <i className="stage-cross cross-a" />
    <i className="stage-cross cross-b" />
    <i className="stage-cross cross-c" />
  </div>;
}

export function Stage({ mascot, action, replay = 0, play = true, loop = false, onTap, children, className = "" }) {
  const pressed = useRef(null);
  const interactive = Boolean(onTap);

  function pointerDown(event) {
    if (onTap && event.button === 0) pressed.current = [event.clientX, event.clientY, performance.now()];
  }

  function pointerUp(event) {
    const start = pressed.current;
    pressed.current = null;
    if (onTap && start && performance.now() - start[2] < 440 &&
        Math.hypot(event.clientX - start[0], event.clientY - start[1]) < 7) onTap();
  }

  return <div className={`stage stage-${mascot.stage} ${className}`}>
    <GridArtwork />
    <div className="stage-view" tabIndex={interactive ? 0 : undefined} role={interactive ? "button" : undefined}
      aria-label={interactive ? `轻点让${mascot.name}切换动作，也可拖动旋转` : undefined}
      onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={() => { pressed.current = null; }}
      onKeyDown={(event) => {
        if (onTap && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onTap();
        }
      }}>
      <img className="stage-poster" src={mascot.poster} alt={mascot.name} draggable={false} />
      <Suspense fallback={null}>
        <Viewer model={mascot.model} action={action} replay={replay} play={play} loop={loop} interactive={interactive} />
      </Suspense>
      {interactive && <span className="stage-fallback">静态预览</span>}
    </div>
    {children}
  </div>;
}

export function Showcase({ posts, reducedMotion }) {
  const top = posts.slice(0, 3);
  const [selected, setSelected] = useState(0);
  const [override, setOverride] = useState(null);
  const paused = override ?? reducedMotion;
  const index = selected % Math.max(1, top.length);
  useEffect(() => {
    if (paused || top.length < 2) return;
    const timer = setTimeout(() => setSelected((i) => (i + 1) % top.length), 7600);
    return () => clearTimeout(timer);
  }, [index, paused, top.length]);

  const mascot = top[index];
  if (!mascot) return null;

  return <Stage mascot={mascot} action={mascot.actions[0].id} play={!paused} loop className="hero-stage">
    <span className="spotlight"><Flame size={15} strokeWidth={2.6} aria-hidden="true" /> 热榜轮播</span>
    <a className="spotlight-caption" href={`#post/${mascot.id}`}>
      <strong>{mascot.name}</strong>
      <span>{mascot.actions[0].name}</span>
    </a>
    <div className="showcase-controls">
      <div className="showcase-dots" role="group" aria-label="切换热门吉祥物">
        {top.map((post, dot) => <button type="button" key={post.id} aria-label={post.name}
          aria-pressed={dot === index} onClick={() => setSelected(dot)} />)}
      </div>
      <button type="button" className="showcase-toggle" aria-label={paused ? "播放热榜" : "暂停热榜"}
        onClick={() => setOverride(!paused)}>
        {paused ? <Play size={15} strokeWidth={2.5} aria-hidden="true" /> : <Pause size={15} strokeWidth={2.5} aria-hidden="true" />}
      </button>
    </div>
  </Stage>;
}
