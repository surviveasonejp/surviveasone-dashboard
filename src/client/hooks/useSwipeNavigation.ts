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

// ドラッグ中に早期発火する閾値
const EARLY_DISTANCE = 100; // px: 確実なスワイプ
const FLICK_DISTANCE = 30; // px: フリック時の最小距離
const FLICK_VELOCITY = 1.0; // px/ms: フリック速度
// 指を離した後の従来閾値
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

  const navigateTo = (dir: -1 | 1) => {
    const nextIndex = currentIndex + dir;
    if (nextIndex >= 0 && nextIndex < PAGES.length) {
      navigate(PAGES[nextIndex]);
    }
  };

  const bind = useDrag(
    ({ movement: [mx], velocity: [vx], first, last, cancel, event }) => {
      if (first) {
        const target = event?.target as HTMLElement | null;
        if (
          target?.closest(
            "input, textarea, select, button, [role='slider'], a, [data-no-swipe]",
          )
        ) {
          cancel();
          return;
        }
      }

      // ドラッグ中: 速度or距離が閾値を超えたら即遷移
      if (!last) {
        const absMx = Math.abs(mx);
        const earlyTrigger =
          absMx > EARLY_DISTANCE ||
          (absMx > FLICK_DISTANCE && vx > FLICK_VELOCITY);

        if (earlyTrigger) {
          navigateTo(mx < 0 ? 1 : -1);
          cancel();
        }
        return;
      }

      // 指を離した時: ゆっくりスワイプ対応
      if (Math.abs(mx) < SWIPE_THRESHOLD) return;
      navigateTo(mx < 0 ? 1 : -1);
    },
    {
      axis: "x",
      filterTaps: true,
      pointer: { touch: true },
    },
  );

  return { bind, direction, currentIndex, totalPages: PAGES.length };
}
