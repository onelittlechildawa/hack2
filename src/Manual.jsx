import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronLeft, Copy, Download, Hand, LockKeyhole, MapPin, Pencil, Play, Send, Share2, Sparkles, X } from "lucide-react";
import { palettes } from "../shared/catalog.js";
import { emotionLabel } from "../shared/emotions.js";
import { TopicLink } from "./CampusTopics.jsx";
import { KindTag, Like } from "./Community.jsx";
import { Icon } from "./icons.jsx";
import ShareDialog from "./ShareDialog.jsx";
import { Stage } from "./Stage.jsx";

const sources = { gemini: "Gemini", openai: "GPT", local: "本地配方", demo: "演示样本" };

export default function Manual({ mascot, community, reducedMotion, onPublish, onRename, onToggle, pendingLike }) {
  const [now, setNow] = useState({ index: 0, replay: 0 });
  const [publishing, setPublishing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(mascot.name);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [copy, setCopy] = useState("idle");
  const [error, setError] = useState("");
  const move = mascot.actions[now.index];
  const palette = palettes[mascot.palette];
  const doMove = (i) => setNow((previous) => ({ index: i, replay: previous.replay + 1 }));
  const status = mascot.published ? "已匿名发布" : "仅自己可见";

  async function submitName(event) {
    event.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed || savingName) return;
    if (trimmed === mascot.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setNameError("");
    try {
      await onRename(mascot, trimmed);
      setEditingName(false);
    } catch (failure) {
      setNameError(failure.message);
    } finally {
      setSavingName(false);
    }
  }

  async function publish() {
    setPublishing(true);
    setError("");
    try {
      await onPublish(mascot, !mascot.published);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPublishing(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(mascot.prompt);
      setCopy("done");
    } catch {
      setCopy("error");
    }
  }

  return <section className="manual">
    <div className="manual-navigation">
      <a className="back-link" href={community ? "#board" : "#lab"}>
        <ChevronLeft size={17} strokeWidth={2.6} aria-hidden="true" /> {community ? "返回情绪图鉴" : "返回配制"}
      </a>
      <div className="manual-nav-actions">
        <button type="button" className="button secondary" onClick={() => setShareOpen(true)}>
          <Share2 size={17} strokeWidth={2.2} aria-hidden="true" /> 转发
        </button>
        {mascot.own && <a className="button accent-yellow" href={`#campus/${mascot.id}`}>
          <MapPin size={17} aria-hidden="true" /> 带它去校园
        </a>}
      </div>
    </div>
    <div className="manual-grid">
      <Stage mascot={mascot} action={move.id} replay={now.replay} play={!reducedMotion || now.replay > 0}
        onTap={() => doMove((now.index + 1) % mascot.actions.length)} className="manual-stage comic-panel">
        <span className="spotlight spotlight-blue"><Sparkles size={15} strokeWidth={2.5} aria-hidden="true" /> 3D 试玩</span>
        <div className="stage-tip"><Hand size={15} strokeWidth={2.5} aria-hidden="true" /> 拖动旋转 · 轻点换动作</div>
      </Stage>
      <div className="manual-content comic-panel">
        <div className="eyebrow"><Icon name="activity" size={16} /> 角色档案 · 服用说明</div>
        {editingName ? <form className="rename-form" onSubmit={submitName}>
          <label className="sr-only" htmlFor="mascot-name-input">编辑吉祥物名字</label>
          <input id="mascot-name-input" type="text" maxLength={16} value={nameInput} autoFocus
            disabled={savingName} placeholder="输入吉祥物名字（最多 16 字）"
            onChange={(event) => setNameInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") { setEditingName(false); setNameInput(mascot.name); setNameError(""); } }} />
          <div className="rename-actions">
            <button type="submit" className="button primary rename-btn" disabled={savingName || !nameInput.trim()}>
              <Check size={16} strokeWidth={2.6} aria-hidden="true" /> {savingName ? "保存中…" : "保存"}
            </button>
            <button type="button" className="button secondary rename-btn" disabled={savingName}
              onClick={() => { setEditingName(false); setNameInput(mascot.name); setNameError(""); }}>
              <X size={16} strokeWidth={2.6} aria-hidden="true" /> 取消
            </button>
          </div>
          {nameError && <p className="problem" role="alert"><AlertTriangle size={15} aria-hidden="true" /> <span>{nameError}</span></p>}
        </form> : <div className="manual-title-row">
          <h1>{mascot.name}</h1>
          {mascot.own && onRename && <button type="button" className="rename-trigger"
            aria-label="编辑吉祥物名字" onClick={() => { setNameInput(mascot.name); setNameError(""); setEditingName(true); }}>
            <Pencil size={15} strokeWidth={2.5} aria-hidden="true" /> 改名
          </button>}
        </div>}
        <div className="manual-tags">
          <span className="tag tag-mood">{emotionLabel(mascot)}</span>
          <KindTag kind={mascot.kind} />
          <span className="tag tag-power">情绪烈度 {mascot.intensity}/5{mascot.expression && ` · ${mascot.expression}`}</span>
          {palette && <span className="tag palette-tag" style={{ "--swatch": palette.skin }}>
            <span className="palette-dot" aria-hidden="true" /> {palette.label}
          </span>}
          {mascot.tag && <TopicLink id={mascot.tag} />}
        </div>
        <blockquote className="speech-bubble">“{mascot.quote}”</blockquote>
        <h2>让它动一动</h2>
        <div className="action-list">
          {mascot.actions.map((action, index) => <button type="button" key={action.id}
            className={`action-button ${now.index === index ? "active" : ""}`}
            aria-pressed={now.index === index} onClick={() => doMove(index)}>
            <span className="action-icon"><Icon name={action.icon} size={19} /></span>
            <span className="action-copy"><strong>{action.name}</strong><small>{action.hint}</small></span>
            <Play size={17} strokeWidth={2.6} aria-hidden="true" className="action-play" />
          </button>)}
        </div>
        {mascot.motionWarnings > 0 && <p className="problem"><AlertTriangle size={16} strokeWidth={2.5} aria-hidden="true" /> <span>有些自编动作超出了可编排的范围，动作卡上显示实际生成的步骤。</span></p>}
      </div>
    </div>
    {mascot.own ? <>
      <div className={`manual-share comic-panel ${mascot.published ? "is-published" : ""}`}>
        <div className="share-status"><span className="share-badge"><LockKeyhole size={18} strokeWidth={2.5} aria-hidden="true" /></span>
          <div><strong aria-live="polite">{status}</strong>
            <span>{mascot.published ? "情绪图鉴上的访客可以查看它的动作和点共鸣。" : "你可以把它和此刻状态一起收入情绪图鉴。"}</span></div>
        </div>
        <button type="button" className={`button ${mascot.published ? "secondary" : "primary"}`}
          disabled={publishing} onClick={publish}>
          {publishing ? <span className="spinner" aria-hidden="true" /> : <Send size={17} strokeWidth={2.5} aria-hidden="true" />}
          {mascot.published ? "撤回发布" : "匿名发布"}
        </button>
      </div>
      {error && <p className="problem" role="alert"><AlertTriangle size={16} strokeWidth={2.5} aria-hidden="true" /> <span>{error}</span></p>}
      <div className="manual-extras">
        {mascot.prompt && <details className="comic-panel">
          <summary><ChevronDown size={17} strokeWidth={2.5} aria-hidden="true" /> 3D 生成提示词 <span>{sources[mascot.source]} × Blender</span></summary>
          <div className="prompt-body">
            <p>{mascot.prompt}</p>
            <button className="text-link copy-prompt" type="button" onClick={copyPrompt}>
              {copy === "done" ? <Check size={15} strokeWidth={2.6} aria-hidden="true" /> : <Copy size={15} strokeWidth={2.5} aria-hidden="true" />}
              {copy === "done" ? "已复制" : copy === "error" ? "复制失败，重试" : "复制提示词"}
            </button>
          </div>
        </details>}
        <a className="button secondary download" download={`${mascot.name}.glb`} href={mascot.model}>
          <Download size={17} strokeWidth={2.5} aria-hidden="true" /> 下载 GLB
        </a>
      </div>
    </> : <div className="manual-share comic-panel">
      <div className="share-status"><div>
        <strong>{mascot.seed ? "演示样本" : "匿名同学"}</strong>
        <span>有共鸣就点个心。</span>
      </div></div>
      <Like mascot={mascot} pending={pendingLike} onToggle={onToggle} />
    </div>}
    <ShareDialog mascot={mascot} open={shareOpen} onClose={() => setShareOpen(false)} />
  </section>;
}
