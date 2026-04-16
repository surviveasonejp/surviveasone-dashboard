import { type FC, useState } from "react";
import { Link } from "react-router-dom";
import staticReserves from "../data/reserves.json";
import { SensitivityChart } from "../components/SensitivityChart";
import { ScenarioSelector } from "../components/ScenarioSelector";
import { type ScenarioId, DEFAULT_SCENARIO } from "../../shared/scenarios";

const r = staticReserves.oil;
const DATA_SOURCES = [
  { name: "経産省 / 資源エネルギー庁", data: `石油備蓄: 国家${Math.round(r.nationalReserve_kL / 1000).toLocaleString()}千kL(${r.nationalReserveDays}日) + 民間${Math.round(r.privateReserve_kL / 1000).toLocaleString()}千kL(${r.privateReserveDays}日) + 産油国共同${Math.round(r.jointReserve_kL / 1000).toLocaleString()}千kL(${r.jointReserveDays}日) = 合計${Math.round(r.totalReserve_kL / 1000).toLocaleString()}千kL(${r.totalReserveDays}日)`, date: `${staticReserves.meta.baselineDate}時点` },
  { name: "ISEP 電力調査統計", data: "火力65%(LNG29.1%+石炭28.2%+石油1.4%+他6.3%)、原子力8.2%、再エネ26.7%", date: "2024年暦年速報" },
  { name: "JETRO / 財務省貿易統計", data: "中東石油依存率94%、LNGホルムズ依存率6.3%(カタール5.3%+UAE1.0%)", date: "2025年実績" },
  { name: "経産省ガス事業統計", data: "LNG在庫約450万t(約25日分回転在庫)", date: "2025年平均" },
  { name: "OCCTO", data: "連系線運用容量10本(北本90万kW〜東北東京573万kW)、非対称容量対応", date: "2025年度" },
  { name: "原子力規制委員会", data: "稼働15基: 関西7基(6,578MW)、九州4基(4,140MW)、東京1基(1,356MW 柏崎刈羽6号)、四国1基(890MW)、東北1基(825MW)、中国1基(820MW 島根2号・定検停止中)", date: "2026年3月時点" },
  { name: "OWID energy-data", data: "石油日次消費量、LNG日次消費量のベースライン", date: "Cron自動取得" },
  { name: "各電力会社CSV", data: "電力需給実測データ(4エリア: 東京/関西/中部/北陸)", date: "Cron自動取得" },
  { name: "農水省 食料需給表", data: "食料自給率(カロリーベース38%、小麦16%、飼料26%、米97%)。政府備蓄米約29.5万t(2025年8月)", date: "令和6年度概算" },
  { name: "JOGMEC 石油備蓄基地一覧", data: "国家備蓄10基地の所在地・容量・貯蔵方式(苫小牧東部〜志布志)", date: "静的" },
  { name: "資源エネルギー庁 給油所統計", data: "都道府県別給油所数 27,414箇所。地域別ロジスティクスの根拠", date: "2023年度末" },
  { name: "ISEP / IRENA", data: "再エネ設備利用率(太陽光CF15%/風力CF22%/水力CF35%)。シミュレーション係数の根拠", date: "2024年" },
  { name: "IEA Energy Supply Security", data: "需要破壊モデルの価格弾力性係数。SPR協調放出メカニズム。加盟国別備蓄日数", date: "2014/2024年" },
  { name: "内閣府 避難所運営ガイドライン", data: "水3L/人日、Family Meter基準値。水道崩壊カスケードの根拠", date: "2016年" },
];

