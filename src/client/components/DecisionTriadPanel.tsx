/**
 * DecisionTriadPanel — 事実 / 解釈 / 含意 の3カラム意思決定サマリー（Phase 20-B）
 *
 * 「データを示し、判断を支援する」ミッションを構造化する。
 * - FACTS: 中立的な事実数値（変動少・出典明示）
 * - INTERPRETATION: 現シナリオの解釈（信頼区間込み）
 * - SCENARIO IMPLICATIONS: 4シナリオの含意比較
 *
 * 既存の SUPPLY BUFFER + CountdownTimer×3 を吸収・統合する。
 * 確認フレーム: 「もしこの仮説なら〇〇日まで持つ」と仮説的に提示。
 */

import { type FC, useMemo } from "react";
import type { ResourceCountdown, FlowSimulationResult, ScenarioPhase } from "../../shared/types";
import { type ScenarioId, SCENARIOS } from "../../shared/scenarios";
import { useApiData } from "../hooks/useApiData";
import { SectionHeading } from "./SectionHeading";
import { Badge, type BadgeTone } from "./Badge";
import { UncertaintyBand } from "./UncertaintyBand";
import staticReserves from "../data/reserves.json";
import { FALLBACK_COUNTDOWNS, ALL_SCENARIO_DAYS } from "../lib/fallbackCountdowns";

interface Props {
  scenario: ScenarioId;
}

interface OilPriceResponse {
  wti_usd: number;
  date: string;
}

const PHASE_TONE: Record<ScenarioPhase, BadgeTone> = {
  initial: "warning",
  rationing: "primary",
  structural: "info",
  recovery: "teal",
};

const SCENARIO_TONE: Record<ScenarioId, BadgeTone> = {
  optimistic: "success",
  realistic: "warning",
  pessimistic: "primary",
  ceasefire: "teal",
};

const EMPTY_SIM: FlowSimulationResult = {
  timeline: [],
  oilDepletionDay: 365,
  lngDepletionDay: 365,
  powerCollapseDay: 365,
  thresholds: [],
};

const EMPTY_OIL_PRICE: OilPriceResponse = { wti_usd: 0, date: "" };

/** Infinity・極大値を「2年+」表記に丸める */
function formatDays(d: number): string {
  if (!isFinite(d) || d > 730) return "2年+";
  if (d > 365) return `${Math.round(d / 30)}ヶ月`;
  return `${Math.round(d)}日`;
}

