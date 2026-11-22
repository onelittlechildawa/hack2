import {
  Activity, BatteryLow, Cloud, Flame, Hand, Heart, Smile, Sparkles, Waves, Wind, Zap,
} from "lucide-react";

const icons = {
  activity: Activity, battery: BatteryLow, cloud: Cloud, flame: Flame, hand: Hand, heart: Heart,
  smile: Smile, sparkles: Sparkles, waves: Waves, wind: Wind, bolt: Zap,
};

export function Icon({ name, size = 18, strokeWidth = 2.4, ...props }) {
  const Glyph = icons[name] || Sparkles;
  return <Glyph size={size} strokeWidth={strokeWidth} aria-hidden="true" {...props} />;
}
