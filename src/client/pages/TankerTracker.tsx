import { type FC, useState, useRef, useEffect, useCallback } from "react";
import { CountdownTimer } from "../components/CountdownTimer";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { TankerMap, type MapScenario } from "../components/TankerMap";
import { SupplyGapChart } from "../components/SupplyGapChart";
import { ArrivalTimeline } from "../components/ArrivalTimeline";
import { AlternativeRoutePanel } from "../components/AlternativeRoutePanel";
import { useTankerData } from "../hooks/useTankerData";
import { getAlertLevel, getAlertColor } from "../lib/alertHelpers";
import { formatDecimal, formatNumber, formatDistance, formatDepletionDate } from "../lib/formatters";
import { ALL_ROUTES } from "../lib/tankerPosition";
import { Badge } from "../components/Badge";
import { SectionHeading } from "../components/SectionHeading";

/** 米国産原油の出発港 */
const US_ORIGIN_PORTS = new Set([
  "USGC", "Ingleside", "Ingleside-Cape", "USGC-Cape", "Cameron", "Sabine Pass",
]);

/** ホルムズ海峡内側の出発港 — 封鎖時に日本到達不可 */
const HORMUZ_PORTS = new Set([
  "Ras Tanura", "Jubail", "Kharg Island",
  "Ras Laffan", "Mina Al Ahmadi", "Basrah",
]);

/** 日本の到着港 */
const JAPAN_DEST_PORTS = new Set([
  "Japan", "Kawasaki", "Hiroshima", "Chiba", "Yokkaichi", "Sakai",
  "Mizushima", "Kiire", "Futtsu", "Chita", "Kitakyushu", "Himeji",
  "Sodegaura", "Sendai", "Naha", "Kashima", "Negishi", "Oita", "Ehime",
  "Yokohama", "Hitachi", "Sakai/Izumiotsu",
]);

/** 米国産ルート種別 */
function getUsRoute(departurePort: string): string {
  return ["Ingleside-Cape", "USGC-Cape"].includes(departurePort)
    ? "喜望峰経由"
    : "パナマ運河経由";
}

/** データセット内の最大積載量（TAKASAGO 313,989t） */
const MAX_CARGO_T = 314000;

/** cargo_t → サイズ分類 */
function getSizeClass(cargo_t: number): { label: string; color: string } {
  if (cargo_t >= 200000) return { label: "超大型", color: "#78716c" };
  if (cargo_t >= 80000) return { label: "大型", color: "#94a3b8" };
  return { label: "中型", color: "var(--color-info-lighter)" };
}

