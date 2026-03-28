import { type FC, useState, useCallback, useEffect } from "react";
import { AlertBanner } from "../components/AlertBanner";

// ─── データ定義（既存と同一） ─────────────────────────

interface PrepareItem {
  category: string;
  items: { name: string; amount: string; note: string }[];
}

const PREPARE_LIST: PrepareItem[] = [
  {
    category: "水",
    items: [
      { name: "飲料水", amount: "1人あたり2L/日 × 7日分", note: "ペットボトル推奨。ローリングストック（消費しながら補充）。ベッド下・クローゼット上段も保管場所に" },
      { name: "生活用水", amount: "1人あたり10L/日 × 3日分", note: "浴槽に常時貯水。断水直後に確保。浴槽が小さい/ない場合はポリタンク(10-20L)で代替" },
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
      { name: "カセットコンロ+ボンベ", amount: "ボンベ30本以上", note: "1本=約60分。調理・暖房兼用。収納が少ない住居では最低10本から。屋内使用は換気必須" },
      { name: "ポータブル電源", amount: "500Wh以上", note: "スマホ充電・医療機器・照明に必須" },
      { name: "ソーラーパネル", amount: "100W以上", note: "停電長期化時の電源再生産手段。ベランダ設置可（南向き推奨）。設置不可の場合はモバイルバッテリー増量で代替" },
      { name: "乾電池・充電池", amount: "単3×50本、単1×20本", note: "ラジオ・懐中電灯・体温計用" },
    ],
  },
  {
    category: "情報・通信",
    items: [
      { name: "手回し・ソーラーラジオ", amount: "1台", note: "AM/FMで政府発表を受信。電源不要" },
      { name: "モバイルバッテリー", amount: "20,000mAh以上 × 2個", note: "スマホ10回分。防水モデル推奨。ソーラーパネル設置不可の場合は3個以上" },
      { name: "オフラインマップ", amount: "スマホにDL済み", note: "Google Maps等を事前DL。通信なしで使用可" },
    ],
  },
  {
    category: "医療・衛生",
    items: [
      { name: "常備薬・処方薬", amount: "90日分", note: "慢性疾患の薬は必ず多めに確保" },
      { name: "救急セット", amount: "1セット", note: "包帯・消毒・体温計・血圧計" },
      { name: "衛生用品", amount: "3ヶ月分", note: "トイレットペーパー、マスク、消毒液" },
      { name: "簡易トイレ", amount: "50回分以上", note: "断水・下水停止時に必須。保管場所が少ない場合は凝固剤+ビニール袋のコンパクトタイプを選ぶ" },
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

const VULNERABLE_CHECKLIST: Array<{ id: string; category: string; items: { name: string; note: string }[] }> = [
  {
    id: "infant",
    category: "乳幼児がいる家庭（0-2歳）",
    items: [
      { name: "液体ミルク（常温使用可）", note: "停電で煮沸できない場合に必須。7日分以上。アレルギー対応品も確認" },
      { name: "おむつ・おしりふき", note: "1日8-10枚 × 14日分。断水時はおしりふきが清拭にも使える" },
      { name: "経口補水液（乳幼児用）", note: "脱水は乳幼児に致命的。OS-1等を最低7日分" },
      { name: "離乳食・ベビーフード", note: "レトルトパウチ型は常温・開封後すぐ食べられる。7日分以上" },
      { name: "抱っこひも", note: "避難時に両手を空けるため必須。ベビーカーは瓦礫・停電エレベーターで使えない" },
    ],
  },
  {
    id: "children",
    category: "子ども・青少年のいる家庭（未就学〜高校生）",
    items: [
      { name: "経口補水液・飲料水の増量", note: "子どもは体重あたりの必要水分量が大人より多い。成長期の高校生も同様。1人あたり飲料水+1L/日を目安に" },
      { name: "常温保存おやつ・栄養補助食品", note: "偏食の子が多い。食べ慣れたもの（ビスケット・ゼリー飲料・シリアルバー等）を7日分以上。アレルギー対応品も確認" },
      { name: "アレルギー対応食の備蓄", note: "食物アレルギーがある場合、配給・炊き出しで対応食が出ない可能性大。最低14日分を別途確保" },
      { name: "学校の災害時引き渡し・連絡手順の確認", note: "学校待機か自宅待機か、引き渡し方法を事前に確認。高校生は下校判断を自分でする場合がある。連絡手段が使えない前提で家族の合流方法を決めておく" },
      { name: "通学路の安全確認・代替ルート", note: "停電で信号停止、ガソリン不足で交通量変化。徒歩・自転車での安全なルートを子どもと一緒に確認" },
      { name: "停電時の過ごし方の準備", note: "本・ボードゲーム・お絵かき・トランプ等。長期停電で「退屈」は子どもの精神を蝕む。高校生もスマホが使えないストレスは深刻" },
      { name: "年齢に応じた状況説明の準備", note: "小さな子には「怖い」を否定せず安心材料を。中高生にはSNSのデマや不確かな情報への対処法を。家族で状況を共有し「自分も役に立てる」感覚を持たせる" },
      { name: "かかりつけ医の災害時連絡先", note: "小児科（中学生まで）または内科（高校生）の災害時連絡先を紙に。夜間救急の場所も確認。お薬手帳・母子手帳のコピーを防水保管" },
      { name: "受験・進路への影響への備え", note: "高校生は受験期と重なる可能性。参考書・問題集の紙版を確保。オンライン学習が使えない前提で計画を立てる" },
    ],
  },
  {
    id: "medical",
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
    id: "dialysis",
    category: "透析患者がいる家庭",
    items: [
      { name: "透析施設の災害時対応計画", note: "通院先の災害時連絡先・代替施設リストを事前入手。猶予は3-4日" },
      { name: "低カリウム食品の備蓄", note: "透析不能時にカリウム蓄積が致命的。白米・パン・うどん等を備蓄" },
      { name: "腹膜透析への切替相談", note: "血液透析が不能になった場合の代替手段を主治医と事前に相談" },
      { name: "透析手帳・お薬手帳", note: "避難先の施設でも透析を受けるために必須。コピーを防水保管" },
    ],
  },
  {
    id: "elderly",
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
    id: "disability",
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

const ACTION_LIST: Array<{ category: string; icon: string; items: { name: string; note: string }[] }> = [
  {
    category: "情報・連絡体制",
    icon: "📡",
    items: [
      { name: "緊急連絡先リストの紙版作成", note: "かかりつけ医・透析施設・福祉避難所・地域包括支援センター・親族の番号を紙に書いて防水保管" },
      { name: "災害用伝言ダイヤル(171)の確認", note: "NTTの体験日（毎月1日・15日）に家族で練習。録音・再生の手順を確認" },
      { name: "近隣の給水拠点・配給拠点の把握", note: "自治体HPで確認し、紙の地図に記入。徒歩・自転車でのルートも確認" },
      { name: "手回しラジオの動作確認", note: "AM/FMで政府発表・NHKを受信可能か確認。電池切れでも使えるか" },
    ],
  },
  {
    category: "医療・福祉",
    icon: "🏥",
    items: [
      { name: "電力会社への医療機器使用者登録", note: "「命に関わる医療機器使用者」登録で停電時に優先復旧の対象になり得る" },
      { name: "処方薬の長期処方を主治医に依頼", note: "慢性疾患の薬を90日分処方。封鎖長期化で薬局の在庫切れに備える" },
      { name: "透析施設の災害時対応計画の入手", note: "通院先の災害時連絡先・代替施設リストを事前取得。透析の猶予は3-4日" },
      { name: "お薬手帳・透析手帳のスマホ撮影", note: "紙版に加えスマホ+クラウドにデジタルコピー。避難先の施設で必須" },
      { name: "福祉避難所の事前確認", note: "自治体に要配慮者の事前登録が可能か確認。一般避難所と場所が異なる" },
    ],
  },
  {
    category: "移動・交通",
    icon: "🚲",
    items: [
      { name: "自転車の整備・パンクレスタイヤ化", note: "ガソリン制限時の代替移動手段。阪神大震災では自転車が最重要の移動手段だった。車を持たない世帯では最重要の備え" },
      { name: "車両燃料の常時半分以上維持", note: "奇数偶数制の給油制限に備え、常時半タン以上を習慣化。車なしの場合は給水拠点への運搬用に台車・キャリーカートを準備" },
      { name: "医療施設への複数ルート把握", note: "かかりつけ病院・透析施設への自転車・徒歩ルートを事前に確認" },
      { name: "避難先の複数候補選定", note: "福祉避難所・親族宅・食料自給率の高い地域。60日超で都市退避の判断材料に" },
    ],
  },
  {
    category: "住宅・エネルギー",
    icon: "🏠",
    items: [
      { name: "太陽光パネルの自立運転モード確認", note: "既設パネルがあれば停電時に自立運転で最大1500W使用可能。切替操作を確認。賃貸・集合住宅ではポータブル電源+折りたたみソーラーパネル(ベランダ設置)が代替" },
      { name: "窓の断熱対策", note: "断熱フィルム・厚手カーテンで暖房燃料の高騰・不足に備える。100均の隙間テープも有効。高層階は風が強く体感温度が低い" },
      { name: "医療機器の消費電力リスト作成", note: "全機器のW数を記録し、ポータブル電源の持続時間を計算。FamilyMeterで試算可" },
      { name: "雨水収集の準備", note: "断水に備え簡易雨水収集（バケツ+漏斗）。生活用水として使用（飲用は煮沸必須）。集合住宅ではベランダの排水口に容器を置く方法も" },
    ],
  },
  {
    category: "コミュニティ・メンタル",
    icon: "🤝",
    items: [
      { name: "要配慮者の存在を近隣に共有", note: "民生委員・町内会長に医療機器使用者・透析患者・乳幼児の存在を事前に知らせる" },
      { name: "近隣住民との相互支援の合意", note: "声かけ・買い出し代行・情報共有。物流停止時に共助が命綱になる" },
      { name: "家族間の役割分担の事前決定", note: "危機時に「誰が何をするか」を決めておくことでパニック防止" },
      { name: "電力不要な過ごし方の確保", note: "読書・ボードゲーム・散歩等。長期危機では「することがない」が精神を蝕む" },
      { name: "重要書類の防水コピー保管", note: "保険証・マイナンバー・通帳・権利証を防水袋に。スマホ撮影+クラウドも" },
    ],
  },
];

const HOUSING_DATA = [
  {
    id: "mansion",
    type: "マンション高層階（4階以上）",
    color: "#ef4444",
    points: [
      "停電でエレベーター停止 → 高齢者・車椅子・乳幼児連れは移動不能。階段昇降の体力と水・食料の運搬手段を確保",
      "受水槽がポンプ式の場合、停電で即断水（重力式の低層階は水圧で一時的に出る場合あり）。管理組合に受水槽の方式を確認",
      "ベランダへのソーラーパネル設置は管理規約を確認。折りたたみ式なら一時使用で対応可",
      "高層階は風が強く冬季の暖房需要が大きい。窓の断熱対策を優先",
    ],
  },
  {
    id: "studio",
    type: "ワンルーム・1K（単身・少人数）",
    color: "#f59e0b",
    points: [
      "備蓄保管スペースが限られる。ベッド下・クローゼット上段・玄関棚を活用。ボンベは最低10本を目安に",
      "浴槽が小さい/シャワーのみの場合、ポリタンク(10-20L)を2-3個用意して生活用水を確保",
      "簡易トイレはコンパクトな凝固剤+ビニール袋タイプを選ぶ。保管場所を最小化",
      "単身世帯は助けを呼べる近隣関係が生命線。隣人と「声かけの約束」だけでもしておく",
    ],
  },
  {
    id: "apartment",
    type: "賃貸アパート（1-2階）",
    color: "#22c55e",
    points: [
      "低層階は停電時もエレベーター不要で移動しやすい。水圧が残りやすく断水が遅い場合も",
      "太陽光パネルの屋根設置は不可。ベランダ向き折りたたみパネルかモバイルバッテリー増量で代替",
      "庭がなくても玄関先やベランダにバケツ+漏斗で簡易雨水収集は可能",
      "賃貸は原状回復義務あり。窓断熱は剥がせるフィルム・突っ張り棒+厚手カーテンで対応",
    ],
  },
  {
    id: "nocar",
    type: "車を持たない世帯",
    color: "#94a3b8",
    points: [
      "給水拠点への水運搬にキャリーカート（耐荷重30kg以上）またはリュック型ウォーターバッグを準備",
      "大量備蓄品の購入はネット通販で事前に。普段から少しずつ積み増す「ローリングストック」が有効",
      "自転車が最重要の移動手段。パンクレスタイヤ化と空気入れの常備を",
      "配給制開始時の受取拠点への徒歩ルートを事前に確認。雨天・夜間の経路も想定",
    ],
  },
];

const PHASE_GUIDE = [
  { phase: "封鎖0〜3日", color: "#22c55e", label: "SAFE", actions: ["備蓄確認・補充", "現金引き出し", "車に満タン給油", "情報収集態勢確立", "家族の役割分担を確認", "緊急連絡先リストを紙に書き出す"] },
  { phase: "封鎖4〜14日", color: "#f59e0b", label: "WARNING", actions: ["不要不急の外出削減", "節水・節電開始", "食料消費ペース管理", "近隣コミュニティと連携・要配慮者の声かけ", "給油制限（奇数偶数制）に備え車両の燃料を満タンに", "自転車の整備・移動手段の確保"] },
  { phase: "封鎖15〜60日", color: "#ef4444", label: "CRITICAL — 配給制開始", actions: ["政府配給の受取拠点（自治体窓口・給水所）を事前確認", "燃料使用を暖房・調理のみに限定", "配給外の食料確保（家庭菜園・物々交換）", "医薬品の優先確保・処方薬の残量管理", "ゴミ収集停止に備え生ゴミの減量・密封保管（衛生対策）", "医療施設への自転車・徒歩ルートで通院", "農地・食料生産拠点に近づく判断"] },
  { phase: "封鎖60日〜", color: "#ef4444", label: "COLLAPSE — 配給縮小", actions: ["配給量の減少に備え自給体制を確立", "都市部からの退避を検討（事前選定した避難先へ）", "食料自給率の高い地域へ移動", "コミュニティ単位での生存戦略", "長期サバイバル体制へ移行"] },
];

// ─── フィルタの型定義 ─────────────────────────────

type HousingType = "mansion" | "studio" | "apartment" | "house" | "";
type FamilyTag = "infant" | "children" | "medical" | "dialysis" | "elderly" | "disability";

// ─── 折りたたみセクションコンポーネント ──────────

interface AccordionProps {
  title: string;
  forceOpen?: boolean;
  highlight?: boolean;
  color?: string;
  children: React.ReactNode;
}

const Accordion: FC<AccordionProps> = ({ title, forceOpen = false, highlight = false, color, children }) => {
  const [open, setOpen] = useState(forceOpen);
  // フィルタ適用時に親から開閉を制御
  useEffect(() => { setOpen(forceOpen); }, [forceOpen]);
  return (
    <div className="print:!block">
      <button
        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left transition-colors print:hidden ${
          highlight ? "bg-[#151c24] border" : "bg-[#151c24] border border-[#1e2a36]"
        }`}
        style={highlight && color ? { borderColor: `${color}60` } : undefined}
        onClick={() => setOpen(!open)}
      >
        <span className="font-mono text-sm tracking-wider" style={color ? { color } : { color: "#94a3b8" }}>
          {title}
        </span>
        <span className={`text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      <div className={`overflow-hidden transition-all print:!max-h-none print:!opacity-100 ${open ? "max-h-[5000px] opacity-100 mt-3" : "max-h-0 opacity-0"}`}>
        {children}
      </div>
    </div>
  );
};

// ─── メインコンポーネント ─────────────────────────

export const Prepare: FC = () => {
  const [housing, setHousing] = useState<HousingType>("");
  const [familyTags, setFamilyTags] = useState<Set<FamilyTag>>(new Set());
  const [hasCar, setHasCar] = useState<boolean | null>(null);
  const [filterApplied, setFilterApplied] = useState(false);

  const toggleFamily = useCallback((tag: FamilyTag) => {
    setFamilyTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  }, []);

  const applyFilter = () => setFilterApplied(true);
  const resetFilter = () => { setHousing(""); setFamilyTags(new Set()); setHasCar(null); setFilterApplied(false); };

  // フィルタに基づく表示判定
  const showHousing = (id: string) => {
    if (!filterApplied) return false; // フィルタ未適用時は折りたたみ
    if (id === "nocar") return hasCar === false;
    return housing === id || housing === "";
  };
  const showVulnerable = (id: string) => {
    if (!filterApplied) return false;
    return familyTags.size === 0 || familyTags.has(id as FamilyTag);
  };

  return (
    <div className="space-y-6">
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
        message="備蓄は配給や相互支援が届くまでの時間を稼ぐ手段 — わが家に足りないものを確認しよう"
      />

      {/* ── パーソナライズフィルタ ── */}
      <div className="bg-[#151c24] border border-[#f59e0b]/30 rounded-lg p-5 space-y-4 print:hidden">
        <div>
          <h2 className="font-mono text-sm tracking-wider text-[#f59e0b]">あなたの状況を選んでください</h2>
          <p className="text-[10px] text-neutral-500 mt-1">該当するセクションだけを展開表示します。選択内容はこのブラウザ内のみで処理され、サーバーへの送信は一切行いません。</p>
        </div>

        {/* 住居形態 */}
        <div className="space-y-1.5">
          <div className="text-xs text-neutral-400 font-mono">住居形態</div>
          <div className="flex flex-wrap gap-2">
            {([
              { value: "house" as HousingType, label: "一軒家" },
              { value: "mansion" as HousingType, label: "マンション高層" },
              { value: "apartment" as HousingType, label: "アパート低層" },
              { value: "studio" as HousingType, label: "ワンルーム" },
            ]).map((opt) => (
              <button
                key={opt.value}
                className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors ${
                  housing === opt.value
                    ? "bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/50"
                    : "bg-transparent text-neutral-400 border-[#1e2a36] hover:border-neutral-500"
                }`}
                onClick={() => setHousing(housing === opt.value ? "" : opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 車 */}
        <div className="space-y-1.5">
          <div className="text-xs text-neutral-400 font-mono">車</div>
          <div className="flex gap-2">
            {([
              { value: true, label: "あり" },
              { value: false, label: "なし" },
            ] as const).map((opt) => (
              <button
                key={String(opt.value)}
                className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors ${
                  hasCar === opt.value
                    ? "bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/50"
                    : "bg-transparent text-neutral-400 border-[#1e2a36] hover:border-neutral-500"
                }`}
                onClick={() => setHasCar(hasCar === opt.value ? null : opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 家族構成 */}
        <div className="space-y-1.5">
          <div className="text-xs text-neutral-400 font-mono">該当する家族（複数選択可）</div>
          <div className="flex flex-wrap gap-2">
            {([
              { value: "infant" as FamilyTag, label: "乳幼児(0-2歳)" },
              { value: "children" as FamilyTag, label: "子ども・青少年(〜高校生)" },
              { value: "medical" as FamilyTag, label: "医療機器" },
              { value: "dialysis" as FamilyTag, label: "透析" },
              { value: "elderly" as FamilyTag, label: "要介護" },
              { value: "disability" as FamilyTag, label: "障害" },
            ]).map((opt) => (
              <button
                key={opt.value}
                className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors ${
                  familyTags.has(opt.value)
                    ? "bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/50"
                    : "bg-transparent text-neutral-400 border-[#1e2a36] hover:border-neutral-500"
                }`}
                onClick={() => toggleFamily(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="px-4 py-2 rounded text-xs font-mono font-bold bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/50 hover:bg-[#f59e0b]/30 transition-colors"
            onClick={applyFilter}
          >
            この条件で表示
          </button>
          {filterApplied && (
            <button
              className="px-4 py-2 rounded text-xs font-mono text-neutral-500 border border-[#1e2a36] hover:bg-white/5 transition-colors"
              onClick={resetFilter}
            >
              リセット
            </button>
          )}
        </div>
      </div>

      {/* 印刷ボタン */}
      <button
        className="w-full py-2.5 px-4 rounded-lg text-xs font-mono font-bold bg-white/5 text-neutral-400 border border-[#1e2a36] hover:bg-white/10 transition-colors print:hidden"
        onClick={() => window.print()}
      >
        このページを印刷する（紙で配布用）
      </button>

      {/* ── フェーズ別行動指針（常に表示） ── */}
      <Accordion title="フェーズ別行動指針" forceOpen>
        <div data-screenshot="prepare-guide" className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PHASE_GUIDE.map((phase) => (
            <div key={phase.phase} className="bg-[#151c24] border rounded-lg p-4 space-y-2" style={{ borderColor: `${phase.color}40` }}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ color: phase.color, backgroundColor: `${phase.color}15`, border: `1px solid ${phase.color}40` }}>
                  {phase.label}
                </span>
                <span className="font-mono text-sm font-bold" style={{ color: phase.color }}>{phase.phase}</span>
              </div>
              <ul className="space-y-1">
                {phase.actions.map((action) => (
                  <li key={action} className="text-xs text-neutral-400 flex gap-2">
                    <span style={{ color: phase.color }}>▸</span>{action}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Accordion>

      {/* ── 備蓄チェックリスト（常に表示） ── */}
      <Accordion title="備蓄チェックリスト" forceOpen>
        <div className="space-y-4">
          {PREPARE_LIST.map((section) => (
            <div key={section.category} className="bg-[#151c24] border border-[#1e2a36] rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#1e2a36] bg-[#162029]">
                <h3 className="font-mono text-sm font-bold text-neutral-300">{section.category}</h3>
              </div>
              <div className="divide-y divide-[#162029]">
                {section.items.map((item) => (
                  <div key={item.name} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                    <div className="sm:w-40 shrink-0"><span className="text-sm font-bold text-neutral-200">{item.name}</span></div>
                    <div className="sm:w-52 shrink-0"><span className="text-xs font-mono text-[#f59e0b]">{item.amount}</span></div>
                    <div><span className="text-xs text-neutral-500">{item.note}</span></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Accordion>

      {/* ── 住居形態別（フィルタ連動） ── */}
      {HOUSING_DATA.map((h) => (
        <Accordion key={h.id} title={h.type} forceOpen={showHousing(h.id)} highlight={showHousing(h.id)} color={h.color}>
          <div className="bg-[#151c24] border rounded-lg overflow-hidden" style={{ borderColor: `${h.color}40` }}>
            <ul className="px-4 py-3 space-y-2">
              {h.points.map((point, i) => (
                <li key={i} className="text-xs text-neutral-400 leading-relaxed flex gap-2">
                  <span style={{ color: h.color }} className="shrink-0">▸</span><span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </Accordion>
      ))}

      {/* ── 要配慮者向け（フィルタ連動） ── */}
      {VULNERABLE_CHECKLIST.map((section) => (
        <Accordion
          key={section.id}
          title={section.category}
          forceOpen={showVulnerable(section.id)}
          highlight={showVulnerable(section.id)}
          color="#ef4444"
        >
          <div id={`sec-${section.id}`} className="bg-[#151c24] border border-[#ef444440] rounded-lg overflow-hidden scroll-mt-20">
            <div className="divide-y divide-[#162029]">
              {section.items.map((item) => (
                <div key={item.name} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                  <div className="sm:w-48 shrink-0"><span className="text-sm font-bold text-neutral-200">{item.name}</span></div>
                  <div><span className="text-xs text-neutral-400">{item.note}</span></div>
                </div>
              ))}
            </div>
          </div>
        </Accordion>
      ))}

      {/* ── 行動チェックリスト（折りたたみ） ── */}
      <Accordion title="今日からできる行動チェックリスト">
        <p className="text-xs text-neutral-500 mb-3">物資の備蓄だけでは生き残れない。情報・連絡体制・移動手段・コミュニティが生死を分ける。</p>
        <div className="space-y-4">
          {ACTION_LIST.map((section) => (
            <div key={section.category} className="bg-[#151c24] border border-[#3b82f640] rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#3b82f620] bg-[#101820]">
                <h3 className="font-mono text-sm font-bold text-blue-300">
                  <span className="mr-1.5">{section.icon}</span>{section.category}
                </h3>
              </div>
              <div className="divide-y divide-[#162029]">
                {section.items.map((item) => (
                  <div key={item.name} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                    <div className="sm:w-56 shrink-0"><span className="text-sm font-bold text-neutral-200">{item.name}</span></div>
                    <div><span className="text-xs text-neutral-400">{item.note}</span></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Accordion>

      <p className="text-xs text-neutral-600 font-mono text-center">
        備蓄は自給自足のためではなく、配給や相互支援が届くまでの橋渡し。物資だけでなく、情報・つながり・行動力を備えよう。
      </p>
    </div>
  );
};
