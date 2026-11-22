import { FlaskConical, LayoutGrid, Map, MessageCircle, Pencil } from "lucide-react";

export default function AppDock({ active, drawHref = "#draw", campusHref = "#campus", drawLabel }) {
  const items = [
    { id: "draw", label: "画板", icon: Pencil, href: drawHref, detail: drawLabel },
    { id: "campus", label: "校园", icon: Map, href: campusHref },
    { id: "messages", label: "纸条箱", icon: MessageCircle, href: "#messages" },
    { id: "board", label: "情绪图鉴", icon: LayoutGrid, href: "#board" },
    { id: "lab", label: "制造间", icon: FlaskConical, href: "#lab" },
  ];

  return <nav className="app-dock" aria-label="底部导航">
    {items.map(({ id, label, icon: Glyph, href, detail }) => <a key={id} href={href}
      title={detail} aria-current={active === id ? "page" : undefined}>
      <Glyph size={17} strokeWidth={2.15} aria-hidden="true" /> <span>{label}</span>
    </a>)}
  </nav>;
}
