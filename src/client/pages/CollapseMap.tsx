import { type FC, useState, useEffect } from "react";
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

export const CollapseMap: FC = () => {
  const { regions, loading: regionsLoading } = useCollapseOrder();
  const [selectedRegion, setSelectedRegion] = useState<RegionCollapse | null>(null);
  const [showLogistics, setShowLogistics] = useState(false);
  const userRegion = useUserRegion();

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
          <span className="text-[#f59e0b]">COLLAPSE</span> MAP
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
        <div className="lg:col-span-2 bg-[#151c24] border border-[#1e2a36] rounded-lg p-4">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => setShowLogistics(!showLogistics)}
              className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${
                showLogistics
                  ? "border-[#8b5cf6] text-[#8b5cf6] bg-[#8b5cf6]/10"
                  : "border-[#1e2a36] text-neutral-500 hover:text-neutral-400"
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
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2a36]">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">崩壊順ランキング</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-500 font-mono text-xs border-b border-[#1e2a36]">
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
                    className={`border-b border-[#162029] cursor-pointer transition-colors ${
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
                    <td className="px-4 py-2 text-right font-mono text-[#8b5cf6]">
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
    </div>
  );
};
