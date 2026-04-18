import { useApiData } from "./useApiData";

export interface AffectedPopulation {
  /** 推計対象人数（または施設数） */
  count: number;
  /** 表示用ラベル（根拠内訳を含む） */
  label: string;
  /** 出典（統計名称・調査年含む） */
  source: string;
}

export interface RealEvent {
  date: string;
  dayOffset: number;
  category: "government" | "industry" | "international" | "medical" | string;
  label: string;
  source: string;
  impact: string;
  scenario?: string;
  affectedPopulation?: AffectedPopulation;
}

export interface RealEventsResponse {
  generatedAt: string;
  dataAsOf: string;
  blockadeStartDate: string;
  count: number;
  filters: { recentDays: number | null; category: string | null };
  events: RealEvent[];
}

const EMPTY: RealEventsResponse = {
  generatedAt: "",
  dataAsOf: "",
  blockadeStartDate: "",
  count: 0,
  filters: { recentDays: null, category: null },
  events: [],
};

/**
 * 直近 N 日の realEvents を取得する（日付降順）。
 * 取得失敗時は空配列を返す（表示しない側で制御）。
 */
export function useRecentRealEvents(recentDays: number = 30, category?: string) {
  const params = new URLSearchParams();
  params.set("recentDays", String(recentDays));
  if (category) params.set("category", category);
  const { data, isFromApi } = useApiData<RealEventsResponse>(
    `/api/real-events?${params.toString()}`,
    EMPTY,
  );
  return { response: data ?? EMPTY, isFromApi };
}
