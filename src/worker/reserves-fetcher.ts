/**
 * 石油備蓄データ自動更新
 *
 * 資源エネルギー庁「石油備蓄の現況」PDF から備蓄日数を自動抽出し D1 を更新。
 * PDF URL パターン: https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl001/pdf/{YYYY}/{YYMMDD}oil.pdf
 *
 * 毎月18日 UTC 6:00 (JST 15:00) に実行。
 * PDF テキスト抽出に失敗した場合は KV に "reserves_update_needed" フラグを立てる。
 */

import { invalidateCache, CACHE_KEYS } from "./kv-cache";

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ARCHIVE: R2Bucket;
}

/** 抽出結果 */
interface ReservesExtract {
  /** 基準月 YYYY-MM */
  baseMonth: string;
  /** 国家備蓄日数 */
  nationalDays: number;
  /** 民間備蓄日数 */
  privateDays: number;
  /** 産油国共同備蓄日数 */
  jointDays: number;
  /** 合計日数 */
  totalDays: number;
}

// 国家備蓄 kL/日 の基準値（国家備蓄 kL ÷ 日数で逆算した IEA 純輸入基準）
const DAILY_NET_IMPORT_KL = 295890;

/**
 * 石油備蓄の最新 PDF を取得し D1 を更新
 */
export async function fetchReservesUpdate(env: Env): Promise<void> {
  // 直近3ヶ月分の PDF URL を候補として生成（公開日にばらつきがあるため）
  const candidates = generatePdfCandidates();
  console.log(`Reserves update: trying ${candidates.length} PDF candidates`);

  let pdfBytes: ArrayBuffer | null = null;
  let pdfUrl = "";

  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "SurviveAsOne-Bot/1.0" } });
      if (res.ok) {
        pdfBytes = await res.arrayBuffer();
        pdfUrl = url;
        console.log(`Reserves PDF found: ${url} (${pdfBytes.byteLength} bytes)`);
        break;
      }
    } catch {
      // 次の候補へ
    }
  }

  if (!pdfBytes) {
    console.warn("Reserves update: no PDF found in candidates");
    await env.CACHE.put("reserves_update_needed", "true", { expirationTtl: 86400 * 30 });
    return;
  }

  // R2 にアーカイブ
  const archiveKey = `reserves/${new Date().toISOString().slice(0, 10)}.pdf`;
  await env.ARCHIVE.put(archiveKey, pdfBytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { source: pdfUrl, fetchedAt: new Date().toISOString() },
  });

  // PDF テキスト抽出
  const text = extractTextFromPdf(pdfBytes);
  if (!text) {
    console.warn("Reserves update: text extraction failed");
    await env.CACHE.put("reserves_update_needed", JSON.stringify({
      reason: "PDF text extraction failed",
      pdfUrl,
      archivedAs: archiveKey,
    }), { expirationTtl: 86400 * 30 });
    return;
  }

  console.log(`Reserves PDF text extracted (${text.length} chars)`);

  // 備蓄日数を抽出
  const extract = parseReservesText(text);
  if (!extract) {
    console.warn("Reserves update: parsing failed");
    await env.CACHE.put("reserves_update_needed", JSON.stringify({
      reason: "Number extraction failed",
      pdfUrl,
      archivedAs: archiveKey,
      textSample: text.slice(0, 500),
    }), { expirationTtl: 86400 * 30 });
    return;
  }

  console.log(`Reserves extracted: national=${extract.nationalDays}, private=${extract.privateDays}, joint=${extract.jointDays}, total=${extract.totalDays}`);

  // D1 更新
  await upsertReserves(env.DB, extract);

  // KV キャッシュ無効化
  await invalidateCache(env.CACHE, [
    CACHE_KEYS.RESERVES_LATEST,
    CACHE_KEYS.RESERVES_HISTORY,
  ]);

  // 成功フラグ
  await env.CACHE.delete("reserves_update_needed");
  await env.CACHE.put("reserves_last_updated", JSON.stringify({
    date: new Date().toISOString(),
    ...extract,
    source: pdfUrl,
  }), { expirationTtl: 86400 * 60 });

  console.log("Reserves update: D1 updated successfully");
}

