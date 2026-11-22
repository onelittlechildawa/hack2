import { actions, orderedActions } from "../shared/catalog.js";

const motions = [
  ["wave", /挥|招手|摆手/], ["shake", /摇肚|举手|扭|摇晃|抖|摆动|摇摆/], ["laugh", /笑/],
  ["kick", /踢|蹬|抬脚/], ["breathe", /呼吸|吸气|吐气/], ["bounce", /跳|蹦/],
  ["spin", /转[一二两三四1-4]圈|转圈|转个圈/], ["turn", /转身|转向|往左|往右|向左|向右|左看|右看|扭头/],
  ["nod", /点头|鞠躬|低头/], ["pause", /停|等|呆住|定住/],
];

const shortNames = {
  wave: "挥手", shake: "摇肚", laugh: "大笑", kick: "蹬腿", breathe: "呼吸",
  bounce: "弹跳", spin: "转圈", turn: "转身", nod: "点头", pause: "停顿",
};

export const suggestedMoves = {
  gag: ["shake", "laugh", "kick", "bounce", "spin", "turn", "nod", "pause"],
  soft: ["wave", "breathe", "bounce", "turn", "nod", "pause"],
};

const number = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, "1": 1, "2": 2, "3": 3, "4": 4 };

function command(phrase) {
  const [move] = motions.find(([, pattern]) => pattern.test(phrase)) || [];
  if (!move) return null;
  const count = phrase.match(/([一二两三四1-4])\s*([下次圈秒])/);
  const side = /左/.test(phrase) ? "left" : /右/.test(phrase) ? "right" : /双|两手/.test(phrase) ? "both" : "auto";
  return {
    move, side, repeats: count && count[2] !== "秒" ? number[count[1]] : 1,
    seconds: count?.[2] === "秒" ? number[count[1]] : null,
    pace: /慢|轻/.test(phrase) ? 1.25 : /快/.test(phrase) ? 0.78 : 1,
  };
}

function aiSteps(steps, kind) {
  if (!Array.isArray(steps)) return [];
  return steps.slice(0, 3).filter((step) => step && suggestedMoves[kind].includes(step.move)).map((step) => ({
    move: step.move,
    side: ["left", "right", "both"].includes(step.side) ? step.side : "auto",
    repeats: Number.isInteger(step.repeats) ? Math.min(4, Math.max(1, step.repeats)) : 1,
    pace: Number.isFinite(step.pace) ? Math.min(1.35, Math.max(0.75, step.pace)) : 1,
    seconds: null,
  }));
}

function describe(step) {
  const side = step.side === "left" ? "左侧" : step.side === "right" ? "右侧" : step.side === "both" ? "双侧" : "";
  const count = step.repeats > 1 ? ` ×${step.repeats}` : "";
  return `${side}${shortNames[step.move]}${step.seconds ? ` ${step.seconds} 秒` : count}`;
}

export function makeMotionPlan(kind, leadAction, custom, answer) {
  const defaults = orderedActions(kind, leadAction);
  const suggestions = Array.isArray(answer.motionPlan) ? answer.motionPlan : [];
  const warnings = [];
  const clips = defaults.map((action, index) => {
    const instruction = custom[index];
    let customSteps = [];
    if (instruction) {
      const segments = instruction.split(/[，,。；;！!]+|(?:接着|然后|之后|再|最后)/u).map((part) => part.trim()).filter(Boolean);
      customSteps = segments.slice(0, 3).map(command).filter(Boolean);
      if (!customSteps.length || customSteps.length !== segments.length) warnings.push(instruction);
    }
    const suggestion = suggestions[index];
    const suggested = aiSteps(suggestion?.steps, kind);
    const steps = customSteps.length ? customSteps : suggested.length ? suggested
      : [{ move: action.id, side: "auto", repeats: 1, pace: 1, seconds: null }];
    const title = suggested.length === suggestion?.steps?.length && typeof suggestion.name === "string"
      ? [...suggestion.name.replace(/[\x00-\x1f\x7f]/g, " ").trim()].slice(0, 16).join("") : "";
    const display = steps.map(describe);
    return {
      id: `move-${index + 1}`,
      name: customSteps.length ? display[0] + (display.length > 1 ? "连招" : "")
        : suggested.length ? title || display[0] : action.name,
      hint: customSteps.length || suggested.length ? display.join(" · ") : action.hint,
      icon: actions[steps[0].move].icon,
      steps,
      authored: Boolean(customSteps.length),
    };
  });
  return { clips, warnings };
}
