/**
 * PhaseIndicator — 長期化シナリオのフェーズ区分を可視化（Phase 20-A）
 *
 * 「初期ショック期 → 制限期 → 構造的適応期」の境界を時系列バーで表示する。
 * 停戦交渉失敗による長期化前提の意思決定を支援するため、
 * 各フェーズの期間と特性を併記する。
 *
 * 確認フレーム: 「いつ」「何が起きるか」を示し、「今すぐ買え」を煽らない。
 */

import { type FC, useMemo, useState, useEffect } from "react";
import type { FlowSimulationResult, ScenarioPhase, PhaseInfo } from "../../shared/types";
import { type ScenarioId, SCENARIOS } from "../../shared/scenarios";
import { useApiData } from "../hooks/useApiData";
import { SectionHeading } from "./SectionHeading";
import { Badge, type BadgeTone } from "./Badge";

interface Props {
  scenario: ScenarioId;
  /** 観測経過日数（オプション）。未指定時は0扱い */
  currentDay?: number;
}

const PHASE_TONE: Record<ScenarioPhase, BadgeTone> = {
  initial: "warning",
  rationing: "primary",
  structural: "info",
  recovery: "teal",
};

/** バー描画用の塗り色（背景色クラス。完全形でJIT検出させる） */
const PHASE_BAR_COLOR: Record<ScenarioPhase, string> = {
  initial: "bg-warning-soft",
  rationing: "bg-primary-soft",
  structural: "bg-info-soft",
  recovery: "bg-teal",
};

const EMPTY_RESULT: FlowSimulationResult = {
  timeline: [],
  oilDepletionDay: 365,
  lngDepletionDay: 365,
  powerCollapseDay: 365,
  thresholds: [],
};

const SCENARIO_MAX_DAYS_FOR_REQUEST: Record<ScenarioId, number> = {
  optimistic: 365,
  realistic: 365,
  pessimistic: 730,
  ceasefire: 365,
};

export const PhaseIndicator: FC<Props> = ({ scenario, currentDay = 0 }) => {
  const maxDaysParam = SCENARIO_MAX_DAYS_FOR_REQUEST[scenario];
  const { data } = useApiData<FlowSimulationResult>(
    `/api/simulation?scenario=${scenario}&maxDays=${maxDaysParam}`,
    EMPTY_RESULT,
  );
  const result = data ?? EMPTY_RESULT;
  const phases = result.phaseTimeline ?? [];

  const totalDays = useMemo(() => {
    if (phases.length === 0) return 0;
    const last = phases.at(-1);
    return last?.endDay ?? 0;
  }, [phases]);

  const currentPhase = useMemo<ScenarioPhase | null>(() => {
    for (const p of phases) {
      const end = p.endDay ?? totalDays;
      if (currentDay >= p.startDay && currentDay < end) {
        return p.phase;
      }
    }
    return phases[0]?.phase ?? null;
  }, [phases, currentDay, totalDays]);

  if (phases.length === 0 || totalDays === 0) {
    return null;
  }

  const hasStructural = phases.some((p) => p.phase === "structural");
  const observationLabel = scenario === "pessimistic" ? "2年観測" : "1年観測";

  return (
    <div className="bg-panel border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionHeading tracking="widest">
          PHASE TIMELINE — 長期化シナリオの段階区分
        </SectionHeading>
        <Badge tone={hasStructural ? "info" : "warning"}>
          {observationLabel}
        </Badge>
      </div>

      {/* フェーズバー */}
      <div className="space-y-2">
        <div className="flex h-8 rounded-md overflow-hidden border border-border">
          {phases.map((p) => {
            const phaseEnd = p.endDay ?? totalDays;
            const widthPct = ((phaseEnd - p.startDay) / totalDays) * 100;
            const isCurrent = currentPhase === p.phase;
            return (
              <div
                key={p.phase}
                className={`${PHASE_BAR_COLOR[p.phase]} flex items-center justify-center text-[10px] font-mono text-white relative ${
                  isCurrent ? "ring-2 ring-info ring-inset" : ""
                }`}
                style={{ width: `${widthPct}%` }}
                title={`${p.label}: Day ${p.startDay}〜${phaseEnd}`}
              >
                <span className="px-1 truncate">{p.label}</span>
              </div>
            );
          })}
        </div>
        {/* スケール */}
        <div className="flex justify-between text-[10px] font-mono text-text-muted">
          <span>Day 0</span>
          <span>Day {Math.round(totalDays / 2)}</span>
          <span>Day {totalDays}</span>
        </div>
      </div>

      {/* フェーズ説明カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {phases.map((p) => {
          const phaseEnd = p.endDay ?? totalDays;
          const isCurrent = currentPhase === p.phase;
          const duration = phaseEnd - p.startDay;
          return (
            <div
              key={p.phase}
              className={`border rounded-md p-3 ${
                isCurrent
                  ? "border-info/40 bg-info/5"
                  : "border-border bg-bg/50"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5 gap-1">
                <Badge tone={PHASE_TONE[p.phase]}>
                  {p.label}
                </Badge>
                {isCurrent && (
                  <span className="text-[10px] font-mono text-info shrink-0">現在</span>
                )}
              </div>
              <div className="text-[10px] font-mono text-text-muted mb-1.5">
                Day {p.startDay}〜{phaseEnd}（{duration}日間）
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                {p.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Phase 20-D: 4シナリオ比較ビュー（折り畳み） */}
      <PhaseComparisonView activeScenario={scenario} />

      {/* フッター注記 */}
      <p className="text-xs text-text-muted leading-relaxed border-t border-border pt-2">
        フェーズ境界は備蓄消費と政策発動の進捗から動的に算出されます。
        {hasStructural && " 製油所改造（6〜18ヶ月）と行動変容による構造的需要減を含む長期均衡モデルです。"}
        実際の移行時期は政策対応・国際情勢で変動します。
      </p>
    </div>
  );
};

