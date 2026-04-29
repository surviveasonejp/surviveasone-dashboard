/**
 * Phase 25 — 基地別石油備蓄データ取得 hook
 *
 * /api/oil-reserves/bases と /api/oil-reserves/releases を統合フェッチ。
 * 失敗時は空配列をフォールバックとして返す（UI 側で「データ取得中」表示）。
 */

import { useState, useEffect } from "react";

export interface OilReserveBase {
  base_id: string;
  name: string;
  region: string;
  reserve_type: "national" | "private";
  capacity_kL: number | null;
  cumulativeReleased_kL: number;
  remaining_kL: number | null;
  remainingPercent: number | null;
  releaseEventCount: number;
}

export interface OilReserveBasesResponse {
  bases: OilReserveBase[];
  summary: {
    nationalBaseCount: number;
    privateBaseCount: number;
    totalNationalCapacity_kL: number;
    totalNationalReleased_kL: number;
    totalNationalRemaining_kL: number;
    totalNationalRemainingPercent: number;
  };
  note: string;
  sources: string[];
}

export interface OilReleaseEvent {
  id: string;
  release_date: string;
  base_id: string;
  base_name: string;
  reserve_type: "national" | "private" | "joint";
  volume_kL: number;
  split_method: "confirmed" | "estimated_equal" | "capacity_weighted";
  wave: string;
  refiners: string[];
  source_url: string;
  source_label: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface OilReleasesResponse {
  events: OilReleaseEvent[];
  total: number;
  note: string;
  source: string;
}

export interface UseOilReservesResult {
  bases: OilReserveBase[];
  summary: OilReserveBasesResponse["summary"] | null;
  events: OilReleaseEvent[];
  loading: boolean;
  error: string | null;
}

export function useOilReserves(): UseOilReservesResult {
  const [bases, setBases] = useState<OilReserveBase[]>([]);
  const [summary, setSummary] = useState<OilReserveBasesResponse["summary"] | null>(null);
  const [events, setEvents] = useState<OilReleaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [basesRes, releasesRes] = await Promise.all([
          fetch("/api/oil-reserves/bases"),
          fetch("/api/oil-reserves/releases"),
        ]);
        if (!basesRes.ok) throw new Error(`bases ${basesRes.status}`);
        if (!releasesRes.ok) throw new Error(`releases ${releasesRes.status}`);

        const basesJson = await basesRes.json() as { data: OilReserveBasesResponse };
        const releasesJson = await releasesRes.json() as { data: OilReleasesResponse };

        if (!cancelled) {
          setBases(basesJson.data.bases);
          setSummary(basesJson.data.summary);
          setEvents(releasesJson.data.events);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { bases, summary, events, loading, error };
}
