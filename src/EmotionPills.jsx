import { primaryEmotions } from "../shared/emotions.js";

export default function EmotionPills({ value, onChange, disabled, scene = false }) {
  return <div className={scene ? "draw-topic-pills" : "emotion-pills"} role="group" aria-label="主要情绪">
    {Object.entries(primaryEmotions).map(([id, { label }]) => <button key={id} type="button"
      className={scene ? "draw-topic-pill" : "emotion-pill"} aria-pressed={value === id} disabled={disabled}
      onClick={() => onChange(id)}>{label}</button>)}
  </div>;
}