// ─── Phase 20-D: 4シナリオ比較ビュー ─────────────────

const COMPARISON_SCALE_DAYS = 730;
const ALL_SCENARIOS: readonly ScenarioId[] = ["optimistic", "realistic", "pessimistic", "ceasefire"] as const;

interface PhaseComparisonViewProps {
  activeScenario: ScenarioId;
}

const PhaseComparisonView: FC<PhaseComparisonViewProps> = ({ activeScenario }) => {
  const [open, setOpen] = useState(false);
  const [allPhases, setAllPhases] = useState<Partial<Record<ScenarioId, PhaseInfo[]>>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    Promise.all(
      ALL_SCENARIOS.map(async (s) => {
        const maxDays = SCENARIO_MAX_DAYS_FOR_REQUEST[s];
        try {
          const res = await fetch(`/api/simulation?scenario=${s}&maxDays=${maxDays}`);
          if (!res.ok) return [s, [] as PhaseInfo[]] as const;
          const json = await res.json() as { data?: FlowSimulationResult };
          return [s, (json.data?.phaseTimeline ?? []) as PhaseInfo[]] as const;
        } catch {
          return [s, [] as PhaseInfo[]] as const;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const map: Partial<Record<ScenarioId, PhaseInfo[]>> = {};
      for (const [s, pt] of results) map[s] = pt;
      setAllPhases(map);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [open, loaded]);

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-bg/30 transition-colors"
        aria-expanded={open}
      >
        <SectionHeading tone="info" size="xs" tracking="widest">
          PHASE COMPARISON — 4シナリオの境界比較
        </SectionHeading>
        <span className="text-[10px] font-mono text-text-muted shrink-0">
          {open ? "▲ 閉じる" : "▼ 全シナリオ比較を開く"}
        </span>
      </button>

      {open && (
        <div className="border-t border-border p-3 space-y-3">
          {!loaded ? (
            <p className="text-xs text-text-muted">読み込み中...</p>
          ) : (
            <>
              <div className="space-y-2">
                {ALL_SCENARIOS.map((s) => {
                  const phases = allPhases[s] ?? [];
                  const isActive = s === activeScenario;
                  return (
                    <ScenarioPhaseRow
                      key={s}
                      scenarioId={s}
                      phases={phases}
                      isActive={isActive}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[9px] font-mono text-text-muted">
                <span>Day 0</span>
                <span>Day 365</span>
                <span>Day {COMPARISON_SCALE_DAYS}</span>
              </div>
              <p className="text-[10px] text-text-muted leading-relaxed">
                共通スケール（最大{COMPARISON_SCALE_DAYS}日）。シナリオによってフェーズ移行時期が大きくズレることが見て取れます。
                pessimistic は唯一構造的適応期に到達、optimistic と realistic は制限期で観測終了します。
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

interface ScenarioPhaseRowProps {
  scenarioId: ScenarioId;
  phases: PhaseInfo[];
  isActive: boolean;
}

const ScenarioPhaseRow: FC<ScenarioPhaseRowProps> = ({ scenarioId, phases, isActive }) => {
  const last = phases.at(-1);
  const observedDays = last?.endDay ?? 0;
  return (
    <div className={`p-2 rounded ${isActive ? "bg-info/5 ring-1 ring-info/30" : ""}`}>
      <div className="flex items-center justify-between mb-1 gap-2">
        <Badge tone={isActive ? "info" : "neutral"} outlined={!isActive}>
          {SCENARIOS[scenarioId].label}
        </Badge>
        <span className="text-[10px] font-mono text-text-muted">
          観測 {observedDays}日
        </span>
      </div>
      {/* ミニバー（共通スケール 730日） */}
      <div className="relative h-5 bg-bg/50 border border-border rounded overflow-hidden">
        {phases.map((p) => {
          const phaseEnd = p.endDay ?? observedDays;
          const startPct = (p.startDay / COMPARISON_SCALE_DAYS) * 100;
          const widthPct = ((phaseEnd - p.startDay) / COMPARISON_SCALE_DAYS) * 100;
          return (
            <div
              key={p.phase}
              className={`absolute top-0 bottom-0 ${PHASE_BAR_COLOR[p.phase]} flex items-center justify-center text-[9px] font-mono text-white`}
              style={{
                left: `${startPct}%`,
                width: `${widthPct}%`,
              }}
              title={`${p.label}: Day ${p.startDay}〜${phaseEnd}`}
            >
              {widthPct > 8 && <span className="px-1 truncate">{p.label}</span>}
            </div>
          );
        })}
        {/* 観測終端マーカー（観測期間 < スケール上限の場合） */}
        {observedDays < COMPARISON_SCALE_DAYS && observedDays > 0 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-text-muted/40"
            style={{ left: `${(observedDays / COMPARISON_SCALE_DAYS) * 100}%` }}
            title={`観測終端: Day ${observedDays}`}
          />
        )}
      </div>
    </div>
  );
};
