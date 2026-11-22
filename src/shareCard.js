import QRCode from "qrcode";
import { kinds } from "../shared/catalog.js";
import { campusPlaces } from "../shared/campus.js";
import { emotionLabel } from "../shared/emotions.js";
import { campusTopics } from "../shared/topics.js";

const STAGE_THEMES = {
  lilac: { bg: "#efe8fb", tint: "#dfd0f6", ring: "#9c80c8" },
  peach: { bg: "#faf0ea", tint: "#f3dbd0", ring: "#c88d7c" },
  mint: { bg: "#ebf6ef", tint: "#d4ecde", ring: "#6ba68a" },
};

const FONT_SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("海报图像加载失败"));
    img.src = src;
  });
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const chars = [...text.replace(/\s+/g, " ").trim()];
  const lines = [];
  let line = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      if (lines.length === maxLines - 1) {
        let last = "";
        for (let j = i; j < chars.length; j++) {
          const next = last + chars[j];
          if (ctx.measureText(`${next}…`).width > maxWidth && j < chars.length - 1) {
            lines.push(`${last}…`);
            return lines;
          }
          if (ctx.measureText(next).width > maxWidth) {
            lines.push(`${last}…`);
            return lines;
          }
          last = next;
        }
        if (last) lines.push(last);
        return lines;
      }
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawPill(ctx, x, y, label, { bg, border, color }) {
  ctx.font = `700 24px ${FONT_SANS}`;
  const padX = 18;
  const h = 44;
  const w = Math.ceil(ctx.measureText(label).width) + padX * 2;
  roundRect(ctx, x, y, w, h, 22);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = border;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + padX, y + h / 2 + 1);
  return w;
}

export function getShareUrl(mascot) {
  const origin = window.location.origin;
  if (mascot.published || mascot.seed) {
    return new URL(`#post/${mascot.id}`, origin).href;
  }
  return new URL("#draw", origin).href;
}

