/**
 * AlternativeRoutePanel
 *
 * 代替ルート供給余力パネル。
 * sea-routes.json のデータを使い「ホルムズ封鎖時に何Mbpd確保できるか」を
 * 具体的な航行日数・ルート別で示す。
 * 確認フレーム: 「完全停止ではなく制約付き供給」を数字で可視化。
 */
import { type FC } from "react";
import seaRoutes from "../data/sea-routes.json";

interface RouteEntry {
  waypoints: number[][];
  chokepoints: string[];
  capacity_mbpd?: number;
  route_type: string;
  label: string;
  transit_days: number;
  risk_note?: string;
  partialRoute?: boolean;
}

type SeaRoutes = Record<string, RouteEntry>;
const routes = seaRoutes as SeaRoutes;

interface RouteDisplayConfig {
  key: string;
  status: "blocked" | "bypass" | "active";
  statusLabel: string;
  statusColor: string;
  note?: string;
}

const ROUTE_CONFIGS: RouteDisplayConfig[] = [
  {
    key: "hormuz-malacca",
    status: "blocked",
    statusLabel: "封鎖時停止",
    statusColor: "#dc2626",
    note: "ホルムズ内側の港から出港不可",
  },
  {
    key: "fujairah-malacca",
    status: "bypass",
    statusLabel: "代替可",
    statusColor: "#d97706",
    note: "ホルムズ外側・フジャイラ積み替え",
  },
  {
    key: "yanbu-suez",
    status: "bypass",
    statusLabel: "代替可（リスクあり）",
    statusColor: "#eab308",
  },
  {
    key: "usgc-capehope",
    status: "bypass",
    statusLabel: "緊急代替",
    statusColor: "#f97316",
    note: "欧州→喜望峰→日本。通常ルート+約15日",
  },
  {
    key: "australia-west",
    status: "active",
    statusLabel: "継続中",
    statusColor: "#16a34a",
  },
  {
    key: "australia-east",
    status: "active",
    statusLabel: "継続中",
    statusColor: "#16a34a",
  },
  {
    key: "southeast-asia",
    status: "active",
    statusLabel: "継続中",
    statusColor: "#16a34a",
  },
  {
    key: "sakhalin",
    status: "active",
    statusLabel: "継続中",
    statusColor: "#16a34a",
  },
  {
    key: "us-pacific",
    status: "active",
    statusLabel: "継続中",
    statusColor: "#16a34a",
  },
];

