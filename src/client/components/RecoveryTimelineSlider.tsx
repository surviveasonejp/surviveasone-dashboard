/**
 * RecoveryTimelineSlider
 *
 * 停戦シナリオ（ceasefire）用インタラクティブ回復タイムライン。
 * Day 0-180 スライダーで「今待つべきか」の判断を支援する。
 * 確認フレーム: 恐怖ではなく「何日後に何が回復するか」の見通しを提供する。
 */
import { type FC, useState } from "react";

// BLOCKADE_PROFILES ceasefire の時系列（flowSimulation.ts と同期）
// day 0-45: 94%
// day 45-60: 94→80%（線形）
// day 60-90: 80→45%（線形）
// day 90-120: 45→15%（線形）
// day 120-180: 15→8%（線形）
function getBlockadeRate(day: number): number {
  if (day <= 45) return 0.94;
  if (day <= 60) return 0.94 - (0.94 - 0.80) * ((day - 45) / 15);
  if (day <= 90) return 0.80 - (0.80 - 0.45) * ((day - 60) / 30);
  if (day <= 120) return 0.45 - (0.45 - 0.15) * ((day - 90) / 30);
  return 0.15 - (0.15 - 0.08) * Math.min((day - 120) / 60, 1);
}

interface Phase {
  from: number;
  to: number;
  label: string;
  shortLabel: string;
  color: string;
  /** 確認フレームの意思決定サポートコピー */
  decision: string;
}

const PHASES: Phase[] = [
  {
    from: 0,
    to: 44,
    label: "封鎖継続",
    shortLabel: "封鎖",
    color: "#dc2626",
    decision:
      "封鎖継続中。代替ルート（フジャイラ・喜望峰）タンカーが入港準備中です。SPR放出・IEA協調備蓄が進行しており、備蓄は段階的に消化されています。",
  },
  {
    from: 45,
    to: 59,
    label: "保険解除審査中",
    shortLabel: "保険審査",
    color: "#d97706",
    decision:
      "停戦宣言後も即正常化ではありません。保険会社の危険区域指定解除に2週間程度かかります。湾内の待機タンカーが出港準備を開始した段階です。",
  },
  {
    from: 60,
    to: 89,
    label: "港湾再開フェーズ",
    shortLabel: "港湾再開",
    color: "#eab308",
    decision:
      "湾内に待機していたタンカーが流出開始。日本到着まであと20〜30日前後。契約再締結まで待機するか、スポット調達を継続するかの判断フェーズです。",
  },
  {
    from: 90,
    to: 119,
    label: "契約再締結フェーズ",
    shortLabel: "契約復旧",
    color: "#84cc16",
    decision:
      "フォースマジュール解除・長期契約の再締結が進行中。供給量は着実に回復しています。備蓄は再充填フェーズへ移行する見込みです。",
  },
  {
    from: 120,
    to: 180,
    label: "構造的残存（ほぼ正常化）",
    shortLabel: "正常化",
    color: "#0d9488",
    decision:
      "ほぼ正常化。制裁残存・保険料上昇による8%程度のコスト増が継続する見込みですが、生活・産業への影響は軽微です。",
  },
];

const KEY_EVENTS: Array<{ day: number; label: string; detail: string; color: string }> = [
  {
    day: 45,
    label: "停戦宣言（想定）",
    detail: "WTI急落・念のための需要増が発生。ただし港湾は未再開。",
    color: "#d97706",
  },
  {
    day: 59,
    label: "初VLCC通過",
    detail: "湾内待機タンカー40隻が流出開始。日本到着まであと20日前後。",
    color: "#eab308",
  },
  {
    day: 65,
    label: "IEA放出縮小協議",
    detail: "SPR放出を段階的に縮小。備蓄消化フェーズへ移行。",
    color: "#84cc16",
  },
  {
    day: 110,
    label: "SPR再充填閣議決定",
    detail: "保険料2〜3倍で安定化。再充填を開始し備蓄水準を回復。",
    color: "#0d9488",
  },
];

