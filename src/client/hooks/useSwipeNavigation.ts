import { useState, useRef, useEffect, useCallback } from "react";
import { useDrag } from "@use-gesture/react";
import { useNavigate, useLocation } from "react-router-dom";

export const SWIPE_PAGES: string[] = [
  "/",
  "/dashboard",
  "/countdown",
  "/collapse-map",
  "/last-tanker",
  "/food-collapse",
  "/petrochem",
  "/family",
  "/prepare",
  "/about",
];

export const PAGE_LABELS: Record<string, string> = {
  "/": "TOP",
  "/dashboard": "DASHBOARD",
  "/countdown": "CLOCK",
  "/collapse-map": "MAP",
  "/last-tanker": "TANKER",
  "/food-collapse": "FOOD",
  "/petrochem": "PETROCHEM",
  "/family": "FAMILY",
  "/prepare": "PREPARE",
  "/about": "ABOUT",
};

const SNAP_THRESHOLD = 80;       // px: この距離を超えたら遷移確定
const FLICK_VELOCITY = 0.8;      // px/ms: フリック速度
const FLICK_MIN_DIST = 20;       // px: フリック判定の最小距離
const RUBBER_BAND = 0.3;         // 端でのラバーバンド係数
export const SLIDE_DURATION = 260; // ms: スライドアニメーション時間

// スライダー上での判定用
const SLIDER_DECISION_DIST = 15; // px: この距離までに速度で判定
const SLIDER_FAST_VELOCITY = 0.5; // px/ms: これ以上ならスワイプと判断

export type SlideDirection = "left" | "right" | null;

export interface PageInfo {
  path: string;
  label: string;
}

function getContentStyle(
  dragX: number,
  transitionEnabled: boolean,
): React.CSSProperties | undefined {
  if (transitionEnabled) {
    return {
      transform: `translateX(${dragX}px)`,
      transition: `transform ${SLIDE_DURATION}ms ease-out`,
      willChange: "transform",
    };
  }
  if (dragX !== 0) {
    return {
      transform: `translateX(${dragX}px)`,
      willChange: "transform",
    };
  }
  return undefined;
}

export { getContentStyle };

export function useSwipeNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentIndex = SWIPE_PAGES.indexOf(location.pathname);
  const prevIndexRef = useRef(currentIndex);
  const [direction, setDirection] = useState<SlideDirection>(null);
  const [dragX, setDragX] = useState(0);
  const [transitionEnabled, setTransitionEnabled] = useState(false);

  // 入場アニメーション方向: navigate() より前にセットしてレンダリング時に参照
  const enterDirRef = useRef<"from-right" | "from-left" | null>(null);

  const onSliderRef = useRef(false);
  const decidedRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (prevIndexRef.current !== currentIndex && currentIndex >= 0) {
      setDirection(currentIndex > prevIndexRef.current ? "left" : "right");
      prevIndexRef.current = currentIndex;
    }
  }, [currentIndex]);

  const canGoLeft = currentIndex > 0;
  const canGoRight = currentIndex < SWIPE_PAGES.length - 1;

  const commitNavigate = useCallback(
    (targetIndex: number, exitX: number) => {
      // 入場方向を先にセット（navigate() より前）
      enterDirRef.current = exitX < 0 ? "from-right" : "from-left";

      // 退場アニメーション開始
      setTransitionEnabled(true);
      setDragX(exitX);

      // アニメーション完了後に遷移・リセット
      setTimeout(() => {
        navigate(SWIPE_PAGES[targetIndex] ?? "/");
        setTransitionEnabled(false);
        setDragX(0);
      }, SLIDE_DURATION);
    },
    [navigate],
  );

  const bind = useDrag(
    ({ movement: [mx], velocity: [vx], first, last, cancel, event }) => {
      if (first) {
        const target = event?.target as HTMLElement | null;

        // インタラクティブ要素はスワイプ無効
        if (target?.closest("textarea, select, button, a, [data-no-swipe]")) {
          cancel();
          return;
        }

        // スライダー上でのドラッグ開始を記録
        onSliderRef.current = !!target?.closest(
          "input[type='range'], [role='slider']",
        );
        decidedRef.current = false;
        cancelledRef.current = false;
        return;
      }

      // スライダー操作に委譲済み
      if (cancelledRef.current) {
        cancel();
        return;
      }

      // スライダー上でのドラッグ: 速度で判定
      if (onSliderRef.current && !decidedRef.current) {
        const absMx = Math.abs(mx);
        if (absMx >= SLIDER_DECISION_DIST) {
          decidedRef.current = true;
          if (vx < SLIDER_FAST_VELOCITY) {
            // 遅いドラッグ → スライダー操作に委譲
            cancelledRef.current = true;
            cancel();
            return;
          }
          // 速いスワイプ → ページ遷移として続行
        } else {
          return; // まだ判定待機
        }
      }

      // ドラッグ中: translateX をリアルタイム反映
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
      const goDir = mx < 0 ? 1 : -1;
      const canGo = goDir === 1 ? canGoRight : canGoLeft;

      if ((isSnap || isFlick) && canGo) {
        const exitX = goDir === 1 ? -window.innerWidth : window.innerWidth;
        commitNavigate(currentIndex + goDir, exitX);
      } else {
        setDragX(0);
      }
    },
    {
      axis: "x",
      filterTaps: true,
      pointer: { touch: true },
    },
  );

  const prevPath = currentIndex > 0 ? SWIPE_PAGES[currentIndex - 1] : undefined;
  const nextPath =
    currentIndex < SWIPE_PAGES.length - 1
      ? SWIPE_PAGES[currentIndex + 1]
      : undefined;

  const prevPage: PageInfo | null = prevPath
    ? { path: prevPath, label: PAGE_LABELS[prevPath] ?? prevPath }
    : null;
  const nextPage: PageInfo | null = nextPath
    ? { path: nextPath, label: PAGE_LABELS[nextPath] ?? nextPath }
    : null;

  return {
    bind,
    direction,
    currentIndex,
    totalPages: SWIPE_PAGES.length,
    dragX,
    transitionEnabled,
    enterDir: enterDirRef.current,
    prevPage,
    nextPage,
  };
}