const MODEL_EQUATIONS = [
  {
    title: "フロー型在庫モデル",
    equation: "dStock/dt = Inflow(t) - Consumption(t) + SPR_Release(t)",
    description: "365日間の日次在庫推移を離散時間ステップで計算。タンカー到着スケジュールに基づくInflowと、シナリオ別遮断率によるConsumptionを反映。",
  },
  {
    title: "供給制約",
    equation: "supply(t) = min(stock(t), processingCapacity)",
    description: "製油所処理能力(bpd)とLNG再ガス化能力(tpd)で供給量を制限。地域別に設定。",
  },
  {
    title: "SPR放出メカニズム",
    equation: "国家備蓄: delay=14日, max=30万kL/日, 変換効率82% / 民間: delay=0日, 実効40% / 共同: 国際協調100%→標準対応50%→需要超過0%",
    description: "石油備蓄法+IEA Emergency Response Mechanismに基づく。リードタイム14日=IEA要請→閣議了解(1-2日)→JOGMEC放出指示→基地出荷(3-5日)→精製到着(2-3日)。国家備蓄は原油タンク主体のため精製変換係数0.82を適用（IEA Oil Supply Security 2014）。民間実効40%は公式70%から製油所底部残液・タンカーバラスト・稼働継続在庫を追加控除した実効値。産油国共同備蓄は外交不確実性・契約遅延でシナリオ別に利用率を設定。",
  },
  {
    title: "封鎖解除曲線",
    equation: "blockadeRate(t) = initial + (final - initial) × ((t - start) / (end - start))",
    description: "国際協調: 7日→30日で解除(残留10%) / 標準対応: 30日→120日段階的(残留30%) / 需要超過: 90日→365日(残留60%)。線形補間。",
  },
  {
    title: "需要破壊モデル",
    equation: "demand(t) = baseDemand × blockadeRate(t) × rationFactor × destructionFactor(stockPercent)",
    description: "在庫50%超: 通常 / 30-50%: 産業15%減 / 10-30%: 産業+商業35%減 / 10%未満: 生活必需のみ55%減。係数はHamilton(2003)の価格弾力性モデル + 1973年第一次石油危機の実績(経産省2018年エネルギー白書) + IEA Energy Supply Security(2014)に基づく。閾値は石油備蓄法の放出段階に対応。",
  },
  {
    title: "段階的崩壊閾値",
    equation: "50%→価格暴騰, 30%→供給制限(配給0.7倍), 10%→配給制(0.4倍), 0%→完全停止",
    description: "在庫残量に応じて消費制限が段階的に発動。配給制下では消費が自動的に抑制される。",
  },
  {
    title: "原子力補正",
    equation: "thermalShare_regional = thermalShare_national × (1 - nuclearCoverage - renewableCoverage)",
    description: "nuclearCoverage = min(原発出力MW × 稼働率80% / 地域需要MW, 0.7)。稼働率80%は原子力規制委員会実績値(2023-2024年度平均)。上限70%はOCCTO系統運用ルール(周波数調整用火力の最低保持)に基づく。稼働15基(関西7/九州4/東京1/四国1/東北1/中国1)。",
  },
  {
    title: "再エネバッファ",
    equation: "renewableOutput = solar×CF15% + wind×CF22% + hydro×CF35%",
    description: "CF=設備利用率(ISEP自然エネルギー白書+IRENA Statistics 2024の日本実績値)。蓄電池なしの系統安定限界として最大40%カバーに制限(IEA Grid Integration of Variable Renewables)。季節変動は現在未反映。",
  },
  {
    title: "連系線融通",
    equation: "bonusDays = min(daysDiff × coverageRatio, daysDiff × 0.5)",
    description: "coverageRatio = 連系線容量(方向別) × 稼働率70% × (1-損失率) / 受電側需要。稼働率70%は通常時80-90%から危機時の保守要員不足・系統不安定を考慮(OCCTO緊急時運用規程準拠)。3回反復で多段融通を安定化。",
  },
  {
    title: "水道崩壊カスケード",
    equation: "電力停止 → +0日:水圧低下 → +1日:断水 → +3日:衛生崩壊",
    description: "配水池の重力式貯留(1-3日分)と非常用発電機燃料(72時間)に基づく。出典: 厚労省「水道事業における耐震化の促進」+ 厚労省水道事業ガイドライン。",
  },
  {
    title: "Family Meter",
    equation: "生存日数 = min(水÷3L人日, 食料日数, ガス÷30分人日, 電力÷50Wh人日)",
    description: "水3L/人日=内閣府「避難所における良好な生活環境の確保に向けた取組指針」(2016年)。カセットガス60分/本=岩谷産業公表値、30分/人日=最低調理時間。電力50Wh/人日=スマホ15Wh+LED30Wh+ラジオ5Wh。ボトルネック方式で最短リソースが生存日数を決定。",
  },
];

