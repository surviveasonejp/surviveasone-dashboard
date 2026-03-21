import { useState, useEffect } from "react";

// D1行の型定義（Worker側db.tsと同期）
export interface ReservesRow {
  date: string;
  oil_national_kL: number;
  oil_private_kL: number;
  oil_joint_kL: number;
  oil_total_kL: number;
  oil_total_days: number;
  oil_hormuz_rate: number;
  lng_inventory_t: number;
  lng_hormuz_rate: number;
  thermal_share: number;
  nuclear_share: number;
  renewable_share: number;
  source: string;
  updated_at: string;
}

export interface ConsumptionRow {
  date: string;
  oil_annual_TWh: number;
  oil_daily_kL: number;
  oil_daily_barrels: number;
  lng_annual_t: number;
  lng_daily_t: number;
  source: string;
  updated_at: string;
}

export interface RegionRow {
  id: string;
  name: string;
  population: number;
  power_demand_share: number;
  food_self_sufficiency: number;
  oil_share: number;
  lng_share: number;
  vulnerability_rank: string;
  winter_factor: number;
  isolation_risk: number;
  interconnection_kW: number | null;
  note: string;
  updated_at: string;
}

interface UseApiDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  isFromApi: boolean;
}

/**
 * APIからデータを取得し、失敗時はフォールバック値を返すhook。
 * Phase 1の静的JSONをフォールバックとして維持する。
 */
export function useApiData<T>(
  endpoint: string,
  fallback: T,
): UseApiDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromApi, setIsFromApi] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const res = await fetch(endpoint);
        if (!res.ok) {
          throw new Error(`API ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json.data ?? json);
          setIsFromApi(true);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setData(fallback);
          setIsFromApi(false);
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [endpoint]);

  return { data, loading, error, isFromApi };
}
