/**
 * MyHypothesisPanel — 「私の想定」設定パネル（Phase 20-C）
 *
 * 設計者本人がシナリオパラメータを直接入力し、4標準シナリオと
 * 並べて含意を比較できるようにする。完全 localStorage、
 * サーバー側コスト増ゼロ。
 *
 * 「ダッシュボードを極めたい」要望に応える、自分用の意思決定エンジン。
 *
 * 確認フレーム: 数値を煽らない。標準シナリオと並べて「自分の仮説の位置」を示す。
 */

import { type FC, useState, useMemo } from "react";
import { Link } from "react-router";
import { SectionHeading } from "./SectionHeading";
import { Badge } from "./Badge";
import { useLocalStorage } from "../hooks/useLocalStorage";
import {
  STORAGE_KEYS,
  DEFAULT_HYPOTHESIS,
  type UserHypothesis,
  newId,
  nowIso,
  type DecisionLogEntry,
} from "../lib/journal";
import { ALL_SCENARIO_DAYS, calcDaysForRates } from "../lib/fallbackCountdowns";
import { SCENARIOS, type ScenarioId } from "../../shared/scenarios";

interface Props {
  scenarioRef: ScenarioId;
}

function formatDays(d: number): string {
  if (!isFinite(d) || d > 1825) return "5年+";
  if (d > 730) return `${(d / 365).toFixed(1)}年`;
  if (d > 365) return `${Math.round(d / 30)}ヶ月`;
  return `${Math.round(d)}日`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export const MyHypothesisPanel: FC<Props> = ({ scenarioRef }) => {
  const [hypothesis, setHypothesis] = useLocalStorage<UserHypothesis>(
    STORAGE_KEYS.hypothesis,
    DEFAULT_HYPOTHESIS,
  );
  const [, setLog] = useLocalStorage<DecisionLogEntry[]>(
    STORAGE_KEYS.decisionLog,
    [],
  );

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UserHypothesis>(hypothesis);
  const [logTitle, setLogTitle] = useState("");
  const [logRationale, setLogRationale] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [loggedFlash, setLoggedFlash] = useState(false);

  const myDays = useMemo(
    () => calcDaysForRates(draft.oilBlockadeRate, draft.lngBlockadeRate, draft.demandReductionRate),
    [draft.oilBlockadeRate, draft.lngBlockadeRate, draft.demandReductionRate],
  );

  const isDirty = useMemo(
    () =>
      draft.oilBlockadeRate !== hypothesis.oilBlockadeRate ||
      draft.lngBlockadeRate !== hypothesis.lngBlockadeRate ||
      draft.demandReductionRate !== hypothesis.demandReductionRate ||
      draft.label !== hypothesis.label,
    [draft, hypothesis],
  );

  const handleSave = () => {
    setHypothesis({ ...draft, updatedAt: nowIso() });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const handleReset = () => {
    setDraft(hypothesis);
  };

  const handlePresetCopy = (id: ScenarioId) => {
    const s = SCENARIOS[id];
    setDraft((prev) => ({
      ...prev,
      oilBlockadeRate: s.oilBlockadeRate,
      lngBlockadeRate: s.lngBlockadeRate,
      demandReductionRate: s.demandReductionRate,
      label: prev.label === DEFAULT_HYPOTHESIS.label ? `${s.label} を出発点に調整` : prev.label,
    }));
  };

  const handleAddLog = () => {
    if (!logTitle.trim()) return;
    const entry: DecisionLogEntry = {
      id: newId(),
      timestamp: nowIso(),
      title: logTitle.trim(),
      rationale: logRationale.trim(),
      hypothesis: {
        oilBlockadeRate: draft.oilBlockadeRate,
        lngBlockadeRate: draft.lngBlockadeRate,
        demandReductionRate: draft.demandReductionRate,
        label: draft.label,
      },
      scenarioRef,
    };
    setLog((prev) => [entry, ...prev]);
    setLogTitle("");
    setLogRationale("");
    setLoggedFlash(true);
    setTimeout(() => setLoggedFlash(false), 2000);
  };

  return (
    <div className="bg-panel border border-border rounded-lg overflow-hidden">
      {/* ヘッダー（クリックで折り畳み） */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-bg/30 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <SectionHeading tracking="widest">
            MY HYPOTHESIS — 私の想定
          </SectionHeading>
          {hypothesis.updatedAt !== "" && (
            <span className="text-[10px] font-mono text-text-muted">
              現在: {hypothesis.label}
            </span>
          )}
        </div>
        <span className="text-xs font-mono text-text-muted shrink-0">
          {open ? "▲ 閉じる" : "▼ 開く"}
        </span>
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-4">
          {/* プリセットコピー */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-text-muted tracking-wider">
              出発点として標準シナリオから複製:
            </span>
            {(["optimistic", "realistic", "pessimistic", "ceasefire"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => handlePresetCopy(id)}
                className="text-[10px] font-mono px-2 py-0.5 rounded border border-border hover:bg-bg/50 transition-colors"
              >
                {SCENARIOS[id].label}
              </button>
            ))}
          </div>

          {/* パラメータ入力 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ParamInput
              label="石油 ホルムズ遮断率"
              hint="0〜1（0.94 = 94%遮断）"
              value={draft.oilBlockadeRate}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setDraft((p) => ({ ...p, oilBlockadeRate: clamp(v, 0, 1) }))}
            />
            <ParamInput
              label="LNG ホルムズ遮断率"
              hint="0〜1（0.063 = 6.3%遮断、非ホルムズ供給は継続）"
              value={draft.lngBlockadeRate}
              min={0}
              max={1}
              step={0.005}
              onChange={(v) => setDraft((p) => ({ ...p, lngBlockadeRate: clamp(v, 0, 1) }))}
            />
            <ParamInput
              label="需要削減率"
              hint="-0.2〜0.3（負=パニック増、正=節約）"
              value={draft.demandReductionRate}
              min={-0.3}
              max={0.5}
              step={0.01}
              onChange={(v) => setDraft((p) => ({ ...p, demandReductionRate: clamp(v, -0.3, 0.5) }))}
            />
          </div>

          {/* ラベル入力 */}
          <div>
            <label className="block text-[10px] font-mono text-text-muted tracking-wider mb-1">
              想定の名前・備考（自由記述）
            </label>
            <input
              type="text"
              value={draft.label}
              onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
              maxLength={120}
              placeholder="例: 停戦交渉失敗・代替供給遅延を想定"
              className="w-full px-3 py-1.5 text-xs font-mono border border-border rounded bg-bg/50 focus:outline-none focus:border-info"
            />
          </div>

          {/* 操作ボタン */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty}
              className="px-3 py-1.5 text-xs font-mono rounded bg-info/15 text-info border border-info/30 hover:bg-info/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              想定を保存
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={!isDirty}
              className="px-3 py-1.5 text-xs font-mono rounded border border-border hover:bg-bg/50 transition-colors disabled:opacity-40"
            >
              編集を破棄
            </button>
            {savedFlash && (
              <span className="text-[10px] font-mono text-success-soft">
                ✓ localStorage に保存しました
              </span>
            )}
          </div>

          {/* 4シナリオとの比較表 */}
          <div className="space-y-2">
            <SectionHeading tone="warning" size="xs">
              COMPARISON — 4標準シナリオとの含意比較
            </SectionHeading>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-text-muted border-b border-border">
                    <th className="text-left font-normal py-1.5 pr-2">想定</th>
                    <th className="text-right font-normal py-1.5 px-1">石油</th>
                    <th className="text-right font-normal py-1.5 px-1">LNG</th>
                    <th className="text-right font-normal py-1.5 pl-1">電力</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 自分の想定 */}
                  <tr className="bg-info/5 border-l-2 border-info">
                    <td className="py-1.5 pr-2">
                      <Badge tone="info">私の想定</Badge>
                    </td>
                    <td className="text-right py-1.5 px-1 text-text font-bold">
                      {formatDays(myDays[0] ?? 0)}
                    </td>
                    <td className="text-right py-1.5 px-1 text-text font-bold">
                      {formatDays(myDays[1] ?? 0)}
                    </td>
                    <td className="text-right py-1.5 pl-1 text-text font-bold">
                      {formatDays(myDays[2] ?? 0)}
                    </td>
                  </tr>
                  {ALL_SCENARIO_DAYS.map((row) => (
                    <tr key={row.id} className="border-b border-border/40">
                      <td className="py-1.5 pr-2 text-text-muted">
                        {SCENARIOS[row.id].label}
                      </td>
                      <td className="text-right py-1.5 px-1 text-text-muted">
                        {formatDays(row.oil)}
                      </td>
                      <td className="text-right py-1.5 px-1 text-text-muted">
                        {formatDays(row.lng)}
                      </td>
                      <td className="text-right py-1.5 pl-1 text-text-muted">
                        {formatDays(row.power)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-text-muted leading-relaxed">
              ベース計算（封鎖率×消費）。代替供給・SPR放出・需要破壊・構造的需要減は含まない。
              フェーズ別動的モデルとの差は <Link to="/methodology" className="text-info hover:underline">手法ページ</Link> 参照。
            </p>
          </div>

          {/* 意思決定ログ追加フォーム */}
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <SectionHeading tone="info" size="xs">
                JOURNAL ENTRY — この想定で意思決定を記録
              </SectionHeading>
              <Link
                to="/journal"
                className="text-[10px] font-mono text-info hover:underline shrink-0"
              >
                記録一覧 →
              </Link>
            </div>
            <input
              type="text"
              value={logTitle}
              onChange={(e) => setLogTitle(e.target.value)}
              maxLength={120}
              placeholder="判断のタイトル（例: 備蓄を1ヶ月分追加することにした）"
              className="w-full px-3 py-1.5 text-xs font-mono border border-border rounded bg-bg/50 focus:outline-none focus:border-info"
            />
            <textarea
              value={logRationale}
              onChange={(e) => setLogRationale(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="根拠（なぜそう判断したか・どのデータを参照したか）"
              className="w-full px-3 py-1.5 text-xs font-mono border border-border rounded bg-bg/50 focus:outline-none focus:border-info resize-y"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleAddLog}
                disabled={!logTitle.trim()}
                className="px-3 py-1.5 text-xs font-mono rounded bg-info/15 text-info border border-info/30 hover:bg-info/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ログに記録
              </button>
              {loggedFlash && (
                <span className="text-[10px] font-mono text-success-soft">
                  ✓ 意思決定ログに追加しました
                </span>
              )}
              <span className="text-[10px] font-mono text-text-muted">
                参照シナリオ: {SCENARIOS[scenarioRef].label}（自動記録）
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface ParamInputProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

const ParamInput: FC<ParamInputProps> = ({ label, hint, value, min, max, step, onChange }) => (
  <div>
    <label className="block text-[10px] font-mono text-text-muted tracking-wider mb-1">
      {label}
    </label>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
      className="w-full px-3 py-1.5 text-xs font-mono border border-border rounded bg-bg/50 focus:outline-none focus:border-info"
    />
    <p className="text-[10px] text-text-muted mt-1 leading-tight">{hint}</p>
  </div>
);
