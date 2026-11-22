import { primaryEmotions } from "../shared/emotions.js";

const priorMood = { overheat: "angry", offline: "tired", blank: "calm", giddy: "happy" };

const performances = {
  angry: { name: "跺脚震地", frames: [
    { time: 0 }, { time: .19, squash: -.17, pitch: .13 },
    { time: .41, lift: .30, roll: -.10, step: .40 }, { time: .57, squash: -.29, pitch: .17 },
    { time: .75, roll: .14 }, { time: .95, lift: .27, roll: .10, step: -.44 },
    { time: 1.11, squash: -.27, pitch: .15 }, { time: 1.27, roll: -.14 },
    { time: 1.49, roll: .11 }, { time: 1.68, roll: -.06 }, { time: 2.11 },
  ] },
  anxious: { name: "左右急踱", frames: [
    { time: 0 }, { time: .23, shift: -.16, yaw: -.47, step: .40 },
    { time: .47, shift: -.34, yaw: -.48, lift: .09, step: -.42 },
    { time: .69, shift: -.32, yaw: .48, step: .37, squash: -.12 },
    { time: .94, shift: -.12, yaw: .48, lift: .08, step: -.40 },
    { time: 1.20, shift: .17, yaw: .48, step: .43 },
    { time: 1.45, shift: .34, yaw: .44, lift: .09, step: -.42 },
    { time: 1.66, shift: .30, yaw: -.40, step: .37, squash: -.10 },
    { time: 1.92, shift: .12, yaw: -.34, lift: .06, step: -.38 }, { time: 2.32 },
  ] },
  sad: { name: "低头缩成团", frames: [
    { time: 0 }, { time: .42, squash: -.12, pitch: .18 },
    { time: .93, squash: -.31, pitch: .37, roll: -.07 },
    { time: 1.36, squash: -.27, pitch: .33, roll: -.08 },
    { time: 1.68, squash: -.30, pitch: .37, roll: -.07 },
    { time: 2.34, squash: -.12, pitch: .13 }, { time: 2.78 },
  ] },
  tired: { name: "打盹差点栽倒", frames: [
    { time: 0 }, { time: .30, pitch: .18, squash: -.11 },
    { time: .56, pitch: .06, lift: .06 },
    { time: 1.06, roll: -.50, squash: -.23, shift: -.12 },
    { time: 1.35, roll: -.44, squash: -.26, shift: -.15 },
    { time: 1.59, roll: .17, lift: .10, squash: .12 },
    { time: 1.94, roll: -.07, squash: -.04 }, { time: 2.43 },
  ] },
  calm: { name: "慢慢呼吸", frames: [
    { time: 0 }, { time: .42, squash: .06, widen: .04 },
    { time: .93, squash: .15, widen: .09, lift: .034 },
    { time: 1.26, squash: .16, widen: .10, lift: .047 },
    { time: 1.75, squash: .10, widen: .07, lift: .024 },
    { time: 2.27, squash: .03, widen: .03 }, { time: 2.78 },
  ] },
  happy: { name: "跳起来转圈", spin: true, frames: [
    { time: 0 }, { time: .26, squash: -.22, roll: -.09 },
    { time: .53, lift: .27, squash: .085, yaw: Math.PI / 2, roll: .08 },
    { time: .78, lift: .44, yaw: Math.PI, roll: .13, step: .20 },
    { time: 1.02, lift: .32, yaw: Math.PI * 1.5, roll: .06 },
    { time: 1.25, squash: -.24, yaw: Math.PI * 2 },
    { time: 1.53, lift: .22, yaw: Math.PI * 2, roll: -.07, step: -.20 },
    { time: 1.87, squash: -.10, yaw: Math.PI * 2 }, { time: 2.26, yaw: Math.PI * 2 },
  ] },
};

export const campusPerformances = Object.fromEntries(Object.entries(performances).map(([emotion, performance]) => [
  `campus-${emotion}`, { ...performance, id: `campus-${emotion}`, emotion: primaryEmotions[emotion].label },
]));

export function campusPerformanceFor(mascot, previewEmotion) {
  const emotion = previewEmotion ?? mascot.emotion ?? priorMood[mascot.mood] ?? "tired";
  return campusPerformances[`campus-${emotion}`] ?? campusPerformances["campus-tired"];
}
