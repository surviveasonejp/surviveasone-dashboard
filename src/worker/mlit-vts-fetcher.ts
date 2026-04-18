/**
 * 国土交通省 海上保安庁 VTS（海上交通センター）大型船入航予定情報 汎用取得
 *
 * 複数の管制センターが同一フォーマットの HTML を公開しているため、
 * ルート設定（URL・列マッピング）を切り替えて再利用する。
 *
 * 対応ルート:
 *  - uraga  : 浦賀水道航路（東京湾）     — 東京・千葉・横浜・川崎
 *  - akashi : 明石海峡航路（大阪湾）     — 堺・姫路・和歌山・神戸
 *  - kanmon : 関門海峡航路              — 北九州・山口（通過便中心）
 *
 * 5分ごと更新の VTS 管制情報。AIS 途絶・偽装時の補完・新規チャーター
 * 便の検出に活用できる。
 *
 * 注意:
 *  - IMO 番号は含まれないため船名ベースで照合
 *  - ルートごとに列数・列順が僅かに異なる（destination 列位置等）
 */

interface Env {
  CACHE: KVNamespace;
}

const USER_AGENT = "SurviveAsOne-Bot/1.0 (surviveasonejp.org)";

/** タンカー系船種（部分一致キーワード） */
const TANKER_KEYWORDS = ["油タンカー", "ガスタンカー", "ケミカルタンカー"] as const;

/** VTS キャッシュ TTL（秒）— VTS は5分ごと更新のため30分キャッシュで十分 */
const VTS_CACHE_TTL_SEC = 1800;

export type VtsRouteId = "uraga" | "akashi" | "kanmon";

interface VtsRouteConfig {
  url: string;
  label: string;
  /** 0ベースの列インデックス（すべてのルートで [0]=scheduledAt, [1]=vesselName, [2]=type, [3]=grossTonnage, [4]=length, [5]=sizeClass, [6]=flag は共通） */
  destinationIndex: number;
  /** 仕出港の列（Akashi 等のみ・無いルートは null） */
  departureIndex: number | null;
  /** キャッシュキー */
  cacheKey: string;
}

const ROUTES: Record<VtsRouteId, VtsRouteConfig> = {
  uraga: {
    url: "https://www6.kaiho.mlit.go.jp/tokyowan/schedule/URAGA/schedule_1.html",
    label: "浦賀水道航路（東京湾）",
    destinationIndex: 7, // 仕向港（入航航路）
    departureIndex: null,
    cacheKey: "vts_uraga_arrivals",
  },
  akashi: {
    url: "https://www6.kaiho.mlit.go.jp/osakawan/schedule/AKASHI/schedule_1.html",
    label: "明石海峡航路（大阪湾）",
    destinationIndex: 8, // 仕向港
    departureIndex: 7,   // 仕出港
    cacheKey: "vts_akashi_arrivals",
  },
  kanmon: {
    url: "https://www6.kaiho.mlit.go.jp/kanmon/schedule/KANMON/schedule_1.html",
    label: "関門海峡航路",
    destinationIndex: 8, // 仕向港（同形式と仮定）
    departureIndex: 7,
    cacheKey: "vts_kanmon_arrivals",
  },
};

export interface VtsArrival {
  /** 入航予定時刻 / 通航予定日時（MM/DD HH:MM 形式の原文） */
  scheduledAt: string;
  /** 船名 */
  vesselName: string;
  /** 船種（油タンカー / ガスタンカー 等） */
  type: string;
  /** 総トン数 */
  grossTonnage: number;
  /** 全長（m） */
  length: number;
  /** 巨大船区分 */
  sizeClass: string;
  /** 船籍（3レター国コード） */
  flag: string;
  /** 仕出港（取得できない場合は空） */
  departure: string;
  /** 仕向港 */
  destination: string;
}

export interface VtsFetchResult {
  fetchedAt: string;
  routeId: VtsRouteId;
  sourceUrl: string;
  routeLabel: string;
  totalArrivals: number;
  tankerArrivals: VtsArrival[];
}

function cleanText(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMlitVtsHtml(html: string, config: VtsRouteConfig): VtsArrival[] {
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
  const results: VtsArrival[] = [];

  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const trContent = trMatch[1];
    if (!trContent) continue;

    const cells: string[] = [];
    const tdIter = new RegExp(tdRegex.source, "g");
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdIter.exec(trContent)) !== null) {
      const cell = tdMatch[1];
      if (cell !== undefined) cells.push(cleanText(cell));
    }

    // 最低限必要な列数（共通部分: 0-6 の7列 + 仕向港）
    const requiredMin = config.destinationIndex + 1;
    if (cells.length < requiredMin) continue;

    // ヘッダ行スキップ
    if (cells[0] === "入航予定時刻" || cells[0] === "日時" || cells[1] === "船名") continue;

    const type = cells[2] ?? "";
    const isTanker = TANKER_KEYWORDS.some((t) => type.includes(t));
    if (!isTanker) continue;

    const grossTonnage = parseInt(cells[3] ?? "0", 10);
    const length = parseInt(cells[4] ?? "0", 10);

    results.push({
      scheduledAt: cells[0] ?? "",
      vesselName: cells[1] ?? "",
      type,
      grossTonnage: Number.isFinite(grossTonnage) ? grossTonnage : 0,
      length: Number.isFinite(length) ? length : 0,
      sizeClass: cells[5] ?? "",
      flag: cells[6] ?? "",
      departure: config.departureIndex !== null ? (cells[config.departureIndex] ?? "") : "",
      destination: cells[config.destinationIndex] ?? "",
    });
  }

  return results;
}

export async function fetchVtsArrivals(env: Env, routeId: VtsRouteId): Promise<VtsFetchResult> {
  const config = ROUTES[routeId];
  const res = await fetch(config.url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html",
    },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!res.ok) {
    throw new Error(`VTS fetch failed (${routeId}): HTTP ${res.status}`);
  }
  const html = await res.text();
  const tankerArrivals = parseMlitVtsHtml(html, config);

  const totalArrivals = Math.max(
    0,
    (html.match(/<tr[^>]*>/g)?.length ?? 0) - 1,
  );

  const result: VtsFetchResult = {
    fetchedAt: new Date().toISOString(),
    routeId,
    sourceUrl: config.url,
    routeLabel: config.label,
    totalArrivals,
    tankerArrivals,
  };

  await env.CACHE.put(
    config.cacheKey,
    JSON.stringify(result),
    { expirationTtl: VTS_CACHE_TTL_SEC },
  );

  return result;
}

export async function getCachedVtsArrivals(env: Env, routeId: VtsRouteId): Promise<VtsFetchResult | null> {
  const raw = await env.CACHE.get(ROUTES[routeId].cacheKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VtsFetchResult;
  } catch {
    return null;
  }
}

export function detectNewVtsTankers(
  arrivals: VtsArrival[],
  registeredVesselNames: string[],
): VtsArrival[] {
  const normalize = (s: string) => s.toUpperCase().replace(/\s+/g, "").trim();
  const registered = new Set(registeredVesselNames.map(normalize));
  return arrivals.filter((a) => !registered.has(normalize(a.vesselName)));
}

export const VTS_ROUTE_IDS: VtsRouteId[] = ["uraga", "akashi", "kanmon"];
