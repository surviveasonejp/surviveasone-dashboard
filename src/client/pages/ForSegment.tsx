import { type FC } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { AlertBanner } from "../components/AlertBanner";

interface ExternalLink {
  label: string;
  href: string;
}

interface Segment {
  id: string;
  title: string;
  subtitle: string;
  heroStat: string;
  heroUnit: string;
  heroLabel: string;
  heroColor: string;
  alertMessage: string;
  risks: { label: string; days: string; detail: string }[];
  actions: string[];
  officialLinks: ExternalLink[];
  familyMeterPrompt: string;
  prepareAnchor: string;
  metaDescription: string;
  /** CTAの種類: family=FamilyMeter, dashboard=Dashboard, docs=ApiDocs */
  ctaType?: "family" | "dashboard" | "docs";
  /** primaryCTAのリンク先 */
  ctaLink?: string;
  ctaLabel?: string;
  ctaTag?: string;
}

const SEGMENTS: Record<string, Segment> = {
  parents: {
    id: "parents",
    title: "子育て家庭の方へ",
    subtitle: "乳幼児・子ども・高校生までのお子さんがいるご家庭",
    heroStat: "3",
    heroUnit: "日",
    heroLabel: "液体ミルクの店頭在庫（現実シナリオ）",
    heroColor: "#ef4444",
    alertMessage: "日本人の5人に1人がインフラ停止時に特別な備えが必要な家庭に該当します。子育て世帯はその中核です。",
    risks: [
      { label: "液体ミルク", days: "3日", detail: "冷蔵チェーン停止+物流制限により店頭への補充が停止する見込み（シナリオに基づく推定）" },
      { label: "おむつ", days: "7-14日", detail: "石化製品（PE/PP）依存。エチレン減産開始で供給制約" },
      { label: "離乳食", days: "3-5日", detail: "レトルトパウチ型は常温で使用可能だが、物流停止で補充不可" },
      { label: "経口補水液", days: "5-7日", detail: "乳幼児の脱水は急速に致命的。体重あたりの必要水分量が大人より多い" },
      { label: "水道", days: "停電+1日", detail: "配水池の重力式貯留(1-3日分)枯渇後、広域断水" },
    ],
    actions: [
      "【乳幼児】液体ミルク7日分+おむつ14日分+経口補水液7日分が足りているか確認",
      "【全年齢】経口補水液・飲料水を大人より多めに確認（成長期は必要水分量が多い）",
      "【全年齢】アレルギー対応食・食べ慣れたおやつ14日分の過不足を確認（配給では対応されない可能性）",
      "学校の災害時引き渡し手順と家族の合流方法を確認。高校生は自己判断の場面も想定",
      "かかりつけ医の災害時連絡先を紙に。SNSデマへの対処法を中高生と共有",
    ],
    officialLinks: [
      { label: "農林水産省｜災害時に備えた食品ストックガイド", href: "https://www.maff.go.jp/j/zyukyu/foodstock/guidebook.html" },
      { label: "厚労省｜妊産婦・乳幼児向け避難所支援マニュアル", href: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000122611.html" },
    ],
    familyMeterPrompt: "あなたの家庭は何日持ちこたえられる？ 備蓄量を入力して生存ランクを確認",
    prepareAnchor: "sec-infant",
    metaDescription: "供給危機シナリオで液体ミルクの店頭在庫は約3日分。子育て家庭がエネルギー供給リスクで受ける影響と、わが家に足りないものの確認チェックリスト。",
  },
  dialysis: {
    id: "dialysis",
    title: "透析患者のご家族へ",
    subtitle: "血液透析・腹膜透析を受けている方がいるご家庭",
    heroStat: "3-4",
    heroUnit: "日",
    heroLabel: "透析を受けられない場合の猶予",
    heroColor: "#ef4444",
    alertMessage: "日本の透析患者は約34.7万人。停電+断水で透析施設が稼働停止するシナリオでは、猶予は3-4日です。",
    risks: [
      { label: "血液透析", days: "3-4日", detail: "電力と大量の水（1回約120L）が必要。停電で即座に影響" },
      { label: "カリウム蓄積", days: "2-3日", detail: "透析不能でカリウムが蓄積→心停止リスク。低カリウム食品の備蓄が不可欠" },
      { label: "水道", days: "停電+1日", detail: "配水池枯渇後は透析施設も断水。施設の自家発電は通常3日分" },
      { label: "処方薬", days: "数日", detail: "透析関連の薬は薬局の在庫も限られる。90日分の確保を推奨" },
      { label: "移動手段", days: "給油制限開始", detail: "ガソリン奇数偶数制で通院困難に。自転車ルートの確認を" },
    ],
    actions: [
      "透析施設の災害時対応計画を確認（代替施設リスト・連絡先）",
      "低カリウム食品を14日分備蓄（白米・パン・うどん）",
      "腹膜透析への一時切替が可能か主治医と相談",
      "透析手帳・お薬手帳のコピーを防水保管+スマホ撮影",
      "透析施設への自転車ルートを確認（ガソリン制限に備え）",
    ],
    officialLinks: [
      { label: "日本透析医学会｜災害に対する備え（患者向け資料）", href: "https://www.jsdt.or.jp/public/2120.html" },
      { label: "全国腎臓病協議会｜災害対策マニュアル", href: "https://www.zjk.or.jp/kidney-disease/disaster/" },
    ],
    familyMeterPrompt: "ポータブル電源・水の備蓄量を入力して、あなたの家庭の生存日数を確認",
    prepareAnchor: "sec-dialysis",
    metaDescription: "供給危機シナリオで透析の猶予は3-4日。停電・断水時の影響と、家族が確認すべき備えのチェックリスト。",
  },
  policy: {
    id: "policy",
    title: "政策立案者・行政担当者の方へ",
    subtitle: "エネルギー安全保障・危機管理・防災行政に携わる方",
    heroStat: "241",
    heroUnit: "日",
    heroLabel: "現在の石油備蓄（国家+民間+産油国共同、2026年3月経産省推計）",
    heroColor: "#2563eb",
    alertMessage: "政策介入の効果はシナリオにより大きく異なります。SPR早期放出・IEA協調・配給制の組み合わせが鍵です。",
    risks: [
      { label: "SPR放出リードタイム", days: "14日", detail: "国家備蓄は放出決定から実際の供給まで約14日のリードタイムが必要（輸送・精製工程）" },
      { label: "IEA協調発動", days: "Day 10実績", detail: "2026年3月11日、IEA加盟国が協調備蓄放出を発動。石油枯渇を平均18日延命" },
      { label: "配給制移行閾値", days: "在庫30%", detail: "在庫30%以下で奇数偶数制、10%以下で政府管理配給制へ移行するモデル値" },
      { label: "LNG緊急調達", days: "Day 21〜", detail: "非ホルムズルート（豪州・米国）からのスポット調達。7日分相当を追加できる見込み" },
      { label: "代替原油互換性", days: "精製能力依存", detail: "米国ガルフ/西アフリカ産は硫黄分・API度が異なる。既存精製設備では100%代替にならない" },
    ],
    actions: [
      "SPR放出の事前決定と放出量シナリオを確認（/api/simulation で感度分析可能）",
      "IEA協調放出のトリガー条件と自国分担量を確認（/methodology でモデル仕様を公開）",
      "配給制移行の法的根拠・発動手順を再確認（石油需給適正化法・電力広域的運営推進機関）",
      "要配慮者（透析・在宅医療機器・乳幼児）への優先供給ルートを設計",
      "地域別脆弱性（沖縄・北海道・離島）に対する先行的な政策支援を検討",
    ],
    officialLinks: [
      { label: "経産省｜石油備蓄の現況（月次推計）", href: "https://www.meti.go.jp/statistics/tyo/sekiyuneed/index.html" },
      { label: "IEA｜Emergency Response（英語）", href: "https://www.iea.org/topics/emergency-response" },
      { label: "OCCTO｜電力広域的運営推進機関（需給調整）", href: "https://www.occto.or.jp/" },
      { label: "SAO API仕様書 → /api-docs", href: "/api-docs" },
    ],
    familyMeterPrompt: "Dashboardでシナリオ切替・政策介入効果を確認する",
    prepareAnchor: "methodology",
    metaDescription: "ホルムズ封鎖シナリオにおけるSPR放出・IEA協調・配給制の政策介入効果を16式シミュレーションで定量化。政策立案者向けのデータ・API・モデル仕様を公開。",
    ctaType: "dashboard",
    ctaLink: "/dashboard",
    ctaLabel: "政策介入効果比較 → Dashboard",
    ctaTag: "POLICY SIMULATION",
  },
  media: {
    id: "media",
    title: "メディア・報道関係者の方へ",
    subtitle: "報道・取材・コンテンツ制作に携わる方",
    heroStat: "16",
    heroUnit: "式",
    heroLabel: "シミュレーションモデル数（3シナリオ・全データ公開）",
    heroColor: "#8b5cf6",
    alertMessage: "全データ・シミュレーション結果・ソースコードはAGPL-3.0で公開しています。引用・報道に自由にご利用ください。",
    risks: [
      { label: "引用推奨表記", days: "—", detail: "「SAO – Situation Awareness Observatory（surviveasonejp.org）によるシミュレーション」" },
      { label: "データの性質", days: "シミュレーション", detail: "公開データに基づく定量モデル。実際の政策決定・備蓄放出等により大幅に変動します" },
      { label: "API利用", days: "無料", detail: "surviveasonejp.net/api/* — JSON形式、認証不要。商用利用はAGPL-3.0条件に従う" },
      { label: "モデル検証状況", days: "検証中", detail: "/api/validation で発生後の精度検証結果を公開。予測と実績の差分を追跡しています" },
      { label: "一次ソース", days: "全20項目", detail: "経産省・IEA・ISEP・JETRO等の公開データのみを使用。/methodology で出典を明示" },
    ],
    actions: [
      "数値の引用前に必ずシナリオ条件を確認（楽観/現実/悲観で大きく異なる）",
      "/api/validation で最新の精度検証結果を確認",
      "CITATION.cff（GitHubリポジトリ）を学術引用形式として利用可能",
      "API利用・データ可視化への組み込みは surviveasonejp.org/api-docs を参照",
      "取材・連携のご相談は GitHub Issues または X @surviveasonejp へ",
    ],
    officialLinks: [
      { label: "SAO Methodology — モデル仕様・一次ソース一覧", href: "/methodology" },
      { label: "API仕様書 — 全エンドポイント", href: "/api-docs" },
      { label: "GitHub — AGPL-3.0公開リポジトリ", href: "https://github.com/surviveasonejp/surviveasone-dashboard" },
      { label: "精度検証 API — /api/validation", href: "https://surviveasonejp.net/api/validation" },
    ],
    familyMeterPrompt: "シミュレーション仕様書（Methodology）でモデルの詳細を確認する",
    prepareAnchor: "methodology",
    metaDescription: "SAO（Situation Awareness Observatory）のデータ・APIを報道・取材・研究でご利用いただけます。全16式のシミュレーションモデルと出典をAGPL-3.0で公開。",
    ctaType: "docs",
    ctaLink: "/methodology",
    ctaLabel: "Methodology — モデル仕様・出典一覧",
    ctaTag: "DATA & SOURCES",
  },
  research: {
    id: "research",
    title: "研究者・シンクタンクの方へ",
    subtitle: "エネルギー安全保障・防災・政策研究・経済分析に携わる方",
    heroStat: "20",
    heroUnit: "項目",
    heroLabel: "一次ソース数（全て公開データ・APIで取得可能）",
    heroColor: "#0891b2",
    alertMessage: "モデル・データ・ソースコードはすべてAGPL-3.0で公開。研究・教育目的での改変・再配布を歓迎します。",
    risks: [
      { label: "モデルの限界", days: "—", detail: "単一国家・石油中心モデル。グローバルな供給代替・金融市場フィードバックは未実装" },
      { label: "需要破壊モデル", days: "価格媒介型", detail: "WTI実測値→ガソリン価格→需要削減率のフィードバックループ。弾力性は1973年ショック実績に基づく" },
      { label: "精製互換性", days: "実装済み", detail: "非中東原油のAPI度・硫黄分差異によるペナルティ係数をモデル化。SensitivityChartで確認可能" },
      { label: "データパイプライン", days: "自動更新", detail: "EIA WTI日次・経産省備蓄月次・AIS 1日2回・OCCTO電力日次を自動取得" },
      { label: "再現性", days: "AGPL-3.0", detail: "GitHubで全計算ロジックを公開。Cloudflare Workers環境でのセルフホストが可能" },
    ],
    actions: [
      "GitHubリポジトリでシミュレーションコード（flowSimulation.ts）を確認",
      "/methodology でモデル設計・弾力性仮定・出典を確認",
      "API（/api/simulation?scenario=realistic）でシミュレーション結果をJSON取得",
      "CITATION.cffで学術引用形式を確認（GitHub Actions でDOI発行予定）",
      "改善提案・モデル議論はGitHub Issuesで歓迎（特に精製互換性・代替原油モデル）",
    ],
    officialLinks: [
      { label: "GitHub — 全ソースコード（AGPL-3.0）", href: "https://github.com/surviveasonejp/surviveasone-dashboard" },
      { label: "Methodology — モデル設計・弾力性仮定・出典", href: "/methodology" },
      { label: "API — /api/simulation（JSONシミュレーション結果）", href: "https://surviveasonejp.net/api/simulation?scenario=realistic" },
      { label: "API — /api/validation（精度検証・予測vs実績）", href: "https://surviveasonejp.net/api/validation" },
    ],
    familyMeterPrompt: "API仕様書でデータ取得方法を確認する",
    prepareAnchor: "methodology",
    metaDescription: "日本のエネルギー安全保障シミュレーション。16式モデル・全ソースコード・自動更新データパイプラインをAGPL-3.0で公開。研究・教育・政策分析に自由にご利用ください。",
    ctaType: "docs",
    ctaLink: "/api-docs",
    ctaLabel: "API仕様書 → /api-docs",
    ctaTag: "OPEN DATA & CODE",
  },
  elderly: {
    id: "elderly",
    title: "介護・医療機器をお使いのご家族へ",
    subtitle: "要介護高齢者・在宅医療機器利用者・障害のある家族がいるご家庭",
    heroStat: "8",
    heroUnit: "時間",
    heroLabel: "人工呼吸器の内部バッテリー限界",
    heroColor: "#ef4444",
    alertMessage: "在宅人工呼吸器の内部バッテリーは3-8時間。停電時にはポータブル電源の備えが重要です。",
    risks: [
      { label: "人工呼吸器", days: "3-8時間", detail: "内部バッテリーのみ。1000Wh以上のポータブル電源が生死を分ける" },
      { label: "電動ベッド・吸引器", days: "停電即時", detail: "体位変換不能→褥瘡悪化。吸引不能→窒息リスク" },
      { label: "処方薬", days: "数日-数週間", detail: "慢性疾患の薬は薬局在庫切れで入手困難に。90日分確保を" },
      { label: "介護用品", days: "7-14日", detail: "大人用おむつ・経管栄養剤は石化製品依存" },
      { label: "冷蔵が必要な薬", days: "停電24時間", detail: "インスリン等は室温保管可能時間に限りがある" },
    ],
    actions: [
      "ポータブル電源1000Wh以上を確保（人工呼吸器・吸引器用）",
      "電力会社に「命に関わる医療機器使用者」登録（優先復旧対象）",
      "全医療機器の消費電力(W数)を記録→ポータブル電源の持続時間を計算",
      "処方薬90日分を主治医に依頼",
      "福祉避難所の場所・受入条件を自治体に事前確認",
    ],
    officialLinks: [
      { label: "厚労省｜在宅医療の推進（災害時対応含む）", href: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000061944.html" },
      { label: "国土交通省｜要配慮者利用施設の避難確保計画 作成の手引き（PDF）", href: "https://www.mlit.go.jp/river/bousai/main/saigai/jouhou/jieisuibou/pdf/tebiki.pdf" },
    ],
    familyMeterPrompt: "医療機器の電力消費を考慮して、あなたの家庭の生存日数を確認",
    prepareAnchor: "sec-medical",
    metaDescription: "供給危機シナリオで人工呼吸器は停電8時間が限界。在宅医療・介護・障害のある家族を守るための備えの確認チェックリスト。",
  },
};

export const ForSegment: FC = () => {
  const { segment } = useParams<{ segment: string }>();
  const seg = segment ? SEGMENTS[segment] : undefined;

  if (!seg) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* ヒーロー */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span style={{ color: seg.heroColor }}>{seg.title}</span>
        </h1>
        <p className="text-neutral-500 text-sm">{seg.subtitle}</p>
      </div>

      <AlertBanner level="warning" message={seg.alertMessage} />

      {/* 危機の数字 */}
      <div className="bg-panel border border-[#ef4444]/30 rounded-lg p-6 text-center space-y-1">
        <div className="font-mono text-4xl font-bold" style={{ color: seg.heroColor }}>
          {seg.heroStat}<span className="text-lg ml-1">{seg.heroUnit}</span>
        </div>
        <div className="text-sm text-neutral-400">{seg.heroLabel}</div>
        <div className="text-[10px] text-neutral-600">シミュレーション上の推定値です。備蓄放出・代替供給・医療施設の優先供給により変動します</div>
      </div>

      {/* 崩壊タイムライン */}
      <div className="space-y-2">
        <h2 className="font-mono text-xs tracking-wider text-neutral-400">あなたの家庭に起きること</h2>
        <div className="space-y-2">
          {seg.risks.map((risk) => (
            <div key={risk.label} className="bg-panel border border-border rounded-lg px-4 py-3 flex gap-4">
              <div className="shrink-0 w-20">
                <div className="font-mono text-sm font-bold text-[#ef4444]">{risk.days}</div>
                <div className="text-[10px] text-neutral-500">{risk.label}</div>
              </div>
              <div className="text-xs text-neutral-400 leading-relaxed">{risk.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 今すぐやるべきこと */}
      <div className="bg-panel border border-[#22c55e]/30 rounded-lg p-5 space-y-3">
        <h2 className="font-mono text-xs tracking-wider text-[#22c55e]">優先して確認すべき5つのこと</h2>
        <ol className="space-y-2">
          {seg.actions.map((action, i) => (
            <li key={i} className="flex gap-3 text-sm text-neutral-300">
              <span className="font-mono text-[#22c55e] font-bold shrink-0">{i + 1}.</span>
              <span>{action}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* 公的支援・情報源 */}
      <div className="bg-[#0c1018] border border-border rounded-lg p-4 space-y-2">
        <h2 className="font-mono text-xs tracking-wider text-neutral-500">公的支援・情報源</h2>
        <ul className="space-y-1.5">
          {seg.officialLinks.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#3b82f6] hover:text-[#60a5fa] underline underline-offset-2 transition-colors"
              >
                {link.label} &rarr;
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* プライマリCTA */}
      {seg.ctaType && seg.ctaLink ? (
        <Link
          to={seg.ctaLink}
          className="block bg-panel border border-[#2563eb]/40 hover:border-[#2563eb]/70 rounded-lg p-5 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="font-mono text-xs tracking-widest text-[#2563eb]">{seg.ctaTag ?? "NEXT STEP"}</div>
              <p className="text-sm font-bold">{seg.familyMeterPrompt}</p>
            </div>
            <span className="text-[#2563eb] font-mono text-xl group-hover:translate-x-1 transition-transform">&rarr;</span>
          </div>
        </Link>
      ) : (
        <>
          {/* CTA: Family Meter（個人向けセグメントのみ） */}
          <Link
            to="/family"
            className="block bg-panel border border-[#f59e0b]/40 hover:border-[#f59e0b]/70 rounded-lg p-5 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-mono text-xs tracking-widest text-[#f59e0b]">FAMILY SURVIVAL METER</div>
                <p className="text-sm font-bold">{seg.familyMeterPrompt}</p>
              </div>
              <span className="text-[#f59e0b] font-mono text-xl group-hover:translate-x-1 transition-transform">&rarr;</span>
            </div>
          </Link>

          {/* CTA: 詳細チェックリスト */}
          <Link
            to={`/prepare#${seg.prepareAnchor}`}
            className="block bg-panel border border-border hover:border-neutral-600 rounded-lg p-5 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-mono text-xs tracking-widest text-neutral-500">SURVIVAL GUIDE</div>
                <p className="text-sm font-bold">詳細な備蓄チェックリストを見る</p>
              </div>
              <span className="text-neutral-500 font-mono text-xl group-hover:translate-x-1 transition-transform">&rarr;</span>
            </div>
          </Link>
        </>
      )}

      {/* シェア */}
      <button
        className="w-full py-2.5 px-4 rounded-lg text-xs font-mono font-bold bg-[#1d9bf0]/15 text-[#1d9bf0] border border-[#1d9bf0]/30 hover:bg-[#1d9bf0]/25 transition-colors"
        onClick={() => {
          const text = [
            `【${seg.title}】ホルムズリスクシナリオ`,
            `${seg.heroLabel}: ${seg.heroStat}${seg.heroUnit}（現実シナリオ推定）`,
            "",
            seg.actions[0] ?? "今のうちに備えを確認してください。",
            "",
            `surviveasonejp.org/for/${seg.id}`,
            "",
            "#ホルムズ海峡 #備蓄確認",
          ].join("\n");
          window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener");
        }}
      >
        X(Twitter)でシェア
      </button>
    </div>
  );
};