// ─── PDF URL 候補生成 ────────────────────────────────

function generatePdfCandidates(): string[] {
  const now = new Date();
  const urls: string[] = [];
  const BASE = "https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl001/pdf";

  // 直近3ヶ月の15日〜20日を候補に（公開日は月中旬）
  for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
    const d = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const yyyy = d.getFullYear();
    const yy = String(yyyy).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");

    for (const day of [20, 19, 18, 17, 16, 15, 14]) {
      const dd = String(day).padStart(2, "0");
      urls.push(`${BASE}/${yyyy}/${yy}${mm}${dd}oil.pdf`);
    }
  }

  return urls;
}

// ─── PDF テキスト抽出 ────────────────────────────────

/**
 * PDF バイナリからテキストを抽出する軽量パーサー。
 * PDF のテキストストリーム（BT...ET ブロック内の Tj/TJ オペレータ）を収集。
 * 完全なパーサーではないが、政府 PDF の定型文書には十分。
 */
function extractTextFromPdf(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer);
  const raw = new TextDecoder("latin1").decode(bytes);

  // 方法1: stream の FlateDecode を展開するのは Workers では困難なので、
  // 非圧縮テキストの直接抽出を試みる
  const textChunks: string[] = [];

  // Tj オペレータ（テキスト表示）を検索: (テキスト) Tj
  const tjRegex = /\(([^)]*)\)\s*Tj/g;
  let match;
  while ((match = tjRegex.exec(raw)) !== null) {
    textChunks.push(decodeOctalEscapes(match[1] ?? ""));
  }

  // TJ 配列オペレータ: [(テキスト1) 数値 (テキスト2)] TJ
  const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
  while ((match = tjArrayRegex.exec(raw)) !== null) {
    const innerRegex = /\(([^)]*)\)/g;
    let innerMatch;
    const arrayContent = match[1] ?? "";
    while ((innerMatch = innerRegex.exec(arrayContent)) !== null) {
      textChunks.push(decodeOctalEscapes(innerMatch[1] ?? ""));
    }
  }

  if (textChunks.length === 0) return null;

  return textChunks.join(" ");
}

