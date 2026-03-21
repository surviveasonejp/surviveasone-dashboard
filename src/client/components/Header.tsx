import { type FC } from "react";
import { Link, useLocation } from "react-router-dom";

interface NavItem {
  path: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "TOP" },
  { path: "/dashboard", label: "DASHBOARD" },
  { path: "/countdown", label: "CLOCK" },
  { path: "/collapse-map", label: "MAP" },
  { path: "/last-tanker", label: "TANKER" },
  { path: "/food-collapse", label: "FOOD" },
  { path: "/family", label: "FAMILY" },
  { path: "/prepare", label: "PREPARE" },
  { path: "/about", label: "ABOUT" },
];

export const Header: FC = () => {
  const location = useLocation();
  const currentItem = NAV_ITEMS.find((item) => item.path === location.pathname);

  return (
    <header className="border-b border-[#2a2a2a] bg-[#0a0a0a]/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-[#ff1744] font-mono font-bold text-lg">SURVIVE</span>
          <span className="font-mono font-bold text-lg">AS ONE</span>
        </Link>
        {/* モバイル: 現在ページ名 */}
        {currentItem && (
          <span className="md:hidden text-xs font-mono tracking-wider text-neutral-400">
            {currentItem.label}
          </span>
        )}
        {/* デスクトップ: フルナビ */}
        <nav className="hidden md:flex gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-3 py-1.5 text-xs font-mono tracking-wider transition-colors rounded ${
                location.pathname === item.path
                  ? "text-[#ff1744] bg-[#ff1744]/10"
                  : "text-neutral-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
};
