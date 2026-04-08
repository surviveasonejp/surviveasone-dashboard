import { type FC } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { useSwipeNavigation, getContentStyle } from "../hooks/useSwipeNavigation";

export const Layout: FC = () => {
  const location = useLocation();
  const {
    bind,
    currentIndex,
    totalPages,
    dragX,
    transitionEnabled,
    enterDir,
    prevPage,
    nextPage,
  } = useSwipeNavigation();

  const showNavBar = currentIndex >= 0;
  const contentStyle = getContentStyle(dragX, transitionEnabled);

  return (
    <div className="min-h-screen bg-bg text-white overflow-x-hidden">
      <Header />
      <main {...bind()} className="max-w-7xl mx-auto px-4 py-6 touch-pan-y">
        <div
          key={location.key}
          data-enter={enterDir ?? undefined}
          className="page-content"
          style={contentStyle}
        >
          <Outlet />
        </div>
      </main>

      {/* フッター */}
      <footer className="border-t border-border bg-bg py-4 px-4 pb-20 md:pb-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-600">
          <span className="font-mono tracking-wider">SAO – Situation Awareness Observatory</span>
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

      {/* モバイルナビバー */}
      {showNavBar && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-bg/95 backdrop-blur-sm z-40">
          <div className="flex items-center justify-between px-3 py-2">

            {/* 前のページ */}
            {prevPage ? (
              <Link
                to={prevPage.path}
                className="flex items-center gap-1 text-[11px] font-mono text-neutral-500 active:text-text transition-colors py-1 px-1 min-w-[72px]"
              >
                <span className="text-base leading-none">‹</span>
                <span className="truncate">{prevPage.label}</span>
              </Link>
            ) : (
              <div className="min-w-[72px]" />
            )}

            {/* ページ位置インジケーター */}
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-[3px]">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full transition-all duration-200"
                    style={{
                      width: i === currentIndex ? "14px" : "4px",
                      height: "4px",
                      background:
                        i === currentIndex ? "#ef4444" : "#cbd5e1",
                    }}
                  />
                ))}
              </div>
              <span className="text-[9px] font-mono text-neutral-400 tabular-nums leading-none">
                {currentIndex + 1}&thinsp;/&thinsp;{totalPages}
              </span>
            </div>

            {/* 次のページ */}
            {nextPage ? (
              <Link
                to={nextPage.path}
                className="flex items-center gap-1 text-[11px] font-mono text-neutral-500 active:text-text transition-colors py-1 px-1 min-w-[72px] justify-end"
              >
                <span className="truncate">{nextPage.label}</span>
                <span className="text-base leading-none">›</span>
              </Link>
            ) : (
              <div className="min-w-[72px]" />
            )}

          </div>
        </div>
      )}
    </div>
  );
};
