import { useState, useRef, useEffect } from "react";
import { useDrag } from "@use-gesture/react";
import { useNavigate, useLocation } from "react-router-dom";

const PAGES = [
  "/",
  "/dashboard",
  "/countdown",
  "/collapse-map",
  "/last-tanker",
  "/food-collapse",
  "/family",
  "/prepare",
  "/about",
];

const SNAP_THRESHOLD = 80; // px: この距離を超えたら遷移確定
const FLICK_VELOCITY = 0.8; // px/ms: フリック速度
const FLICK_MIN_DIST = 20; // px: フリック判定の最小距離
const RUBBER_BAND = 0.3; // 端でのラバーバンド係数

export type SlideDirection = "left" | "right" | null;

export function useSwipeNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentIndex = PAGES.indexOf(location.pathname);
  const prevIndexRef = useRef(currentIndex);
  const [direction, setDirection] = useState<SlideDirection>(null);
  const [dragX, setDragX] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [skipAnimation, setSkipAnimation] = useState(false);

  useEffect(() => {
    if (prevIndexRef.current !== currentIndex && currentIndex >= 0) {
      setDirection(currentIndex > prevIndexRef.current ? "left" : "right");
      prevIndexRef.current = currentIndex;
    }
  }, [currentIndex]);

  const canGoLeft = currentIndex > 0;
  const canGoRight = currentIndex < PAGES.length - 1;

  const bind = useDrag(
    ({ movement: [mx], velocity: [vx], first, last, cancel, event }) => {
      if (isTransitioning) {
        cancel();
        return;
      }

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

      // ドラッグ中: translateXをリアルタイム反映
      if (!last) {
        let dx = mx;
        // 端でのラバーバンド抵抗
        if ((dx > 0 && !canGoLeft) || (dx < 0 && !canGoRight)) {
          dx = dx * RUBBER_BAND;
        }
        setDragX(dx);
        return;
      }

      // リリース: 遷移判定
      const absMx = Math.abs(mx);
      const isFlick = absMx > FLICK_MIN_DIST && vx > FLICK_VELOCITY;
      const isSnap = absMx > SNAP_THRESHOLD;
      const goDir = mx < 0 ? 1 : -1; // 1=次ページ, -1=前ページ
      const canGo = goDir === 1 ? canGoRight : canGoLeft;

      if ((isSnap || isFlick) && canGo) {
        // 遷移確定: 画面外へスナップしてから遷移
        const targetX = goDir === 1 ? -window.innerWidth : window.innerWidth;
        setDragX(targetX);
        setIsTransitioning(true);

        setSkipAnimation(true);
        setTimeout(() => {
          navigate(PAGES[currentIndex + goDir]);
          // 次フレームでリセット（新ページ描画後）
          requestAnimationFrame(() => {
            setDragX(0);
            setIsTransitioning(false);
            // fade-inスキップフラグを次の遷移まで維持
            setTimeout(() => setSkipAnimation(false), 50);
          });
        }, 200);
      } else {
        // キャンセル: 元に戻す
        setDragX(0);
      }
    },
    {
      axis: "x",
      filterTaps: true,
      pointer: { touch: true },
    },
  );

  return {
    bind,
    direction,
    currentIndex,
    totalPages: PAGES.length,
    dragX,
    isTransitioning,
    skipAnimation,
  };
}
