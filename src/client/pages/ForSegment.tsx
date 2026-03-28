import { type FC } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { AlertBanner } from "../components/AlertBanner";

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
  familyMeterPrompt: string;
  prepareAnchor: string;
  metaDescription: string;
}

const SEGMENTS: Record<string, Segment> = {
  parents: {
    id: "parents",
    title: "子育て家庭の方へ",
    subtitle: "乳幼児・子ども・高校生までのお子さんがいるご家庭",
    heroStat: "3",
    heroUnit: "日",
    heroLabel: "液体ミルクが店頭から消えるまで",
    heroColor: "#ef4444",
    alertMessage: "日本人の5人に1人がインフラ停止時に特別な備えが必要な家庭に該当します。子育て世帯はその中核です。",
    risks: [
      { label: "液体ミルク", days: "3日", detail: "冷蔵チェーン崩壊+物流停止で店頭在庫が消失。紙パック内面PE不足で容器生産も停止" },
      { label: "おむつ", days: "7-14日", detail: "石化製品（PE/PP）依存。エチレン減産開始で供給制約" },
      { label: "離乳食", days: "3-5日", detail: "レトルトパウチ型は常温で使用可能だが、物流停止で補充不可" },
      { label: "経口補水液", days: "5-7日", detail: "乳幼児の脱水は急速に致命的。体重あたりの必要水分量が大人より多い" },
      { label: "水道", days: "停電+1日", detail: "配水池の重力式貯留(1-3日分)枯渇後、広域断水" },
    ],
    actions: [
      "【乳幼児】液体ミルク7日分+おむつ14日分+経口補水液7日分を今すぐ確保",
      "【全年齢】経口補水液・飲料水を大人より多めに備蓄（成長期は必要水分量が多い）",
      "【全年齢】アレルギー対応食・食べ慣れたおやつを14日分確保（配給では対応されない可能性）",
      "学校の災害時引き渡し手順と家族の合流方法を確認。高校生は自己判断の場面も想定",
      "かかりつけ医の災害時連絡先を紙に。SNSデマへの対処法を中高生と共有",
    ],
    familyMeterPrompt: "あなたの家庭は何日持ちこたえられる？ 備蓄量を入力して生存ランクを確認",
    prepareAnchor: "sec-infant",
    metaDescription: "停電でミルクは3日で消える。子育て家庭がホルムズ海峡封鎖で受ける影響と、今日からできる備蓄・行動チェックリスト。",
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
      "透析施設の災害時対応計画を今すぐ入手（代替施設リスト・連絡先）",
      "低カリウム食品を14日分備蓄（白米・パン・うどん）",
      "腹膜透析への一時切替が可能か主治医と相談",
      "透析手帳・お薬手帳のコピーを防水保管+スマホ撮影",
      "透析施設への自転車ルートを確認（ガソリン制限に備え）",
    ],
    familyMeterPrompt: "ポータブル電源・水の備蓄量を入力して、あなたの家庭の生存日数を確認",
    prepareAnchor: "sec-dialysis",
    metaDescription: "透析患者の猶予は3-4日。ホルムズ海峡封鎖で停電・断水が起きた場合の影響と、家族が今すぐ取るべき行動。",
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
    familyMeterPrompt: "医療機器の電力消費を考慮して、あなたの家庭の生存日数を確認",
    prepareAnchor: "sec-medical",
    metaDescription: "人工呼吸器は停電8時間が限界。在宅医療・介護・障害のある家族を守るための備蓄と行動チェックリスト。",
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
      <div className="bg-[#151c24] border border-[#ef4444]/30 rounded-lg p-6 text-center space-y-1">
        <div className="font-mono text-4xl font-bold" style={{ color: seg.heroColor }}>
          {seg.heroStat}<span className="text-lg ml-1">{seg.heroUnit}</span>
        </div>
        <div className="text-sm text-neutral-400">{seg.heroLabel}</div>
      </div>

      {/* 崩壊タイムライン */}
      <div className="space-y-2">
        <h2 className="font-mono text-xs tracking-wider text-neutral-400">あなたの家庭に起きること</h2>
        <div className="space-y-2">
          {seg.risks.map((risk) => (
            <div key={risk.label} className="bg-[#151c24] border border-[#1e2a36] rounded-lg px-4 py-3 flex gap-4">
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
      <div className="bg-[#151c24] border border-[#22c55e]/30 rounded-lg p-5 space-y-3">
        <h2 className="font-mono text-xs tracking-wider text-[#22c55e]">今すぐやるべき5つのこと</h2>
        <ol className="space-y-2">
          {seg.actions.map((action, i) => (
            <li key={i} className="flex gap-3 text-sm text-neutral-300">
              <span className="font-mono text-[#22c55e] font-bold shrink-0">{i + 1}.</span>
              <span>{action}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* CTA: Family Meter */}
      <Link
        to="/family"
        className="block bg-[#151c24] border border-[#f59e0b]/40 hover:border-[#f59e0b]/70 rounded-lg p-5 transition-colors group"
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
        className="block bg-[#151c24] border border-[#1e2a36] hover:border-neutral-600 rounded-lg p-5 transition-colors group"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="font-mono text-xs tracking-widest text-neutral-500">SURVIVAL GUIDE</div>
            <p className="text-sm font-bold">詳細な備蓄チェックリストを見る</p>
          </div>
          <span className="text-neutral-500 font-mono text-xl group-hover:translate-x-1 transition-transform">&rarr;</span>
        </div>
      </Link>

      {/* シェア */}
      <button
        className="w-full py-2.5 px-4 rounded-lg text-xs font-mono font-bold bg-[#1d9bf0]/15 text-[#1d9bf0] border border-[#1d9bf0]/30 hover:bg-[#1d9bf0]/25 transition-colors"
        onClick={() => {
          const text = [
            "ホルムズ海峡封鎖シナリオ — 家庭の備蓄は足りているか確認を。",
            "",
            "買い占めではなく、わが家に必要な備えの確認を。",
            "surviveasonejp.org/family",
            "",
            "#surviveasonejp #備蓄確認",
          ].join("\n");
          window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener");
        }}
      >
        X(Twitter)でシェア
      </button>
    </div>
  );
};
