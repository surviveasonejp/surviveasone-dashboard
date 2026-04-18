/**
 * UncertaintyBand — 4シナリオの結果幅を可視化（Phase 20-D）
 *
 * 「単一値は確定感を与えて危険」（CLAUDE.md 設計原則#2）に基づき、
 * 4標準シナリオの oil/lng/power 日数を横バーで重ね、現選択を強調する。
 *
 * 確認フレーム: 「不確実性の幅」を視覚化し、「○日で枯渇する」という
 * 断定的な印象を回避する。
 */

import { type FC, useMemo } from "react";
import type { ScenarioId } from "../../shared/scenarios";
import { SCENARIOS } from "../../shared/scenarios";
import { ALL_SCENARIO_DAYS } from "../lib/fallbackCountdowns";
import { SectionHeading } from "./SectionHeading";
import { Badge, type BadgeTone } from "./Badge";

interface Props {
  /** 現選択シナリオ（強調表示用） */
  scenario: ScenarioId;
  /** 表示スケール上限（日）。これ以上の値は「最大+」扱い */
  maxScaleDays?: number;
}

const SCENARIO_TONE: Record<ScenarioId, BadgeTone> = {
  optimistic: "success",
  realistic: "warning",
  pessimistic: "primary",
  ceasefire: "teal",
};

/** 4シナリオの色（バー上のマーカー用） */
const SCENARIO_DOT_COLOR: Record<ScenarioId, string> = {
  optimistic: "bg-success-soft",
  realistic: "bg-warning-soft",
  pessimistic: "bg-primary-soft",
  ceasefire: "bg-teal",
};

function formatDays(d: number): string {
  if (!isFinite(d) || d > 1825) return "5年+";
  if (d > 730) return `${(d / 365).toFixed(1)}年`;
  if (d > 365) return `${Math.round(d / 30)}ヶ月`;
  return `${Math.round(d)}日`;
}

interface ResourceBandProps {
  label: string;
  values: { id: ScenarioId; days: number }[];
  scenario: ScenarioId;
  maxScaleDays: number;
}

const ResourceBand: FC<ResourceBandProps> = ({ label, values, scenario, maxScaleDays }) => {
  const finite = values.filter((v) => isFinite(v.days) && v.days > 0);
  if (finite.length === 0) return null;

  const minVal = Math.min(...finite.map((v) => v.days));
  const maxVal = Math.max(...finite.map((v) => v.days));
  const current = finite.find((v) => v.id === scenario);

  // スケール上限でクランプ（極端値の圧縮）
  const clampedMin = Math.min(minVal, maxScaleDays);
  const clampedMax = Math.min(maxVal, maxScaleDays);
  const minPct = (clampedMin / maxScaleDays) * 100;
  const maxPct = (clampedMax / maxScaleDays) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-mono text-text">{label}</span>
        <span className="text-[10px] font-mono text-text-muted">
          {formatDays(minVal)} 〜 {formatDays(maxVal)}
          {current && (
            <span className="ml-2 text-text">
              現在: <span className="font-bold">{formatDays(current.days)}</span>
            </span>
          )}
        </span>
      </div>

      {/* バー本体 */}
      <div className="relative h-5 bg-bg/50 border border-border rounded-md overflow-visible">
        {/* レンジ帯 */}
        <div
          className="absolute top-0 bottom-0 bg-info/15 border-y border-info/30"
          style={{
            left: `${minPct}%`,
            width: `${Math.max(0.5, maxPct - minPct)}%`,
          }}
        />
        {/* 各シナリオのドット */}
        {finite.map((v) => {
          const clampedDays = Math.min(v.days, maxScaleDays);
          const pct = (clampedDays / maxScaleDays) * 100;
          const isCurrent = v.id === scenario;
          return (
            <div
              key={v.id}
              className={`absolute top-1/2 -translate-y-1/2 ${SCENARIO_DOT_COLOR[v.id]} rounded-full ${
                isCurrent
                  ? "w-3.5 h-3.5 ring-2 ring-info ring-offset-1 ring-offset-bg z-10"
                  : "w-2 h-2 opacity-70"
              }`}
              style={{ left: `calc(${pct}% - ${isCurrent ? "7" : "4"}px)` }}
              title={`${SCENARIOS[v.id].label}: ${formatDays(v.days)}`}
            />
          );
        })}
      </div>

      {/* スケールラベル */}
      <div className="flex justify-between text-[9px] font-mono text-text-muted">
        <span>0</span>
        <span>{Math.round(maxScaleDays / 2)}日</span>
        <span>{maxScaleDays}日+</span>
      </div>
    </div>
  );
};

export const UncertaintyBand: FC<Props> = ({ scenario, maxScaleDays = 730 }) => {
  const oilValues = useMemo(
    () => ALL_SCENARIO_DAYS.map((s) => ({ id: s.id, days: s.oil })),
    [],
  );
  const lngValues = useMemo(
    () => ALL_SCENARIO_DAYS.map((s) => ({ id: s.id, days: s.lng })),
    [],
  );
  const powerValues = useMemo(
    () => ALL_SCENARIO_DAYS.map((s) => ({ id: s.id, days: s.power })),
    [],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionHeading tone="info" size="xs" tracking="widest">
          UNCERTAINTY BAND — シナリオ間の不確実性幅
        </SectionHeading>
        <span className="text-[10px] font-mono text-text-muted">
          現在: <Badge tone={SCENARIO_TONE[scenario]} outlined={false}>{SCENARIOS[scenario].label}</Badge>
        </span>
      </div>

      <div className="space-y-3">
        <ResourceBand label="石油" values={oilValues} scenario={scenario} maxScaleDays={maxScaleDays} />
        <ResourceBand label="LNG" values={lngValues} scenario={scenario} maxScaleDays={maxScaleDays} />
        <ResourceBand label="電力" values={powerValues} scenario={scenario} maxScaleDays={maxScaleDays} />
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] font-mono pt-1 border-t border-border">
        <span className="text-text-muted">凡例:</span>
        {(["optimistic", "realistic", "pessimistic", "ceasefire"] as const).map((id) => (
          <span key={id} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${SCENARIO_DOT_COLOR[id]}`} />
            <span className="text-text-muted">{SCENARIOS[id].label}</span>
          </span>
        ))}
      </div>
      <p className="text-[10px] text-text-muted leading-relaxed">
        ベース計算（封鎖率×消費）。ceasefire は遮断率が低いため大きい値となり「{maxScaleDays}日+」で圧縮表示します。
      </p>
    </div>
  );
};
