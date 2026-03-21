import { useState, useRef, useEffect } from "react";
import { useDrag } from "@use-gesture/react";
import { useNavigate, useLocation } from "react-router-dom";

const PAGES = [
  "/",
  "/countdown",
  "/collapse-map",
  "/dashboard",
  "/last-tanker",
  "/food-collapse",
  "/family",
  "/prepare",
  "/about",
];

const SWIPE_THRESHOLD = 50;

export type SlideDirection = "left" | "right" | null;

export function useSwipeNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentIndex = PAGES.indexOf(location.pathname);
  const prevIndexRef = useRef(currentIndex);
  const [direction, setDirection] = useState<SlideDirection>(null);

  useEffect(() => {
    if (prevIndexRef.current !== currentIndex && currentIndex >= 0) {
      setDirection(currentIndex > prevIndexRef.current ? "left" : "right");
      prevIndexRef.current = currentIndex;
    }
  }, [currentIndex]);

  const bind = useDrag(
    ({ movement: [mx], last, cancel, event }) => {
      const target = event?.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, button, [role='slider'], a, [data-no-swipe]",
        )
      ) {
        cancel();
        return;
      }

      if (!last) return;
      if (Math.abs(mx) < SWIPE_THRESHOLD) return;

      if (mx < 0 && currentIndex < PAGES.length - 1) {
        navigate(PAGES[currentIndex + 1]);
      } else if (mx > 0 && currentIndex > 0) {
        navigate(PAGES[currentIndex - 1]);
      }
    },
    {
      axis: "x",
      filterTaps: true,
      pointer: { touch: true },
    },
  );

  return { bind, direction, currentIndex, totalPages: PAGES.length };
}
