import { useState } from "react";
import { AlertTriangle, Heart, Plus } from "lucide-react";
import { kinds } from "../shared/catalog.js";
import { emotionLabel } from "../shared/emotions.js";
import { GridArtwork } from "./Stage.jsx";

export function KindTag({ kind }) {
  return <span className={`tag tag-${kind}`}>{kinds.find(({ id }) => id === kind)?.label}</span>;
}

export function Like({ mascot, pending, onToggle, quiet = false }) {
  const label = quiet ? "我也在" : "共鸣";
  const action = mascot.liked ? `取消${label}` : label;
  return <button type="button" className={`like-button ${mascot.liked ? "liked" : ""}`}
    aria-label={quiet ? action : `${action}，${mascot.likes} 个共鸣`}
    aria-pressed={mascot.liked} disabled={pending} onClick={() => onToggle(mascot)}>
    <Heart size={17} strokeWidth={2.5} fill={mascot.liked ? "currentColor" : "none"} aria-hidden="true" /> {quiet ? label : mascot.likes}
  </button>;
}

export default function Community({ posts, onToggle, pendingLikes, error }) {
  const [sort, setSort] = useState("hot");
  const ordered = sort === "hot" ? posts : [...posts].sort((a, b) => b.publishedAt - a.publishedAt);
  return <section className="board">
    <div className="board-intro comic-panel">
      <div>
        <h1>情绪图鉴</h1>
        <p>打开吉祥物，看看它的 3D 动作。</p>
      </div>
      <a href="#draw" className="button primary"><Plus size={19} strokeWidth={2.6} aria-hidden="true" /> 画一个</a>
    </div>
    <div className="board-toolbar">
      <span className="board-count">共收录 {posts.length} 只吉祥物</span>
      <div className="sort-tabs" role="group" aria-label="排列吉祥物">
        <button type="button" aria-pressed={sort === "hot"} onClick={() => setSort("hot")}>按热度</button>
        <button type="button" aria-pressed={sort === "latest"} onClick={() => setSort("latest")}>最新</button>
      </div>
    </div>
    {error && <p className="problem" role="alert"><AlertTriangle size={16} strokeWidth={2.5} aria-hidden="true" /> <span>{error}</span></p>}
    <div className="post-grid">
      {ordered.map((mascot, idx) => <article className="post-card comic-panel" key={mascot.id}>
        <a className={`post-picture stage-${mascot.stage}`} href={`#post/${mascot.id}`}
          aria-label={`查看${mascot.name}的 3D 动作`}>
          <GridArtwork />
          <img src={mascot.poster} alt={mascot.name} loading="lazy" />
          <KindTag kind={mascot.kind} />
          <span className="card-issue" aria-hidden="true">#{String(idx + 1).padStart(2, "0")}</span>
        </a>
        <div className="post-body">
          <div>
            <a className="post-name" href={`#post/${mascot.id}`}>{mascot.name}</a>
            <div className="post-meta">{emotionLabel(mascot)} · {mascot.seed ? "演示样本" : mascot.own ? "我发布的" : "匿名同学"}</div>
          </div>
          <Like mascot={mascot} pending={pendingLikes.has(mascot.id)} onToggle={onToggle} />
        </div>
      </article>)}
    </div>
  </section>;
}
