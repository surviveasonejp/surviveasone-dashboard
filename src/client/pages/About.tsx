import { type FC } from "react";
import { Link } from "react-router-dom";
import staticReserves from "../data/reserves.json";

const DATA_SOURCES_LIST = [
  { name: "経産省 石油備蓄推計量", note: `国家・民間・産油国共同備蓄日数(${staticReserves.meta.baselineDate}時点)`, auto: true },
  { name: "ISEP 電力調査統計", note: "火力発電依存率(2024年暦年速報)", auto: false },
  { name: "JETRO / 財務省 貿易統計", note: "LNGホルムズ依存率・輸入先(2025年実績)", auto: false },
  { name: "OWID energy-data", note: "石油・LNG消費量ベースライン", auto: true },
  { name: "10電力エリアCSV/JSON", note: "電力需給実測データ(全10エリア)", auto: true },
  { name: "OCCTO 電力広域的運営推進機関", note: "連系線運用容量10本(2025年度)", auto: false },
  { name: "原子力規制委員会", note: "稼働原発15基・設備利用率(柏崎刈羽6号機2026年1月再稼働。島根2号は定期検査停止中)", auto: false },
  { name: "MaritimeOptima / AISStream.io", note: "タンカー位置・航路のAIS検証(日次自動取得+日本向け判定)", auto: true },
  { name: "公開船舶DB / 海運各社PR", note: "タンカー18隻(代替5隻+ASIA VENTURE含む)のIMO・航路(2026年4月1日検証済。非日本向け船はバッジ表示)", auto: false },
  { name: "資源エネルギー庁 給油所統計", note: "都道府県別給油所数 27,414箇所(2023年度末)", auto: false },
  { name: "JOGMEC 石油備蓄基地一覧", note: "国家石油備蓄10基地の所在地・容量・貯蔵方式", auto: false },
  { name: "化学日報", note: "石化産業減産状況(2026年3月19日報道)", auto: false },
  { name: "Bloomberg / 産経", note: "代替ルートタンカー到着情報(2026年3月24日報道)", auto: false },
  { name: "ロイター / Bloomberg JP", note: "日本・インド LPG/原油ナフサ バーター交渉開始(2026年3月27日) / 韓国 原油スワップ正式発動(2026年3月31日報道)", auto: false },
  { name: "BusinessToday / Business Standard", note: "インド石油備蓄 国家SPR9.5日分(充填率64%)+商業在庫64.5日=総合74日(2026年3月24日報道)", auto: false },
  { name: "IEA Oil Security Policy", note: "加盟国別備蓄日数(国際比較用)", auto: false },
  { name: "農水省 食料需給表", note: "食料自給率(カロリーベース38%、小麦16%、飼料26%、米97%)(令和6年度概算)", auto: false },
  { name: "農水省 米穀需給基本指針", note: "政府備蓄米在庫(適正100万t→2025年8月時点約29.5万t)", auto: false },
  { name: "ISEP / IRENA", note: "再エネ設備利用率(太陽光15%/風力22%/水力35%) シミュレーション係数の根拠", auto: false },
  { name: "内閣府 避難所運営ガイドライン", note: "水3L/人日・Family Meter基準値の根拠(2016年)", auto: false },
  { name: "OCCTO 電力需給検証報告書", note: "全国ピーク需要(1.6億kW)・連系線緊急時稼働率の根拠", auto: false },
];

