import { type FC } from "react";
import { AlertBanner } from "../components/AlertBanner";

interface PrepareItem {
  category: string;
  items: { name: string; amount: string; note: string }[];
}

const PREPARE_LIST: PrepareItem[] = [
  {
    category: "水",
    items: [
      { name: "飲料水", amount: "1人あたり2L/日 × 7日分", note: "ペットボトル推奨。ローリングストック（消費しながら補充）" },
      { name: "生活用水", amount: "1人あたり10L/日 × 3日分", note: "浴槽に常時貯水。断水直後に確保" },
    ],
  },
  {
    category: "食料",
    items: [
      { name: "米", amount: "1人あたり150g/日 × 14日分", note: "真空パック・缶詰米が長期保存向き" },
      { name: "缶詰・レトルト", amount: "1人あたり3食/日 × 7日分", note: "缶切り不要プルタブ缶を選ぶ" },
      { name: "乾麺・インスタント", amount: "7日分", note: "調理に水が少ないものを優先" },
      { name: "塩・砂糖・調味料", amount: "各1kg以上", note: "エネルギー確保と保存食の味付け" },
      { name: "栄養補助食品", amount: "14日分", note: "ビタミン剤、プロテインバー等。偏食対策" },
    ],
  },
  {
    category: "エネルギー",
    items: [
      { name: "カセットコンロ+ボンベ", amount: "ボンベ30本以上", note: "1本=約60分。調理・暖房兼用。大型推奨" },
      { name: "ポータブル電源", amount: "500Wh以上", note: "スマホ充電・医療機器・照明に必須" },
      { name: "ソーラーパネル", amount: "100W以上", note: "停電長期化時の電源再生産手段" },
      { name: "乾電池・充電池", amount: "単3×50本、単1×20本", note: "ラジオ・懐中電灯・体温計用" },
    ],
  },
  {
    category: "情報・通信",
    items: [
      { name: "手回し・ソーラーラジオ", amount: "1台", note: "AM/FMで政府発表を受信。電源不要" },
      { name: "モバイルバッテリー", amount: "20,000mAh以上 × 2個", note: "スマホ10回分。防水モデル推奨" },
      { name: "オフラインマップ", amount: "スマホにDL済み", note: "Google Maps等を事前DL。通信なしで使用可" },
    ],
  },
  {
    category: "医療・衛生",
    items: [
      { name: "常備薬・処方薬", amount: "90日分", note: "慢性疾患の薬は必ず多めに確保" },
      { name: "救急セット", amount: "1セット", note: "包帯・消毒・体温計・血圧計" },
      { name: "衛生用品", amount: "3ヶ月分", note: "トイレットペーパー、マスク、消毒液" },
      { name: "簡易トイレ", amount: "50回分以上", note: "断水・下水停止時に必須" },
    ],
  },
  {
    category: "現金・重要書類",
    items: [
      { name: "現金", amount: "10万円以上（小銭含む）", note: "電子決済停止に備え。100円玉多め" },
      { name: "重要書類コピー", amount: "防水袋に保管", note: "保険証・通帳・権利証・マイナンバーカード" },
    ],
  },
];

const PHASE_GUIDE = [
  {
    phase: "封鎖0〜3日",
    color: "#00e676",
    label: "SAFE",
    actions: ["備蓄確認・補充", "現金引き出し", "車に満タン給油", "情報収集態勢確立"],
  },
  {
    phase: "封鎖4〜14日",
    color: "#ff9100",
    label: "WARNING",
    actions: ["不要不急の外出削減", "節水・節電開始", "食料消費ペース管理", "近隣コミュニティと連携"],
  },
  {
    phase: "封鎖15〜60日",
    color: "#ff5252",
    label: "CRITICAL",
    actions: ["燃料使用を暖房・調理のみに限定", "物々交換ネットワーク形成", "農地・食料生産拠点に近づく判断", "医薬品の優先確保"],
  },
  {
    phase: "封鎖60日〜",
    color: "#ff1744",
    label: "COLLAPSE",
    actions: ["都市部からの退避を検討", "食料自給率の高い地域へ移動", "コミュニティ単位での生存戦略", "長期サバイバル体制へ移行"],
  },
];

export const Prepare: FC = () => {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-[#00e676]">SURVIVAL</span> GUIDE
        </h1>
        <p className="text-neutral-500 text-sm">
          ホルムズ海峡封鎖シナリオに備えるための備蓄・行動ガイド
        </p>
      </div>

      <AlertBanner
        level="warning"
        message="正常性バイアスを捨てろ — 備えた者だけが選択肢を持つ"
      />

      {/* フェーズ別行動指針 */}
      <div className="space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">フェーズ別行動指針</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PHASE_GUIDE.map((phase) => (
            <div
              key={phase.phase}
              className="bg-[#141414] border rounded-lg p-4 space-y-2"
              style={{ borderColor: `${phase.color}40` }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="font-mono text-xs font-bold px-2 py-0.5 rounded"
                  style={{ color: phase.color, backgroundColor: `${phase.color}15`, border: `1px solid ${phase.color}40` }}
                >
                  {phase.label}
                </span>
                <span className="font-mono text-sm font-bold" style={{ color: phase.color }}>
                  {phase.phase}
                </span>
              </div>
              <ul className="space-y-1">
                {phase.actions.map((action) => (
                  <li key={action} className="text-xs text-neutral-400 flex gap-2">
                    <span style={{ color: phase.color }}>▸</span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* 備蓄リスト */}
      <div className="space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">備蓄チェックリスト</h2>
        <div className="space-y-4">
          {PREPARE_LIST.map((section) => (
            <div key={section.category} className="bg-[#141414] border border-[#2a2a2a] rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#2a2a2a] bg-[#1a1a1a]">
                <h3 className="font-mono text-sm font-bold text-neutral-300">{section.category}</h3>
              </div>
              <div className="divide-y divide-[#1a1a1a]">
                {section.items.map((item) => (
                  <div key={item.name} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                    <div className="sm:w-40 shrink-0">
                      <span className="text-sm font-bold text-neutral-200">{item.name}</span>
                    </div>
                    <div className="sm:w-52 shrink-0">
                      <span className="text-xs font-mono text-[#ff9100]">{item.amount}</span>
                    </div>
                    <div>
                      <span className="text-xs text-neutral-500">{item.note}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-neutral-600 font-mono text-center">
        備蓄は「もしも」のためではなく「いつか必ず来る」ための投資です
      </p>
    </div>
  );
};
