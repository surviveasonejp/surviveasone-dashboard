import { useState, useEffect } from "react";
import type { TankerInfo } from "../../shared/types";
import staticTankerData from "../data/tankers.json";

export interface TankerMeta {
  /** tankers.json の meta.updatedAt（YYYY-MM-DD） */
  updatedAt: string;
  /** AIS最終成功取得タイムスタンプ（ISO文字列）。未取得時は undefined */
  lastAisFetch?: string;
}

const fallbackTankers: TankerInfo[] = [...staticTankerData.vessels]
  .sort((a, b) => a.eta_days - b.eta_days);

const fallbackMeta: TankerMeta = { updatedAt: staticTankerData.meta.updatedAt };

export function useTankerData(): { tankers: TankerInfo[]; meta: TankerMeta } {
  const [tankers, setTankers] = useState<TankerInfo[]>(fallbackTankers);
  const [meta, setMeta] = useState<TankerMeta>(fallbackMeta);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tankers")
      .then((r) => r.json())
      .then((json: { data?: TankerInfo[]; meta?: TankerMeta }) => {
        if (cancelled) return;
        if (Array.isArray(json.data)) setTankers(json.data);
        if (json.meta?.updatedAt) setMeta(json.meta);
      })
      .catch(() => {/* フォールバックのまま */});
    return () => { cancelled = true; };
  }, []);

  return { tankers, meta };
}
