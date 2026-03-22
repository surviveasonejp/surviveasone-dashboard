import { type FC } from "react";
import { CountdownTimer } from "../components/CountdownTimer";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { useTankerData } from "../hooks/useTankerData";
import { getAlertLevel, getAlertColor } from "../lib/alertHelpers";
import { formatDecimal, formatNumber, formatDistance, formatDepletionDate } from "../lib/formatters";

export const TankerTracker: FC = () => {
  const tankers = useTankerData();
  const vlccTankers = tankers.filter((t) => t.type === "VLCC");
  const lngTankers = tankers.filter((t) => t.type === "LNG");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-[#ffea00]">LAST TANKER</span> TRACKER
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

      {/* 到着順テーブル */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2a2a2a]">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">到着順ランキング</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-500 font-mono text-xs border-b border-[#2a2a2a]">
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
                return (
                  <tr key={tanker.id} className="border-b border-[#1a1a1a] hover:bg-white/[0.02]">
                    <td className="px-4 py-2 font-mono text-neutral-500">{index + 1}</td>
                    <td className="px-4 py-2 font-bold text-neutral-200">{tanker.name}</td>
                    <td className="px-4 py-2">
                      <span
                        className="font-mono text-xs px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: tanker.type === "VLCC" ? "#ff910020" : "#00e67620",
                          color: tanker.type === "VLCC" ? "#ff9100" : "#00e676",
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
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4 text-xs text-neutral-500 font-mono space-y-2">
        <p className="text-neutral-400 font-bold">計算根拠:</p>
        <p>到着予測日数 = 航路距離(海里) ÷ (速度(knots) × 24時間)</p>
        <p>VLCC標準速度: 13〜15knots / LNG船標準速度: 17〜19knots</p>
        <p className="text-neutral-600">※ 封鎖時は海峡通過前に出港済みの船舶のみ。封鎖後の新規出港は不可</p>
      </div>
    </div>
  );
};
