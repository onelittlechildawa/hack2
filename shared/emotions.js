import { moods } from "./catalog.js";

export const primaryEmotions = {
  angry: { label: "生气", mood: "overheat" },
  anxious: { label: "焦虑", mood: "overheat" },
  sad: { label: "难过", mood: "offline" },
  tired: { label: "疲惫", mood: "offline" },
  calm: { label: "平静", mood: "blank" },
  happy: { label: "开心", mood: "giddy" },
};

export function emotionLabel({ emotion, mood }) {
  return primaryEmotions[emotion]?.label ?? moods.find(({ id }) => id === mood)?.label;
}
