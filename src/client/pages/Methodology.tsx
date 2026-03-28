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
    equation: "国家備蓄: delay=14日, max=30万kL/日 / 民間: delay=0日, 実質70%",
    description: "石油備蓄法+IEA Emergency Response Mechanismに基づく。リードタイム14日=IEA要請→閣議了解(1-2日)→JOGMEC放出指示→基地出荷(3-5日)→精製到着(2-3日)。2022年IEA協調放出時は約10日(JOGMEC報告)。民間70%は操業用在庫30%控除(石油連盟2019年)。悲観では産油国共同備蓄利用不可。",
  },
  {
    title: "封鎖解除曲線",
    equation: "blockadeRate(t) = initial + (final - initial) × ((t - start) / (end - start))",
    description: "楽観: 7日で介入→30日で解除(残留10%) / 現実: 30日全面→120日段階的(残留30%) / 悲観: 90日全面→365日(残留60%)。線形補間。",
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
      <div className="bg-[#151c24] border border-[#f59e0b]/30 rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-[#f59e0b]">重要な前提</h2>
        <p className="text-neutral-300 text-sm leading-relaxed">
          本シミュレーションは<span className="text-neutral-200 font-bold">予測ではなく、リスクシナリオの可視化</span>です。
          楽観・現実・悲観の3シナリオで分析し、それぞれ異なる遮断率・解除曲線・需要変動を適用します。
        </p>
        <p className="text-neutral-400 text-sm leading-relaxed">
          実際にはIEA協調備蓄放出、代替供給ルートの確保、需要削減政策等の対応が取られます。
          日本の石油備蓄はIEA基準204日分で国際的に充実した水準にあります。
        </p>
      </div>

      {/* 3シナリオ */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2a36]">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">3シナリオ</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-500 font-mono text-xs border-b border-[#1e2a36]">
                <th className="px-4 py-2 text-left">シナリオ</th>
                <th className="px-4 py-2 text-right">石油遮断</th>
                <th className="px-4 py-2 text-right">LNG遮断</th>
                <th className="px-4 py-2 text-right">需要変動</th>
                <th className="px-4 py-2 text-right">封鎖解除</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#162029]">
                <td className="px-4 py-2 text-[#22c55e] font-bold">楽観</td>
                <td className="px-4 py-2 text-right font-mono">50%</td>
                <td className="px-4 py-2 text-right font-mono">3%</td>
                <td className="px-4 py-2 text-right font-mono">-15%</td>
                <td className="px-4 py-2 text-right text-neutral-400 text-xs">7日→30日で解除</td>
              </tr>
              <tr className="border-b border-[#162029]">
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

      {/* 計算式 */}
      <div className="space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">計算モデル（全11式）</h2>
        {MODEL_EQUATIONS.map((eq) => (
          <div key={eq.title} className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-4 space-y-2">
            <h3 className="text-sm font-bold text-neutral-200">{eq.title}</h3>
            <code className="block text-xs font-mono text-[#f59e0b] bg-[#0f1419] rounded px-3 py-2 overflow-x-auto">
              {eq.equation}
            </code>
            <p className="text-xs text-neutral-500 leading-relaxed">{eq.description}</p>
          </div>
        ))}
      </div>

      {/* データソース */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2a36]">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">データソース（全て公開データ）</h2>
        </div>
        <div className="divide-y divide-[#162029]">
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

      {/* 感度分析 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">感度分析</h2>
          <ScenarioSelector selected={sensitivityScenario} onChange={setSensitivityScenario} />
        </div>
        <SensitivityChart scenarioId={sensitivityScenario} />
      </div>

      {/* 制約と不確実性 */}
      <div className="bg-[#151c24] border border-[#ef4444]/30 rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-[#ef4444]">制約と不確実性</h2>
        <ul className="space-y-2 text-xs text-neutral-400 leading-relaxed">
          <li>・石炭火力（28%）はホルムズ非依存（豪州・インドネシア主体）。短期的な直接影響は限定的だが、エネルギー価格全般への波及は考慮</li>
          <li>・LNG在庫25日分は全量在庫。ホルムズ直接依存は6.3%だが、封鎖による保険料高騰・船舶退避は豪州(39.7%)・マレーシア(14.8%)等にも波及し得る</li>
          <li>・再エネの季節変動（太陽光は夏:冬=2:1）は現在未反映。蓄電池モデル（揚水発電含む）も未実装</li>
          <li>・経済カスケード効果（GDP・為替・物価への波及）は未実装</li>
          <li>・代替供給ルート（喜望峰迂回+10-15日、カナダLNG等）のモデル化は未実装</li>
          <li>・需要破壊モデルの価格弾力性は1973年石油ショックの実績データに基づく近似であり、現代の経済構造との差異がある</li>
          <li>・エチレンは日本が純輸出国であり、封鎖時に輸出停止→国内振替で包装材枯渇が遅延する可能性がある。現在のnapthaFactorは国内消費のみ考慮しており、この緩和効果は未反映</li>
        </ul>
      </div>

      {/* 引用フォーマット */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">引用・参照</h2>
        <p className="text-neutral-500 text-xs">
          本シミュレーションを論文・レポート・記事等で参照する場合、以下のフォーマットを使用してください。
        </p>
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-mono text-neutral-600 mb-1">APA</div>
            <code className="block text-xs font-mono text-neutral-400 bg-[#0f1419] rounded px-3 py-2 select-all">
              Survive as One Japan. (2026). Hormuz Strait blockade energy simulation for Japan. https://surviveasonejp.org
            </code>
          </div>
          <div>
            <div className="text-[10px] font-mono text-neutral-600 mb-1">BibTeX</div>
            <pre className="text-xs font-mono text-neutral-400 bg-[#0f1419] rounded px-3 py-2 overflow-x-auto select-all">
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
            <code className="block text-xs font-mono text-neutral-400 bg-[#0f1419] rounded px-3 py-2 select-all">
              Survive as One Japan API (https://surviveasonejp.net/api/simulate?scenario=realistic), accessed {new Date().toISOString().slice(0, 10)}.
            </code>
          </div>
        </div>
      </div>

      {/* 検証への招待 */}
      <div className="bg-[#151c24] border border-[#22c55e]/30 rounded-lg p-6 space-y-3">
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
            className="px-4 py-2 border border-[#1e2a36] text-neutral-400 hover:bg-white/5 font-mono text-xs tracking-wider rounded transition-colors"
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
          className="px-4 py-2 border border-[#1e2a36] text-neutral-400 hover:bg-white/5 font-mono text-xs tracking-wider rounded transition-colors"
        >
          &larr; ABOUT
        </Link>
        <Link
          to="/dashboard"
          className="px-4 py-2 border border-[#1e2a36] text-neutral-400 hover:bg-white/5 font-mono text-xs tracking-wider rounded transition-colors"
        >
          DASHBOARD &rarr;
        </Link>
      </div>
    </div>
  );
};
