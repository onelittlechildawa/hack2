import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const minZoom = .6, maxZoom = 2.8;
const step = 1.22;
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export default function useCampusCamera(actor, overview) {
  const viewport = useRef(null);
  const map = useRef(null);
  const pointers = useRef(new Map());
  const following = useRef(true);
  const anchor = useRef(null);
  const scale = useRef(1);
  const [zoom, setZoom] = useState(1);

  const centerActor = useCallback(() => {
    const view = viewport.current;
    if (!following.current || !view || !actor.current) return;
    const scene = view.getBoundingClientRect();
    const character = actor.current.getBoundingClientRect();
    if (view.scrollWidth > view.clientWidth) view.scrollLeft += character.left + character.width / 2 - scene.left - scene.width / 2;
    if (view.scrollHeight > view.clientHeight) view.scrollTop += character.top + character.height * .75 - scene.top - scene.height / 2;
  }, [actor]);

  const zoomBy = useCallback((factor, at, from = at) => {
    const view = viewport.current;
    const bounds = view.getBoundingClientRect();
    const target = at || { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    const origin = from || target;
    const next = Math.max(minZoom, Math.min(maxZoom, Math.round(scale.current * factor * 1000) / 1000));
    following.current = false;
    if (next === scale.current) {
      view.scrollBy(origin.x - target.x, origin.y - target.y);
      return;
    }
    const scene = map.current.getBoundingClientRect();
    anchor.current = { x: (origin.x - scene.left) / scene.width, y: (origin.y - scene.top) / scene.height, target };
    scale.current = next;
    setZoom(next);
  }, []);

  useLayoutEffect(() => {
    const focus = anchor.current;
    if (!focus) {
      centerActor();
      return;
    }
    anchor.current = null;
    const scene = map.current.getBoundingClientRect();
    viewport.current.scrollBy(scene.left + focus.x * scene.width - focus.target.x,
      scene.top + focus.y * scene.height - focus.target.y);
  }, [zoom, overview, centerActor]);

  useEffect(() => {
    const view = viewport.current;
    const observer = new ResizeObserver(centerActor);
    observer.observe(view);
    function wheel(event) {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && !event.ctrlKey) {
        following.current = false;
        return;
      }
      if (!event.deltaY) return;
      event.preventDefault();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.clientHeight : 1;
      zoomBy(Math.exp(-event.deltaY * units * .0018), { x: event.clientX, y: event.clientY });
    }
    view.addEventListener("wheel", wheel, { passive: false });
    return () => { observer.disconnect(); view.removeEventListener("wheel", wheel); };
  }, [centerActor, zoomBy]);

  function pointerDown(event) {
    const active = pointers.current;
    if (event.button !== 0 || active.size >= 2 || event.target.closest("button, a")) return;
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.panning = "";
  }

  function pointerMove(event) {
    const active = pointers.current;
    const previous = active.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    active.set(event.pointerId, next);
    following.current = false;
    if (active.size === 1) event.currentTarget.scrollBy(previous.x - next.x, previous.y - next.y);
    else {
      const other = [...active.values()].find((point) => point !== next);
      zoomBy(distance(next, other) / Math.max(1, distance(previous, other)), midpoint(next, other), midpoint(previous, other));
    }
  }

  function pointerEnd(event) {
    pointers.current.delete(event.pointerId);
    if (!pointers.current.size) delete event.currentTarget.dataset.panning;
  }

  function reset() {
    anchor.current = null;
    following.current = true;
    scale.current = 1;
    setZoom(1);
  }

  return {
    viewport, map, zoom, centerActor, reset,
    follow() { following.current = true; },
    zoomIn() { zoomBy(step); },
    zoomOut() { zoomBy(1 / step); },
    canZoomIn: zoom < maxZoom, canZoomOut: zoom > minZoom,
    pointerHandlers: { onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: pointerEnd,
      onPointerCancel: pointerEnd, onLostPointerCapture: pointerEnd },
  };
}
