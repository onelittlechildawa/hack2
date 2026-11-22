import { useEffect, useRef } from "react";
import { Eraser, Pencil, Sparkles, Undo2 } from "lucide-react";

const example = [
  [
    [0.40, 0.40], [0.32, 0.32], [0.33, 0.22], [0.39, 0.13], [0.49, 0.10], [0.60, 0.13], [0.66, 0.22],
    [0.68, 0.32], [0.61, 0.40], [0.74, 0.41], [0.85, 0.45], [0.86, 0.51], [0.81, 0.56], [0.68, 0.55],
    [0.63, 0.59], [0.68, 0.76], [0.66, 0.84], [0.60, 0.87], [0.54, 0.83], [0.50, 0.72], [0.46, 0.72],
    [0.41, 0.86], [0.34, 0.87], [0.29, 0.83], [0.30, 0.76], [0.35, 0.59], [0.32, 0.55], [0.19, 0.57],
    [0.13, 0.53], [0.14, 0.47], [0.23, 0.43], [0.41, 0.40],
  ],
  [[0.42, 0.25], [0.427, 0.25]],
  [[0.568, 0.246], [0.575, 0.25]],
  [[0.414, 0.32], [0.464, 0.357], [0.524, 0.35], [0.569, 0.315]],
  [[0.48, 0.46], [0.49, 0.52], [0.54, 0.52], [0.52, 0.45], [0.48, 0.46]],
  [[0.48, 0.585], [0.485, 0.59]],
];

export function sampleSketch(surface, size = 0.88) {
  const { width, height } = surface.getBoundingClientRect();
  const scale = size * Math.min(width, height) / Math.max(width, height);
  return example.map((line) => line.map(([x, y]) => [0.5 + (x - 0.5) * scale, 0.5 + (y - 0.5) * scale]));
}

export function cropSketch(strokes) {
  const points = strokes.flat();
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  const scale = 0.88 / Math.max(maxX - minX, maxY - minY, 0.02);
  return strokes.map((line) => line.map(([x, y]) => [0.5 + (x - centerX) * scale, 0.5 + (y - centerY) * scale]));
}

function drawingFrame(width, height, strokes) {
  let halfWidth = 0, halfHeight = 0;
  for (const line of strokes) {
    for (const [x, y] of line) {
      halfWidth = Math.max(halfWidth, Math.abs(x - 0.5));
      halfHeight = Math.max(halfHeight, Math.abs(y - 0.5));
    }
  }
  // Keep the drawing's proportions on rotation, resizing, and moving between editors.
  const scale = Math.min(Math.max(width, height), width / (2 * halfWidth), height / (2 * halfHeight));
  return { scale, left: (width - scale) / 2, top: (height - scale) / 2 };
}