/** PDF 文字列のオクタルエスケープをデコード */
function decodeOctalEscapes(s: string): string {
  return s.replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

// ─── テキストから備蓄日数を抽出 ─────────────────────

function parseReservesText(text: string): ReservesExtract | null {
  // 日数パターン: "146日分" "89日分" "6日分" "241日分" など
  // 国家備蓄、民間備蓄、産油国共同備蓄の順で出現する前提

  const dayPatterns = text.match(/(\d{1,3})\s*日\s*分/g);
  if (!dayPatterns || dayPatterns.length < 3) {
    // フォールバック: "146日" "89日" のパターンも試す
    const altPatterns = text.match(/(\d{1,3})\s*日/g);
    if (!altPatterns || altPatterns.length < 3) return null;
    return tryExtractFromDayMatches(altPatterns, text);
  }

  return tryExtractFromDayMatches(dayPatterns, text);
}

function tryExtractFromDayMatches(matches: string[], text: string): ReservesExtract | null {
  const days = matches.map((m) => {
    const n = m.match(/(\d+)/);
    return n?.[1] ? parseInt(n[1], 10) : 0;
  }).filter((d) => d > 0 && d < 400); // 妥当な範囲

  if (days.length < 3) return null;

  // 国家備蓄が最大（100以上）、次が民間（50以上）、共同が最小（10未満）を想定
  const sorted = [...days].sort((a, b) => b - a);
  const nationalCandidates = sorted.filter((d) => d >= 100 && d <= 200);
  const privateCandidates = sorted.filter((d) => d >= 30 && d < 120);
  const jointCandidates = sorted.filter((d) => d >= 1 && d <= 15);

  if (nationalCandidates.length === 0 || privateCandidates.length === 0 || jointCandidates.length === 0) {
    return null;
  }

  const nationalDays = nationalCandidates[0] ?? 0;
  // 民間は国家より小さいものを選択
  const privateDays = privateCandidates.find((d) => d < nationalDays) ?? privateCandidates[0] ?? 0;
  const jointDays = jointCandidates[0] ?? 0;
  const totalDays = nationalDays + privateDays + jointDays;

  // 合計が妥当な範囲か検証 (200〜300日)
  if (totalDays < 200 || totalDays > 300) return null;

  // 基準月を推定（テキストから年月を抽出）
  const monthMatch = text.match(/令和\s*[０-９\d]+\s*年\s*([０-９\d]+)\s*月/);
  let baseMonth = new Date().toISOString().slice(0, 7);
  if (monthMatch) {
    const warekiYear = toHalfWidth(monthMatch[0]).match(/令和\s*(\d+)\s*年/);
    const month = toHalfWidth(monthMatch[1] ?? "");
    if (warekiYear) {
      const gregorianYear = parseInt(warekiYear[1] ?? "0", 10) + 2018;
      baseMonth = `${gregorianYear}-${month.padStart(2, "0")}`;
    }
  }

  return { baseMonth, nationalDays, privateDays, jointDays, totalDays };
}

/** 全角数字→半角 */
function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

// ─── D1 更新 ────────────────────────────────────────

async function upsertReserves(db: D1Database, extract: ReservesExtract): Promise<void> {
  const date = `${extract.baseMonth}-01`;

  // kL 換算（日数 × 日量純輸入）
  const nationalKL = extract.nationalDays * DAILY_NET_IMPORT_KL;
  const privateKL = extract.privateDays * DAILY_NET_IMPORT_KL;
  const jointKL = extract.jointDays * DAILY_NET_IMPORT_KL;
  const totalKL = nationalKL + privateKL + jointKL;

  // 既存の最新行からホルムズ率・電力シェアを引き継ぐ
  const latest = await db
    .prepare("SELECT oil_hormuz_rate, lng_inventory_t, lng_hormuz_rate, thermal_share, nuclear_share, renewable_share FROM reserves ORDER BY date DESC LIMIT 1")
    .first<{
      oil_hormuz_rate: number;
      lng_inventory_t: number;
      lng_hormuz_rate: number;
      thermal_share: number;
      nuclear_share: number;
      renewable_share: number;
    }>();

  await db
    .prepare(`
      INSERT INTO reserves (date, oil_national_kL, oil_private_kL, oil_joint_kL, oil_total_kL, oil_total_days, oil_hormuz_rate, lng_inventory_t, lng_hormuz_rate, thermal_share, nuclear_share, renewable_share, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(date) DO UPDATE SET
        oil_national_kL = excluded.oil_national_kL,
        oil_private_kL = excluded.oil_private_kL,
        oil_joint_kL = excluded.oil_joint_kL,
        oil_total_kL = excluded.oil_total_kL,
        oil_total_days = excluded.oil_total_days,
        source = excluded.source,
        updated_at = datetime('now')
    `)
    .bind(
      date,
      Math.round(nationalKL),
      Math.round(privateKL),
      Math.round(jointKL),
      Math.round(totalKL),
      extract.totalDays,
      latest?.oil_hormuz_rate ?? 0.94,
      latest?.lng_inventory_t ?? 4500000,
      latest?.lng_hormuz_rate ?? 0.063,
      latest?.thermal_share ?? 0.65,
      latest?.nuclear_share ?? 0.082,
      latest?.renewable_share ?? 0.267,
      `資源エネルギー庁 石油備蓄の現況 ${extract.baseMonth} (自動取得)`,
    )
    .run();

  console.log(`Reserves upserted: ${date} total=${extract.totalDays}days (${Math.round(totalKL / 1000)}千kL)`);
}