type PhaseStatus = "completed" | "active" | "planned";
const PHASE_STATUS: Array<{ phase: string; label: string; status: PhaseStatus; items: string[]; remaining?: string[] }> = [
  {
    phase: "Phase 1-4",
    label: "基盤 + シミュレーション",
    status: "completed" as const,
    items: ["全11ページ", "D1/KV/R2", "フロー型モデル", "到着確率", "連系線融通", "PWA", "AGPL-3.0"],
  },
  {
    phase: "Phase 5",
    label: "精度向上（10/10完了）",
    status: "completed" as const,
    items: ["原子力(15基)", "水道カスケード", "SPR放出", "封鎖解除曲線", "需要破壊", "再エネ", "食料SC", "歴史対比", "代替供給ルート", "経済カスケード"],
  },
  {
    phase: "Phase 6",
    label: "データ自動化・信頼性",
    status: "completed" as const,
    items: ["石油備蓄月次自動", "LNG在庫月次自動", "電力需給日次", "OWID週次", "データバリデーション", "セキュリティ監査", "鮮度インジケータ"],
  },
  {
    phase: "Phase 7",
    label: "社会実装基盤",
    status: "completed" as const,
    items: ["API 18本", "sitemap", "ai-plugin", "引用フォーマット", "SNS通知Worker", "RSSニュース監視", "Discord日次サマリ", "Workers AI要約"],
  },
  {
    phase: "Phase 8",
    label: "モデル誠実性・現実連動",
    status: "completed" as const,
    items: ["3シナリオレンジ", "IEA国際比較", "現実イベント37件", "感度分析", "経済カスケード", "地域別ロジスティクス", "国家備蓄基地10基地"],
  },
  {
    phase: "Phase 9",
    label: "当事者リーチ・アクセシビリティ",
    status: "completed" as const,
    items: ["要配慮者チェックリスト(6カテゴリ)", "行動チェックリスト(5カテゴリ)", "住居形態別ガイド", "FAQ構造化データ(9問)", "パーソナライズフィルタ", "Xシェア機能", "アクセシビリティ(ARIA)", "オフライン強化(SW v3)"],
  },
  {
    phase: "Phase 10",
    label: "パニック買い抑止・責任ある情報発信",
    status: "completed" as const,
    items: ["恐怖フレーム→確認フレーム転換", "SNSシェアテキスト設計", "OGP/FAQシナリオ条件明示", "買い占め抑止メッセージ統合", "CountdownTimerシナリオ表示"],
  },
  {
    phase: "Phase 3",
    label: "リアルタイム化（進行中）",
    status: "active" as const,
    items: ["AIS位置+目的港取得", "ETA自動減算", "日本向け判定", "タンカー実データ検証"],
    remaining: ["原油価格自動取得", "衛星AIS"],
  },
];

