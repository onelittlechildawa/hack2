import { useState } from "react";
import { ArrowRight, Eraser, Flame, Heart, Pencil, Pill, Settings2, Sparkles, Undo2 } from "lucide-react";
import { kinds, palettes, resolvePalette } from "../shared/catalog.js";
import { campusTopics } from "../shared/topics.js";
import AppDock from "./AppDock.jsx";
import EmotionPills from "./EmotionPills.jsx";
import ExpressionPreview, { expressionName } from "./ExpressionPreview.jsx";
import FullscreenButton from "./FullscreenButton.jsx";
import { sampleSketch, SketchCanvas } from "./Sketchpad.jsx";
import "./scene.css";

function paperInk(color) {
  const channels = [1, 3, 5].map((start) => Math.round(parseInt(color.slice(start, start + 2), 16) * .62));
  return `rgb(${channels.join(", ")})`;
}

export default function DrawStage({ draft, setDraft, setStrokes, selectEmotion, surfaceRef, place, providers, booted, busy, error, onGenerate, topics = [] }) {
  const [drawing, setDrawing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const palette = resolvePalette(draft.mood, draft.palette);
  const face = expressionName(draft.mood, draft.intensity);
  const hasSketch = drawing || draft.strokes.length > 0;
  const progress = busy === "sculpting" ? "正在把笔迹捏成 3D" : "正在读你的草图";
  const update = (field, value) => setDraft((previous) => ({ ...previous, [field]: value }));
  const orderedTopics = topics.length
    ? topics
    : Object.keys(campusTopics).map((id) => ({ id, count: 0 }));

  return <main className="scene draw-stage" data-drawn={hasSketch || undefined} data-generating={Boolean(busy) || undefined}>
    <div className="draw-grid" aria-hidden="true" />
    <div className="draw-orbits" aria-hidden="true"><i /><i /><i /></div>
    <SketchCanvas className="draw-canvas" strokes={draft.strokes} setStrokes={setStrokes} surfaceRef={surfaceRef}
      disabled={Boolean(busy)} ink={paperInk(palettes[palette].skin)} thickness={5.4} onDrawing={setDrawing}
      label="全屏情绪画板，可以用手指、笔或鼠标绘画，也可以用范例" describedBy="draw-instruction" />
    <header className="scene-header">
      <a className="scene-brand" href="#draw" aria-label="电子布洛芬首页">
        <span className="scene-mark"><Pill size={20} aria-hidden="true" /></span>
        <span><strong>电子布洛芬</strong><small>{place ? `在${place.name}创作` : "情绪画板"}</small></span>
      </a>
      <div className="scene-actions"><FullscreenButton /></div>
    </header>
    <div className="draw-intro">
      <h1>此刻的情绪，画下来<span>。</span></h1>
      <p id="draw-instruction">选一种情绪，在空白处随手画个轮廓，让它变成一只会走路的吉祥物。</p>
      <div className="draw-affordance" aria-hidden="true">
        <svg className="draw-ghost-sketch" viewBox="0 0 220 120" fill="none">
          <path className="draw-ghost-path"
            d="M62 88 C42 84, 34 62, 46 44 C56 28, 78 24, 96 28 C108 14, 128 16, 134 30 C156 26, 178 40, 176 62 C174 82, 154 94, 132 94 C112 94, 84 94, 62 88 Z" />
          <circle cx="92" cy="54" r="3.4" fill="currentColor" opacity="0.42" />
          <circle cx="128" cy="54" r="3.4" fill="currentColor" opacity="0.42" />
          <path d="M98 67 Q110 75 122 67" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity="0.42" />
        </svg>
        <span className="draw-cue-pill">
          <Pencil size={14} strokeWidth={2.2} />
          按住空白处拖动，直接在这里画两笔
        </span>
      </div>
    </div>
    <form className="draw-dock" onSubmit={onGenerate}>
      <div className="draw-mood-bar">
        <div className="draw-mood-choices">
          <div className="draw-topic-strip">
            <span className="draw-bar-label"><Heart size={14} aria-hidden="true" /> 主要情绪</span>
            <EmotionPills value={draft.emotion} onChange={selectEmotion} disabled={Boolean(busy)} scene />
          </div>
          <div className="draw-topic-strip" role="group" aria-label="热榜情境标签">
            <span className="draw-bar-label"><Flame size={14} aria-hidden="true" /> 热榜标签</span>
            <div className="draw-topic-pills">
              {orderedTopics.map(({ id, count }) => {
                const selected = draft.tag === id;
                return <button key={id} type="button" className="draw-topic-pill"
                  aria-pressed={selected} disabled={Boolean(busy)}
                  onClick={() => update("tag", selected ? "" : id)}>
                  <span>#{campusTopics[id]}</span>
                  {count > 0 && <small>{count}</small>}
                </button>;
              })}
            </div>
          </div>
        </div>
        <div className="draw-intensity-control">
          <ExpressionPreview mood={draft.mood} intensity={draft.intensity} kind={draft.kind} />
          <label htmlFor="draw-intensity">
            <span>情绪烈度</span>
            <output htmlFor="draw-intensity" className={`draw-level level-${draft.intensity}`}>
              {draft.intensity}/5 · {face}
            </output>
          </label>
          <input id="draw-intensity" type="range" min="1" max="5" step="1" value={draft.intensity}
            disabled={Boolean(busy)} aria-valuetext={`${draft.intensity} 档，${face}`}
            style={{ "--attr-min": 1, "--attr-max": 5, "--control-value": draft.intensity }}
            onChange={(event) => update("intensity", Number(event.target.value))} />
        </div>
      </div>
      <div className="draw-secondary">
        <button type="button" className="scene-button draw-example" disabled={Boolean(busy) || hasSketch}
          onClick={() => setStrokes(sampleSketch(surfaceRef.current, 0.83))}>
          <Sparkles size={16} aria-hidden="true" /> 用范例
        </button>
        <div className="draw-settings">
          <button className="scene-button scene-icon" type="button" aria-label="创作设置" title="创作设置"
            aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}><Settings2 size={18} aria-hidden="true" /></button>
          {settingsOpen && <fieldset className="scene-popup draw-settings-panel" aria-label="吉祥物选项" disabled={Boolean(busy)}>
            <label>吉祥物类型<select value={draft.kind} onChange={(event) => update("kind", event.target.value)}>
              {kinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
            </select></label>
            {providers.length > 0 && <>
              <label className="draw-ai"><input type="checkbox" checked={draft.useAI}
                onChange={(event) => update("useAI", event.target.checked)} /> 让 AI 解读草图</label>
              {draft.useAI && <small>生成时会把草图和设置发送给 {providers.join(" 或 ")}。</small>}
            </>}
            <a className="draw-lab-link" href={place ? `#lab/${place.id}` : "#lab"}>打开制造间 <ArrowRight size={15} aria-hidden="true" /></a>
          </fieldset>}
        </div>
      </div>
      <div className="draw-tools" aria-label="绘画工具" role="group">
        <fieldset className="draw-colors" aria-label="吉祥物颜色" disabled={Boolean(busy)}>
          {Object.entries(palettes).map(([id, color]) => <label key={id} className="draw-swatch"
            style={{ "--swatch": color.skin }} title={color.label}>
            <input type="radio" name="paint-color" aria-label={color.label} checked={id === palette} onChange={() => update("palette", id)} />
            <span aria-hidden="true" />
          </label>)}
        </fieldset>
        <button className="scene-button scene-icon" type="button" aria-label="撤销上一笔" title="撤销上一笔"
          disabled={Boolean(busy) || !draft.strokes.length} onClick={() => setStrokes((strokes) => strokes.slice(0, -1))}>
          <Undo2 size={19} aria-hidden="true" />
        </button>
        <button className="scene-button scene-icon" type="button" aria-label="清空画板" title="清空画板"
          disabled={Boolean(busy) || !draft.strokes.length} onClick={() => setStrokes([])}>
          <Eraser size={19} aria-hidden="true" />
        </button>
      </div>
      <div className="draw-finish">
        {error && <p className="draw-error" role="alert">{error}</p>}
        <button className="scene-button scene-primary draw-generate" type="submit" disabled={Boolean(busy) || !booted || !draft.strokes.length}>
          <span aria-live="polite">{busy ? progress : "让它走进校园"}</span>
          {busy ? <span className="draw-spinner" aria-hidden="true" /> : <ArrowRight size={20} aria-hidden="true" />}
        </button>
        <small>生成后仅你可见</small>
      </div>
    </form>
    <AppDock active="draw" drawHref={place ? `#draw/${place.id}` : "#draw"}
      campusHref={place ? `#campus//${place.id}` : "#campus"} />
  </main>;
}
