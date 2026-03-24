/**
 * ユーザーの現在地から最寄りの電力エリアを判定するフック
 *
 * 3段階フォールバック:
 * 1. localStorage に保存済みの手動選択（最優先）
 * 2. Browser Geolocation API（GPS/WiFi）
 * 3. null（取得失敗 → 手動選択に委ねる）
 *
 * 手動でエリアを選択した場合は localStorage に保存し、
 * 以降は自動判定を上書きする。
 */

import { useState, useEffect, useCallback } from "react";
import { geoToRegionId, regionIdToName } from "../lib/geoToRegion";

const STORAGE_KEY = "userRegionId";

interface UseUserRegionResult {
  /** 判定されたエリアID（null=未取得） */
  regionId: string | null;
  /** エリア名（null=未取得） */
  regionName: string | null;
  /** 取得方法 */
  source: "saved" | "geolocation" | null;
  /** 取得中か */
  loading: boolean;
  /** 手動でエリアを設定（localStorageに保存） */
  setManualRegion: (id: string | null) => void;
  /** 位置情報を再取得 */
  refresh: () => void;
}

export function useUserRegion(): UseUserRegionResult {
  const [regionId, setRegionId] = useState<string | null>(null);
  const [source, setSource] = useState<"saved" | "geolocation" | null>(null);
  const [loading, setLoading] = useState(true);

  const detectRegion = useCallback(() => {
    setLoading(true);

    // 1. localStorage に保存済みの選択があれば優先
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setRegionId(saved);
        setSource("saved");
        setLoading(false);
        return;
      }
    } catch {
      // localStorage不可の環境
    }

    // 2. Geolocation API
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const id = geoToRegionId(pos.coords.latitude, pos.coords.longitude);
          setRegionId(id);
          setSource("geolocation");
          setLoading(false);
        },
        () => {
          // 拒否/タイムアウト → null
          setRegionId(null);
          setSource(null);
          setLoading(false);
        },
        { timeout: 5000, maximumAge: 300000 }, // 5秒タイムアウト、5分キャッシュ
      );
    } else {
      setRegionId(null);
      setSource(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    detectRegion();
  }, [detectRegion]);

  const setManualRegion = useCallback((id: string | null) => {
    if (id) {
      try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
      setRegionId(id);
      setSource("saved");
    } else {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      detectRegion();
    }
  }, [detectRegion]);

  return {
    regionId,
    regionName: regionId ? regionIdToName(regionId) : null,
    source,
    loading,
    setManualRegion,
    refresh: detectRegion,
  };
}