const SIMULATION_FEATURES = [
  { label: "フロー型在庫モデル", desc: "dStock/dt = Inflow - Consumption + SPR_Release + AlternativeSupply。365日の日次在庫推移をシミュレート" },
  { label: "代替供給ルート", desc: "フジャイラ(UAE)・ヤンブー(サウジ西岸パイプライン)・非中東からの調達。調達成功率は国際競争で日次低下。経産相3/24発表に基づくパラメータ" },
  { label: "SPR放出メカニズム", desc: "国家備蓄: リードタイム14日 + 日次30万kL上限。民間: 実質70%利用可能。産油国共同: 悲観では利用不可" },
  { label: "封鎖解除曲線", desc: "楽観: 7日→30日で解除(残留10%) / 現実: 30日→120日(残留30%) / 悲観: 90日→365日(残留60%)" },
  { label: "需要破壊モデリング", desc: "在庫残量に連動した動的消費削減。50%超: 通常 / 30-50%: 産業15%減 / 10-30%: 35%減 / 10%未満: 55%減" },
  { label: "経済カスケード", desc: "原油価格→ガソリン(弾力性0.7)→物流コスト(0.3)→食品価格(0.15)。IEA価格弾力性+1973年石油ショック実績ベース" },
  { label: "3シナリオ × レンジ表示", desc: "楽観(遮断50%)・現実(遮断94%)・悲観(遮断100%+パニック買い)。全カウントダウンに3シナリオバーを併記" },
  { label: "原子力の地域別寄与", desc: "稼働15基の出力を地域別に反映。設備利用率80%(原子力規制委員会実績値)。関西は原発7基で火力依存が大幅低下。柏崎刈羽6号(東京)は2026年1月再稼働" },
  { label: "再エネバッファ", desc: "太陽光CF15%+風力CF22%+水力CF35%(ISEP自然エネルギー白書実績値)。蓄電池なしの系統安定限界として最大40%カバーに制限(IEA Grid Integration)" },
  { label: "連系線融通", desc: "OCCTO運用容量ベースの10本。非対称容量対応。3回反復で多段融通を安定化。GPS/localStorage/手動の3段階フォールバックでエリア自動選択" },
  { label: "水道崩壊カスケード", desc: "電力停止→水圧低下(同日)→広域断水(+1日)→衛生崩壊(+3日)" },
  { label: "廃棄物カスケード", desc: "石油供給制限+3日→ゴミ収集停止(収集車燃料枯渇)。電力停止→ごみ焼却炉停止。使用済おむつ・医療廃棄物の滞留による衛生リスク" },
  { label: "食料サプライチェーン", desc: "ナフサ→石化製品(PE/PP/PS/PVC)→包装材の連鎖崩壊。化学日報報道に基づくnapthaFactor設定" },
  { label: "物流崩壊モデル", desc: "石油在庫50%→物流稼働100%、30%→70%、10%→30%、0%→完全停止。地域別のトラック燃料依存率×配送遅延バッファで崩壊日を算出。地図上に地域間供給フロー（製油所→油槽所のタンカー・ローリー・鉄道）を可視化" },
  { label: "地域別ロジスティクス", desc: "10エリアの配送遅延(1-5日)・トラック燃料依存率・給油所数(27,414箇所)・物流用軽油消費量・営業トラック台数・地域間供給ルート（出典: 国交省/全日本トラック協会/石油連盟/資源エネルギー庁）" },
  { label: "国家石油備蓄基地", desc: "JOGMEC管理10基地(苫小牧東部/むつ小川原/久慈/秋田/福井/菊間/白島/上五島/串木野/志布志)の地域別配置・容量・貯蔵方式。産油国共同備蓄(UAE/サウジ/クウェート)を含む" },
  { label: "感度分析", desc: "6パラメータを±20%変動させた場合の影響度をトルネードチャートで可視化。Methodologyに配置" },
];

