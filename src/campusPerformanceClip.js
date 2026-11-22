import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack } from "three";

export default function campusPerformanceClip(model, performance, intensity, reducedMotion) {
  const body = model.getObjectByName("Mascot") || model;
  const squish = model.getObjectByName("Squish") || body;
  const { id, frames, spin } = performance;
  const times = frames.map(({ time }) => time);
  const strength = (.79 + intensity * .074) * (reducedMotion ? .42 : 1);
  const positions = [], rotations = [], scales = [];
  for (const frame of frames) {
    const { shift = 0, lift = 0, pitch = 0, roll = 0, yaw = 0, squash = 0, widen = 0 } = frame;
    const height = (lift + Math.abs(pitch) * .23 + Math.abs(roll) * .41) * strength;
    positions.push(body.position.x + shift * strength, body.position.y + height, body.position.z);
    const heading = spin ? (reducedMotion ? Math.sin(yaw) * .22 : yaw) : yaw * strength;
    const tilt = new Quaternion().setFromEuler(new Euler(pitch * strength, heading, roll * strength, "YXZ"));
    rotations.push(...body.quaternion.clone().multiply(tilt).toArray());
    const width = 1 + (widen - squash * .43) * strength;
    scales.push(squish.scale.x * width, squish.scale.y * (1 + squash * strength), squish.scale.z * width);
  }
  const tracks = [
    new VectorKeyframeTrack(`${body.uuid}.position`, times, positions),
    new QuaternionKeyframeTrack(`${body.uuid}.quaternion`, times, rotations),
    new VectorKeyframeTrack(`${squish.uuid}.scale`, times, scales),
  ];
  model.traverse((joint) => {
    const ankle = joint.name.match(/^([LR])[_ ]ankle$/i);
    if (!ankle) return;
    const side = ankle[1].toUpperCase() === "L" ? 1 : -1;
    const steps = frames.flatMap(({ step = 0 }) => {
      const tilt = new Quaternion().setFromEuler(new Euler(step * strength * side, 0, 0));
      return joint.quaternion.clone().multiply(tilt).toArray();
    });
    tracks.push(new QuaternionKeyframeTrack(`${joint.uuid}.quaternion`, times, steps));
  });
  return new AnimationClip(id, times.at(-1), tracks);
}
