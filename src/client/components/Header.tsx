import { type FC } from "react";
import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";

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
  { path: "/petrochem", label: "PETROCHEM" },
  { path: "/prepare", label: "PREPARE" },
  { path: "/about", label: "ABOUT" },
];

export const Header: FC = () => {
  const location = useLocation();
  const currentItem = NAV_ITEMS.find((item) => item.path === location.pathname);

  return (
    <header className="border-b border-border bg-bg/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-[#1e3a8a] text-lg" style={{ fontFamily: "'Lato', 'Arial Black', sans-serif", fontWeight: 900, letterSpacing: "-0.02em" }}>SAO</span>
          <span className="font-mono text-xs text-neutral-500 hidden sm:inline tracking-wide">Situation Awareness Observatory</span>
        </Link>
        {/* モバイル: 現在ページ名 + テーマ切替 */}
        <div className="md:hidden flex items-center gap-2">
          {currentItem && (
            <span className="text-xs font-mono tracking-wider text-neutral-400">
              {currentItem.label}
            </span>
          )}
          <ThemeToggle />
        </div>
        {/* デスクトップ: フルナビ + テーマ切替 */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-3 py-1.5 text-xs font-mono tracking-wider transition-colors rounded ${
                location.pathname === item.path
                  ? "text-[#ef4444] bg-[#ef4444]/10"
                  : "text-neutral-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
};