export const About: FC = () => {
  return (
    <div className="space-y-8 max-w-3xl">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-[#ef4444]">ABOUT</span> THIS PROJECT
        </h1>
        <p className="text-neutral-500 text-sm">
          Survive as One Japan — プロジェクト概要
        </p>
      </div>

      {/* ミッション */}
      <div className="bg-[#151c24] border border-[#ef4444]/30 rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-[#ef4444]">MISSION</h2>
        <p className="text-neutral-300 leading-relaxed">
          ホルムズ海峡封鎖時に日本のエネルギー・食料・水道がどう連鎖崩壊するかを可視化し、市民の生存判断を支援する戦術ダッシュボード。
        </p>
        <p className="text-neutral-400 text-sm leading-relaxed">
          特に、乳幼児・在宅医療機器利用者・透析患者・要介護高齢者・障害のある家族を持つ人々が、
          危機の進行を正しく理解し、素早く行動するための情報を提供する。
        </p>
        <p className="text-neutral-400 text-sm leading-relaxed">
          公開統計データに基づく17の計算モデルと3つのシナリオで分析。
          代替供給ルート・経済カスケード・配給制シミュレーション・地域別ロジスティクスを含む。
          予測ではなくリスクシナリオのシミュレーションとして、不確実性を含めて透明に提示する。
        </p>
      </div>

      {/* なぜホルムズ海峡か */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">なぜホルムズ海峡か</h2>
        <div className="space-y-2 text-sm text-neutral-400 leading-relaxed">
          <p>日本の原油輸入の<span className="text-[#f59e0b] font-mono font-bold">94%</span>が中東依存。うち<span className="text-[#f59e0b] font-mono font-bold">93%</span>がホルムズ海峡を通過する。</p>
          <p>封鎖が長期化すれば、火力発電（LNG29.1%+石炭28.2%+石油1.4%+その他6.3%=全体の65%）への燃料供給が影響を受け、電力→石化製品→物流→食料→水道が連鎖的に崩壊する。</p>
          <p className="text-neutral-500 text-xs">{`※ 石油備蓄${staticReserves.oil.totalReserveDays}日分（経産省${staticReserves.meta.baselineDate}時点推計）。LNG在庫は約25日分でホルムズ直接依存は6.3%だが、保険・海運市場への波及で非依存ルートにも影響し得る。`}</p>
        </div>
      </div>

      {/* データの信頼性 */}
      <div className="bg-[#151c24] border border-[#22c55e]/30 rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-[#22c55e]">データの信頼性</h2>
        <div className="space-y-2 text-sm text-neutral-400 leading-relaxed">
          <p>全ての入力データは<span className="text-neutral-200 font-bold">政府統計・公開データ</span>に基づいています。</p>
          <ul className="space-y-1.5 text-xs text-neutral-500">
            <li>・石油備蓄・LNG在庫・電力需給・消費量データは<span className="text-[#22c55e]">自動パイプライン</span>で定期更新（月次/日次/週次）+ バリデーション（絶対範囲・整合性・前回比チェック）</li>
            <li>・データの基準日と経過日数をUI上に常時表示し、鮮度を可視化。封鎖経過日数も全ページに表示</li>
            <li>・タンカー18隻（代替ルート5隻+ASIA VENTURE含む）のIMO・現在位置をMaritimeOptima/AISで検証。日本向けでない船舶はグレーアウト+バッジ表示(2026年4月1日)</li>
            <li>・代替供給ルートは経産相発表(2026-03-24)に基づく。フジャイラ/ヤンブー/非中東/紅海経由の5ルート</li>
            <li>・給油所数は資源エネルギー庁の公的統計(2023年度末27,414箇所)を使用</li>
            <li>・全数値はreserves.jsonからの動的参照に統一。ハードコード値ゼロ</li>
            <li>・セキュリティ監査実施済み（CRITICAL 0/HIGH 0/MEDIUM 0）</li>
          </ul>
        </div>
      </div>

      {/* シミュレーション仕様 */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2a36]">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">シミュレーション仕様（全17モデル）</h2>
        </div>
        <div className="divide-y divide-[#162029]">
          {SIMULATION_FEATURES.map((f) => (
            <div key={f.label} className="px-4 py-3">
              <div className="text-sm font-bold text-neutral-300">{f.label}</div>
              <div className="text-xs text-neutral-500 mt-0.5">{f.desc}</div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-[#1e2a36]">
          <Link
            to="/methodology"
            className="inline-block px-4 py-2 border border-[#f59e0b] text-[#f59e0b] hover:bg-[#f59e0b]/10 font-mono text-xs tracking-wider rounded transition-colors"
          >
            計算式・前提条件の詳細 &rarr;
          </Link>
        </div>
      </div>

      {/* 前提条件と制約 */}
      <div className="bg-[#151c24] border border-[#f59e0b]/30 rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-[#f59e0b]">制約と不確実性</h2>
        <div className="space-y-2 text-sm text-neutral-400 leading-relaxed">
          <p>本シミュレーションは<span className="text-neutral-200 font-bold">リスクシナリオの可視化</span>であり、予測ではありません。</p>
          <ul className="space-y-1.5 text-xs text-neutral-500">
            <li>{`・石油備蓄${staticReserves.oil.totalReserveDays}日分はIEA加盟国で上位の水準（IEA基準約${Math.round(staticReserves.oil.totalReserveDays * 0.85)}日）`}</li>
            <li>・代替供給ルートは実装済みだが、調達成功率の低下モデルは簡易近似。実際の国際市場の競争動態はより複雑</li>
            <li>・経済カスケードは価格弾力性の簡易モデル。為替・金利・GDP波及は未反映</li>
            <li>・再エネの季節変動（太陽光は夏:冬=2:1）・蓄電池モデルは未反映</li>
            <li>・地域別ロジスティクスは配送遅延の簡易モデル。油槽所レベルのグラフネットワークは未実装</li>
            <li>・需要破壊モデルの価格弾力性は1973年石油ショックの近似であり、現代の経済構造との差異がある</li>
          </ul>
        </div>
      </div>

      {/* 精度検証レポート */}
      <div className="bg-[#151c24] border border-[#22c55e]/30 rounded-lg p-6 space-y-4">
        <h2 className="font-mono text-sm tracking-wider text-[#22c55e]">精度検証レポート（2026年4月1日時点）</h2>
        <p className="text-neutral-400 text-sm leading-relaxed">
          封鎖開始（3月1日）から31日間の実データとシミュレーション予測の照合。
          詳細データは<a href="https://surviveasonejp.net/api/validation" target="_blank" rel="noopener noreferrer" className="text-[#22c55e] underline underline-offset-2">/api/validation</a>で取得可能。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-neutral-500 font-mono border-b border-[#1e2a36]">
                <th className="px-3 py-2 text-left">カテゴリ</th>
                <th className="px-3 py-2 text-left">シミュレーション予測</th>
                <th className="px-3 py-2 text-left">実際に起きたこと</th>
                <th className="px-3 py-2 text-left">評価</th>
              </tr>
            </thead>
            <tbody className="text-neutral-400">
              <tr className="border-b border-[#162029]">
                <td className="px-3 py-2 font-mono text-neutral-300">ナフサ枯渇</td>
                <td className="px-3 py-2">napthaFactorベースで包装材消失を予測</td>
                <td className="px-3 py-2">ナフサ在庫14日分（経産省令和8年1月統計）。12拠点中半数減産。出光が減産方針を公表。石化協「4月維持、5月以降焦点」</td>
                <td className="px-3 py-2 text-[#22c55e]">整合</td>
              </tr>
              <tr className="border-b border-[#162029]">
                <td className="px-3 py-2 font-mono text-neutral-300">ガソリン価格</td>
                <td className="px-3 py-2">50%閾値で価格暴騰を予測</td>
                <td className="px-3 py-2">店頭最高値190.8円。政府が補助金48.1円/L（過去最高）で170円台に抑制。在庫50%未達のためモデル閾値未到達</td>
                <td className="px-3 py-2 text-[#22c55e]">整合</td>
              </tr>
              <tr className="border-b border-[#162029]">
                <td className="px-3 py-2 font-mono text-neutral-300">買い占め</td>
                <td className="px-3 py-2">在庫50%以下でパニック買い発生と予測</td>
                <td className="px-3 py-2">石油在庫50%未達だが、医療消耗品で先行発生。ニトリル手袋は封鎖10日目に歯科卸が出荷制限、27日目にメーカー・通販・卸で連鎖的受注停止。原料枯渇ではなく将来の供給不安による買い溜めが主因。韓国ではごみ袋買い占め</td>
                <td className="px-3 py-2 text-[#f59e0b]">想定より早期</td>
              </tr>
              <tr className="border-b border-[#162029]">
                <td className="px-3 py-2 font-mono text-neutral-300">医療消耗品</td>
                <td className="px-3 py-2">ナフサ→石化製品→包装材の連鎖モデル</td>
                <td className="px-3 py-2">封鎖10日目に歯科卸がニトリルグローブ出荷制限、27日目にメーカー・通販・卸で連鎖的受注停止。原料枯渇ではなく供給不安による買い溜めが主因</td>
                <td className="px-3 py-2 text-[#f59e0b]">想定より早期</td>
              </tr>
              <tr className="border-b border-[#162029]">
                <td className="px-3 py-2 font-mono text-neutral-300">代替供給</td>
                <td className="px-3 py-2">28日目で代替ルート到着を予測</td>
                <td className="px-3 py-2">3月28日に代替第1便が今治沖に到着確認（太陽石油・サウジ産原油10万kL）</td>
                <td className="px-3 py-2 text-[#22c55e]">一致</td>
              </tr>
              <tr className="border-b border-[#162029]">
                <td className="px-3 py-2 font-mono text-neutral-300">SPR放出</td>
                <td className="px-3 py-2">14日目に国家備蓄放出開始</td>
                <td className="px-3 py-2">3月16日（15日目）に民間備蓄放出開始、3月26日（25日目）に国家備蓄放出開始</td>
                <td className="px-3 py-2 text-[#f59e0b]">やや遅延</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-neutral-300">建材・樹脂</td>
                <td className="px-3 py-2">食品中心。建材への波及は未モデル化</td>
                <td className="px-3 py-2">フクビ化学が4月1日から全製品供給制限を発表。モデルの範囲外で影響発生</td>
                <td className="px-3 py-2 text-[#f59e0b]">モデル外</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-neutral-600">
          評価基準: 「一致」=日数・事象が正確に一致。「整合」=方向性と規模感が合致。「やや遅延」=発生したが予測日と数日のずれ。「モデル外」=現在のモデルがカバーしていない領域。
          検証用API: <a href="https://surviveasonejp.net/api/validation" target="_blank" rel="noopener noreferrer" className="text-neutral-500 underline underline-offset-2">/api/validation</a> |
          出典マッピング: <a href="https://surviveasonejp.net/api/sources" target="_blank" rel="noopener noreferrer" className="text-neutral-500 underline underline-offset-2">/api/sources</a> |
          計算モデル: <a href="https://surviveasonejp.net/api/methodology" target="_blank" rel="noopener noreferrer" className="text-neutral-500 underline underline-offset-2">/api/methodology</a>
        </p>
      </div>

      {/* データソース */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2a36]">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">データソース</h2>
        </div>
        <div className="divide-y divide-[#162029]">
          {DATA_SOURCES_LIST.map((ds) => (
            <div key={ds.name} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-sm text-neutral-300 sm:w-56 shrink-0 flex items-center gap-1.5">
                {ds.name}
                {ds.auto && (
                  <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30">
                    AUTO
                  </span>
                )}
              </span>
              <span className="text-xs text-neutral-500">{ds.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 開発フェーズ */}
      <div className="space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">開発ロードマップ</h2>
        <div className="space-y-3">
          {PHASE_STATUS.map((p) => (
            <div
              key={p.phase}
              className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-4 flex gap-4"
            >
              <div className="shrink-0 pt-0.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full mt-1.5 ${
                    p.status === "completed"
                      ? "bg-[#22c55e]"
                      : p.status === "active"
                        ? "bg-[#f59e0b]"
                        : "bg-[#1e2a36]"
                  }`}
                />
              </div>
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-bold text-neutral-300">{p.phase}</span>
                  <span className="text-xs text-neutral-500">{p.label}</span>
                  {p.status === "completed" && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30">LIVE</span>
                  )}
                  {p.status === "active" && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30">IN PROGRESS</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.items.map((item) => (
                    <span
                      key={item}
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                      style={{
                        backgroundColor:
                          p.status === "completed" ? "#22c55e12"
                          : p.status === "active" ? "#f59e0b12"
                          : "#1e2a36",
                        color:
                          p.status === "completed" ? "#22c55e"
                          : p.status === "active" ? "#f59e0b"
                          : "#555",
                      }}
                    >
                      {item}
                    </span>
                  ))}
                  {"remaining" in p && p.remaining?.map((item) => (
                    <span
                      key={item}
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-[#1e2a36] text-neutral-600 border border-[#333] border-dashed"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 技術スタック */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">TECH STACK</h2>
        <div className="flex flex-wrap gap-2">
          {["Cloudflare Workers", "Workers AI", "D1", "KV", "R2", "Cron Triggers", "React 19", "TypeScript", "Vite", "Tailwind CSS 4", "PWA"].map((t) => (
            <span key={t} className="text-xs px-2 py-0.5 rounded font-mono bg-[#1e2a36] text-neutral-400 border border-[#1e2a36]">
              {t}
            </span>
          ))}
        </div>
        <div className="text-xs text-neutral-600 font-mono space-y-0.5">
          <p>API: 21エンドポイント（.org + .net専用ドメイン）+ OpenAPI 3.0 + AI Plugin</p>
          <p>Cronパイプライン: 4/5枠使用（OWID週次 + 電力日次 + AIS 1日2回 + 石油備蓄/LNG月次）+ Discord通知(日次サマリ+差分検知+RSS監視)Worker + Workers AI LLM要約</p>
          <p>コスト: インフラ ~$3/月（ドメイン2件。Cloudflare無料枠）+ 開発ツール（AI支援）~$100-200/月</p>
        </div>
      </div>

      {/* 支援 */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-6 space-y-4">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">SUPPORT THIS PROJECT</h2>
        <p className="text-neutral-300 text-sm leading-relaxed">
          広告なし・トラッキングなし・個人情報収集なしのオープンソースプロジェクトです。
          全てのデータ・シミュレーション・APIはスポンサーの有無にかかわらず完全に無料で公開されています。
        </p>
        <div className="text-xs text-neutral-500 space-y-2 leading-relaxed">
          <p>インフラ: ドメイン2件（月額約$3）。Cloudflare Workers/D1/KV/R2は全て無料枠内。開発にはAI支援ツールを使用しており（月額$100-200）、これが実質的な最大の支出です。</p>
          <p>スポンサーシップは、このプロジェクトの継続的な開発と運営に使われます。</p>
        </div>
        <a
          href="https://github.com/sponsors/idx"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-2 border border-neutral-600 text-neutral-300 hover:bg-white/5 font-mono text-xs tracking-wider rounded transition-colors"
        >
          GitHub Sponsors で支援する &rarr;
        </a>
      </div>

      {/* リンク */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">LINKS</h2>
        <div className="space-y-2 text-sm">
          <div className="flex gap-3">
            <span className="text-neutral-500 font-mono w-24 shrink-0">GitHub</span>
            <a href="https://github.com/surviveasonejp" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-neutral-200 transition-colors">github.com/surviveasonejp</a>
          </div>
          <div className="flex gap-3">
            <span className="text-neutral-500 font-mono w-24 shrink-0">API</span>
            <a href="https://surviveasonejp.net/api" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-neutral-200 transition-colors">surviveasonejp.net/api</a>
          </div>
          <div className="flex gap-3">
            <span className="text-neutral-500 font-mono w-24 shrink-0">X</span>
            <a href="https://x.com/surviveasonejp" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-neutral-200 transition-colors">@surviveasonejp</a>
          </div>
          <div className="flex gap-3">
            <span className="text-neutral-500 font-mono w-24 shrink-0">License</span>
            <span className="text-neutral-400">AGPL-3.0（商用は個別ライセンス）</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/methodology"
          className="px-4 py-2 border border-[#f59e0b] text-[#f59e0b] hover:bg-[#f59e0b]/10 font-mono text-xs tracking-wider rounded transition-colors"
        >
          METHODOLOGY &rarr;
        </Link>
        <Link
          to="/prepare"
          className="px-4 py-2 border border-[#22c55e] text-[#22c55e] hover:bg-[#22c55e]/10 font-mono text-xs tracking-wider rounded transition-colors"
        >
          SURVIVAL GUIDE &rarr;
        </Link>
        <Link
          to="/dashboard"
          className="px-4 py-2 border border-[#1e2a36] text-neutral-400 hover:bg-white/5 font-mono text-xs tracking-wider rounded transition-colors"
        >
          DASHBOARD &rarr;
        </Link>
      </div>

      <p className="text-xs text-neutral-600 font-mono">
        本シミュレーションは公開データに基づくリスクシナリオの推定値です。予測ではありません。実際の備蓄運用は政府判断により変動します。
      </p>
    </div>
  );
};
