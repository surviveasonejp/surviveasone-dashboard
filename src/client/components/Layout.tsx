import { type FC } from "react";
import { Outlet, Link } from "react-router-dom";
import { Header } from "./Header";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";

export const Layout: FC = () => {
  const { bind, currentIndex, totalPages, dragX } = useSwipeNavigation();
  const isDragging = dragX !== 0;

  return (
    <div className="min-h-screen bg-[#0f1419] text-white overflow-x-hidden">
      <Header />
      <main {...bind()} className="max-w-7xl mx-auto px-4 py-6 touch-pan-y">
        <div
          style={isDragging ? {
            transform: `translateX(${dragX}px)`,
            opacity: Math.max(0.4, 1 - Math.abs(dragX) / window.innerWidth),
            willChange: "transform, opacity",
          } : undefined}
        >
          <Outlet />
        </div>
      </main>
      {/* フッター */}
      <footer className="border-t border-[#1e2a36] bg-[#0f1419] py-4 px-4 pb-16 md:pb-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-600">
          <span className="font-mono tracking-wider">Survive as One Japan</span>
          <div className="flex items-center gap-3 font-mono">
            <a href="https://github.com/surviveasonejp" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-400 transition-colors">GitHub</a>
            <span className="text-neutral-700">&middot;</span>
            <a href="https://x.com/surviveasonejp" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-400 transition-colors">X</a>
            <span className="text-neutral-700">&middot;</span>
            <a href="https://github.com/sponsors/idx" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-400 transition-colors">Support</a>
            <span className="text-neutral-700">&middot;</span>
            <Link to="/about" className="hover:text-neutral-400 transition-colors">About</Link>
          </div>
        </div>
      </footer>
      {/* モバイルページインジケーター */}
      <div className="md:hidden fixed bottom-4 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
        {Array.from({ length: totalPages }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i === currentIndex ? "bg-[#ef4444]" : "bg-neutral-700"
            }`}
          />
        ))}
      </div>
    </div>
  );
};
