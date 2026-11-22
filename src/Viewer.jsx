import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import campusPerformanceClip from "./campusPerformanceClip.js";
import { campusPerformances } from "./campusPerformances.js";

function contactShadow() {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(48, 48, 3, 48, 48, 47);
  gradient.addColorStop(0, "rgba(26,26,26,0.36)");
  gradient.addColorStop(0.58, "rgba(26,26,26,0.18)");
  gradient.addColorStop(1, "rgba(26,26,26,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.7), new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, toneMapped: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  return shadow;
}

function freeModel(model) {
  model.traverse((node) => {
    if (node.isMesh) {
      node.geometry.dispose();
      node.material.dispose();
    }
  });
}

function campusWalk(scene) {
  const body = scene.getObjectByName("Mascot");
  if (!body) return null;
  const duration = 0.86;
  const times = [0, .125, .25, .375, .5, .625, .75, .875, 1].map((step) => step * duration);
  const positions = times.flatMap((time) => [
    body.position.x, body.position.y + .07 * Math.sin(time / duration * Math.PI * 2) ** 2, body.position.z,
  ]);
  const tracks = [new THREE.VectorKeyframeTrack(`${body.uuid}.position`, times, positions)];
  const strideAxis = new THREE.Vector3(1, 0, 0);
  scene.traverse((rig) => {
    const match = rig.name.match(/^([LR])[_ ]ankle$/i);
    if (!match) return;
    const side = match[1].toUpperCase() === "L" ? 1 : -1;
    const rotations = times.flatMap((time) => {
      const step = Math.sin(time / duration * Math.PI * 2) * side;
      const tilt = new THREE.Quaternion().setFromAxisAngle(strideAxis, .27 * step);
      return rig.quaternion.clone().multiply(tilt).toArray();
    });
    tracks.push(new THREE.QuaternionKeyframeTrack(`${rig.uuid}.quaternion`, times, rotations));
  });
  return new THREE.AnimationClip("campus-walk", duration, tracks);
}

export default function Viewer({ model, action, replay, play, loop, interactive,
  performanceIntensity = 3, reducedMotion = false, onPerformance }) {
  const surface = useRef(null);
  const state = useRef(null);
  const motion = useRef(null);
  const [display, setDisplay] = useState("loading");
  motion.current = { action, replay, play, loop, performanceIntensity, reducedMotion, onPerformance };

  useEffect(() => {
    const frame = surface.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      setDisplay("poster");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    renderer.setClearColor(0x000000, 0);
    frame.append(renderer.domElement);
    const scene = new THREE.Scene();
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(room, 0.05);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.45;
    room.dispose();
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xffffff, 0xc8d4f0, 2.0);
    scene.add(hemi);
    for (const [color, strength, x, y, z] of [
      [0xfff8e6, 2.45, -3.2, 5, 4.6],
      [0xe6eeff, 0.85, 4.8, 2.4, 3.4],
      [0xfff0c2, 2.15, 2, 4, -2.5],
    ]) {
      const light = new THREE.DirectionalLight(color, strength);
      light.position.set(x, y, z);
      scene.add(light);
    }
    const shadow = contactShadow();
    scene.add(shadow);

    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 25);
    camera.position.set(0.72, 2.05, 6.5);
    camera.lookAt(0, 1.23, 0);
    const orbit = interactive ? new OrbitControls(camera, renderer.domElement) : null;
    if (orbit) {
      orbit.target.set(0, 1.23, 0);
      orbit.enablePan = false;
      orbit.enableZoom = false;
      orbit.enableDamping = true;
      orbit.rotateSpeed = 0.62;
      orbit.minPolarAngle = Math.PI / 4;
      orbit.maxPolarAngle = Math.PI / 2;
      orbit.update();
    }

    const current = { scene, mixer: null, gltf: null, key: "", active: null };
    state.current = current;

    function resize() {
      const { width, height } = frame.getBoundingClientRect();
      if (!width || !height) return;
      const ratio = width / height;
      const half = Math.max(interactive ? 1.69 : 1.53, 1.54 / ratio);
      camera.left = -half * ratio;
      camera.right = half * ratio;
      camera.top = half;
      camera.bottom = -half;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(frame);
    resize();
    let visible = true;
    const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    visibility.observe(frame);

    let request = 0;
    let last = performance.now();
    function tick(now) {
      request = requestAnimationFrame(tick);
      const delta = Math.min((now - last) / 1000, 0.06);
      last = now;
      if (!visible || document.hidden) return;
      const { action: requested, replay: times, play: playing, loop: repeating,
        performanceIntensity: intensity, reducedMotion: gentle, onPerformance: reportPerformance } = motion.current;
      const performance = campusPerformances[requested];
      if (current.mixer) {
        const performanceKey = performance ? `${requested}:${intensity}:${gentle}` : "";
        const key = `${requested}:${times}:${repeating}:${performanceKey}`;
        if (key !== current.key) {
          current.active?.stop();
          current.active = null;
          let clip;
          if (performance) {
            if (!current.performances.has(performanceKey)) {
              current.performances.set(performanceKey, campusPerformanceClip(current.gltf.scene, performance, intensity, gentle));
            }
            clip = current.performances.get(performanceKey);
          } else if (requested === "campus-walk") {
            current.walk ||= campusWalk(current.gltf.scene);
            clip = current.walk;
          } else {
            clip = current.gltf.animations.find(({ name }) => name === requested);
          }
          if (clip) {
            current.active = current.mixer.clipAction(clip);
            current.active.reset().setLoop(repeating ? THREE.LoopRepeat : THREE.LoopOnce, repeating ? Infinity : 1);
            current.active.clampWhenFinished = !repeating;
            if (repeating) current.active.time = 0.30;
            current.active.play();
          }
          current.key = key;
        }
        if (playing) current.mixer.update(delta);
      }
      const performing = playing && performance && current.active?.isRunning() ? performance.id : null;
      if (performing !== current.performing) {
        current.performing = performing;
        reportPerformance?.(performing);
      }
      if (!interactive) {
        const targetZoom = performing ? .86 : 1;
        if (Math.abs(targetZoom - camera.zoom) > .003) {
          camera.zoom += (targetZoom - camera.zoom) * Math.min(1, delta * 16);
          camera.updateProjectionMatrix();
        }
      }
      orbit?.update();
      renderer.render(scene, camera);
    }
    request = requestAnimationFrame(tick);

    function lost() { setDisplay("poster"); }
    renderer.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      cancelAnimationFrame(request);
      observer.disconnect();
      visibility.disconnect();
      orbit?.dispose();
      shadow.geometry.dispose();
      shadow.material.map.dispose();
      shadow.material.dispose();
      environment.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.dispose();
      renderer.domElement.remove();
      state.current = null;
    };
  }, [interactive]);

  useEffect(() => {
    const current = state.current;
    if (!current) return;
    setDisplay("loading");
    let cancelled = false;
    let loaded = null;
    new GLTFLoader().load(model, (gltf) => {
      if (cancelled) {
        freeModel(gltf.scene);
        return;
      }
      loaded = gltf;
      current.gltf = gltf;
      current.walk = null;
      current.performances = new Map();
      current.key = "";
      current.active = null;
      current.scene.add(gltf.scene);
      current.mixer = new THREE.AnimationMixer(gltf.scene);
      setDisplay("ready");
    }, undefined, () => {
      if (!cancelled) setDisplay("poster");
    });
    return () => {
      cancelled = true;
      if (loaded) {
        current.mixer?.stopAllAction();
        current.mixer?.uncacheRoot(loaded.scene);
        current.scene.remove(loaded.scene);
        freeModel(loaded.scene);
      }
      current.gltf = current.mixer = null;
    };
  }, [model, interactive]);

  return <div ref={surface} className="viewer-webgl" data-display={display} aria-hidden="true" />;
}
