import { type FC, useMemo, useState } from "react";
import { useOilReserves, type OilReserveBase, type OilReleaseEvent } from "../hooks/useOilReserves";
import { SectionHeading } from "./SectionHeading";
import { Badge } from "./Badge";

/**
 * Phase 25-C: 国家10基地 + 民間4拠点の容量・累積放出量・残存率を可視化。
 *
 * 表示要素:
 *  - 全国家備蓄合計のサマリーバー
 *  - 各基地の容量バー with 累積放出量オーバーレイ
 *  - 放出イベントタイムライン（wave別）
 */

const REGION_LABELS: Record<string, string> = {
  hokkaido: "北海道",
  tohoku: "東北",
  hokuriku: "北陸",
  shikoku: "四国",
  kyushu: "九州",
  chugoku: "中国",
  tokyo: "関東",
  okinawa: "沖縄",
};

function formatKL(kL: number | null): string {
  if (kL === null) return "—";
  if (kL >= 10_000) {
    return `${(kL / 10_000).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}万kL`;
  }
  return `${kL.toLocaleString("ja-JP")}kL`;
}

function remainingTone(percent: number | null): "success" | "warning" | "primary" | "neutral" {
  if (percent === null) return "neutral";
  if (percent >= 80) return "success";
  if (percent >= 60) return "warning";
  return "primary";
}

