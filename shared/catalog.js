export { default as palettes } from "./palettes.json" with { type: "json" };

export const moods = [
  { id: "offline", label: "社交没电", icon: "battery", name: "社交电量见底", palette: "grape" },
  { id: "overheat", label: "脑内过热", icon: "flame", name: "脑子在冒烟", palette: "peach" },
  { id: "blank", label: "想静静", icon: "cloud", name: "需要一点空白", palette: "blue" },
  { id: "giddy", label: "莫名亢奋", icon: "bolt", name: "快乐有点超频", palette: "lemon" },
];

export const kinds = [
  { id: "gag", label: "恶搞系", hint: "越离谱越好", icon: "smile" },
  { id: "soft", label: "治愈系", hint: "软一点，慢一点", icon: "heart" },
];

export const levels = ["轻微波动", "开始晃动", "不太稳定", "有点上头", "整栋楼停电"];

export const actions = {
  shake: { id: "shake", name: "举手摇肚", hint: "两手一举，肚子开始摇号。", icon: "waves" },
  laugh: { id: "laugh", name: "笑到漏气", hint: "把憋住的气笑成三连发。", icon: "smile" },
  kick: { id: "kick", name: "原地蹬腿", hint: "和空气短暂地闹个别扭。", icon: "bolt" },
  wave: { id: "wave", name: "轻轻挥手", hint: "打个不用回话的招呼。", icon: "hand" },
  breathe: { id: "breathe", name: "慢慢呼吸", hint: "鼓起来，瘪下去，留一点空白。", icon: "wind" },
  bounce: { id: "bounce", name: "糯米弹跳", hint: "轻轻跳一下，再软着陆。", icon: "sparkles" },
  spin: { id: "spin", name: "转一圈", icon: "sparkles" },
  turn: { id: "turn", name: "转身看看", icon: "waves" },
  nod: { id: "nod", name: "点点头", icon: "smile" },
  pause: { id: "pause", name: "停一下", icon: "cloud" },
};

export const motionSets = { gag: ["shake", "laugh", "kick"], soft: ["wave", "breathe", "bounce"] };

export function resolvePalette(mood, choice = "auto") {
  return choice === "auto" ? moods.find(({ id }) => id === mood).palette : choice;
}

export const seeds = [
  {
    id: "leak-frog", name: "周一漏电蛙", quote: "我把周一塞进了洗衣机，脱水出来是周三。",
    mood: "overheat", kind: "gag", intensity: 4, likes: 4, leadAction: "shake",
    campus: { place: "field", line: "今天绕操场走半圈就够了。", tag: "rest" },
    palette: "lemon", form: "blob", ears: "nubs", eyes: "crossed",
    width: 1.04, height: 0.98, mouth: 1.22, lean: 0.045,
  },
  {
    id: "quiet-dumpling", name: "静音团子", quote: "今天的消息请寄给枕头，我会在梦里签收。",
    mood: "offline", kind: "soft", intensity: 2, likes: 2, leadAction: "wave",
    campus: { place: "library", line: "想和人一起自习，也想先安静坐一会儿。", tag: "study" },
    palette: "grape", form: "bean", ears: "bunny", eyes: "dozy",
    width: 0.93, height: 0.97, mouth: 0.94, lean: -0.04,
  },
  {
    id: "bubble-beast", name: "食堂气泡兽", quote: "我的情绪在食堂排队，站在珍珠后面。",
    mood: "giddy", kind: "gag", intensity: 5, likes: 1, leadAction: "laugh",
    campus: { place: "canteen", line: "端着饭找座位的时候，好想有人轻轻招一下手。" },
    palette: "mint", form: "bean", ears: "antenna", eyes: "bright",
    width: 0.9, height: 1.07, mouth: 1.15, lean: -0.055,
  },
];

export function orderedActions(kind, leadAction) {
  const set = motionSets[kind];
  return [leadAction, ...set.filter((id) => id !== leadAction)].map((id) => actions[id]);
}