function paint(context, strokes, width, height, ink, thickness) {
  context.strokeStyle = ink;
  context.fillStyle = ink;
  context.lineWidth = thickness;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const line of strokes) {
    const [firstX, firstY] = line[0];
    context.beginPath();
    if (line.length === 1) {
      context.arc(firstX * width, firstY * height, thickness / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    context.moveTo(firstX * width, firstY * height);
    for (let i = 1; i < line.length - 1; i++) {
      const [x, y] = line[i];
      const [nextX, nextY] = line[i + 1];
      context.quadraticCurveTo(x * width, y * height, (x + nextX) * width / 2, (y + nextY) * height / 2);
    }
    const [lastX, lastY] = line.at(-1);
    context.lineTo(lastX * width, lastY * height);
    context.stroke();
  }
}

export function sketchImage(strokes, aspect) {
  const canvas = document.createElement("canvas");
  canvas.width = 520;
  canvas.height = Math.round(520 / aspect);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  paint(context, strokes, canvas.width, canvas.height, "#1a1a1a", 5);
  return canvas.toDataURL("image/png");
}

export function SketchCanvas({ strokes, setStrokes, surfaceRef, disabled, className, label, describedBy,
  ink = "#1a1a1a", thickness = 4.2, glow = false, guide = false, onDrawing }) {
  const active = useRef(null);
  const redraw = useRef(null);

  redraw.current = () => {
    const canvas = surfaceRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2, 3000 / Math.max(width, height));
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const drawing = active.current ? [...strokes, active.current.line] : strokes;
    const { scale, left, top } = active.current?.frame || drawingFrame(width, height, strokes);
    context.translate(left, top);
    if (guide && !drawing.length) {
      const hint = sampleSketch(canvas).map((line) => line.map(([x, y]) => [x, y - 0.04]));
      paint(context, hint, scale, scale, "rgba(51, 102, 255, 0.36)", 2.6);
    }
    if (glow && drawing.length) {
      context.shadowColor = ink;
      context.shadowBlur = 13 * dpr;
      context.globalAlpha = 0.42;
      paint(context, drawing, scale, scale, ink, thickness);
      context.shadowBlur = 0;
      context.globalAlpha = 1;
    }
    paint(context, drawing, scale, scale, ink, thickness);
  };
  useEffect(() => {
    const observer = new ResizeObserver(() => redraw.current());
    observer.observe(surfaceRef.current);
    return () => observer.disconnect();
  }, [surfaceRef]);
  useEffect(() => { redraw.current(); }, [strokes, ink, thickness, glow, guide]);

  function point(event, frame, bounds) {
    const unit = (value) => Math.round(value * 10000) / 10000;
    const x = Math.min(bounds.width, Math.max(0, event.clientX - bounds.left));
    const y = Math.min(bounds.height, Math.max(0, event.clientY - bounds.top));
    return [unit((x - frame.left) / frame.scale), unit((y - frame.top) / frame.scale)];
  }

  function begin(event) {
    if (disabled || active.current || strokes.length >= 64 || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = event.currentTarget.getBoundingClientRect();
    const frame = drawingFrame(bounds.width, bounds.height, strokes);
    active.current = { id: event.pointerId, frame, bounds, line: [point(event, frame, bounds)] };
    onDrawing?.(true);
    redraw.current();
  }

  function move(event) {
    const stroke = active.current;
    if (stroke?.id !== event.pointerId) return;
    const last = stroke.line.at(-1);
    const p = point(event, stroke.frame, stroke.bounds);
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) * stroke.frame.scale < 2) return;
    if (stroke.line.length >= 280) stroke.line = stroke.line.filter((_, i) => i % 2 === 0);
    stroke.line.push(p);
    redraw.current();
  }

  function end(event) {
    if (active.current?.id !== event.pointerId) return;
    const { line } = active.current;
    active.current = null;
    setStrokes((drawing) => [...drawing, line]);
    onDrawing?.(false);
  }

  return <canvas ref={surfaceRef} className={className} tabIndex={0} aria-label={label}
    aria-describedby={describedBy} onPointerDown={begin} onPointerMove={move} onPointerUp={end}
    onPointerCancel={end} onLostPointerCapture={end} />;
}

export default function Sketchpad({ strokes, setStrokes, surfaceRef, paletteColor, disabled }) {
  return (
    <div className="sketch-panel comic-panel">
      <div className="sketch-heading">
        <div className="sketch-heading-text">
          <Pencil size={18} strokeWidth={2.2} aria-hidden="true" />
          <h3>吉祥物白板</h3>
        </div>
        <button type="button" className="sample-button" disabled={disabled} onClick={() => setStrokes(sampleSketch(surfaceRef.current))}>
          <Sparkles size={15} strokeWidth={2.2} aria-hidden="true" /> 用范例
        </button>
      </div>
      <div className={`sketch-surface ${disabled ? "frozen" : ""}`} style={{ "--mascot-color": paletteColor }}>
        <SketchCanvas surfaceRef={surfaceRef} strokes={strokes} setStrokes={setStrokes} disabled={disabled} guide
          label="吉祥物白板，可用鼠标或手指绘画，键盘用户可选择用范例" />
        {!strokes.length && <span className="sketch-hint">按住空白处随手画，围一圈更像原稿</span>}
      </div>
      <div className="sketch-tools">
        <span className="stroke-counter" aria-live="polite">{strokes.length} 笔</span>
        <div>
          <button type="button" className="icon-button" aria-label="撤销上一笔" title="撤销上一笔"
            disabled={!strokes.length || disabled} onClick={() => setStrokes((drawing) => drawing.slice(0, -1))}>
            <Undo2 size={18} strokeWidth={2.5} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" aria-label="清空白板" title="清空白板"
            disabled={!strokes.length || disabled} onClick={() => setStrokes([])}>
            <Eraser size={18} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
