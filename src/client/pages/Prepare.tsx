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

const VULNERABLE_CHECKLIST: Array<{ category: string; items: { name: string; note: string }[] }> = [
  {
    category: "乳幼児がいる家庭",
    items: [
      { name: "液体ミルク（常温使用可）", note: "停電で煮沸できない場合に必須。7日分以上。アレルギー対応品も確認" },
      { name: "おむつ・おしりふき", note: "1日8-10枚 × 14日分。断水時はおしりふきが清拭にも使える" },
      { name: "経口補水液（乳幼児用）", note: "脱水は乳幼児に致命的。OS-1等を最低7日分" },
      { name: "離乳食・ベビーフード", note: "レトルトパウチ型は常温・開封後すぐ食べられる。7日分以上" },
      { name: "抱っこひも", note: "避難時に両手を空けるため必須。ベビーカーは瓦礫・停電エレベーターで使えない" },
    ],
  },
  {
    category: "医療機器を使用している家族",
    items: [
      { name: "ポータブル電源（1000Wh以上）", note: "在宅人工呼吸器の内部バッテリーは3-8時間。外部電源が生死を分ける" },
      { name: "電力会社への事前登録", note: "「命に関わる医療機器使用者」登録で停電時に優先復旧の対象になる場合がある" },
      { name: "近隣病院の非常用電源の確認", note: "自家発電のある病院を複数把握。燃料は通常3日分しかない点にも注意" },
      { name: "福祉避難所の場所の確認", note: "自治体の福祉避難所は一般避難所と異なる。事前に場所と受入条件を確認" },
      { name: "医療機器の消費電力メモ", note: "機器のW数を記録し、ポータブル電源の持続時間を計算しておく" },
    ],
  },
  {
    category: "透析患者がいる家庭",
    items: [
      { name: "透析施設の災害時対応計画", note: "通院先の災害時連絡先・代替施設リストを事前入手。猶予は3-4日" },
      { name: "低カリウム食品の備蓄", note: "透析不能時にカリウム蓄積が致命的。白米・パン・うどん等を備蓄" },
      { name: "腹膜透析への切替相談", note: "血液透析が不能になった場合の代替手段を主治医と事前に相談" },
      { name: "透析手帳・お薬手帳", note: "避難先の施設でも透析を受けるために必須。コピーを防水保管" },
    ],
  },
  {
    category: "要介護高齢者がいる家庭",
    items: [
      { name: "処方薬90日分", note: "慢性疾患の薬は主治医に依頼して多めに確保。薬局の在庫切れに備える" },
      { name: "介護用品の予備", note: "大人用おむつ・吸引器消耗品・経管栄養剤等。14日分以上" },
      { name: "地域包括支援センターの連絡先", note: "ケアマネージャーと災害時の対応を事前に協議" },
      { name: "電動機器のバッテリー対策", note: "電動ベッド・電動車椅子・吸引器の消費Whを把握し電源を確保" },
      { name: "移動手段の確保", note: "ガソリン車は給油制限に備え常時満タン。車椅子移動のルート確認" },
    ],
  },
  {
    category: "障害のある家族",
    items: [
      { name: "ヘルプマーク・障害者手帳のコピー", note: "避難所で合理的配慮を受けるために必要。防水袋に保管" },
      { name: "感覚過敏対策グッズ", note: "耳栓・アイマスク・安心できる毛布等。避難所の騒音・光対策" },
      { name: "コミュニケーションボード", note: "言語障害がある場合、避難所で意思疎通するための絵カード等" },
      { name: "常用薬・発作時頓服薬", note: "てんかん・精神障害等の薬は中断で重篤化。90日分確保" },
      { name: "避難所以外の選択肢の把握", note: "福祉避難所・グループホーム・知人宅等、障害特性に合った避難先" },
    ],
  },
];

const PHASE_GUIDE = [
  {
    phase: "封鎖0〜3日",
    color: "#22c55e",
    label: "SAFE",
    actions: ["備蓄確認・補充", "現金引き出し", "車に満タン給油", "情報収集態勢確立"],
  },
  {
    phase: "封鎖4〜14日",
    color: "#f59e0b",
    label: "WARNING",
    actions: ["不要不急の外出削減", "節水・節電開始", "食料消費ペース管理", "近隣コミュニティと連携", "給油制限（奇数偶数制）に備え車両の燃料を満タンに"],
  },
  {
    phase: "封鎖15〜60日",
    color: "#ef4444",
    label: "CRITICAL — 配給制開始",
    actions: ["政府配給の受取拠点（自治体窓口・給水所）を事前確認", "燃料使用を暖房・調理のみに限定", "配給外の食料確保（家庭菜園・物々交換）", "医薬品の優先確保", "農地・食料生産拠点に近づく判断"],
  },
  {
    phase: "封鎖60日〜",
    color: "#ef4444",
    label: "COLLAPSE — 配給縮小",
    actions: ["配給量の減少に備え自給体制を確立", "都市部からの退避を検討", "食料自給率の高い地域へ移動", "コミュニティ単位での生存戦略", "長期サバイバル体制へ移行"],
  },
];

export const Prepare: FC = () => {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-[#22c55e]">SURVIVAL</span> GUIDE
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
              className="bg-[#151c24] border rounded-lg p-4 space-y-2"
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
            <div key={section.category} className="bg-[#151c24] border border-[#1e2a36] rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#1e2a36] bg-[#162029]">
                <h3 className="font-mono text-sm font-bold text-neutral-300">{section.category}</h3>
              </div>
              <div className="divide-y divide-[#162029]">
                {section.items.map((item) => (
                  <div key={item.name} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                    <div className="sm:w-40 shrink-0">
                      <span className="text-sm font-bold text-neutral-200">{item.name}</span>
                    </div>
                    <div className="sm:w-52 shrink-0">
                      <span className="text-xs font-mono text-[#f59e0b]">{item.amount}</span>
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

      {/* 要配慮者向け追加備蓄 */}
      <div className="space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">要配慮者がいる家庭の追加備蓄</h2>
        <div className="space-y-4">
          {VULNERABLE_CHECKLIST.map((section) => (
            <div key={section.category} className="bg-[#151c24] border border-[#ef444440] rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#ef444420] bg-[#1a1015]">
                <h3 className="font-mono text-sm font-bold text-red-300">{section.category}</h3>
              </div>
              <div className="divide-y divide-[#162029]">
                {section.items.map((item) => (
                  <div key={item.name} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                    <div className="sm:w-48 shrink-0">
                      <span className="text-sm font-bold text-neutral-200">{item.name}</span>
                    </div>
                    <div>
                      <span className="text-xs text-neutral-400">{item.note}</span>
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
