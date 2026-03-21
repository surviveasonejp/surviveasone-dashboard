import { type FC } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";

export const Layout: FC = () => {
  const location = useLocation();
  const { bind, direction, currentIndex, totalPages } = useSwipeNavigation();

  const animationClass =
    direction === "left"
      ? "animate-slide-in-right"
      : direction === "right"
        ? "animate-slide-in-left"
        : "animate-fade-in";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-x-hidden">
      <Header />
      <main {...bind()} className="max-w-7xl mx-auto px-4 py-6 touch-pan-y">
        <div key={location.pathname} className={animationClass}>
          <Outlet />
        </div>
      </main>
      {/* モバイルページインジケーター */}
      <div className="md:hidden fixed bottom-4 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
        {Array.from({ length: totalPages }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i === currentIndex ? "bg-[#ff1744]" : "bg-neutral-700"
            }`}
          />
        ))}
      </div>
    </div>
  );
};
