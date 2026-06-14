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
      .then((json: unknown) => {
        if (cancelled || !json || typeof json !== "object") return;
        const payload = json as { data?: TankerInfo[]; meta?: TankerMeta };
        if (Array.isArray(payload.data)) setTankers(payload.data);
        if (payload.meta?.updatedAt) setMeta(payload.meta);
      })
      .catch(() => {/* フォールバックのまま */});
    return () => { cancelled = true; };
  }, []);

  return { tankers, meta };
}
