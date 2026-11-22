import { memo, useEffect, useRef } from "react";
import { projectCampus } from "../shared/campus.js";

export default memo(function CampusArtwork({ route, view }) {
  const surface = useRef(null);
  useEffect(() => {
    const canvas = surface.current;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.size.width * ratio);
    canvas.height = Math.round(view.size.height * ratio);
    if (route.length < 2) return;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.beginPath();
    const start = projectCampus(route[0], view);
    ctx.moveTo(start.x, start.y);
    for (const point of route.slice(1)) {
      const projected = projectCampus(point, view);
      ctx.lineTo(projected.x, projected.y);
    }
    ctx.lineWidth = 9;
    ctx.strokeStyle = "#143b334d";
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#fffcdd";
    ctx.setLineDash([9, 8]);
    ctx.stroke();
  }, [route, view]);

  return <div className="campus-artwork" aria-hidden="true">
    <img src={view.image} alt="" draggable={false} />
    <canvas ref={surface} />
  </div>;
});