export const TankerTracker: FC = () => {
  const { tankers, meta } = useTankerData();
  const isBlocked = (t: { departurePort: string }) => HORMUZ_PORTS.has(t.departurePort);
  const isNotJapanBound = (t: { destinationPort: string }) => !JAPAN_DEST_PORTS.has(t.destinationPort);
  const isDimmed = (t: { departurePort: string; destinationPort: string }) => isBlocked(t) || isNotJapanBound(t);
  const vlccTankers = tankers.filter((t) => t.type === "VLCC" && !isDimmed(t));
  const lngTankers = tankers.filter((t) => t.type === "LNG" && !isDimmed(t));
  const usTankers = tankers.filter((t) => US_ORIGIN_PORTS.has(t.departurePort));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapScenario, setMapScenario] = useState<MapScenario>("full");
  const [showInset, setShowInset] = useState(false);
  const [showDimmed, setShowDimmed] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // PCのみインセット表示（md: 768px以上）
  const updateInset = useCallback(() => {
    setShowInset(window.innerWidth >= 768);
  }, []);

  useEffect(() => {
    updateInset();
    window.addEventListener("resize", updateInset);
    return () => window.removeEventListener("resize", updateInset);
  }, [updateInset]);

  // マップで船舶選択時、テーブルの該当行にスクロール
  useEffect(() => {
    if (selectedId) {
      const row = rowRefs.current.get(selectedId);
      row?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedId]);

  // ルート・タンカー選択時は互いにクリア
  const handleTankerSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id !== null) setSelectedRouteId(null);
  }, []);

  const handleRouteSelect = useCallback((id: string | null) => {
    setSelectedRouteId(id);
    if (id !== null) setSelectedId(null);
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-[#94a3b8]">LAST TANKER</span> TRACKER
        </h1>
        <p className="text-neutral-500 text-sm">
          ホルムズ封鎖シナリオ下での日本向けタンカー入港追跡 — 代替ルート・非ホルムズ便の到着見通しと封鎖影響を航路別に可視化
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] font-mono text-neutral-500">
          <span>データ基準日: {meta.updatedAt}</span>
          {meta.lastAisFetch ? (
            <span>AIS最終取得: {new Intl.DateTimeFormat("ja-JP", {
              timeZone: "Asia/Tokyo",
              month: "numeric", day: "numeric",
              hour: "2-digit", minute: "2-digit",
            }).format(new Date(meta.lastAisFetch))} JST</span>
          ) : (
            <span className="text-neutral-600">AIS: 未取得</span>
          )}
        </div>
      </div>

      <AlertBanner
        level="warning"
        message="4/2 オマーン籍VLCC2隻・LNG1隻がオマーン沿岸ルートで通過の可能性（衛星確認）。通航の可否は軍事・外交情勢に依存 — シミュレーションは封鎖完全閉鎖の最悪ケース"
      />

      <SimulationBanner />

      {/* ── PC: マップ(左) + サイドパネル(右) / モバイル: 縦積み ── */}
      <div className="grid md:grid-cols-[3fr_2fr] gap-4 items-start">

        {/* 左カラム: シナリオセレクター + マップ */}
        <div className="space-y-2">
          {/* シナリオセレクター + フィルター */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md overflow-hidden border border-border text-[11px] font-mono">
              {(
                [
                  { key: "normal" as MapScenario, label: "通常時" },
                  { key: "partial" as MapScenario, label: "部分封鎖" },
                  { key: "full" as MapScenario, label: "完全封鎖" },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setMapScenario(key)}
                  className={`px-3 py-1 transition-colors ${
                    mapScenario === key
                      ? "bg-neutral-700 text-neutral-100"
                      : "bg-transparent text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowDimmed((v) => !v)}
              className={`px-3 py-1 rounded-md border text-[11px] font-mono transition-colors ${
                showDimmed
                  ? "border-neutral-500 bg-neutral-700 text-neutral-200"
                  : "border-border text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {showDimmed ? "全船表示" : "日本向けのみ"}
            </button>
            <span className="text-[10px] text-neutral-600 font-mono hidden sm:inline">
              {mapScenario === "normal" && "全ルート通常稼働"}
              {mapScenario === "partial" && "ホルムズ50%制限"}
              {mapScenario === "full" && "完全封鎖 — 代替ルート強調"}
            </span>
          </div>

          <TankerMap
            tankers={tankers}
            selectedId={selectedId}
            onSelect={handleTankerSelect}
            scenario={mapScenario}
            showInset={showInset}
            showDimmed={showDimmed}
            selectedRouteId={selectedRouteId}
            onRouteSelect={handleRouteSelect}
            onRouteHover={setHoveredRouteId}
          />
        </div>

        {/* 右カラム: サイドパネル（PCのみ sticky） */}
        <div className="md:sticky md:top-20 space-y-3">
          {/* ── ルート詳細（ホバー/選択時） ── */}
          {(() => {
            const activeRouteId = selectedRouteId ?? hoveredRouteId;
            const route = activeRouteId ? (ALL_ROUTES[activeRouteId] ?? null) : null;
            if (!route) return null;
            const routeTypeLabel: Record<string, string> = {
              primary: "主要航路", bypass: "代替迂回路", existing_alt: "既存代替源",
            };
            const routeTypeColor: Record<string, string> = {
              primary: "#f59e0b", bypass: "#3b82f6", existing_alt: "#22c55e",
            };
            const chopkLabels: Record<string, string> = {
              hormuz: "ホルムズ海峡", malacca: "マラッカ海峡", lombok: "ロンボク海峡",
              tsugaru: "津軽海峡", panama: "パナマ運河", babel: "バベルマンデブ海峡",
              "good-hope": "喜望峰",
            };
            const color = routeTypeColor[route.route_type] ?? "#94a3b8";
            return (
              <div className="bg-panel border rounded-lg p-4 space-y-3 text-xs font-mono" style={{ borderColor: color }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-text leading-tight">{route.label}</div>
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: `${color}22`, color }}>
                    {routeTypeLabel[route.route_type] ?? route.route_type}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <span className="text-text-muted">輸送容量</span>
                  <span className="text-text font-bold">{route.capacity_mbpd.toFixed(2)} mbpd</span>
                  <span className="text-text-muted">所要日数</span>
                  <span className="text-text font-bold">約{route.transit_days}日</span>
                </div>
                {route.chokepoints.length > 0 ? (
                  <div className="space-y-1">
                    <div className="text-text-muted">通過チョークポイント</div>
                    {route.chokepoints.map((cp) => (
                      <div key={cp} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-soft shrink-0" />
                        <span className="text-text">{chopkLabels[cp] ?? cp}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-success">✓ チョークポイントなし</div>
                )}
                {route.risk_note !== undefined && (
                  <div className="text-warning">⚠ {route.risk_note}</div>
                )}
                {selectedRouteId && (
                  <button
                    onClick={() => handleRouteSelect(null)}
                    className="text-[10px] text-text-muted hover:text-text transition-colors"
                  >
                    × 閉じる
                  </button>
                )}
              </div>
            );
          })()}

          {/* ── タンカー詳細（選択時） ── */}
          {(() => {
            if (!selectedId) return null;
            const t = tankers.find((v) => v.id === selectedId);
            if (!t) return null;
            const blocked = HORMUZ_PORTS.has(t.departurePort);
            const notJapan = !JAPAN_DEST_PORTS.has(t.destinationPort);
            const typeColor = t.type === "VLCC" ? "#f59e0b" : "#22c55e";
            const level = getAlertLevel(t.eta_days);
            const etaColor = blocked || notJapan ? "#525252" : getAlertColor(level);
            return (
              <div className="bg-panel border border-border rounded-lg p-4 space-y-3 text-xs font-mono">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: `${typeColor}20`, color: typeColor }}>
                      {t.type}
                    </span>
                    <span className="font-bold text-text">{t.name}</span>
                    {t.aisTracked && (
                      <Badge tone="success" className="text-[8px] px-1">AIS</Badge>
                    )}
                  </div>
                  <button onClick={() => handleTankerSelect(null)} className="text-text-muted hover:text-text transition-colors text-[10px]">×</button>
                </div>
                <div className="text-text-muted">{t.departure} → {t.destination}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <span className="text-text-muted">到着まで</span>
                  <span className="font-bold" style={{ color: etaColor }}>
                    {blocked || notJapan ? "—" : `${t.eta_days.toFixed(1)}日`}
                  </span>
                  <span className="text-text-muted">到着予定</span>
                  <span className="text-text">{blocked || notJapan ? "—" : formatDepletionDate(t.eta_days)}</span>
                  <span className="text-text-muted">積載量</span>
                  <span className="text-text">{formatNumber(t.cargo_t)}t</span>
                  <span className="text-text-muted">速度</span>
                  <span className="text-text">{formatDecimal(t.speed_knots)}kn</span>
                  <span className="text-text-muted">距離</span>
                  <span className="text-text">{formatDistance(t.distanceToJapan_nm)}</span>
                </div>
                {blocked && <div className="text-primary-soft font-bold">封鎖時到達不可</div>}
                {!blocked && notJapan && <div className="text-text-muted">日本向けでない</div>}
              </div>
            );
          })()}

          {/* ── デフォルト: カウントダウン ── */}
          {!selectedId && !selectedRouteId && !hoveredRouteId && (
            <div className="space-y-3">
              <CountdownTimer
                label="代替ルートVLCC 最遠入港予測"
                totalSeconds={(vlccTankers[vlccTankers.length - 1]?.eta_days ?? 0) * 86400}
              />
              {(() => {
                const nextLng = lngTankers.find((t) => t.eta_days >= 1);
                const arrivingToday = !nextLng && lngTankers.some((t) => t.eta_days > 0);
                if (nextLng) {
                  return (
                    <CountdownTimer label="次のLNG船到着（非ホルムズ）" totalSeconds={nextLng.eta_days * 86400} noAlert />
                  );
                }
                return (
                  <div className="bg-panel border border-border rounded-lg p-4 text-center">
                    <div className="text-xs font-mono text-text-muted tracking-wider mb-2">次のLNG船到着（非ホルムズ）</div>
                    <div className={`font-mono font-bold text-2xl ${arrivingToday ? "text-info" : "text-success"}`}>
                      {arrivingToday ? "本日入港予定" : "入港済み"}
                    </div>
                  </div>
                );
              })()}
              <p className="text-[10px] text-text-muted font-mono">
                LNG: 豪州・サハリン・マレーシア産は継続入港。カタール産（ホルムズ経由）停止中。
              </p>
            </div>
          )}

          {/* ── コンパクトタンカーリスト ── */}
          <div className="bg-panel border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-[10px] font-mono text-text-muted tracking-wider">
                {showDimmed ? `全タンカー ${tankers.length}隻` : `日本向け ${tankers.filter((t) => !isDimmed(t)).length}隻`}
              </span>
              <span className="text-[9px] font-mono text-text-muted">タップで選択</span>
            </div>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {(showDimmed ? tankers : tankers.filter((t) => !isDimmed(t))).map((t) => {
                const typeColor = t.type === "VLCC" ? "#f59e0b" : "#22c55e";
                const dimmed = isDimmed(t);
                const level = getAlertLevel(t.eta_days);
                const etaColor = dimmed ? "#525252" : getAlertColor(level);
                return (
                  <button
                    key={t.id}
                    ref={(el) => { if (el) rowRefs.current.set(t.id, el as unknown as HTMLTableRowElement); }}
                    onClick={() => handleTankerSelect(selectedId === t.id ? null : t.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-[11px] font-mono transition-colors text-left ${
                      selectedId === t.id ? "bg-info/10" : "hover:bg-white/[0.03]"
                    } ${dimmed ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: typeColor }} />
                      <span className={`text-text-muted truncate ${dimmed ? "line-through" : ""}`}>{t.name}</span>
                      {t.aisTracked && <span className="text-[8px] text-success-soft shrink-0">AIS</span>}
                      {t.status === "引き返し" && <span className="text-[8px] text-warning-soft shrink-0">引返</span>}
                    </div>
                    <span className="font-bold shrink-0 ml-2" style={{ color: etaColor }}>
                      {dimmed ? "—" : `${t.eta_days.toFixed(1)}日`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── 以下: 全幅セクション ── */}

      {/* 到着タイムライン */}
      <ArrivalTimeline
        tankers={tankers}
        selectedId={selectedId}
        onSelect={handleTankerSelect}
      />

      {/* 米国産原油パネル（D案: PC/Mobile両対応 HTML） */}
      {usTankers.length > 0 && (
        <div className="bg-panel border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-mono text-sm tracking-wider text-neutral-300">
              米国産原油 — ホルムズ・バベルマンデブ完全回避ルート
            </h2>
            <p className="text-[11px] text-neutral-600 mt-0.5 font-mono">
              パナマ運河経由（約30日）・喜望峰経由（約35日）。地図右端から出現する理由はこの航路にある。
            </p>
          </div>
          <div className="p-4 flex flex-col md:flex-row gap-5">
            {/* 航路模式図 */}
            <div className="md:w-2/5 space-y-3 shrink-0">
              <div className="text-[10px] font-mono text-neutral-600 uppercase tracking-wider">航路</div>
              <div className="space-y-2">
                <div>
                  <div className="flex items-center gap-1 flex-wrap text-[11px] font-mono">
                    <span className="text-neutral-400">米国ガルフ</span>
                    <span className="text-neutral-700">→</span>
                    <span className="text-warning-soft">パナマ運河</span>
                    <span className="text-neutral-700">→ 太平洋北上 →</span>
                    <span className="text-info">日本</span>
                  </div>
                  <div className="text-[10px] text-neutral-700 font-mono mt-0.5 ml-0">
                    地図右端（東経170度）から現れ左へ進む。約30日・ホルムズ非経由
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1 flex-wrap text-[11px] font-mono">
                    <span className="text-neutral-400">米国ガルフ</span>
                    <span className="text-neutral-700">→</span>
                    <span className="text-neutral-400">大西洋南下</span>
                    <span className="text-neutral-700">→</span>
                    <span className="text-neutral-500">喜望峰</span>
                    <span className="text-neutral-700">→ インド洋 →</span>
                    <span className="text-info">日本</span>
                  </div>
                  <div className="text-[10px] text-neutral-700 font-mono mt-0.5">
                    地図左端（喜望峰付近）から現れ右へ進む。約35日・ホルムズ非経由
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-neutral-700 font-mono pt-1 border-t border-border">
                計 約1,200万バレル（Bloomberg 2026-04-08）
              </div>
            </div>

            {/* タンカー一覧 */}
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-mono text-neutral-600 uppercase tracking-wider mb-2">追跡中</div>
              <div className="space-y-1.5">
                {usTankers.map((t) => {
                  const route = getUsRoute(t.departurePort);
                  const isArrived = t.status === "入港済";
                  const etaColor = isArrived ? "#16a34a" : "#2563eb";
                  return (
                    <div
                      key={t.id}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded border text-[11px] font-mono cursor-pointer transition-colors ${
                        selectedId === t.id
                          ? "border-info/50 bg-info/5"
                          : "border-border bg-white/[0.02] hover:bg-white/[0.04]"
                      }`}
                      onClick={() => handleTankerSelect(selectedId === t.id ? null : t.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-neutral-200 truncate">{t.name}</span>
                        <span className="text-[9px] text-neutral-600 shrink-0 hidden sm:inline">{route}</span>
                        <span className="text-[9px] text-neutral-700 shrink-0 hidden md:inline truncate">
                          {t.cargoType.split('（')[0]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[9px] text-neutral-600 hidden sm:inline">{t.type}</span>
                        <span className="font-bold" style={{ color: etaColor }}>
                          {isArrived ? "入港済" : `${t.eta_days.toFixed(1)}日`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 供給ギャップチャート */}
      <SupplyGapChart scenario={mapScenario} />

      {/* 代替ルート供給余力パネル */}
      <AlternativeRoutePanel />

      {/* 到着順ランキング */}
      <div className="bg-panel border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <SectionHeading as="h2" tone="neutral-muted" size="sm" tracking="wider">到着順ランキング</SectionHeading>
        </div>

        {/* デスクトップ: テーブル */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-500 font-mono text-xs border-b border-border">
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">船名</th>
                <th className="px-4 py-2 text-left">種別</th>
                <th className="px-4 py-2 text-left">出発地</th>
                <th className="px-4 py-2 text-left">行先</th>
                <th className="px-4 py-2 text-right">距離</th>
                <th className="px-4 py-2 text-right">速度</th>
                <th className="px-4 py-2 text-right">到着予測</th>
                <th className="px-4 py-2 text-right">積荷</th>
              </tr>
            </thead>
            <tbody>
              {tankers.map((tanker, index) => {
                const blocked = isBlocked(tanker);
                const notJapan = isNotJapanBound(tanker);
                const dimmed = blocked || notJapan;
                const level = getAlertLevel(tanker.eta_days);
                const color = dimmed ? "#525252" : getAlertColor(level);
                const isSelected = tanker.id === selectedId;
                const dimClass = dimmed ? "opacity-45" : "";
                return (
                  <tr
                    key={tanker.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(tanker.id, el);
                    }}
                    className={`border-b border-border cursor-pointer transition-colors ${
                      isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.02]"
                    } ${dimClass}`}
                    onClick={() => handleTankerSelect(isSelected ? null : tanker.id)}
                  >
                    <td className="px-4 py-2 font-mono text-neutral-500">{index + 1}</td>
                    <td className="px-4 py-2 font-bold text-neutral-200">
                      <span className={dimmed ? "line-through" : ""}>{tanker.name}</span>
                      {tanker.aisTracked ? (
                        <Badge tone="success" className="ml-1.5 text-[8px] font-normal px-1">
                          AIS
                        </Badge>
                      ) : (
                        <span className="ml-1.5 text-[8px] font-mono font-normal px-1 py-0.5 rounded bg-neutral-800 text-neutral-500 border border-neutral-700">
                          推定
                        </span>
                      )}
                      {blocked && (
                        <span className="ml-1.5 text-[10px] font-mono font-normal px-1.5 py-0.5 rounded bg-red-900/40 text-red-400">
                          封鎖時到達不可
                        </span>
                      )}
                      {!blocked && notJapan && (
                        <span className="ml-1.5 text-[10px] font-mono font-normal px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700 badge-not-japan">
                          日本向けでない
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-0.5 items-start">
                        <span
                          className="font-mono text-xs px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: tanker.type === "VLCC" ? "#f59e0b20" : "#22c55e20",
                            color: tanker.type === "VLCC" ? "#f59e0b" : "#22c55e",
                          }}
                        >
                          {tanker.type}
                        </span>
                        <span
                          className="font-mono text-[9px]"
                          style={{ color: getSizeClass(tanker.cargo_t).color }}
                        >
                          {getSizeClass(tanker.cargo_t).label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-neutral-400">{tanker.departure}</td>
                    <td className="px-4 py-2 text-neutral-400">{tanker.destination}</td>
                    <td className="px-4 py-2 text-right font-mono text-neutral-500">
                      {formatDistance(tanker.distanceToJapan_nm)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-neutral-500">
                      {formatDecimal(tanker.speed_knots)}kn
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-bold" style={{ color }}>
                      <div className={dimmed ? "line-through" : ""}>{dimmed && tanker.eta_days === 0 ? "—" : `${formatDecimal(tanker.eta_days)}日`}</div>
                      <div className="text-xs font-normal text-neutral-400">{dimmed ? "—" : formatDepletionDate(tanker.eta_days)}</div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-neutral-400">
                      <div>{formatNumber(tanker.cargo_t)}t</div>
                      <div className="mt-0.5 flex justify-end">
                        <div
                          className="h-1 rounded-full"
                          style={{
                            width: `${Math.max((tanker.cargo_t / MAX_CARGO_T) * 40, 2)}px`,
                            backgroundColor: tanker.type === "VLCC" ? "#f59e0b" : "#22c55e",
                            opacity: dimmed ? 0.25 : 0.65,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* モバイル: カードレイアウト */}
        <div className="md:hidden divide-y divide-border">
          {tankers.map((tanker, index) => {
            const blocked = isBlocked(tanker);
            const notJapan = isNotJapanBound(tanker);
            const dimmed = blocked || notJapan;
            const level = getAlertLevel(tanker.eta_days);
            const color = dimmed ? "#525252" : getAlertColor(level);
            const isSelected = tanker.id === selectedId;
            const typeColor = tanker.type === "VLCC" ? "#f59e0b" : "#22c55e";
            return (
              <div
                key={tanker.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(tanker.id, el as unknown as HTMLTableRowElement);
                }}
                className={`px-4 py-3 cursor-pointer transition-colors ${
                  isSelected ? "bg-white/[0.06]" : "active:bg-white/[0.03]"
                } ${dimmed ? "opacity-45" : ""}`}
                onClick={() => handleTankerSelect(isSelected ? null : tanker.id)}
              >
                {/* 1行目: 順位 + 船名 + バッジ */}
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-neutral-600 w-5 shrink-0">{index + 1}</span>
                  <span className={`font-bold text-sm text-neutral-200 ${dimmed ? "line-through" : ""}`}>{tanker.name}</span>
                  {tanker.aisTracked ? (
                    <Badge tone="success" className="text-[10px] shrink-0">
                      AIS
                    </Badge>
                  ) : (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 border border-neutral-700 shrink-0">
                      推定
                    </span>
                  )}
                  <span
                    className="font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0"
                    style={{ backgroundColor: `${typeColor}20`, color: typeColor }}
                  >
                    {tanker.type}
                  </span>
                  <span
                    className="font-mono text-[10px] shrink-0"
                    style={{ color: getSizeClass(tanker.cargo_t).color }}
                  >
                    {getSizeClass(tanker.cargo_t).label}
                  </span>
                  {blocked && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 shrink-0">
                      封鎖時到達不可
                    </span>
                  )}
                  {!blocked && notJapan && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700 badge-not-japan shrink-0">
                      日本向けでない
                    </span>
                  )}
                </div>
                {/* 2行目: 航路 + ETA */}
                <div className="flex items-baseline justify-between mt-1.5 ml-7">
                  <span className="text-xs text-neutral-500 truncate mr-3">
                    {tanker.departure} → {tanker.destination}
                  </span>
                  <span className="font-mono text-sm font-bold shrink-0" style={{ color }}>
                    {dimmed && tanker.eta_days === 0 ? "—" : `${formatDecimal(tanker.eta_days)}日`}
                  </span>
                </div>
                {/* 3行目: 詳細（選択時のみ展開） */}
                {isSelected && (
                  <div className="mt-2 ml-7 grid grid-cols-3 gap-y-1 text-[10px] font-mono">
                    <div>
                      <div className="text-neutral-600">距離</div>
                      <div className="text-neutral-400">{formatDistance(tanker.distanceToJapan_nm)}</div>
                    </div>
                    <div>
                      <div className="text-neutral-600">速度</div>
                      <div className="text-neutral-400">{formatDecimal(tanker.speed_knots)}kn</div>
                    </div>
                    <div>
                      <div className="text-neutral-600">積荷</div>
                      <div className="text-neutral-400">{formatNumber(tanker.cargo_t)}t</div>
                      <div className="mt-0.5">
                        <div
                          className="h-1 rounded-full"
                          style={{
                            width: `${Math.max((tanker.cargo_t / MAX_CARGO_T) * 36, 2)}px`,
                            backgroundColor: tanker.type === "VLCC" ? "#f59e0b" : "#22c55e",
                            opacity: 0.65,
                          }}
                        />
                      </div>
                    </div>
                    {!dimmed && (
                      <div className="col-span-3 mt-0.5">
                        <div className="text-neutral-600">到着予定</div>
                        <div className="text-neutral-400">{formatDepletionDate(tanker.eta_days)}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 計算根拠 */}
      <div className="bg-panel border border-border rounded-lg p-4 text-xs text-neutral-500 font-mono space-y-2">
        <p className="text-neutral-400 font-bold">計算根拠:</p>
        <p>到着予測日数 = 航路距離(海里) ÷ (速度(knots) × 24時間)</p>
        <p>推定位置 = 航路ウェイポイント上をETA進捗率で線形補間</p>
        <p>VLCC標準速度: 12〜12.5knots / LNG船標準速度: 17〜19.5knots</p>
        <p className="text-neutral-600">※ シミュレーションは封鎖完全閉鎖を前提とした最悪ケース。4/2 オマーン籍船3隻が南側ルートで通過の可能性あり（出典: Bloomberg）。通航可否は軍事・外交情勢に依存</p>
        <p className="text-neutral-600">※ 地図上の位置はETA逆算による推定値です。AIS未接続のため実際の位置とは異なります</p>
      </div>
    </div>
  );
};
