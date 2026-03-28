import { type FC, useState, useRef, useEffect } from "react";
import { CountdownTimer } from "../components/CountdownTimer";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { TankerMap } from "../components/TankerMap";
import { useTankerData } from "../hooks/useTankerData";
import { getAlertLevel, getAlertColor } from "../lib/alertHelpers";
import { formatDecimal, formatNumber, formatDistance, formatDepletionDate } from "../lib/formatters";

/** ホルムズ海峡内側の出発港 — 封鎖時に日本到達不可 */
const HORMUZ_PORTS = new Set([
  "Ras Tanura", "Jubail", "Kharg Island",
  "Ras Laffan", "Mina Al Ahmadi", "Basrah",
]);

/** 日本の到着港 */
const JAPAN_DEST_PORTS = new Set([
  "Japan", "Kawasaki", "Hiroshima", "Chiba", "Yokkaichi", "Sakai",
  "Mizushima", "Kiire", "Futtsu", "Chita", "Kitakyushu", "Himeji",
  "Sodegaura", "Sendai", "Naha", "Kashima", "Negishi", "Oita",
]);

export const TankerTracker: FC = () => {
  const tankers = useTankerData();
  const isBlocked = (t: { departurePort: string }) => HORMUZ_PORTS.has(t.departurePort);
  const isNotJapanBound = (t: { destinationPort: string }) => !JAPAN_DEST_PORTS.has(t.destinationPort);
  const isDimmed = (t: { departurePort: string; destinationPort: string }) => isBlocked(t) || isNotJapanBound(t);
  const vlccTankers = tankers.filter((t) => t.type === "VLCC" && !isDimmed(t));
  const lngTankers = tankers.filter((t) => t.type === "LNG" && !isDimmed(t));
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

      {/* 到着順ランキング */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2a36]">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">到着順ランキング</h2>
        </div>

        {/* デスクトップ: テーブル */}
        <div className="hidden md:block overflow-x-auto">
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
                const blocked = isBlocked(tanker);
                const notJapan = isNotJapanBound(tanker);
                const dimmed = blocked || notJapan;
                const level = getAlertLevel(tanker.eta_days);
                const color = dimmed ? "#525252" : getAlertColor(level);
                const isSelected = tanker.id === selectedId;
                const dimClass = dimmed ? "opacity-45" : "";
                return (
                  <tr
                    key={tanker.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(tanker.id, el);
                    }}
                    className={`border-b border-[#162029] cursor-pointer transition-colors ${
                      isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.02]"
                    } ${dimClass}`}
                    onClick={() => setSelectedId(isSelected ? null : tanker.id)}
                  >
                    <td className="px-4 py-2 font-mono text-neutral-500">{index + 1}</td>
                    <td className="px-4 py-2 font-bold text-neutral-200">
                      <span className={dimmed ? "line-through" : ""}>{tanker.name}</span>
                      {tanker.aisTracked ? (
                        <span className="ml-1.5 text-[8px] font-mono font-normal px-1 py-0.5 rounded bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30">
                          AIS
                        </span>
                      ) : (
                        <span className="ml-1.5 text-[8px] font-mono font-normal px-1 py-0.5 rounded bg-neutral-800 text-neutral-500 border border-neutral-700">
                          推定
                        </span>
                      )}
                      {blocked && (
                        <span className="ml-1.5 text-[10px] font-mono font-normal px-1.5 py-0.5 rounded bg-red-900/40 text-red-400">
                          封鎖時到達不可
                        </span>
                      )}
                      {!blocked && notJapan && (
                        <span className="ml-1.5 text-[10px] font-mono font-normal px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700 badge-not-japan">
                          日本向けでない
                        </span>
                      )}
                    </td>
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
                      <div className={dimmed ? "line-through" : ""}>{dimmed && tanker.eta_days === 0 ? "—" : `${formatDecimal(tanker.eta_days)}日`}</div>
                      <div className="text-xs font-normal text-neutral-400">{dimmed ? "—" : formatDepletionDate(tanker.eta_days)}</div>
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

        {/* モバイル: カードレイアウト */}
        <div className="md:hidden divide-y divide-[#162029]">
          {tankers.map((tanker, index) => {
            const blocked = isBlocked(tanker);
            const notJapan = isNotJapanBound(tanker);
            const dimmed = blocked || notJapan;
            const level = getAlertLevel(tanker.eta_days);
            const color = dimmed ? "#525252" : getAlertColor(level);
            const isSelected = tanker.id === selectedId;
            const typeColor = tanker.type === "VLCC" ? "#f59e0b" : "#22c55e";
            return (
              <div
                key={tanker.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(tanker.id, el as unknown as HTMLTableRowElement);
                }}
                className={`px-4 py-3 cursor-pointer transition-colors ${
                  isSelected ? "bg-white/[0.06]" : "active:bg-white/[0.03]"
                } ${dimmed ? "opacity-45" : ""}`}
                onClick={() => setSelectedId(isSelected ? null : tanker.id)}
              >
                {/* 1行目: 順位 + 船名 + バッジ */}
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-neutral-600 w-5 shrink-0">{index + 1}</span>
                  <span className={`font-bold text-sm text-neutral-200 ${dimmed ? "line-through" : ""}`}>{tanker.name}</span>
                  {tanker.aisTracked ? (
                    <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30 shrink-0">
                      AIS
                    </span>
                  ) : (
                    <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-neutral-800 text-neutral-500 border border-neutral-700 shrink-0">
                      推定
                    </span>
                  )}
                  <span
                    className="font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0"
                    style={{ backgroundColor: `${typeColor}20`, color: typeColor }}
                  >
                    {tanker.type}
                  </span>
                  {blocked && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 shrink-0">
                      封鎖時到達不可
                    </span>
                  )}
                  {!blocked && notJapan && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700 badge-not-japan shrink-0">
                      日本向けでない
                    </span>
                  )}
                </div>
                {/* 2行目: 航路 + ETA */}
                <div className="flex items-baseline justify-between mt-1.5 ml-7">
                  <span className="text-xs text-neutral-500 truncate mr-3">
                    {tanker.departure} → {tanker.destination}
                  </span>
                  <span className="font-mono text-sm font-bold shrink-0" style={{ color }}>
                    {dimmed && tanker.eta_days === 0 ? "—" : `${formatDecimal(tanker.eta_days)}日`}
                  </span>
                </div>
                {/* 3行目: 詳細（選択時のみ展開） */}
                {isSelected && (
                  <div className="mt-2 ml-7 grid grid-cols-3 gap-y-1 text-[10px] font-mono">
                    <div>
                      <div className="text-neutral-600">距離</div>
                      <div className="text-neutral-400">{formatDistance(tanker.distanceToJapan_nm)}</div>
                    </div>
                    <div>
                      <div className="text-neutral-600">速度</div>
                      <div className="text-neutral-400">{formatDecimal(tanker.speed_knots)}kn</div>
                    </div>
                    <div>
                      <div className="text-neutral-600">積荷</div>
                      <div className="text-neutral-400">{formatNumber(tanker.cargo_t)}t</div>
                    </div>
                    {!dimmed && (
                      <div className="col-span-3 mt-0.5">
                        <div className="text-neutral-600">到着予定</div>
                        <div className="text-neutral-400">{formatDepletionDate(tanker.eta_days)}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