// Day X に最も近いキーイベント（±3日以内）
function getNearbyEvent(day: number): (typeof KEY_EVENTS)[0] | null {
  return KEY_EVENTS.find((e) => Math.abs(e.day - day) <= 3) ?? null;
}

function getPhase(day: number): Phase {
  return PHASES.find((p) => day >= p.from && day <= p.to) ?? (PHASES[PHASES.length - 1] as Phase);
}

// フェーズバーの各幅（180日基準）
const PHASE_WIDTHS = [
  (45 / 180) * 100,   // 0-44: 25%
  (15 / 180) * 100,   // 45-59: 8.33%
  (30 / 180) * 100,   // 60-89: 16.67%
  (30 / 180) * 100,   // 90-119: 16.67%
  (61 / 180) * 100,   // 120-180: 33.89%
];

// スナップポイントのX位置（0-100%）
const SNAP_POINTS = [
  { day: 45,  pct: (45 / 180) * 100 },
  { day: 60,  pct: (60 / 180) * 100 },
  { day: 90,  pct: (90 / 180) * 100 },
  { day: 120, pct: (120 / 180) * 100 },
];

export const RecoveryTimelineSlider: FC = () => {
  const [day, setDay] = useState(0);

  const phase = getPhase(day);
  const blockadeRate = getBlockadeRate(day);
  const supplyRestoreRate = (1 - blockadeRate) * 100;
  const nearbyEvent = getNearbyEvent(day);

  return (
    <div className="bg-teal/10 border border-teal/30 rounded-lg p-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-mono text-xs tracking-widest text-teal">
          CEASEFIRE RECOVERY TIMELINE — 供給正常化ロードマップ（シミュレーション）
        </div>
        <div
          className="text-[10px] font-mono px-2 py-0.5 rounded font-bold"
          style={{ backgroundColor: `${phase.color}20`, color: phase.color }}
        >
          Day {day} — {phase.shortLabel}
        </div>
      </div>

      {/* フェーズバー（選択フェーズをハイライト） */}
      <div>
        <div className="flex h-5 rounded overflow-hidden text-[8px] font-mono leading-none">
          {PHASES.map((p, i) => (
            <div
              key={p.from}
              className="flex items-center justify-center text-white px-1 transition-opacity duration-200"
              style={{
                width: `${PHASE_WIDTHS[i]}%`,
                backgroundColor: p.color,
                opacity: day >= p.from && day <= p.to ? 1 : 0.3,
              }}
            >
              <span className="truncate hidden sm:inline">{p.shortLabel}</span>
            </div>
          ))}
        </div>
        {/* ラベル位置 */}
        <div className="relative h-3 mt-0.5 select-none">
          <span className="absolute left-0 text-[8px] font-mono text-neutral-500">Day 0</span>
          {SNAP_POINTS.map((sp) => (
            <span
              key={sp.day}
              className="absolute text-[8px] font-mono text-neutral-500 -translate-x-1/2"
              style={{ left: `${sp.pct}%` }}
            >
              {sp.day}
            </span>
          ))}
          <span className="absolute right-0 text-[8px] font-mono text-neutral-500">180</span>
        </div>
      </div>

      {/* スライダー */}
      <div className="space-y-2">
        <input
          type="range"
          min={0}
          max={180}
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          className="w-full h-1.5 appearance-none rounded-full cursor-pointer outline-none"
          style={{ accentColor: phase.color }}
          aria-label={`封鎖Day選択: 現在 Day ${day}`}
        />
        {/* スナップボタン */}
        <div className="flex justify-between text-xs font-mono">
          <button
            onClick={() => setDay(0)}
            className="px-2 py-1.5 rounded transition-colors hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 min-h-[36px]"
          >
            Day 0
          </button>
          {KEY_EVENTS.map((ev) => (
            <button
              key={ev.day}
              onClick={() => setDay(ev.day)}
              className="px-2 py-1.5 rounded transition-colors hover:bg-neutral-100 min-h-[36px]"
              style={{ color: day === ev.day ? ev.color : "#94a3b8" }}
            >
              {ev.day}
            </button>
          ))}
          <button
            onClick={() => setDay(180)}
            className="px-2 py-1.5 rounded transition-colors hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 min-h-[36px]"
          >
            Day 180
          </button>
        </div>
      </div>

      {/* Day X の状態指標 */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-2 space-y-0.5">
          <div className="font-mono font-bold text-xl" style={{ color: phase.color }}>
            {(blockadeRate * 100).toFixed(0)}
            <span className="text-xs font-normal text-neutral-400">%</span>
          </div>
          <div className="text-[10px] text-neutral-500">遮断率</div>
        </div>
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-2 space-y-0.5">
          <div className="font-mono font-bold text-xl text-success">
            {supplyRestoreRate.toFixed(0)}
            <span className="text-xs font-normal text-neutral-400">%</span>
          </div>
          <div className="text-[10px] text-neutral-500">供給回復率</div>
        </div>
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-2 space-y-0.5">
          <div
            className="font-mono font-bold text-sm leading-tight"
            style={{ color: phase.color }}
          >
            {phase.shortLabel}
          </div>
          <div className="text-[10px] text-neutral-500">フェーズ</div>
        </div>
      </div>

      {/* 遮断率推移インジケーター */}
      <div className="space-y-1">
        <div className="text-[10px] font-mono text-neutral-500">遮断率推移</div>
        <div className="relative h-2 bg-[#e2e8f0] rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-200"
            style={{
              width: `${blockadeRate * 100}%`,
              backgroundColor: phase.color,
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-neutral-400">
          <span>0%（正常化）</span>
          <span>94%（封鎖初期）</span>
        </div>
      </div>

      {/* 近傍キーイベント表示 */}
      {nearbyEvent && (
        <div
          className="flex items-start gap-2 rounded px-3 py-2.5 text-xs font-mono border-l-2"
          style={{
            backgroundColor: `${nearbyEvent.color}12`,
            borderColor: nearbyEvent.color,
          }}
        >
          <span className="shrink-0 font-bold" style={{ color: nearbyEvent.color }}>
            Day {nearbyEvent.day}
          </span>
          <div className="space-y-0.5">
            <div style={{ color: nearbyEvent.color }}>{nearbyEvent.label}</div>
            <div className="text-neutral-500 text-[10px]">{nearbyEvent.detail}</div>
          </div>
        </div>
      )}

      {/* 意思決定サポート */}
      <div
        className="rounded-lg px-3 py-2.5 border-l-2 bg-white"
        style={{ borderColor: phase.color }}
      >
        <div className="text-[10px] font-mono text-neutral-400 mb-1">
          Day {day} の見通し
        </div>
        <div className="text-sm text-[#0f172a] leading-relaxed">{phase.decision}</div>
      </div>

      {/* 時系列サマリー */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono border-t border-teal/20 pt-3">
        {KEY_EVENTS.map((ev) => {
          const isPast = day > ev.day;
          const isCurrent = Math.abs(day - ev.day) <= 3;
          return (
            <button
              key={ev.day}
              onClick={() => setDay(ev.day)}
              className="text-left space-y-0.5 rounded p-1.5 transition-colors hover:bg-teal/10"
              style={{
                opacity: isPast ? 0.5 : 1,
                outline: isCurrent ? `1px solid ${ev.color}` : "none",
              }}
            >
              <div className="font-bold" style={{ color: ev.color }}>
                Day {ev.day}
                {isPast && <span className="ml-1 text-[10px] text-neutral-400">済</span>}
              </div>
              <div className="text-neutral-500 leading-tight">{ev.label}</div>
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-neutral-400 font-mono leading-relaxed">
        ※ 停戦後も即正常化ではありません。港湾再開・タンカー回航・契約再締結に60〜90日、完全正常化に180日以上かかる見込みです。このタイムラインはシミュレーション上の推定値であり、実際の交渉・軍事情勢により前後します。
      </p>
    </div>
  );
};
