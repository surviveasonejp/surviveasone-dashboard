import { type FC } from "react";
import { useLocation } from "react-router-dom";
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

interface HeaderProps {
  onNavigate: (to: string) => void;
}

export const Header: FC<HeaderProps> = ({ onNavigate }) => {
  const location = useLocation();
  const currentItem = NAV_ITEMS.find((item) => item.path === location.pathname);

  return (
    <header className="border-b border-border bg-bg/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => onNavigate("/")}
          className="flex items-center gap-2"
        >
          <span className="text-[#1e3a8a] text-lg" style={{ fontFamily: "'Lato', 'Arial Black', sans-serif", fontWeight: 900, letterSpacing: "-0.02em" }}>SAO</span>
          <span className="font-mono text-xs text-neutral-500 tracking-wide">Situation Awareness Observatory</span>
        </button>
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
            <button
              key={item.path}
              onClick={() => onNavigate(item.path)}
              className={`px-3 py-1.5 text-xs font-mono tracking-wider transition-colors rounded ${
                location.pathname === item.path
                  ? "text-primary-soft bg-primary-soft/10"
                  : "text-neutral-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {item.label}
            </button>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
};
