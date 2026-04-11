/**
 * e-Stat API クライアント
 *
 * 政府統計の総合窓口（e-Stat）REST API v3.0 のラッパー。
 * https://www.e-stat.go.jp/api/api-info/e-stat-manual
 *
 * 使用前に e-Stat でアプリケーション ID を取得し、
 * Workers Secret として ESTAT_APP_ID に設定すること。
 *
 * 無料利用制限: 制限なし（過度なアクセスは禁止）
 */

const BASE_URL = "https://api.e-stat.go.jp/rest/3.0/app/json";
const USER_AGENT = "SurviveAsOne-Bot/1.0 (surviveasonejp.org)";

// ─── レスポンス型定義 ──────────────────────────────────

export interface EStatValue {
  /** 地域コード */
  "@area"?: string;
  /** 時間コード */
  "@time"?: string;
  /** カテゴリ1コード */
  "@cat01"?: string;
  /** カテゴリ2コード */
  "@cat02"?: string;
  /** カテゴリ3コード */
  "@cat03"?: string;
  /** データ値（文字列。"-" は欠損値） */
  $: string;
  /** 単位 */
  "@unit"?: string;
}

export interface EStatClassItem {
  "@code": string;
  "@name": string;
  "@level"?: string;
  "@parentCode"?: string;
  "@unit"?: string;
}

export interface EStatClass {
  "@id": string;
  "@name": string;
  "@description"?: string;
  "CLASS": EStatClassItem | EStatClassItem[];
}

export interface EStatStatsData {
  RESULT_INF: {
    TOTAL_NUMBER: number;
    FROM_NUMBER: number;
    TO_NUMBER: number;
  };
  TABLE_INF: {
    "@id": string;
    STAT_NAME: { "@code": string; $: string };
    GOV_ORG: { "@code": string; $: string };
    STATISTICS_NAME: string;
    TITLE: { "@no": string; $: string };
    CYCLE: string;
    SURVEY_DATE: string;
    OPEN_DATE: string;
    SMALL_AREA: number;
  };
  CLASS_INF: {
    CLASS_OBJ: EStatClass | EStatClass[];
  };
  DATA_INF: {
    NOTE?: { "@char": string; $: string } | Array<{ "@char": string; $: string }>;
    VALUE: EStatValue | EStatValue[];
  };
}

export interface EStatResponse {
  GET_STATS_DATA: {
    RESULT: {
      STATUS: number;
      ERROR_MSG: string;
      DATE: string;
    };
    PARAMETER: Record<string, string>;
    STATISTICAL_DATA?: EStatStatsData;
  };
}

// ─── クエリパラメータ ──────────────────────────────────

export interface EStatQueryParams {
  /** 統計表 ID */
  statsDataId: string;
  /** 地域コード（省略時は全国） */
  cdArea?: string;
  /** 時間コード（例: "202501" = 2025年1月） */
  cdTime?: string | string[];
  /** カテゴリ1コード */
  cdCat01?: string | string[];
  /** カテゴリ2コード */
  cdCat02?: string | string[];
  /** メタデータ取得フラグ */
  metaGetFlg?: "Y" | "N";
  /** 取得開始位置 */
  startPosition?: number;
  /** 取得件数（最大 100,000） */
  limit?: number;
}

// ─── メイン関数 ──────────────────────────────────────

/**
 * e-Stat API からデータを取得する
 * @returns null の場合はアプリID未設定またはAPIエラー
 */
export async function fetchEStatData(
  appId: string,
  params: EStatQueryParams,
): Promise<EStatStatsData | null> {
  const url = new URL(`${BASE_URL}/getStatsData`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("statsDataId", params.statsDataId);
  url.searchParams.set("metaGetFlg", params.metaGetFlg ?? "N");
  url.searchParams.set("cntGetFlg", "N");
  url.searchParams.set("explanationGetFlg", "N");
  url.searchParams.set("annotationGetFlg", "N");

  if (params.cdArea) url.searchParams.set("cdArea", params.cdArea);

  // 複数時間コードは繰り返しパラメータ
  if (params.cdTime) {
    const times = Array.isArray(params.cdTime) ? params.cdTime : [params.cdTime];
    for (const t of times) url.searchParams.append("cdTime", t);
  }
  if (params.cdCat01) {
    const cats = Array.isArray(params.cdCat01) ? params.cdCat01 : [params.cdCat01];
    for (const c of cats) url.searchParams.append("cdCat01", c);
  }
  if (params.cdCat02) {
    const cats = Array.isArray(params.cdCat02) ? params.cdCat02 : [params.cdCat02];
    for (const c of cats) url.searchParams.append("cdCat02", c);
  }
  if (params.startPosition !== undefined) {
    url.searchParams.set("startPosition", String(params.startPosition));
  }
  if (params.limit !== undefined) {
    url.searchParams.set("limit", String(params.limit));
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
    });
  } catch (e) {
    console.error("e-Stat API fetch failed:", e);
    return null;
  }

  if (!res.ok) {
    console.error(`e-Stat API HTTP error: ${res.status} ${res.statusText}`);
    return null;
  }

  let json: EStatResponse;
  try {
    json = await res.json() as EStatResponse;
  } catch (e) {
    console.error("e-Stat API JSON parse failed:", e);
    return null;
  }

  const result = json.GET_STATS_DATA?.RESULT;
  if (!result || result.STATUS !== 0) {
    console.error(`e-Stat API error: STATUS=${result?.STATUS} MSG="${result?.ERROR_MSG}"`);
    return null;
  }

  return json.GET_STATS_DATA?.STATISTICAL_DATA ?? null;
}

// ─── ユーティリティ ──────────────────────────────────

/**
 * VALUE が単一 or 配列の場合を統一して配列で返す
 */
export function normalizeValues(data: EStatStatsData): EStatValue[] {
  const raw = data.DATA_INF.VALUE;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/**
 * CLASS_OBJ を id → アイテムのMapに変換
 */
export function buildClassMap(
  data: EStatStatsData,
  classId: string,
): Map<string, EStatClassItem> {
  const classInf = data.CLASS_INF.CLASS_OBJ;
  const classObjs = Array.isArray(classInf) ? classInf : [classInf];
  const target = classObjs.find((c) => c["@id"] === classId);
  if (!target) return new Map();

  const items = Array.isArray(target.CLASS) ? target.CLASS : [target.CLASS];
  return new Map(items.map((item) => [item["@code"], item]));
}

/**
 * 時間コードを YYYY-MM 形式に変換
 * e-Stat の時間コード形式: "2025010000" (年次) "2025010100" (月次1月)
 */
export function estatTimeToYearMonth(cdTime: string): string {
  // 月次: 2025010100 → 2025-01
  // 形式によって異なるため先頭8文字で判定
  const y = cdTime.slice(0, 4);
  const m = cdTime.slice(4, 6);
  if (m && m !== "00") return `${y}-${m}`;
  return y; // 年次の場合は年のみ
}

/**
 * 直近 N ヶ月分の e-Stat 時間コードを生成
 * 月次統計用: YYYY01MM00 形式
 */
export function generateMonthCodes(monthsBack: number): string[] {
  const now = new Date();
  const codes: string[] = [];
  for (let i = 1; i <= monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    codes.push(`${y}01${m}00`);
  }
  return codes;
}
