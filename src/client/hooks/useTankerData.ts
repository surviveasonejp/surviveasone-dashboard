import { useState, useEffect } from "react";
import type { TankerInfo } from "../../shared/types";
import staticTankerData from "../data/tankers.json";

export interface TankerMeta {
  /** tankers.json の meta.updatedAt（YYYY-MM-DD） */
  updatedAt: string;
  /** AIS最終成功取得タイムスタンプ（ISO文字列）。未取得時は undefined */
  lastAisFetch?: string;
}

// 初期表示用のサンプル（数隻のみ）。実データは全船を /api/tankers から取得する。
// worker/data/tankers.json は 200KB 超のためクライアントには同梱しない。
const fallbackTankers: TankerInfo[] = [...staticTankerData.vessels]
  .sort((a, b) => a.eta_days - b.eta_days);

const fallbackMeta: TankerMeta = { updatedAt: staticTankerData.meta.updatedAt };

export interface TankerDataResult {
  tankers: TankerInfo[];
  meta: TankerMeta;
  /** true の間はサンプル表示。実データ基準日として meta.updatedAt を提示してはいけない */
  isFallback: boolean;
}

export function useTankerData(): TankerDataResult {
  const [tankers, setTankers] = useState<TankerInfo[]>(fallbackTankers);
  const [meta, setMeta] = useState<TankerMeta>(fallbackMeta);
  const [isFallback, setIsFallback] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tankers")
      .then((r) => r.json())
      .then((json: unknown) => {
        if (cancelled || !json || typeof json !== "object") return;
        const payload = json as { data?: TankerInfo[]; meta?: TankerMeta };
        if (Array.isArray(payload.data)) {
          setTankers(payload.data);
          setIsFallback(false);
        }
        if (payload.meta?.updatedAt) setMeta(payload.meta);
      })
      .catch(() => {/* フォールバックのまま */});
    return () => { cancelled = true; };
  }, []);

  return { tankers, meta, isFallback };
}
