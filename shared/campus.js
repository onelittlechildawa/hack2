import layout from "./campus-layout.json" with { type: "json" };
import oblique from "./campus-oblique.json" with { type: "json" };

export const mapSize = layout.size;
export const campusPlaces = layout.places;
export const campusLineLimit = 72;

export const campusViews = {
  oblique: { ...oblique, image: "/campus/zhongguancun-oblique.webp" },
  overview: { size: mapSize, origin: [0, 0], east: [mapSize.width, 0], south: [0, mapSize.height],
    north: 0, image: "/campus/zhongguancun.webp" },
};

export function projectCampus({ x, y }, view) {
  const eastward = x / mapSize.width;
  const southward = y / mapSize.height;
  return {
    x: view.origin[0] + view.east[0] * eastward + view.south[0] * southward,
    y: view.origin[1] + view.east[1] * eastward + view.south[1] * southward,
  };
}

export function campusRoute(from, to) {
  return (layout.routes[from]?.[to] || []).map(([x, y]) => ({ x, y }));
}