function CapacityBar({ mbpd, max }: { mbpd: number; max: number }) {
  const pct = max > 0 ? Math.min((mbpd / max) * 100, 100) : 0;
  return (
    <div className="h-1 bg-[#e2e8f0] rounded-full overflow-hidden">
      <div
        className="h-full bg-[#2563eb] rounded-full"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export const AlternativeRoutePanel: FC = () => {
  // ホルムズ依存分
  const hormuzRoute = routes["hormuz-malacca"];
  const hormuzCapacity = hormuzRoute?.capacity_mbpd ?? 2.3;

  // 代替ルート（bypass + active 合計）
  const altCapacity = ROUTE_CONFIGS.filter((c) => c.status !== "blocked").reduce((sum, c) => {
    const r = routes[c.key];
    return sum + (r?.capacity_mbpd ?? 0);
  }, 0);

  // 供給ギャップ
  const gapMbpd = Math.max(hormuzCapacity - altCapacity, 0);
  const coverageRate = Math.min((altCapacity / hormuzCapacity) * 100, 100);

  // 最大容量（バー幅の基準）
  const maxCapacity = hormuzCapacity;

  const bypassRoutes = ROUTE_CONFIGS.filter((c) => c.status === "bypass");
  const activeRoutes = ROUTE_CONFIGS.filter((c) => c.status === "active");
  const blockedRoute = ROUTE_CONFIGS.filter((c) => c.status === "blocked");

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-lg p-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-mono text-xs tracking-widest text-neutral-500">
          ALTERNATIVE ROUTES — 代替ルート供給余力
        </div>
        <div className="text-[10px] font-mono text-neutral-400">
          ホルムズ封鎖シナリオ
        </div>
      </div>

      {/* 供給ギャップサマリー */}
      <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-3 space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
          <div>
            <div className="font-bold text-lg text-[#dc2626]">
              {hormuzCapacity.toFixed(1)}
              <span className="text-xs font-normal text-neutral-400"> Mbpd</span>
            </div>
            <div className="text-neutral-500">ホルムズ経由</div>
            <div className="text-[8px] text-[#dc2626]">封鎖時停止</div>
          </div>
          <div>
            <div className="font-bold text-lg text-[#2563eb]">
              {altCapacity.toFixed(2)}
              <span className="text-xs font-normal text-neutral-400"> Mbpd</span>
            </div>
            <div className="text-neutral-500">代替ルート合計</div>
            <div className="text-[8px] text-[#2563eb]">確保可能</div>
          </div>
          <div>
            <div className="font-bold text-lg text-[#d97706]">
              {gapMbpd.toFixed(2)}
              <span className="text-xs font-normal text-neutral-400"> Mbpd</span>
            </div>
            <div className="text-neutral-500">供給ギャップ</div>
            <div className="text-[8px] text-[#d97706]">需要削減で補完</div>
          </div>
        </div>

        {/* カバー率バー */}
        <div className="space-y-1">
          <div className="flex justify-between text-[9px] font-mono text-neutral-500">
            <span>代替ルートカバー率</span>
            <span className="font-bold text-[#2563eb]">{coverageRate.toFixed(0)}%</span>
          </div>
          <div className="h-2 bg-[#e2e8f0] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${coverageRate}%`, backgroundColor: "#2563eb" }}
            />
          </div>
          <div className="text-[9px] font-mono text-neutral-400">
            備蓄放出・需要削減を合わせると、180日以上の対応余力があります
          </div>
        </div>
      </div>

      {/* ルート別テーブル */}
      <div className="space-y-3">

        {/* 封鎖停止ルート */}
        <div className="space-y-1">
          <div className="text-[9px] font-mono text-neutral-400 tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#dc2626] inline-block" />
            封鎖時停止ルート
          </div>
          {blockedRoute.map((cfg) => {
            const r = routes[cfg.key];
            if (!r) return null;
            return (
              <RouteRow key={cfg.key} route={r} config={cfg} maxCapacity={maxCapacity} />
            );
          })}
        </div>

        {/* 代替・迂回ルート */}
        <div className="space-y-1">
          <div className="text-[9px] font-mono text-neutral-400 tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#d97706] inline-block" />
            代替・迂回ルート（封鎖時に転換）
          </div>
          {bypassRoutes.map((cfg) => {
            const r = routes[cfg.key];
            if (!r) return null;
            return (
              <RouteRow key={cfg.key} route={r} config={cfg} maxCapacity={maxCapacity} />
            );
          })}
        </div>

        {/* 継続中（非ホルムズ） */}
        <div className="space-y-1">
          <div className="text-[9px] font-mono text-neutral-400 tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#16a34a] inline-block" />
            継続中（非ホルムズ・封鎖影響なし）
          </div>
          {activeRoutes.map((cfg) => {
            const r = routes[cfg.key];
            if (!r) return null;
            return (
              <RouteRow key={cfg.key} route={r} config={cfg} maxCapacity={maxCapacity} />
            );
          })}
        </div>
      </div>

      {/* 補足 */}
      <p className="text-[9px] text-neutral-400 border-t border-[#e2e8f0] pt-2 leading-relaxed">
        供給能力は参考値。実際の転換には輸送契約の組み替え・港湾受け入れ能力・タンカー不足により数週間のラグが生じます。日本の石油輸入中東依存率は約92%ですが、LNG は非ホルムズ調達が93.7%を占めます。
      </p>
    </div>
  );
};

// ─── ルート行 ─────────────────────────────────────────

interface RouteRowProps {
  route: RouteEntry;
  config: RouteDisplayConfig;
  maxCapacity: number;
}

const RouteRow: FC<RouteRowProps> = ({ route, config, maxCapacity }) => {
  const isBlocked = config.status === "blocked";
  return (
    <div className={`flex items-center gap-2 text-[10px] font-mono ${isBlocked ? "opacity-50" : ""}`}>
      {/* 航行日数 */}
      <div className="w-12 text-right shrink-0">
        <span className="font-bold" style={{ color: config.statusColor }}>
          {route.transit_days}
        </span>
        <span className="text-[8px] text-neutral-400">日</span>
      </div>

      {/* ルート情報 */}
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[11px] ${isBlocked ? "line-through text-neutral-400" : "text-[#0f172a]"}`}>
            {route.label}
          </span>
          <span
            className="text-[8px] px-1.5 py-0.5 rounded font-bold shrink-0"
            style={{
              backgroundColor: `${config.statusColor}18`,
              color: config.statusColor,
            }}
          >
            {config.statusLabel}
          </span>
        </div>
        {/* 容量バー */}
        <div className="flex items-center gap-1.5">
          <CapacityBar mbpd={route.capacity_mbpd ?? 0} max={maxCapacity} />
          <span className="text-[9px] text-neutral-400 shrink-0">
            {(route.capacity_mbpd ?? 0).toFixed(2)} Mbpd
          </span>
        </div>
        {(config.note ?? route.risk_note) && (
          <div className="text-[9px] text-neutral-400 truncate">
            {config.note ?? route.risk_note}
          </div>
        )}
      </div>
    </div>
  );
};