export const DecisionTriadPanel: FC<Props> = ({ scenario }) => {
  // 現シナリオのカウントダウン
  const { data: countdownData } = useApiData<ResourceCountdown[]>(
    `/api/countdowns?scenario=${scenario}`,
    FALLBACK_COUNTDOWNS,
  );
  const countdowns = countdownData ?? FALLBACK_COUNTDOWNS;

  // 現シナリオのフェーズ（PhaseIndicator と同じデータ源）
  const { data: simData } = useApiData<FlowSimulationResult>(
    `/api/simulation?scenario=${scenario}`,
    EMPTY_SIM,
  );
  const simulation = simData ?? EMPTY_SIM;

  // WTI 原油価格
  const { data: oilPriceData, isFromApi: oilPriceFromApi } = useApiData<OilPriceResponse>(
    "/api/oil-price",
    EMPTY_OIL_PRICE,
  );
  const oilPrice = oilPriceData ?? EMPTY_OIL_PRICE;

  // 現フェーズ判定
  const currentPhase = useMemo<ScenarioPhase>(() => {
    const phases = simulation.phaseTimeline ?? [];
    return phases[0]?.phase ?? "initial";
  }, [simulation.phaseTimeline]);

  // 次に到達する閾値イベント（参考表示）
  const nextThreshold = useMemo(() => {
    const ts = simulation.thresholds ?? [];
    return ts.find((t) => t.stockPercent >= 0 && t.day > 0) ?? null;
  }, [simulation.thresholds]);

  const oilCd = countdowns.find((c) => c.label === "石油備蓄");
  const lngCd = countdowns.find((c) => c.label === "LNG供給余力");
  const powerCd = countdowns.find((c) => c.label === "電力供給");

  return (
    <div className="bg-panel border border-border rounded-lg p-4 lg:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <SectionHeading tracking="widest">
          DECISION TRIAD — 事実 / 解釈 / 含意
        </SectionHeading>
        <span className="text-[10px] font-mono text-text-muted">
          現シナリオ: <span className="text-text">{SCENARIOS[scenario].label}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-0">
        {/* ─── FACTS（事実）─── */}
        <div className="space-y-3 lg:pr-6">
          <SectionHeading tone="success" size="xs">
            FACTS — 観測された事実
          </SectionHeading>

          <FactRow
            label="石油備蓄日数（法ベース・IEA上位）"
            value={`${staticReserves.oil.totalReserveDays}`}
            unit="日"
            tone="success"
          />
          <FactRow
            label="LNG ホルムズ依存率"
            value={`${(staticReserves.lng.hormuzDependencyRate * 100).toFixed(1)}`}
            unit="%"
            tone="success"
            note="93.7% は非ホルムズ供給"
          />
          <FactRow
            label="代替供給ルート"
            value="3"
            unit="本"
            tone="success"
            note="フジャイラ / ヤンブー / 非中東"
          />
          <FactRow
            label="WTI 原油スポット価格"
            value={oilPriceFromApi && oilPrice.wti_usd > 0 ? `${oilPrice.wti_usd.toFixed(2)}` : "—"}
            unit="USD/bbl"
            tone="info"
            note={oilPrice.date ? `${oilPrice.date} 時点・出典: EIA` : "取得待ち"}
          />
        </div>

        {/* ─── INTERPRETATION（解釈）─── */}
        <div className="space-y-3 lg:px-6 lg:border-l lg:border-r border-border">
          <SectionHeading tone="info" size="xs">
            INTERPRETATION — 現シナリオの解釈
          </SectionHeading>

          {/* 現フェーズ */}
          <div className="rounded-md border border-border bg-bg/50 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono text-text-muted tracking-wider">
                CURRENT PHASE
              </span>
              <Badge tone={PHASE_TONE[currentPhase]}>
                {phaseLabel(currentPhase)}
              </Badge>
            </div>
            {nextThreshold && (
              <p className="text-xs text-text-muted leading-relaxed">
                次の閾値: <span className="text-text">{nextThreshold.label}</span>
                <span className="text-[10px] font-mono text-text-muted ml-1">
                  （Day {nextThreshold.day} 想定）
                </span>
              </p>
            )}
          </div>

          {/* 現シナリオの3リソース日数 */}
          <ResourceRow
            label="石油"
            currentDays={oilCd?.totalDays ?? 0}
            scenarioId={scenario}
            resourceIdx={0}
          />
          <ResourceRow
            label="LNG"
            currentDays={lngCd?.totalDays ?? 0}
            scenarioId={scenario}
            resourceIdx={1}
          />
          <ResourceRow
            label="電力"
            currentDays={powerCd?.totalDays ?? 0}
            scenarioId={scenario}
            resourceIdx={2}
          />

          <p className="text-[10px] text-text-muted leading-relaxed pt-1">
            括弧内は楽観↔悲観レンジ。実際は政策発動と国際情勢で変動。
          </p>
        </div>

        {/* ─── SCENARIO IMPLICATIONS（含意）─── */}
        <div className="space-y-3 lg:pl-6">
          <SectionHeading tone="warning" size="xs">
            IMPLICATIONS — 4シナリオの含意
          </SectionHeading>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  <th className="text-left font-normal py-1.5 pr-2">シナリオ</th>
                  <th className="text-right font-normal py-1.5 px-1">石油</th>
                  <th className="text-right font-normal py-1.5 px-1">LNG</th>
                  <th className="text-right font-normal py-1.5 pl-1">電力</th>
                </tr>
              </thead>
              <tbody>
                {ALL_SCENARIO_DAYS.map((row) => {
                  const isActive = row.id === scenario;
                  const sLabel = SCENARIOS[row.id].label;
                  return (
                    <tr
                      key={row.id}
                      className={
                        isActive
                          ? "bg-info/5 border-l-2 border-info"
                          : "border-b border-border/50"
                      }
                    >
                      <td className="py-1.5 pr-2">
                        <span className="flex items-center gap-1.5">
                          <Badge tone={SCENARIO_TONE[row.id]} outlined={false}>
                            {sLabel}
                          </Badge>
                          {isActive && (
                            <span className="text-[9px] text-info">●</span>
                          )}
                        </span>
                      </td>
                      <td className="text-right py-1.5 px-1 text-text">
                        {formatDays(row.oil)}
                      </td>
                      <td className="text-right py-1.5 px-1 text-text">
                        {formatDays(row.lng)}
                      </td>
                      <td className="text-right py-1.5 pl-1 text-text">
                        {formatDays(row.power)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-text-muted leading-relaxed pt-1">
            ベース計算（封鎖率×消費）。代替供給・SPR放出・需要破壊は含まない。
            詳細は <span className="text-info">PHASE TIMELINE</span> 参照。
          </p>
        </div>
      </div>

      {/* Phase 20-D: 不確実性バンド — 4シナリオの幅を視覚化 */}
      <div className="border-t border-border pt-4 mt-4">
        <UncertaintyBand scenario={scenario} />
      </div>

      {/* 全体注記 */}
      <p className="text-xs text-text-muted leading-relaxed border-t border-border pt-3 mt-4">
        即時崩壊シナリオではありません。政策対応・代替供給・需要抑制により影響は段階的に制御可能です。
        本パネルは「事実 → 仮説別含意」を一覧化し、判断材料として提示します。
      </p>
    </div>
  );
};

// ─── 内部コンポーネント ───────────────────────────────

interface FactRowProps {
  label: string;
  value: string;
  unit: string;
  tone: "success" | "info";
  note?: string;
}

const FactRow: FC<FactRowProps> = ({ label, value, unit, tone, note }) => {
  const valueColor = tone === "success" ? "text-success-soft" : "text-info";
  return (
    <div className="rounded-md border border-border bg-bg/50 p-3">
      <div className="text-[10px] font-mono text-text-muted tracking-wider mb-1">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-mono font-bold text-2xl ${valueColor}`}>{value}</span>
        <span className="text-xs text-text-muted">{unit}</span>
      </div>
      {note && (
        <div className="text-[10px] text-text-muted mt-1 leading-tight">{note}</div>
      )}
    </div>
  );
};

interface ResourceRowProps {
  label: string;
  currentDays: number;
  scenarioId: ScenarioId;
  resourceIdx: number;
}

const ResourceRow: FC<ResourceRowProps> = ({ label, currentDays }) => {
  // ALL_SCENARIO_DAYS から min/max レンジを計算（信頼区間表示）
  const all = ALL_SCENARIO_DAYS;
  const values = all.map((s) => {
    if (label === "石油") return s.oil;
    if (label === "LNG") return s.lng;
    return s.power;
  });
  const finite = values.filter((v) => isFinite(v) && v > 0);
  const min = Math.min(...finite);
  const max = Math.max(...finite);

  return (
    <div className="flex items-baseline justify-between gap-2 py-1 border-b border-border/30">
      <span className="text-xs text-text-muted">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono font-bold text-lg text-text">
          {formatDays(currentDays)}
        </span>
        <span className="text-[10px] font-mono text-text-muted">
          （{formatDays(min)} 〜 {formatDays(max)}）
        </span>
      </div>
    </div>
  );
};

function phaseLabel(p: ScenarioPhase): string {
  const map: Record<ScenarioPhase, string> = {
    initial: "初期ショック期",
    rationing: "制限期",
    structural: "構造的適応期",
    recovery: "回復期",
  };
  return map[p];
}
