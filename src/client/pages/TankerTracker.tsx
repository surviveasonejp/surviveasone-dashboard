import { type FC, useState, useRef, useEffect } from "react";
import { CountdownTimer } from "../components/CountdownTimer";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { TankerMap } from "../components/TankerMap";
import { useTankerData } from "../hooks/useTankerData";
import { getAlertLevel, getAlertColor } from "../lib/alertHelpers";
import { formatDecimal, formatNumber, formatDistance, formatDepletionDate } from "../lib/formatters";

export const TankerTracker: FC = () => {
  const tankers = useTankerData();
  const vlccTankers = tankers.filter((t) => t.type === "VLCC");
  const lngTankers = tankers.filter((t) => t.type === "LNG");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // マップで船舶選択時、テーブルの該当行にスクロール
  useEffect(() => {
    if (selectedId) {
      const row = rowRefs.current.get(selectedId);
      row?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedId]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-[#94a3b8]">LAST TANKER</span> TRACKER
        </h1>
        <p className="text-neutral-500 text-sm">
          日本向け最終タンカーの到着予測 — 封鎖後、最後の積荷はいつ届くか
        </p>
      </div>

      <AlertBanner
        level="warning"
        message="ホルムズ海峡封鎖時、通過前に出港済みの船舶のみが日本に到達可能"
      />

      <SimulationBanner />

      {/* 最終タンカー到着カウントダウン */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CountdownTimer
          label="最終VLCC到着（原油）"
          totalSeconds={(vlccTankers[vlccTankers.length - 1]?.eta_days ?? 0) * 86400}
        />
        <CountdownTimer
          label="最終LNG船到着"
          totalSeconds={(lngTankers[lngTankers.length - 1]?.eta_days ?? 0) * 86400}
        />
      </div>

      {/* 推定航跡マップ */}
      <TankerMap
        tankers={tankers}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {/* 到着順テーブル */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2a36]">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">到着順ランキング</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-500 font-mono text-xs border-b border-[#1e2a36]">
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">船名</th>
                <th className="px-4 py-2 text-left">種別</th>
                <th className="px-4 py-2 text-left">出発地</th>
                <th className="px-4 py-2 text-left">行先</th>
                <th className="px-4 py-2 text-right">距離</th>
                <th className="px-4 py-2 text-right">速度</th>
                <th className="px-4 py-2 text-right">到着予測</th>
                <th className="px-4 py-2 text-right">積荷</th>
              </tr>
            </thead>
            <tbody>
              {tankers.map((tanker, index) => {
                const level = getAlertLevel(tanker.eta_days);
                const color = getAlertColor(level);
                const isSelected = tanker.id === selectedId;
                return (
                  <tr
                    key={tanker.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(tanker.id, el);
                    }}
                    className={`border-b border-[#162029] cursor-pointer transition-colors ${
                      isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.02]"
                    }`}
                    onClick={() => setSelectedId(isSelected ? null : tanker.id)}
                  >
                    <td className="px-4 py-2 font-mono text-neutral-500">{index + 1}</td>
                    <td className="px-4 py-2 font-bold text-neutral-200">{tanker.name}</td>
                    <td className="px-4 py-2">
                      <span
                        className="font-mono text-xs px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: tanker.type === "VLCC" ? "#f59e0b20" : "#22c55e20",
                          color: tanker.type === "VLCC" ? "#f59e0b" : "#22c55e",
                        }}
                      >
                        {tanker.type}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-neutral-400">{tanker.departure}</td>
                    <td className="px-4 py-2 text-neutral-400">{tanker.destination}</td>
                    <td className="px-4 py-2 text-right font-mono text-neutral-500">
                      {formatDistance(tanker.distanceToJapan_nm)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-neutral-500">
                      {formatDecimal(tanker.speed_knots)}kn
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-bold" style={{ color }}>
                      <div>{formatDecimal(tanker.eta_days)}日</div>
                      <div className="text-xs font-normal text-neutral-400">{formatDepletionDate(tanker.eta_days)}</div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-neutral-400">
                      {formatNumber(tanker.cargo_t)}t
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 計算根拠 */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-4 text-xs text-neutral-500 font-mono space-y-2">
        <p className="text-neutral-400 font-bold">計算根拠:</p>
        <p>到着予測日数 = 航路距離(海里) ÷ (速度(knots) × 24時間)</p>
        <p>推定位置 = 航路ウェイポイント上をETA進捗率で線形補間</p>
        <p>VLCC標準速度: 12〜12.5knots / LNG船標準速度: 17〜19.5knots</p>
        <p className="text-neutral-600">※ 封鎖時は海峡通過前に出港済みの船舶のみ。封鎖後の新規出港は不可</p>
        <p className="text-neutral-600">※ 地図上の位置はETA逆算による推定値です。AIS未接続のため実際の位置とは異なります</p>
      </div>
    </div>
  );
};
