import expressions from "../shared/expressions.json" with { type: "json" };
import { moods } from "../shared/catalog.js";

export function expressionName(mood, intensity) {
  return expressions[mood][intensity - 1].name;
}

export default function ExpressionPreview({ mood, intensity, kind }) {
  const row = moods.findIndex(({ id }) => id === mood);
  return <span className="expression-preview" aria-hidden="true" style={{
    backgroundImage: `url(/faces/${kind}.webp)`,
    backgroundPosition: `${(intensity - 1) * 25}% ${row * 100 / (moods.length - 1)}%`,
  }} />;
}
