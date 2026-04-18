import { type FC } from "react";
import { SectionHeading } from "./SectionHeading";
import { Badge } from "./Badge";

interface Anomaly {
  item: string;
  yoy: string;
  date: string;
  source: string;
  action: string;
}

const ANOMALIES: Anomaly[] = [
  {
    item: "潤滑油（3月出荷量）",
    yoy: "+約30%",
    date: "2026-04-17",
    source: "経済産業省 調査・要請発表",
    action: "元売・潤滑油事業者へ「前年同月比同量を基本」供給要請。供給先行き不安による中間流通層の買い増しが目詰まりを生んだ構図",
  },
  {
    item: "ニトリルグローブ（歯科卸）",
    yoy: "出荷制限",
    date: "2026-03-11",
    source: "中野デンタルサプライ",
    action: "パニック注文殺到。在庫は未枯渇だが公平供給のため制限（最大6カートン）。原料不足ではなく需要急増が直接トリガー",
  },
  {
    item: "シェル系潤滑油",
    yoy: "供給停止",
    date: "2026-04-17",
    source: "SNS・業界観測",
    action: "シェル品が全停止との現場報告。系列別偏在が顕在化。経産省が系列を問わない安定供給要請に連動",
  },
];

/**
 * 需要異常値シグナル — 前年同月比で大きく乖離した品目と政府の対応を並置。
 *
 * ブルウィップ効果（supply先行き不安→発注増幅→中間流通の目詰まり）を
 * 可視化し、SAO の「煽らない設計」を裏付ける。
 * Phase 22 で `demandAnomalies.json` に分離予定。
 */
export const DemandAnomalyBadge: FC = () => {
  return (
    <div className="bg-panel border border-warning-soft/30 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
        <SectionHeading as="h2" tone="warning" size="sm" tracking="wider" className="shrink-0">
          需要異常値シグナル — BULLWHIP INDICATOR
        </SectionHeading>
        <Badge tone="warning" className="shrink-0">YoY ANOMALY</Badge>
      </div>

      <div className="px-4 py-3 text-xs text-text-muted leading-relaxed border-b border-border">
        <p>
          需要急増（前年同月比）と政府の流通偏在対応を並置する指標。
          <span className="text-text font-bold">「量はあるが流通が詰まる」</span>
          状況は、供給先行き不安による中間流通層での買い増し（ブルウィップ効果）が主因。
          確認フレームで対応することで買い占めを抑制できる。
        </p>
      </div>

      <div className="divide-y divide-border">
        {ANOMALIES.map((a) => (
          <div key={`${a.item}-${a.date}`} className="px-4 py-3 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-text">{a.item}</span>
              <Badge tone="warning">{a.yoy}</Badge>
              <span className="text-[10px] font-mono text-text-muted ml-auto">{a.date}</span>
            </div>
            <div className="text-xs text-text-muted leading-relaxed">{a.action}</div>
            <div className="text-[10px] text-text-muted/70 font-mono">出典: {a.source}</div>
          </div>
        ))}
      </div>

      <div className="px-4 py-2.5 bg-panel border-t border-border">
        <p className="text-[11px] text-text-muted leading-relaxed">
          買い占めは最も脆弱な人（乳幼児・透析・在宅医療・要介護）から物資を奪う。
          確認フレームは過不足を明確にし、パニック注文を抑制する。
        </p>
      </div>
    </div>
  );
};
