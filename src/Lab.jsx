import { Activity, AlertTriangle, Check, ChevronDown, FlaskConical, LockKeyhole, MapPin, Sparkles } from "lucide-react";
import { kinds, palettes, resolvePalette } from "../shared/catalog.js";
import EmotionPills from "./EmotionPills.jsx";
import ExpressionPreview, { expressionName } from "./ExpressionPreview.jsx";
import { Icon } from "./icons.jsx";
import Sketchpad from "./Sketchpad.jsx";
import { Showcase } from "./Stage.jsx";

export default function Lab({
  posts, reducedMotion, place, draft, setDraft, setStrokes, selectEmotion, surfaceRef, providers, busy, error, onGenerate,
}) {
  const update = (field, value) => setDraft((previous) => ({ ...previous, [field]: value }));
  const palette = palettes[resolvePalette(draft.mood, draft.palette)];
  const moodPalette = palettes[resolvePalette(draft.mood)];
  const face = expressionName(draft.mood, draft.intensity);
  const progress = busy === "sculpting" ? "Blender 正在捏造…" : "正在读你的草图…";
  function goToMix() {
    document.getElementById("mix")?.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" });
  }

  return <>
    {!place && <section className="hero comic-panel">
      <div className="hero-copy">
        <div className="hero-meta">
          <div className="eyebrow"><Activity size={16} strokeWidth={2.2} aria-hidden="true" /> 校园情绪实验</div>
        </div>
        <h1>今天的情绪，<br /><em>先变个形。</em></h1>
        <p className="hero-blurb">选一个状态，随手画两笔。<br />把说不出口的心情，捏成一只会走路的 3D 吉祥物。</p>
        <div className="hero-actions">
          <button type="button" className="button primary" onClick={goToMix}>
            <FlaskConical size={19} strokeWidth={2.2} aria-hidden="true" /> 开始配制
          </button>
          <a className="button accent-yellow" href="#campus">
            <MapPin size={17} strokeWidth={2.2} aria-hidden="true" /> 逛逛校园
          </a>
        </div>
      </div>
      <Showcase posts={posts} reducedMotion={reducedMotion} />
    </section>}
    <section id="mix" className={`mix-section ${place ? "mix-from-campus" : ""}`} aria-labelledby="mix-title">
      {place && <a href="#campus" className="back-link">返回校园地图</a>}
      <div className="section-heading">
        <div>
          <h2 id="mix-title">{place ? `在${place.name}画两笔` : "配制你的电子布洛芬"}</h2>
          <p>{place ? "画个轮廓，吉祥物就会出现在这个地点。" : "画出你想要的轮廓，Blender 会沿着笔迹把它充成 3D。"}</p>
        </div>
        <span className="muted-note"><LockKeyhole size={15} strokeWidth={2.2} aria-hidden="true" /> 作品默认仅自己可见</span>
      </div>
      <form onSubmit={onGenerate}>
        <div className="mix-grid">
          <div className="mix-inputs comic-panel">
            <div className="mix-inputs-body">
              <fieldset disabled={Boolean(busy)}>
                <legend>主要情绪</legend>
                <EmotionPills value={draft.emotion} onChange={selectEmotion} disabled={Boolean(busy)} />
              </fieldset>
              <fieldset className="palette-field" disabled={Boolean(busy)}>
                <legend>吉祥物颜色 <span className="palette-current" role="status">{palette.label}</span></legend>
                <div className="palette-options">
                  <label className="palette-choice palette-auto" style={{ "--swatch": moodPalette.skin }}>
                    <input type="radio" name="palette" value="auto" checked={draft.palette === "auto"}
                      onChange={() => update("palette", "auto")} />
                    <span className="palette-dot" aria-hidden="true" /> 随状态
                  </label>
                  {Object.entries(palettes).map(([id, color]) => <label className="palette-choice palette-swatch"
                    key={id} title={color.label} style={{ "--swatch": color.skin }}>
                    <input type="radio" name="palette" value={id} aria-label={color.label}
                      checked={draft.palette === id} onChange={() => update("palette", id)} />
                    {draft.palette === id && <Check size={17} strokeWidth={3} aria-hidden="true" />}
                  </label>)}
                </div>
              </fieldset>
              <div className="intensity">
                <div className="intensity-heading">
                  <ExpressionPreview mood={draft.mood} intensity={draft.intensity} kind={draft.kind} />
                  <label htmlFor="intensity">情绪烈度</label>
                  <output htmlFor="intensity" className={`intensity-badge level-${draft.intensity}`}>
                    {draft.intensity}<span>/5</span> · {face}
                  </output>
                </div>
                <input id="intensity" type="range" min="1" max="5" step="1" value={draft.intensity}
                  disabled={Boolean(busy)} aria-valuetext={`${draft.intensity} 档，${face}`}
                  style={{ "--attr-min": 1, "--attr-max": 5, "--control-value": draft.intensity }}
                  onChange={(event) => update("intensity", Number(event.target.value))} />
                <div className="range-ends" aria-hidden="true"><span>轻</span><span>强</span></div>
              </div>
              <fieldset disabled={Boolean(busy)}>
                <legend>吉祥物类型</legend>
                <div className="kind-options">
                  {kinds.map((kind) => {
                    const chosen = draft.kind === kind.id;
                    return <label key={kind.id} className={`choice kind-choice ${chosen ? "chosen" : ""}`}>
                      <input type="radio" name="kind" value={kind.id} checked={chosen}
                        onChange={() => update("kind", kind.id)} />
                      <span className={`kind-icon kind-${kind.id}`}><Icon name={kind.icon} size={18} /></span>
                      <span><b>{kind.label}</b><small>{kind.hint}</small></span>
                      {chosen && <Check className="choice-check" size={15} strokeWidth={3} aria-hidden="true" />}
                    </label>;
                  })}
                </div>
              </fieldset>
            </div>
          </div>
          <Sketchpad strokes={draft.strokes} setStrokes={setStrokes} surfaceRef={surfaceRef}
            paletteColor={palette.skin} disabled={Boolean(busy)} />
        </div>
        <details className="motion-setting comic-panel">
          <summary><Activity size={17} strokeWidth={2.5} aria-hidden="true" /> 编排自己的动作 <span className="summary-tag">可选</span><ChevronDown size={17} strokeWidth={2.5} aria-hidden="true" /></summary>
          <div>
            <label htmlFor="motion-text">每行编一个动作，可串联三步，最多写三行。</label>
            <textarea id="motion-text" rows={3} maxLength={180} disabled={Boolean(busy)}
              placeholder={"左手挥两下，再跳一下\n朝右转一圈，然后停一秒"}
              value={draft.motionText} onChange={(event) => update("motionText", event.target.value)} />
            <p>可以编排挥手、摇肚、大笑、蹬腿、呼吸、弹跳、转圈、转身、点头和停顿。</p>
          </div>
        </details>
        <div className="mix-submit comic-panel">
          <div className="cloud-setting">
            {providers.length ? <>
              <label><input type="checkbox" checked={draft.useAI} disabled={Boolean(busy)}
                onChange={(event) => update("useAI", event.target.checked)} /> 用 AI 解读草图</label>
              <p>{draft.useAI ? `草图、状态和动作说明会发给 ${providers.join(" 或 ")}。` : "草图、动作和模型在本机处理。"}</p>
            </> : <p>本机解读草图，由 Blender 生成模型。</p>}
            {error && <p className="problem" role="alert"><AlertTriangle size={16} strokeWidth={2.5} aria-hidden="true" /> <span>{error}</span></p>}
          </div>
          <button type="submit" className="button primary generate-button" disabled={Boolean(busy)}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <Sparkles size={19} strokeWidth={2.5} aria-hidden="true" />}
            <span aria-live="polite">{busy ? progress : place ? "让它出现在这里" : "生成我的吉祥物！"}</span>
          </button>
        </div>
      </form>
    </section>
  </>;
}
