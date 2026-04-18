/**
 * 名古屋港 入港予定船情報 自動取得
 *
 * 名古屋港管理組合が公開する外航船入港予定をフェッチし、
 * タンカー・ガス船・ケミカル船の到着便を抽出。東京湾（浦賀水道）
 * と合わせて日本向けタンカーの主要到着点をカバーする。
 *
 * データソース:
 *   https://www2.port-of-nagoya.jp/select/selarrivallist.aspx?PageCd=01
 *
 * 対象船種: プロダクトオイルタンカー / 油送船 / LNG船 / 外航ケミカル船
 *
 * 注意: IMO番号は含まれないため、船名ベースでの照合となる。
 */

interface Env {
  CACHE: KVNamespace;
}

const NAGOYA_URL = "https://www2.port-of-nagoya.jp/select/selarrivallist.aspx?PageCd=01";
const USER_AGENT = "SurviveAsOne-Bot/1.0 (surviveasonejp.org)";

/** 対象船種キーワード（部分一致） */
const TANKER_KEYWORDS = ["タンカー", "油送船", "LNG", "ケミカル"] as const;

/** キャッシュTTL（秒）— 入港予定は数時間単位で変動するため30分保持 */
const NAGOYA_CACHE_TTL_SEC = 1800;

export interface NagoyaArrival {
  /** 短コード（BW/B/C等、意味未確定） */
  shortCode: string;
  /** 船名 */
  vesselName: string;
  /** コールサイン（IMO代替の一意識別子） */
  callSign: string;
  /** 総トン数 */
  grossTonnage: number;
  /** 全長（m） */
  length: number;
  /** 船種 */
  type: string;
  /** 入港予定日時（MM/DD HH:MM） */
  arrivalAt: string;
  /** 出港予定日時（MM/DD HH:MM） */
  departureAt: string;
  /** 代理店 */
  agent: string;
}

export interface NagoyaFetchResult {
  fetchedAt: string;
  sourceUrl: string;
  totalArrivals: number;
  tankerArrivals: NagoyaArrival[];
}

function cleanText(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTonnage(s: string): number {
  const m = s.match(/[\d,]+/);
  if (!m) return 0;
  const n = parseInt(m[0].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseLength(s: string): number {
  const m = s.match(/\d+/);
  if (!m) return 0;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * HTML から <tr> 行を抽出し、タンカー系のみ返す
 * 列構成（14列）: icon/shortCode/name/callsign/tonnage/length/type/_/_/arrival/departure/_/_/agent
 */
export function parseNagoyaHtml(html: string): NagoyaArrival[] {
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const results: NagoyaArrival[] = [];

  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const trContent = trMatch[1];
    if (!trContent) continue;

    const cells: string[] = [];
    const tdIter = new RegExp(tdRegex.source, "gi");
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdIter.exec(trContent)) !== null) {
      const cell = tdMatch[1];
      if (cell !== undefined) cells.push(cleanText(cell));
    }

    if (cells.length < 14) continue;
    const type = cells[6] ?? "";
    if (!type) continue;

    const isTanker = TANKER_KEYWORDS.some((k) => type.includes(k));
    if (!isTanker) continue;

    results.push({
      shortCode: cells[1] ?? "",
      vesselName: cells[2] ?? "",
      callSign: cells[3] ?? "",
      grossTonnage: parseTonnage(cells[4] ?? ""),
      length: parseLength(cells[5] ?? ""),
      type,
      arrivalAt: cells[9] ?? "",
      departureAt: cells[10] ?? "",
      agent: cells[13] ?? "",
    });
  }

  return results;
}

/**
 * 名古屋港入港予定を取得し KV キャッシュに保存
 */
export async function fetchNagoyaArrivals(env: Env): Promise<NagoyaFetchResult> {
  const res = await fetch(NAGOYA_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html",
    },
    cf: { cacheTtl: 600, cacheEverything: true },
  });
  if (!res.ok) {
    throw new Error(`Nagoya fetch failed: HTTP ${res.status}`);
  }
  const html = await res.text();
  const tankerArrivals = parseNagoyaHtml(html);

  const totalArrivals = Math.max(
    0,
    (html.match(/<tr[^>]*>/gi)?.length ?? 0) - 1,
  );

  const result: NagoyaFetchResult = {
    fetchedAt: new Date().toISOString(),
    sourceUrl: NAGOYA_URL,
    totalArrivals,
    tankerArrivals,
  };

  await env.CACHE.put(
    "nagoya_tanker_arrivals",
    JSON.stringify(result),
    { expirationTtl: NAGOYA_CACHE_TTL_SEC },
  );

  return result;
}

export async function getCachedNagoyaArrivals(env: Env): Promise<NagoyaFetchResult | null> {
  const raw = await env.CACHE.get("nagoya_tanker_arrivals");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as NagoyaFetchResult;
  } catch {
    return null;
  }
}

/**
 * tankers.json 登録済み船名との照合で新規便を検出
 */
export function detectNewNagoyaTankers(
  arrivals: NagoyaArrival[],
  registeredVesselNames: string[],
): NagoyaArrival[] {
  const normalize = (s: string) => s.toUpperCase().replace(/\s+/g, "").trim();
  const registered = new Set(registeredVesselNames.map(normalize));
  return arrivals.filter((a) => !registered.has(normalize(a.vesselName)));
}