export async function renderShareCard(mascot, { line } = {}) {
  const W = 900;
  const H = 1260;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const shareUrl = getShareUrl(mascot);
  const stage = STAGE_THEMES[mascot.stage] || STAGE_THEMES.lilac;
  const kindLabel = kinds.find(({ id }) => id === mascot.kind)?.label || "";
  const topicId = mascot.campus?.tag || mascot.tag;
  const topicLabel = topicId && campusTopics[topicId] ? `#${campusTopics[topicId]}` : "";
  const placeName = mascot.campus?.place && campusPlaces[mascot.campus.place]?.name;
  const quoteText = (line || mascot.campus?.line || mascot.quote || "").trim();

  // 1. Soft lavender-cream radial canvas background
  const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.24, 40, W * 0.5, H * 0.45, H * 0.85);
  bgGrad.addColorStop(0, "#ebe2fa");
  bgGrad.addColorStop(0.45, "#f5eef6");
  bgGrad.addColorStop(1, "#fcf8ed");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle lavender dot pattern
  ctx.fillStyle = "rgba(130, 107, 157, 0.14)";
  for (let gx = 24; gx < W; gx += 32) {
    for (let gy = 24; gy < H; gy += 32) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 2. Main cream card container
  const pad = 44;
  const cardX = pad;
  const cardY = pad;
  const cardW = W - pad * 2;
  const cardH = H - pad * 2;
  ctx.save();
  ctx.shadowColor = "rgba(79, 56, 89, 0.12)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, cardX, cardY, cardW, cardH, 34);
  ctx.fillStyle = "#fffcf7";
  ctx.fill();
  ctx.restore();

  roundRect(ctx, cardX, cardY, cardW, cardH, 34);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(112, 87, 129, 0.22)";
  ctx.stroke();

  // 3. Top header row inside card
  const innerX = cardX + 42;
  const innerW = cardW - 84;
  drawPill(ctx, innerX, cardY + 36, "电子布洛芬 · 校园情绪实验", {
    bg: "#f2e9fa",
    border: "rgba(166, 132, 198, 0.45)",
    color: "#674d94",
  });

  if (placeName || topicLabel) {
    const rightText = [placeName ? `人大 · ${placeName}` : "", topicLabel].filter(Boolean).join("  ");
    ctx.font = `700 22px ${FONT_SANS}`;
    ctx.fillStyle = "#695d70";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(rightText, innerX + innerW, cardY + 58);
    ctx.textAlign = "left";
  }

  // 4. Pastel 3D mascot stage frame
  const stageY = cardY + 104;
  const stageH = 490;
  ctx.save();
  roundRect(ctx, innerX, stageY, innerW, stageH, 26);
  ctx.clip();

  const stageGrad = ctx.createRadialGradient(
    innerX + innerW / 2, stageY + stageH * 0.48, 30,
    innerX + innerW / 2, stageY + stageH * 0.5, innerW * 0.65,
  );
  stageGrad.addColorStop(0, "#fffcf7");
  stageGrad.addColorStop(1, stage.tint);
  ctx.fillStyle = stageGrad;
  ctx.fillRect(innerX, stageY, innerW, stageH);

  const cx = innerX + innerW / 2;
  const cy = stageY + stageH * 0.5;
  ctx.strokeStyle = stage.ring;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 188, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.arc(cx, cy, 152, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  try {
    const posterImg = await loadImage(mascot.poster);
    const scale = Math.min((innerW * 0.86) / posterImg.width, (stageH * 0.92) / posterImg.height);
    const dw = posterImg.width * scale;
    const dh = posterImg.height * scale;
    ctx.save();
    ctx.shadowColor = "rgba(79, 56, 104, 0.22)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 12;
    ctx.drawImage(posterImg, cx - dw / 2, cy - dh / 2 + 4, dw, dh);
    ctx.restore();
  } catch {
    ctx.font = `700 28px ${FONT_SANS}`;
    ctx.fillStyle = "#695d70";
    ctx.textAlign = "center";
    ctx.fillText(mascot.name, cx, cy);
    ctx.textAlign = "left";
  }
  ctx.restore();

  roundRect(ctx, innerX, stageY, innerW, stageH, 26);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(112, 87, 129, 0.2)";
  ctx.stroke();

  // 5. Mascot Name + Tags
  const titleY = stageY + stageH + 54;
  ctx.font = `800 50px ${FONT_SANS}`;
  ctx.fillStyle = "#31273c";
  ctx.textBaseline = "alphabetic";
  const nameLines = wrapText(ctx, mascot.name, innerW, 1);
  ctx.fillText(nameLines[0] || mascot.name, innerX, titleY);

  const tagsY = titleY + 20;
  let tagX = innerX;
  const tagSpecs = [
    { label: emotionLabel(mascot), bg: "#e1d2f5", border: "rgba(166, 132, 198, 0.45)", color: "#38265a" },
    kindLabel && {
      label: kindLabel,
      bg: mascot.kind === "gag" ? "#fdeed4" : "#e8f5ec",
      border: mascot.kind === "gag" ? "#e4c18a" : "#a5d4b4",
      color: mascot.kind === "gag" ? "#7a4c14" : "#235c3b",
    },
    { label: `情绪烈度 ${mascot.intensity}/5`, bg: "#fcebf0", border: "#df9db0", color: "#8c2c4a" },
  ].filter(Boolean);

  for (const spec of tagSpecs) {
    const w = drawPill(ctx, tagX, tagsY, spec.label, spec);
    tagX += w + 12;
  }

  // 6. Quote / Speech Bubble Box
  const quoteY = tagsY + 66;
  const quoteH = 148;
  roundRect(ctx, innerX, quoteY, innerW, quoteH, 18);
  ctx.fillStyle = "#f7f2fb";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(180, 153, 207, 0.48)";
  ctx.stroke();

  roundRect(ctx, innerX, quoteY, 8, quoteH, 4);
  ctx.fillStyle = "#674d94";
  ctx.fill();

  ctx.font = `600 28px ${FONT_SANS}`;
  ctx.fillStyle = "#31273c";
  ctx.textBaseline = "top";
  const quoteLines = wrapText(ctx, `“${quoteText}”`, innerW - 56, 3);
  const lineH = 40;
  const textStartY = quoteY + (quoteH - quoteLines.length * lineH) / 2 + 2;
  quoteLines.forEach((txt, idx) => {
    ctx.fillText(txt, innerX + 30, textStartY + idx * lineH);
  });

  // 7. Bottom Footer with Real Scannable QR Code
  const footerY = quoteY + quoteH + 34;
  const dividerY = footerY - 14;
  ctx.strokeStyle = "rgba(112, 87, 129, 0.18)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(innerX, dividerY);
  ctx.lineTo(innerX + innerW, dividerY);
  ctx.stroke();

  const qrSize = 172;
  const qrX = innerX + innerW - qrSize;
  const qrY = footerY + 4;

  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, shareUrl, {
    width: qrSize - 16,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#31273c", light: "#ffffff" },
  });

  roundRect(ctx, qrX, qrY, qrSize, qrSize, 18);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(166, 132, 198, 0.52)";
  ctx.stroke();
  ctx.drawImage(qrCanvas, qrX + 8, qrY + 8, qrSize - 16, qrSize - 16);

  const copyMaxW = innerW - qrSize - 32;
  ctx.textBaseline = "top";
  ctx.font = `800 32px ${FONT_SANS}`;
  ctx.fillStyle = "#31273c";
  ctx.fillText("电子布洛芬", innerX, qrY + 14);

  ctx.font = `600 24px ${FONT_SANS}`;
  ctx.fillStyle = "#674d94";
  const cta = mascot.published || mascot.seed
    ? "扫码查看这只吉祥物的 3D 动作"
    : "扫码画两笔，捏一只你的情绪吉祥物";
  const ctaLines = wrapText(ctx, cta, copyMaxW, 2);
  ctaLines.forEach((txt, idx) => {
    ctx.fillText(txt, innerX, qrY + 62 + idx * 34);
  });

  ctx.font = `500 20px ${FONT_SANS}`;
  ctx.fillStyle = "#695d70";
  const hostLabel = window.location.host || "zzlight.onelittlechild.cn";
  ctx.fillText(`长按识别二维码 · ${hostLabel}`, innerX, qrY + qrSize - 26);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const dataUrl = canvas.toDataURL("image/png");
  const safeName = (mascot.name || "电子布洛芬吉祥物").replace(/[\\/:*?"<>|]/g, "_");
  return {
    blob,
    dataUrl,
    shareUrl,
    filename: `${safeName}-电子布洛芬.png`,
  };
}