export const OilReserveBasesPanel: FC = () => {
  const { bases, summary, events, loading, error } = useOilReserves();
  const [expandedBase, setExpandedBase] = useState<string | null>(null);

  // 基地ごとの放出イベントをマップ化
  const eventsByBase = useMemo(() => {
    const map = new Map<string, OilReleaseEvent[]>();
    for (const ev of events) {
      const arr = map.get(ev.base_id) ?? [];
      arr.push(ev);
      map.set(ev.base_id, arr);
    }
    return map;
  }, [events]);

  // wave 別サマリー
  const waveSummary = useMemo(() => {
    const map = new Map<string, { totalKL: number; date: string; baseCount: number; refiners: string[] }>();
    for (const ev of events) {
      const cur = map.get(ev.wave) ?? { totalKL: 0, date: ev.release_date, baseCount: 0, refiners: ev.refiners };
      cur.totalKL += ev.volume_kL;
      cur.baseCount += 1;
      map.set(ev.wave, cur);
    }
    return [...map.entries()].sort((a, b) => a[1].date.localeCompare(b[1].date));
  }, [events]);

  if (loading) {
    return (
      <div className="bg-panel border border-border rounded-lg p-6 text-center text-text-muted text-sm">
        基地別備蓄データを読み込み中…
      </div>
    );
  }

  if (error || bases.length === 0) {
    return (
      <div className="bg-panel border border-border rounded-lg p-6 text-center text-text-muted text-sm">
        基地別備蓄データはまだ取得されていません（毎月18日更新・初回 cron 待ち）
      </div>
    );
  }

  const nationalBases = bases.filter((b) => b.reserve_type === "national");
  const privateBases = bases.filter((b) => b.reserve_type === "private");

  return (
    <div className="bg-panel border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border space-y-1">
        <SectionHeading as="h2" tone="neutral-muted" size="sm" tracking="wider">
          国家・民間 石油備蓄 基地別状況
        </SectionHeading>
        <p className="text-[10px] text-text-muted">
          国家10基地（容量確定）+ 民間4拠点。確定放出イベントの累積で残存率を表示。基地別kLは公式非公表のため容量加重・均等配分推定を含む（`split_method` で明示）
        </p>
      </div>

      {/* 全国家備蓄サマリー */}
      {summary && (
        <div className="px-4 py-3 border-b border-border bg-bg">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs font-mono text-text-muted tracking-wider">国家備蓄 合計</span>
            <span className="font-mono text-sm">
              <span className="text-text">{formatKL(summary.totalNationalRemaining_kL)}</span>
              <span className="text-text-muted ml-1">/ {formatKL(summary.totalNationalCapacity_kL)}</span>
            </span>
          </div>
          <div className="relative w-full h-3 bg-border rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-success-soft rounded-full"
              style={{ width: `${summary.totalNationalRemainingPercent}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-warning-soft/40"
              style={{ width: `${100 - summary.totalNationalRemainingPercent}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] font-mono text-text-muted">
            <span>残存 {summary.totalNationalRemainingPercent.toFixed(1)}%</span>
            <span>累積放出 {formatKL(summary.totalNationalReleased_kL)}</span>
          </div>
        </div>
      )}

      {/* 基地リスト */}
      <div className="divide-y divide-border">
        {nationalBases.map((base) => (
          <BaseRow
            key={base.base_id}
            base={base}
            events={eventsByBase.get(base.base_id) ?? []}
            expanded={expandedBase === base.base_id}
            onToggle={() => setExpandedBase(expandedBase === base.base_id ? null : base.base_id)}
          />
        ))}
        {privateBases.length > 0 && (
          <div className="px-4 py-2 bg-bg">
            <span className="text-[10px] font-mono text-text-muted tracking-wider">民間備蓄拠点</span>
          </div>
        )}
        {privateBases.map((base) => (
          <BaseRow
            key={base.base_id}
            base={base}
            events={eventsByBase.get(base.base_id) ?? []}
            expanded={expandedBase === base.base_id}
            onToggle={() => setExpandedBase(expandedBase === base.base_id ? null : base.base_id)}
          />
        ))}
      </div>

      {/* Wave タイムライン */}
      {waveSummary.length > 0 && (
        <div className="px-4 py-3 border-t border-border bg-bg">
          <SectionHeading as="h3" tone="text-muted" size="xs" tracking="wider" className="mb-2">
            放出イベントタイムライン
          </SectionHeading>
          <div className="space-y-1.5">
            {waveSummary.map(([wave, info]) => (
              <div key={wave} className="flex items-baseline justify-between text-xs">
                <span className="font-mono text-text-muted">
                  {info.date} <span className="text-text">{wave.toUpperCase()}</span>
                </span>
                <span className="font-mono">
                  <span className="text-text">{formatKL(info.totalKL)}</span>
                  <span className="text-text-muted ml-2">{info.baseCount}基地・{info.refiners.length}社</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-2 border-t border-border text-[9px] text-text-muted">
        出典: JOGMEC ニュースリリース + 経済産業省プレス + regions.json (stockpileBases)。基地別kLは公式非公表のため
        <code className="font-mono mx-1">split_method</code>=
        <code className="font-mono">capacity_weighted</code>/<code className="font-mono">estimated_equal</code> で推定配分
      </div>
    </div>
  );
};

interface BaseRowProps {
  base: OilReserveBase;
  events: OilReleaseEvent[];
  expanded: boolean;
  onToggle: () => void;
}

const BaseRow: FC<BaseRowProps> = ({ base, events, expanded, onToggle }) => {
  const tone = remainingTone(base.remainingPercent);
  const regionLabel = REGION_LABELS[base.region] ?? base.region;
  const hasEvents = events.length > 0;

  return (
    <div>
      <button
        onClick={onToggle}
        disabled={!hasEvents}
        className={`w-full px-4 py-2.5 text-left transition-colors ${
          hasEvents ? "hover:bg-bg cursor-pointer" : "cursor-default"
        }`}
      >
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-bold text-sm text-text truncate">{base.name}</span>
            <span className="text-[10px] font-mono text-text-muted shrink-0">{regionLabel}</span>
            {base.releaseEventCount > 0 && (
              <Badge tone="warning" size="xs" className="shrink-0">
                放出{base.releaseEventCount}回
              </Badge>
            )}
          </div>
          <span className="font-mono text-xs whitespace-nowrap">
            {base.capacity_kL !== null ? (
              <>
                <span className="text-text">{formatKL(base.remaining_kL)}</span>
                <span className="text-text-muted">/{formatKL(base.capacity_kL)}</span>
              </>
            ) : (
              <span className="text-text-muted">容量非公表</span>
            )}
          </span>
        </div>

        {/* 容量バー */}
        {base.capacity_kL !== null && base.remainingPercent !== null && (
          <>
            <div className="relative w-full h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${
                  tone === "success" ? "bg-success-soft"
                  : tone === "warning" ? "bg-warning-soft"
                  : "bg-primary-soft"
                }`}
                style={{ width: `${base.remainingPercent}%` }}
              />
            </div>
            <div className="flex justify-between mt-0.5 text-[10px] font-mono text-text-muted">
              <span>残存 {base.remainingPercent.toFixed(1)}%</span>
              {base.cumulativeReleased_kL > 0 && (
                <span>累積放出 {formatKL(base.cumulativeReleased_kL)}</span>
              )}
            </div>
          </>
        )}
      </button>

      {expanded && hasEvents && (
        <div className="px-4 pb-3 pt-1 bg-bg space-y-1.5">
          {events.map((ev) => (
            <div key={ev.id} className="text-xs flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="font-mono text-text-muted">{ev.release_date}</span>
                <span className="text-text uppercase font-mono">{ev.wave}</span>
                <Badge
                  tone={ev.split_method === "confirmed" ? "success" : "neutral"}
                  size="xs"
                  className="shrink-0"
                >
                  {ev.split_method === "confirmed" ? "確定" :
                   ev.split_method === "capacity_weighted" ? "容量加重" :
                   "均等配分"}
                </Badge>
              </div>
              <span className="font-mono text-text whitespace-nowrap">{formatKL(ev.volume_kL)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