export const Methodology: FC = () => {
  const [sensitivityScenario, setSensitivityScenario] = useState<ScenarioId>(DEFAULT_SCENARIO);
  return (
    <div className="space-y-8 max-w-3xl">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-[#f59e0b]">METHODOLOGY</span>
        </h1>
        <p className="text-neutral-500 text-sm">
          シミュレーションモデルの前提・計算式・データソース・制約
        </p>
      </div>

      {/* シミュレーション宣言 */}
      <div className="bg-panel border border-[#f59e0b]/30 rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-[#f59e0b]">重要な前提</h2>
        <p className="text-neutral-300 text-sm leading-relaxed">
          本シミュレーションは<span className="text-neutral-200 font-bold">予測ではなく、リスクシナリオの可視化</span>です。
          国際協調・標準対応・需要超過の3シナリオで分析し、それぞれ異なる遮断率・解除曲線・需要変動を適用します。
        </p>
        <p className="text-neutral-400 text-sm leading-relaxed">
          実際にはIEA協調備蓄放出、代替供給ルートの確保、需要削減政策等の対応が取られます。
          日本の石油備蓄はIEA基準204日分で国際的に充実した水準にあります。
        </p>
      </div>

      {/* 備蓄日数の3段階解釈 */}
      <div className="bg-panel border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">備蓄日数の解釈（3段階）</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-500 font-mono text-xs border-b border-border">
                <th className="px-4 py-2 text-left">指標</th>
                <th className="px-4 py-2 text-right">日数</th>
                <th className="px-4 py-2 text-left pl-6">説明</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="px-4 py-2 text-neutral-300 font-bold whitespace-nowrap">法ベース<br /><span className="text-[10px] text-neutral-600 font-normal">制度コンプライアンス指標</span></td>
                <td className="px-4 py-2 text-right font-mono text-neutral-200">約{r.totalReserveDays}日</td>
                <td className="px-4 py-2 text-xs text-neutral-500 pl-6">石油備蓄法に基づく公式日数。国家+民間+共同備蓄を全量即時利用可能とみなして計算。IEA報告・政策立案の基準値。</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-2 text-[#f59e0b] font-bold whitespace-nowrap">実効備蓄<br /><span className="text-[10px] text-[#f59e0b]/60 font-normal">放出・精製制約を考慮</span></td>
                <td className="px-4 py-2 text-right font-mono text-[#f59e0b]">約130〜170日</td>
                <td className="px-4 py-2 text-xs text-neutral-500 pl-6">民間備蓄の実効利用率40%（ワーキングストック・底部残液等）、国家備蓄の精製変換効率82%、共同備蓄の外交不確実性を適用した推計値。本シミュレーションが採用する値。</td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-[#ef4444] font-bold whitespace-nowrap">生活維持ベース<br /><span className="text-[10px] text-[#ef4444]/60 font-normal">物流・電力崩壊を考慮</span></td>
                <td className="px-4 py-2 text-right font-mono text-[#ef4444]">約90〜120日</td>
                <td className="px-4 py-2 text-xs text-neutral-500 pl-6">精製所停電・物流混乱・タンクローリー不足等で供給が制約される場合の実物流ベースの推計値。備蓄が存在しても市民に届かない可能性を反映。</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-border">
          <p className="text-[11px] text-neutral-600 leading-relaxed">
            ※ 法ベース日数は「制度的な備蓄量の確認指標」であり「戦時耐久性指標」ではありません。
            本シミュレーションは実効備蓄値を用い、需要破壊モデルと組み合わせることで生活維持ベースに近い推計を行っています。
          </p>
        </div>
      </div>

      {/* 3シナリオ */}
      <div className="bg-panel border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">3シナリオ</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-500 font-mono text-xs border-b border-border">
                <th className="px-4 py-2 text-left">シナリオ</th>
                <th className="px-4 py-2 text-right">石油遮断</th>
                <th className="px-4 py-2 text-right">LNG遮断</th>
                <th className="px-4 py-2 text-right">需要変動</th>
                <th className="px-4 py-2 text-right">封鎖解除</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="px-4 py-2 text-[#22c55e] font-bold">楽観</td>
                <td className="px-4 py-2 text-right font-mono">50%</td>
                <td className="px-4 py-2 text-right font-mono">3%</td>
                <td className="px-4 py-2 text-right font-mono">-15%</td>
                <td className="px-4 py-2 text-right text-neutral-400 text-xs">7日→30日で解除</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-2 text-[#f59e0b] font-bold">現実</td>
                <td className="px-4 py-2 text-right font-mono">94%</td>
                <td className="px-4 py-2 text-right font-mono">6.3%</td>
                <td className="px-4 py-2 text-right font-mono">-5%</td>
                <td className="px-4 py-2 text-right text-neutral-400 text-xs">30日→120日で段階的</td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-[#ef4444] font-bold">悲観</td>
                <td className="px-4 py-2 text-right font-mono">100%</td>
                <td className="px-4 py-2 text-right font-mono">15%</td>
                <td className="px-4 py-2 text-right font-mono">+10%</td>
                <td className="px-4 py-2 text-right text-neutral-400 text-xs">90日→365日</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 国際対応パターン */}
      <div className="bg-panel border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">各国の対応パターン（2026年4月時点）</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-neutral-600 font-mono border-b border-border">
                <th className="px-4 py-2 text-left">類型</th>
                <th className="px-4 py-2 text-left">主な措置</th>
                <th className="px-4 py-2 text-left">国・機関</th>
                <th className="px-4 py-2 text-left">シミュレーションへの反映</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0c1018]">
              <tr>
                <td className="px-4 py-2 text-neutral-300 font-bold whitespace-nowrap">① 軍事・外交</td>
                <td className="px-4 py-2 text-neutral-500">多国籍海上護衛連合構想・地域内外交会議</td>
                <td className="px-4 py-2 text-neutral-400">米国主導・日本/欧州参加・パキスタン仲介</td>
                <td className="px-4 py-2 font-mono text-neutral-600">封鎖解除曲線（楽観7日→30日）</td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-neutral-300 font-bold whitespace-nowrap">② 供給確保</td>
                <td className="px-4 py-2 text-neutral-500">IEA協調備蓄4億bbl放出・OPEC+増産+20万b/d・紅海パイプライン3倍増</td>
                <td className="px-4 py-2 text-neutral-400">IEA・OPEC+・サウジ・日本政府</td>
                <td className="px-4 py-2 font-mono text-neutral-600">SPR放出モデル・代替供給率maxAlternativeSupplyRatio=0.58</td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-neutral-300 font-bold whitespace-nowrap">③ 需要抑制</td>
                <td className="px-4 py-2 text-neutral-500">IEA提言（速度制限・車利用制限・在宅勤務）・タイ在宅勤務令・インド/バングラデシュ燃料配給・フィリピン労働時間短縮</td>
                <td className="px-4 py-2 text-neutral-400">IEA・東南アジア各国（タイ/フィリピン/ベトナム）</td>
                <td className="px-4 py-2 font-mono text-neutral-600">楽観シナリオ需要削減-15%・現実-5%の根拠の一つ</td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-neutral-300 font-bold whitespace-nowrap">④ 経済対策</td>
                <td className="px-4 py-2 text-neutral-500">ガソリン補助金（日本・韓国）・韓国原油スワップ制度・欧州石炭回帰・豪NZ家計支援給付</td>
                <td className="px-4 py-2 text-neutral-400">日本・韓国・EU・オーストラリア・NZ</td>
                <td className="px-4 py-2 font-mono text-neutral-600">段階的崩壊閾値（価格高騰フェーズ）・realEvents</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-border">
          <p className="text-[11px] text-neutral-600 leading-relaxed">
            ※ 日本を含むアジアは中東依存度が最も高く対応コストが大きい。欧州・オセアニアは比較的対応余力あり。
            各国の「需要抑制」効果は本シミュレーションの楽観シナリオ（-15%）の根拠を支持する実績データ。
          </p>
        </div>
      </div>

      {/* 計算式 */}
      <div className="space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">計算モデル（全11式）</h2>
        {MODEL_EQUATIONS.map((eq) => (
          <div key={eq.title} className="bg-panel border border-border rounded-lg p-4 space-y-2">
            <h3 className="text-sm font-bold text-neutral-200">{eq.title}</h3>
            <code className="block text-xs font-mono text-[#f59e0b] bg-bg rounded px-3 py-2 overflow-x-auto">
              {eq.equation}
            </code>
            <p className="text-xs text-neutral-500 leading-relaxed">{eq.description}</p>
          </div>
        ))}
      </div>

      {/* 法的フレームワークと限界 */}
      <div className="space-y-4">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">法的フレームワークと限界</h2>

        {/* 3法の発動トリガー */}
        <div className="bg-panel border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-mono text-xs tracking-wider text-neutral-400">3法の段階発動トリガー</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-neutral-600 font-mono border-b border-border">
                  <th className="px-4 py-2 text-left">在庫残量</th>
                  <th className="px-4 py-2 text-left">発動法律</th>
                  <th className="px-4 py-2 text-left">政府アクション</th>
                  <th className="px-4 py-2 text-left">本シミュレーション対応</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0c1018]">
                <tr>
                  <td className="px-4 py-2 font-mono text-[#f59e0b]">50%以下</td>
                  <td className="px-4 py-2 text-neutral-300">石油備蓄法</td>
                  <td className="px-4 py-2 text-neutral-500">国家備蓄放出・IEA協調・行政指導</td>
                  <td className="px-4 py-2 font-mono text-neutral-600">price_spike閾値（高騰フェーズ）</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-mono text-[#ef4444]">30%以下</td>
                  <td className="px-4 py-2 text-neutral-300">石油需給適正化法</td>
                  <td className="px-4 py-2 text-neutral-500">用途別優先配分（医療・食料・物流優先）/ 奇数偶数制</td>
                  <td className="px-4 py-2 font-mono text-neutral-600">rationing閾値（配給前夜フェーズ）</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-mono text-[#dc2626]">10%以下</td>
                  <td className="px-4 py-2 text-neutral-300">国民生活安定緊急措置法</td>
                  <td className="px-4 py-2 text-neutral-500">正式配給制（企業割当・購入許可制・転売禁止）</td>
                  <td className="px-4 py-2 font-mono text-neutral-600">distribution閾値（配給制フェーズ）</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border">
            <p className="text-[11px] text-neutral-600 leading-relaxed">
              3法は「燃料危機」前提の設計。日本の配給制度はゼロから構築せず、既存法を段階的に発動する。
              ただし配給のデジタル管理基盤（リアルタイム割当・不正防止）は制度として未整備。
            </p>
          </div>
        </div>

        {/* 法的空白領域 — ナフサ起点の危機 */}
        <div className="bg-panel border border-[#ef4444]/30 rounded-lg p-4 space-y-3">
          <h3 className="font-mono text-xs tracking-wider text-[#ef4444]">法的空白領域 — ナフサ起点の危機は3法の範囲外</h3>
          <p className="text-xs text-neutral-500 leading-relaxed">
            3法は「石油（燃料）の流れ」を制御する設計。ナフサ起点の石化産業崩壊は適用外または権限が脆弱。
          </p>
          <div className="space-y-2">
            {([
              {
                label: "ナフサ用途別精密配分",
                status: "法的根拠なし",
                desc: "医療用樹脂・食品包装・自動車材料でナフサの価値は全く異なるが、用途ごとの強制割当制度が存在しない。",
                color: "#ef4444",
              },
              {
                label: "包装材・容器の優先配分",
                status: "完全に法的空白",
                desc: "食品があっても「包めない・運べない」状態に対応する法制度が存在しない。国民生活安定緊急措置法の「生活必需物資」に容器・包装材は明示されていない。",
                color: "#ef4444",
              },
              {
                label: "産業横断サプライチェーン統制",
                status: "権限不足",
                desc: "石油業界への命令は可能だが、「石油→化学→製品→流通」全体を横断する強制統制権限がない。樹脂・包装材メーカーへの生産命令根拠が弱い。",
                color: "#f59e0b",
              },
              {
                label: "デジタル配給基盤",
                status: "制度未整備",
                desc: "現行制度はアナログ配給前提（紙・指示命令）。企業ごとのリアルタイム使用量管理・不正流通監視のデジタル基盤が法制化されていない。",
                color: "#f59e0b",
              },
            ] as const).map((item) => (
              <div key={item.label} className="flex flex-col sm:flex-row gap-1 sm:gap-3 text-xs">
                <div className="flex items-start gap-2 sm:w-64 shrink-0">
                  <span
                    className="shrink-0 mt-0.5 text-[9px] font-mono px-1 py-0.5 rounded"
                    style={{ color: item.color, backgroundColor: `${item.color}15`, border: `1px solid ${item.color}30` }}
                  >
                    {item.status}
                  </span>
                  <span className="text-neutral-300 font-bold">{item.label}</span>
                </div>
                <span className="text-neutral-600 sm:flex-1">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 追加法整備が必要なシナリオ */}
        <div className="bg-panel border border-border rounded-lg p-4 space-y-3">
          <h3 className="font-mono text-xs tracking-wider text-neutral-400">追加法整備が必要なシナリオ</h3>
          <div className="space-y-2 text-xs">
            {([
              { id: "A", label: "ナフサ産業選別", desc: "「重要化学製品指定制度」が未整備。医療・食品優先のナフサ強制割当に法的根拠なし。（準戦時経済法・化学版が必要）" },
              { id: "B", label: "包装崩壊 → 食料流通停止", desc: "包装材の国家統制・食品物流との一体運用根拠なし。現行法ではほぼカバー外。" },
              { id: "C", label: "長期化（3ヶ月以上）", desc: "個人単位の全面配給制度が未整備。戦後配給制度に近いが、現代版（マイナンバー連動等）は法制化されていない。" },
              { id: "D", label: "サプライチェーン連鎖崩壊", desc: "産業横断の強制稼働命令・特定企業の操業維持義務根拠が弱い。石油業界中心の現行法では限定的。" },
            ] as const).map((s) => (
              <div key={s.id} className="flex gap-3">
                <span className="font-mono font-bold text-neutral-500 shrink-0 w-4">{s.id}</span>
                <div>
                  <span className="text-neutral-300 font-bold">{s.label}</span>
                  <span className="text-neutral-600 ml-2">{s.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 省庁別責任マップ */}
        <div className="bg-panel border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-mono text-xs tracking-wider text-neutral-400">省庁別責任マップ（理想構造）</h3>
          </div>
          <div className="divide-y divide-[#0c1018] text-xs">
            {([
              { ministry: "内閣官房", role: "司令塔", desc: "最終意思決定（産業選別）・省庁間強制調整・緊急命令一元発出" },
              { ministry: "経済産業省", role: "エネルギー・化学", desc: "ナフサ・LPGの用途別強制配分 / 石化コンビナートの稼働指示 / 包装材メーカー優先順位付け" },
              { ministry: "農林水産省", role: "食料", desc: "食品供給との統合管理 / 何を優先して包むかの判断 / バラ売り・代替流通の指示" },
              { ministry: "国土交通省", role: "物流", desc: "燃料の物流優先配分 / 輸送対象物資の優先順位決定（医療＞食料＞工業製品）" },
              { ministry: "総務省", role: "配給実務", desc: "地方自治体を通じた配給実施 / 地域単位の割当管理 / デジタル配給基盤" },
              { ministry: "厚生労働省", role: "医療死守", desc: "医療用樹脂（点滴・注射器）最優先確保 / 医薬品・衛生材の配給管理" },
              { ministry: "外務省", role: "供給確保", desc: "原油・ナフサ緊急調達交渉 / ホルムズ・代替ルート確保 / 資源スワップ協定" },
            ] as const).map((item) => (
              <div key={item.ministry} className="px-4 py-2 flex flex-col sm:flex-row gap-1 sm:gap-4">
                <div className="sm:w-36 shrink-0">
                  <span className="text-neutral-200 font-bold">{item.ministry}</span>
                  <span className="text-neutral-600 font-mono text-[9px] ml-2">{item.role}</span>
                </div>
                <span className="text-neutral-500">{item.desc}</span>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-border">
            <p className="text-[11px] text-neutral-600 leading-relaxed">
              本質: 「省庁分担」ではなく「強制統合」が必要。最終的に「誰の生産を止めるか」を決める政治判断が不可欠。
              この権限設計は現行制度には存在せず、緊急立法が必要になる可能性がある。
            </p>
          </div>
        </div>
      </div>

      {/* データソース */}
      <div className="bg-panel border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">データソース（全て公開データ）</h2>
        </div>
        <div className="divide-y divide-border">
          {DATA_SOURCES.map((ds) => (
            <div key={ds.name} className="px-4 py-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-neutral-300">{ds.name}</span>
                <span className="text-[10px] font-mono text-neutral-600">{ds.date}</span>
              </div>
              <p className="text-xs text-neutral-500">{ds.data}</p>
            </div>
          ))}
        </div>
      </div>

      {/* このシミュレーションが外れる主な条件 */}
      <div className="space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">このシミュレーションが外れる主な条件</h2>
        <p className="text-xs text-neutral-600">以下のいずれかが発動した場合、崩壊タイムラインは大幅に変わります。楽観シナリオはこれらの一部を織り込んでいます。</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            {
              icon: "①",
              title: "IEA協調緊急備蓄放出",
              effect: "石油枯渇日数 +14〜30日",
              color: "#3b82f6",
              desc: "IEA加盟国が協調して戦略備蓄を放出した場合。実績: 2022年3月（6,000万バレル放出）では日本向けに約+14日相当（JOGMEC試算）。",
            },
            {
              icon: "②",
              title: "G7・外交による封鎖解除",
              effect: "全シナリオのタイムライン無効化",
              color: "#22c55e",
              desc: "外交交渉や停戦合意により封鎖が早期解除された場合。楽観シナリオは7日で介入・30日で解除開始としてこの可能性を部分的に反映済み。",
            },
            {
              icon: "③",
              title: "非中東代替供給の急拡大",
              effect: "LNG・石油 +10〜20%供給余力",
              color: "#94a3b8",
              desc: "米国・カナダ・インドネシアからのスポット調達が成立した場合。現モデルは代替3ルート・調達成功率70%で試算済み。これを上回る場合に改善。ただし原油は日本製油所がアラビアン・ライト系に最適化されており、WTI・ブレントへの切り替えには設備改造6〜18ヶ月が必要（後述）。LNGは産地非依存のため石油より代替しやすい。",
            },
            {
              icon: "④",
              title: "国内需要破壊（節電・節油）",
              effect: "電力崩壊日数 +20〜40日",
              color: "#f59e0b",
              desc: "政府の節電要請（目標20%削減）や燃料消費削減が達成された場合。実績: 東日本大震災後のピーク需要15%削減（2011年夏）。現モデルのdemandReductionRateを超える削減があれば改善。",
            },
          ].map((item) => (
            <div key={item.icon} className="bg-panel border border-border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-neutral-200">{item.icon} {item.title}</h3>
              </div>
              <div className="text-xs font-mono px-2 py-1 rounded" style={{ backgroundColor: `${item.color}15`, color: item.color }}>
                {item.effect}
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 感度分析 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">感度分析</h2>
          <ScenarioSelector selected={sensitivityScenario} onChange={setSensitivityScenario} />
        </div>
        <SensitivityChart scenarioId={sensitivityScenario} />
      </div>

      {/* 制約と不確実性 */}
      <div className="bg-panel border border-[#ef4444]/30 rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-[#ef4444]">制約と不確実性</h2>
        <ul className="space-y-2 text-xs text-neutral-400 leading-relaxed">
          <li>・石炭火力（28%）はホルムズ非依存（豪州・インドネシア主体）。短期的な直接影響は限定的だが、エネルギー価格全般への波及は考慮</li>
          <li>・LNG在庫25日分は全量在庫。ホルムズ直接依存は6.3%だが、封鎖による保険料高騰・船舶退避は豪州(39.7%)・マレーシア(14.8%)等にも波及し得る</li>
          <li>・再エネの季節変動（太陽光は夏:冬=2:1）は現在未反映。蓄電池モデル（揚水発電含む）も未実装</li>
          <li>・経済カスケード効果（GDP・為替・物価への波及）は未実装</li>
          <li>・代替供給ルート（喜望峰迂回+10-15日、カナダLNG等）のモデル化は未実装</li>
          <li>・代替原油の精製互換性: 日本の製油所はアラビアン・ライト系（硫黄分0.8〜2.5%・API比重27〜34°）に最適化されており、WTI（超軽質・API比重40〜50°超）やブレント（軽質）への切り替えは設備改造6〜18ヶ月が必要（石油連盟「製油所設備能力」調査）。現モデルは nonMideastCompatibilityFactor（0.2〜0.6）で品質ミスマッチを部分的に反映しているが、厳密な遅延ペナルティは未反映。なお米国NGL（天然ガス液: エタン・プロパン等、炭素数2〜4）は石油精製原料ではなく石化フィード・燃料ガスであるため代替供給量には含まない。また米国の製油所自体も約70%が重質油向け設計（AFPM Refining Capacity Report 2025）のため、シェール増産が日本向け代替原油の量的・質的代替になることには構造的上限がある（EIA Short-Term Energy Outlook 2026-04）。一方LNGは再ガス化（単純気化）で産地非依存のため、石油よりも代替供給が容易という非対称性がある。</li>
          <li>・需要破壊モデルの価格弾力性は1973年石油ショックの実績データに基づく近似であり、現代の経済構造との差異がある</li>
          <li>・エチレンは日本が純輸出国であり、封鎖時に輸出停止→国内振替で包装材枯渇が遅延する可能性がある。現在のnapthaFactorは国内消費のみ考慮しており、この緩和効果は未反映</li>
        </ul>
      </div>

      {/* 引用フォーマット */}
      <div className="bg-panel border border-border rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">引用・参照</h2>
        <p className="text-neutral-500 text-xs">
          本シミュレーションを論文・レポート・記事等で参照する場合、以下のフォーマットを使用してください。
        </p>
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-mono text-neutral-600 mb-1">APA</div>
            <code className="block text-xs font-mono text-neutral-400 bg-bg rounded px-3 py-2 select-all">
              Survive as One Japan. (2026). Hormuz Strait blockade energy simulation for Japan. https://surviveasonejp.org
            </code>
          </div>
          <div>
            <div className="text-[10px] font-mono text-neutral-600 mb-1">BibTeX</div>
            <pre className="text-xs font-mono text-neutral-400 bg-bg rounded px-3 py-2 overflow-x-auto select-all">
{`@misc{surviveasonejp2026,
  title  = {Survive as One Japan: Hormuz Strait
            Blockade Energy Simulation},
  author = {idx},
  year   = {2026},
  url    = {https://surviveasonejp.org},
  note   = {AGPL-3.0, API: surviveasonejp.net/api}
}`}
            </pre>
          </div>
          <div>
            <div className="text-[10px] font-mono text-neutral-600 mb-1">API経由のデータ引用</div>
            <code className="block text-xs font-mono text-neutral-400 bg-bg rounded px-3 py-2 select-all">
              Survive as One Japan API (https://surviveasonejp.net/api/simulate?scenario=realistic), accessed {new Date().toISOString().slice(0, 10)}.
            </code>
          </div>
        </div>
      </div>

      {/* 検証への招待 */}
      <div className="bg-panel border border-[#22c55e]/30 rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-[#22c55e]">検証と貢献</h2>
        <p className="text-neutral-400 text-sm leading-relaxed">
          ソースコードはAGPL-3.0で全量公開されています。計算ロジックは誰でも検証可能です。
        </p>
        <p className="text-neutral-400 text-sm leading-relaxed">
          モデルの前提・パラメータに対する検証や改善提案は GitHub Issue（モデル検証テンプレート）で受け付けています。
        </p>
        <div className="flex flex-wrap gap-3 mt-2">
          <a
            href="https://github.com/surviveasonejp/surviveasone-dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-border text-neutral-400 hover:bg-white/5 font-mono text-xs tracking-wider rounded transition-colors"
          >
            GitHub &rarr;
          </a>
          <a
            href="https://github.com/surviveasonejp/surviveasone-dashboard/issues/new?template=model-verification.md"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-[#22c55e] text-[#22c55e] hover:bg-[#22c55e]/10 font-mono text-xs tracking-wider rounded transition-colors"
          >
            モデル検証 Issue &rarr;
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/about"
          className="px-4 py-2 border border-border text-neutral-400 hover:bg-white/5 font-mono text-xs tracking-wider rounded transition-colors"
        >
          &larr; ABOUT
        </Link>
        <Link
          to="/dashboard"
          className="px-4 py-2 border border-border text-neutral-400 hover:bg-white/5 font-mono text-xs tracking-wider rounded transition-colors"
        >
          DASHBOARD &rarr;
        </Link>
      </div>
    </div>
  );
};
