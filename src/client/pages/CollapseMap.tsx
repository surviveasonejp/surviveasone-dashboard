import { type FC, useState, useEffect, useMemo } from "react";
import { RegionMap } from "../components/RegionMap";
import { RegionDetail } from "../components/RegionDetail";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { LocationBar } from "../components/LocationBar";
import { useCollapseOrder } from "../hooks/useCollapseOrder";
import { useUserRegion } from "../hooks/useUserRegion";
import type { RegionCollapse } from "../../shared/types";
import { getAlertLevel, getAlertColor } from "../lib/alertHelpers";
import { formatDecimal, formatDepletionDate } from "../lib/formatters";
import staticRegions from "../../worker/data/regions.json";
import { SectionHeading } from "../components/SectionHeading";

// 再エネ自立率計算（RegionDetail.tsxと同一定数）
const NATIONAL_AVG_MW = 115_000;
const SOLAR_CF = 0.15;
const WIND_CF = 0.22;
const HYDRO_CF = 0.35;
const ESSENTIAL_RATIO = 0.30;

export const CollapseMap: FC = () => {
  const { regions, loading: regionsLoading } = useCollapseOrder();
  const [selectedRegion, setSelectedRegion] = useState<RegionCollapse | null>(null);
  const [showLogistics, setShowLogistics] = useState(false);
  const userRegion = useUserRegion();

  // 全エリアの再エネ自立率を計算してソート
  const renewableRanking = useMemo(() => {
    return staticRegions.map((sr) => {
      const renewableMW = (sr.solarCapacity_MW ?? 0) * SOLAR_CF
        + (sr.windCapacity_MW ?? 0) * WIND_CF
        + (sr.hydroCapacity_MW ?? 0) * HYDRO_CF;
      const minEssentialMW = NATIONAL_AVG_MW * sr.powerDemandShare * ESSENTIAL_RATIO;
      const rate = minEssentialMW > 0 ? (renewableMW / minEssentialMW) * 100 : 0;
      const withNuclear = minEssentialMW > 0
        ? ((renewableMW + (sr.nuclearCapacity_MW ?? 0)) / minEssentialMW) * 100
        : 0;
      return { id: sr.id, name: sr.name, rate, withNuclear, renewableMW: Math.round(renewableMW), minEssentialMW: Math.round(minEssentialMW) };
    }).sort((a, b) => b.rate - a.rate);
  }, []);

  // 位置情報で初期選択
  useEffect(() => {
    if (userRegion.regionId && !selectedRegion && regions.length > 0) {
      const match = regions.find((r) => r.id === userRegion.regionId);
      if (match) setSelectedRegion(match);
    }
  }, [userRegion.regionId, regions]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-warning-soft">COLLAPSE</span> MAP
        </h1>
        <p className="text-neutral-500 text-sm">
          全国10電力エリアの崩壊予測順序 — どのエリアが最初に機能停止するか
        </p>
      </div>

      <AlertBanner
        level="warning"
        message="エリア別の脆弱性に基づく崩壊順序シミュレーション"
      />

      <SimulationBanner />
      <LocationBar
        regionName={userRegion.regionName}
        source={userRegion.source}
        loading={userRegion.loading}
        onReset={() => { userRegion.setManualRegion(null); setSelectedRegion(null); }}
        onRequestGeolocation={userRegion.requestGeolocation}
      />

      {/* 地図 + 詳細 2カラム */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-panel border border-border rounded-lg p-4">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => setShowLogistics(!showLogistics)}
              className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${
                showLogistics
                  ? "border-logistics text-logistics bg-logistics/10"
                  : "border-border text-neutral-500 hover:text-neutral-400"
              }`}
            >
              🚚 物流フロー {showLogistics ? "ON" : "OFF"}
            </button>
          </div>
          <RegionMap
            regions={regions}
            onSelectRegion={setSelectedRegion}
            selectedId={selectedRegion?.id ?? null}
            loading={regionsLoading}
            showLogisticsFlow={showLogistics}
          />
        </div>
        <div>
          <RegionDetail region={selectedRegion} />
        </div>
      </div>

      {/* 崩壊順ランキングテーブル */}
      <div className="bg-panel border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <SectionHeading as="h2" tone="neutral-muted" size="sm" tracking="wider">崩壊順ランキング</SectionHeading>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-500 font-mono text-xs border-b border-border">
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">エリア</th>
                <th className="px-4 py-2 text-left">ランク</th>
                <th className="px-4 py-2 text-right">崩壊予測日</th>
                <th className="px-4 py-2 text-right">石油枯渇</th>
                <th className="px-4 py-2 text-right">LNG枯渇</th>
                <th className="px-4 py-2 text-right">電力崩壊</th>
                <th className="px-4 py-2 text-right">物流崩壊</th>
              </tr>
            </thead>
            <tbody>
              {regions.map((region, index) => {
                const level = getAlertLevel(region.collapseDays);
                const color = getAlertColor(level);
                return (
                  <tr
                    key={region.id}
                    className={`border-b border-border cursor-pointer transition-colors ${
                      selectedRegion?.id === region.id ? "bg-white/5" : "hover:bg-white/[0.02]"
                    }`}
                    onClick={() => setSelectedRegion(region)}
                  >
                    <td className="px-4 py-2 font-mono text-neutral-500">{index + 1}</td>
                    <td className="px-4 py-2 font-bold flex items-center gap-1.5">
                      {region.name}
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: region.hasLiveData ? "#22c55e" : "#f59e0b" }}
                        title={region.hasLiveData ? "実測データ" : "推定値"}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-xs font-bold" style={{ color }}>
                        {region.vulnerabilityRank}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-bold" style={{ color }}>
                      <div>{formatDecimal(region.collapseDays)}日</div>
                      <div className="text-xs font-normal text-neutral-400">{formatDepletionDate(region.collapseDays)}</div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-neutral-400">
                      <div>{formatDecimal(region.oilDepletionDays)}日</div>
                      <div className="text-xs text-neutral-400">{formatDepletionDate(region.oilDepletionDays)}</div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-neutral-400">
                      <div>{formatDecimal(region.lngDepletionDays)}日</div>
                      <div className="text-xs text-neutral-400">{formatDepletionDate(region.lngDepletionDays)}</div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-neutral-400">
                      <div>{formatDecimal(region.powerCollapseDays)}日</div>
                      <div className="text-xs text-neutral-400">{formatDepletionDate(region.powerCollapseDays)}</div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-logistics">
                      <div>{formatDecimal(region.logisticsCollapseDays)}日</div>
                      <div className="text-xs text-neutral-400">{formatDepletionDate(region.logisticsCollapseDays)}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {/* 再エネ自立率ランキング（マイクログリッド指標） */}
      <div className="bg-panel border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border space-y-1">
          <SectionHeading as="h2" tone="neutral-muted" size="sm" tracking="wider">再エネ自立率ランキング</SectionHeading>
          <p className="text-[10px] text-neutral-600">
            電力供給停止時に再生可能エネルギーのみで生活必需需要（通常の30%）を賄える割合。
            設備利用率: 太陽光15% / 風力22% / 水力35%
          </p>
        </div>
        <div className="p-4 space-y-2">
          {renewableRanking.map((r) => {
            const rateColor = r.rate >= 100 ? "#22c55e" : r.rate >= 70 ? "#f59e0b" : r.rate >= 40 ? "#94a3b8" : "#ef4444";
            return (
              <div key={r.id} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-300 w-12">{r.name}</span>
                  <div className="flex-1 mx-3">
                    <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, r.rate)}%`, backgroundColor: rateColor }}
                      />
                    </div>
                  </div>
                  <span className="font-mono text-xs w-20 text-right" style={{ color: rateColor }}>
                    {r.rate >= 100 ? "自立可能" : `${Math.round(r.rate)}%`}
                    {r.withNuclear > r.rate && (
                      <span className="text-neutral-600 text-[9px] ml-1">（核:{Math.round(r.withNuclear)}%）</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-4 pb-3 text-[9px] text-neutral-700">
          出典: 資源エネルギー庁 再エネ設備容量 2023年度確報
        </div>
      </div>
    </div>
  );
};
