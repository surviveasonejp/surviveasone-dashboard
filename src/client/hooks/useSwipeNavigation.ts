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
  "/petrochem",
  "/family",
  "/prepare",
  "/about",
];

const SNAP_THRESHOLD = 80; // px: この距離を超えたら遷移確定
const FLICK_VELOCITY = 0.8; // px/ms: フリック速度
const FLICK_MIN_DIST = 20; // px: フリック判定の最小距離
const RUBBER_BAND = 0.3; // 端でのラバーバンド係数

// スライダー上での判定用
const SLIDER_DECISION_DIST = 15; // px: この距離までに速度で判定
const SLIDER_FAST_VELOCITY = 0.5; // px/ms: これ以上ならスワイプと判断

export type SlideDirection = "left" | "right" | null;

export function useSwipeNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentIndex = PAGES.indexOf(location.pathname);
  const prevIndexRef = useRef(currentIndex);
  const [direction, setDirection] = useState<SlideDirection>(null);
  const [dragX, setDragX] = useState(0);

  // スライダー上でドラッグ開始したかの追跡
  const onSliderRef = useRef(false);
  const decidedRef = useRef(false); // スワイプ/スライダーの判定済みフラグ
  const cancelledRef = useRef(false); // スライダー操作に委譲済み

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
      if (first) {
        const target = event?.target as HTMLElement | null;

        // スライダー以外のインタラクティブ要素はスワイプ無効
        if (
          target?.closest(
            "textarea, select, button, a, [data-no-swipe]",
          )
        ) {
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
          // 速いスワイプ → ページ遷移として処理（続行）
        } else {
          // まだ判定距離に達していない → 待機（ページは動かさない）
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
      const goDir = mx < 0 ? 1 : -1;
      const canGo = goDir === 1 ? canGoRight : canGoLeft;

      if ((isSnap || isFlick) && canGo) {
        navigate(PAGES[currentIndex + goDir]);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setDragX(0);
          });
        });
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

  return {
    bind,
    direction,
    currentIndex,
    totalPages: PAGES.length,
    dragX,
  };
}
