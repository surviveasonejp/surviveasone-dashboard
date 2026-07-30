#!/usr/bin/env node
/**
 * 石油備蓄日数の自動更新
 *
 * 資源エネルギー庁「石油備蓄の状況（推計値の速報）」PDF から最新の備蓄日数を抽出し、
 * src/worker/data/reserves.json を更新する。GitHub Actions から定期実行される。
 *
 *   https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl001/pdf-oil-res/oil_daily.pdf
 *
 * ## Worker 内フェッチャー（reserves-fetcher.ts）ではなく CI で処理する理由
 *
 * 当該 PDF は FlateDecode 圧縮 + CID エンコードで ToUnicode CMap を持たない。
 * Worker 内蔵の簡易パーサでは抽出チャンクが 0 件になり、展開しても Unicode に戻せない。
 * poppler（pdftotext）はフォントの CMap を解決できるため、CI 側で処理する。
 * Worker の CPU・バンドルを消費しない利点もある。
 *
 * ## 更新するフィールド
 *
 * 日数・kL・基準日など**機械的に決まる値のみ**。note 等の手書き解説は書き換えない
 * （数値の変化に応じた文脈の更新は人間の判断が要るため）。
 *
 * ## 安全機構
 *
 * 1. 抽出値のバリデーション（絶対範囲・内訳整合・前回比±50%）
 * 2. reserves.json は手で整形されているため、JSON 再出力ではなく外科的な文字列置換で更新する
 * 3. 置換後に JSON として再パースし、意図した値が意図したパスに入ったかを検証する。
 *    1つでも不一致なら書き込まず異常終了する（誤ったデータの自動コミットを防ぐ）
 *
 * Usage:
 *   node scripts/update-reserves.mjs           # 取得→検証→必要なら書き込み
 *   node scripts/update-reserves.mjs --dry-run # 書き込まず結果のみ表示
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PDF_URL =
  "https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl001/pdf-oil-res/oil_daily.pdf";

// enecho は Mozilla/5.0 で始まらない UA を HTTP 403 で拒否する（2026-07-23 実測）
const USER_AGENT =
  "Mozilla/5.0 (compatible; surviveasonejp-DataBot/1.0; +https://surviveasonejp.org)";

const RESERVES_PATH = "src/worker/data/reserves.json";

/** 日数 → kL 換算に使う日量純輸入（reserves-fetcher.ts と同値） */
const DAILY_NET_IMPORT_KL = 295890;

/** kL → バレル換算（1 kL ≈ 6.29 バレル） */
const KL_PER_BARREL = 0.159;

const DRY_RUN = process.argv.includes("--dry-run");

// ─── 全角数字の正規化 ────────────────────────────────

/** 全角数字を半角へ。PDF は「１０３日分」「令和８年」のように全角と半角が混在する */
function toHalfWidth(s) {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function parseIntFlexible(s) {
  const n = Number.parseInt(toHalfWidth(s), 10);
  return Number.isNaN(n) ? null : n;
}

// ─── PDF 取得とテキスト化 ─────────────────────────────

async function fetchPdfText() {
  const res = await fetch(PDF_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`PDF fetch failed: HTTP ${res.status} (${PDF_URL})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10000) {
    throw new Error(`PDF too small (${buf.length} bytes) — エラーページの可能性`);
  }

  const dir = mkdtempSync(join(tmpdir(), "reserves-"));
  const pdfPath = join(dir, "oil_daily.pdf");
  const txtPath = join(dir, "oil_daily.txt");
  writeFileSync(pdfPath, buf);

  // -layout で表組みの桁を保つ
  execFileSync("pdftotext", ["-layout", pdfPath, txtPath]);
  const text = readFileSync(txtPath, "utf8");

  console.log(`PDF: ${buf.length.toLocaleString()} bytes → text ${text.length.toLocaleString()} chars`);
  return text;
}

// ─── 抽出 ────────────────────────────────────────────

/**
 * PDF テキストの先頭ブロック（＝最新の公表分）から備蓄日数を抽出する。
 *
 * ブロックの形:
 *   令和８年７月 23 日（７月 20 日時点）
 *              備蓄日数
 *   国家備蓄        １０３日分
 *   民間備蓄         ９６日分
 *   産油国共同備蓄      ４日分
 *   合計          ２０２日分
 */
function extractLatest(text) {
  // 公表日（令和）と「N月N日時点」。年月日は全角/半角が混在するため双方を許容する
  const header = text.match(
    /令和\s*([０-９\d]+)\s*年\s*([０-９\d]+)\s*月\s*([０-９\d]+)\s*日\s*（\s*([０-９\d]+)\s*月\s*([０-９\d]+)\s*日時点\s*）/,
  );
  if (!header) throw new Error("公表日ブロックが見つからない（PDF 書式変更の可能性）");

  const warekiYear = parseIntFlexible(header[1]);
  const pubMonth = parseIntFlexible(header[2]);
  const pubDay = parseIntFlexible(header[3]);
  const asOfMonth = parseIntFlexible(header[4]);
  const asOfDay = parseIntFlexible(header[5]);
  if ([warekiYear, pubMonth, pubDay, asOfMonth, asOfDay].some((v) => v === null)) {
    throw new Error(`日付の解釈に失敗: ${header[0]}`);
  }

  const pubYear = warekiYear + 2018; // 令和1年 = 2019
  // 時点日には年の表記がない。公表月より後の月なら前年（年跨ぎ）とみなす
  const asOfYear = asOfMonth > pubMonth ? pubYear - 1 : pubYear;

  const pad = (n) => String(n).padStart(2, "0");
  const publishedAt = `${pubYear}-${pad(pubMonth)}-${pad(pubDay)}`;
  const baselineDate = `${asOfYear}-${pad(asOfMonth)}-${pad(asOfDay)}`;

  // 先頭ブロックのみを対象にする（PDF には過去分が日次で 128 件以上並ぶ）
  const body = text.slice(header.index);
  const pick = (label) => {
    const m = body.match(new RegExp(`${label}\\s*([０-９\\d]+)\\s*日分`));
    if (!m) throw new Error(`「${label}」の日数が見つからない`);
    const v = parseIntFlexible(m[1]);
    if (v === null) throw new Error(`「${label}」の日数を数値化できない: ${m[1]}`);
    return v;
  };

  return {
    publishedAt,
    baselineDate,
    nationalDays: pick("国家備蓄"),
    privateDays: pick("民間備蓄"),
    jointDays: pick("産油国共同備蓄"),
    totalDays: pick("合計"),
  };
}

// ─── バリデーション ──────────────────────────────────

/** 絶対範囲・内訳整合・前回比をチェックする（reserves-fetcher.ts の基準を踏襲） */
function validate(extract, currentTotalDays) {
  const ranges = [
    ["totalDays", extract.totalDays, 100, 300],
    ["nationalDays", extract.nationalDays, 50, 200],
    ["privateDays", extract.privateDays, 10, 150],
    ["jointDays", extract.jointDays, 0, 20],
  ];
  for (const [name, value, min, max] of ranges) {
    if (value < min || value > max) {
      throw new Error(`検証失敗: ${name}=${value} が想定範囲 ${min}-${max} の外`);
    }
  }

  // 原典は内訳の和と合計表記に丸め差が出ることがある（実測で 1 日）
  const sum = extract.nationalDays + extract.privateDays + extract.jointDays;
  if (Math.abs(sum - extract.totalDays) > 5) {
    throw new Error(`検証失敗: 内訳の和 ${sum} と合計 ${extract.totalDays} の差が 5 日超`);
  }

  if (currentTotalDays > 0) {
    const rate = Math.abs(extract.totalDays - currentTotalDays) / currentTotalDays;
    if (rate > 0.5) {
      throw new Error(
        `検証失敗: 前回比 ${(rate * 100).toFixed(1)}% が閾値 50% 超（前回 ${currentTotalDays} → 今回 ${extract.totalDays}）`,
      );
    }
  }
}

// ─── 外科的な文字列置換 ──────────────────────────────

/**
 * `"key": value` の N 番目の出現を置換する。
 * reserves.json は手で整形されているため、JSON 再出力による全面リフォーマットを避ける。
 */
function replaceValue(text, key, newLiteral, occurrence = 1) {
  const re = new RegExp(`("${key}"\\s*:\\s*)("[^"]*"|-?[0-9.]+)`, "g");
  let seen = 0;
  let replaced = false;
  const out = text.replace(re, (match, head, value) => {
    seen += 1;
    if (seen !== occurrence) return match;
    replaced = true;
    return `${head}${newLiteral}`;
  });
  if (!replaced) {
    throw new Error(`置換対象が見つからない: "${key}" の ${occurrence} 番目`);
  }
  return out;
}

/** meta.source 冒頭の「…N年N月N日公表・N月N日時点」だけを差し替える */
function updateSourceHead(text, extract) {
  const [py, pm, pd] = extract.publishedAt.split("-").map(Number);
  const [, bm, bd] = extract.baselineDate.split("-").map(Number);
  const fresh = `資源エネルギー庁「石油備蓄の状況（推計値の速報）」${py}年${pm}月${pd}日公表・${bm}月${bd}日時点`;
  const re = /資源エネルギー庁「石油備蓄の状況（推計値の速報）」\d+年\d+月\d+日公表・\d+月\d+日時点/;
  if (!re.test(text)) {
    console.warn("警告: meta.source の日付部分が見つからず更新をスキップした");
    return text;
  }
  return text.replace(re, fresh);
}

// ─── 反映 ────────────────────────────────────────────

function applyUpdate(raw, extract) {
  const nationalKL = extract.nationalDays * DAILY_NET_IMPORT_KL;
  const privateKL = extract.privateDays * DAILY_NET_IMPORT_KL;
  const jointKL = extract.jointDays * DAILY_NET_IMPORT_KL;
  // 合計は内訳の単純和ではなく、原典の「合計日数」に対応させる（原典に丸め差があるため）
  const totalKL = extract.totalDays * DAILY_NET_IMPORT_KL;
  const totalMb = Math.round(totalKL / KL_PER_BARREL / 1e6);

  let out = raw;
  out = updateSourceHead(out, extract);
  // meta が先頭セクションのため、updatedAt / baselineDate の 1 番目は meta のもの
  out = replaceValue(out, "updatedAt", `"${extract.publishedAt}"`, 1);
  out = replaceValue(out, "baselineDate", `"${extract.baselineDate}"`, 1);

  out = replaceValue(out, "nationalReserve_kL", String(nationalKL));
  out = replaceValue(out, "privateReserve_kL", String(privateKL));
  out = replaceValue(out, "jointReserve_kL", String(jointKL));
  out = replaceValue(out, "totalReserve_kL", String(totalKL));
  out = replaceValue(out, "nationalReserveDays", String(extract.nationalDays));
  out = replaceValue(out, "privateReserveDays", String(extract.privateDays));
  out = replaceValue(out, "jointReserveDays", String(extract.jointDays));
  out = replaceValue(out, "totalReserveDays", String(extract.totalDays));

  // legalBasisDays は effectiveEstimate と globalContext.countries.Japan の 2 箇所
  out = replaceValue(out, "legalBasisDays", String(extract.totalDays), 1);
  out = replaceValue(out, "legalBasisDays", String(extract.totalDays), 2);

  out = replaceValue(out, "reserveMb_equivalent", String(totalMb));
  // Japan.baselineDate（meta に続く 2 番目ではなく US の次＝3 番目）は下の検証で担保する
  const japanBaselineOccurrence = countOccurrences(out, "baselineDate");
  out = replaceValue(out, "baselineDate", `"${extract.baselineDate}"`, japanBaselineOccurrence);

  return out;
}

function countOccurrences(text, key) {
  const re = new RegExp(`"${key}"\\s*:`, "g");
  return (text.match(re) ?? []).length;
}

/**
 * 置換後のテキストを JSON として再パースし、意図した値が意図したパスに入ったかを検証する。
 * 文字列置換の副作用（別セクションを書き換えてしまう等）を検出する最後の砦。
 */
function verify(text, extract) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`置換後の JSON が壊れている: ${e.message}`);
  }

  const totalKL = extract.totalDays * DAILY_NET_IMPORT_KL;
  const checks = [
    ["meta.updatedAt", data.meta.updatedAt, extract.publishedAt],
    ["meta.baselineDate", data.meta.baselineDate, extract.baselineDate],
    ["oil.nationalReserveDays", data.oil.nationalReserveDays, extract.nationalDays],
    ["oil.privateReserveDays", data.oil.privateReserveDays, extract.privateDays],
    ["oil.jointReserveDays", data.oil.jointReserveDays, extract.jointDays],
    ["oil.totalReserveDays", data.oil.totalReserveDays, extract.totalDays],
    ["oil.totalReserve_kL", data.oil.totalReserve_kL, totalKL],
    ["effectiveEstimate.legalBasisDays", data.effectiveEstimate.legalBasisDays, extract.totalDays],
    [
      "globalContext.countries.Japan.legalBasisDays",
      data.globalContext.countries.Japan.legalBasisDays,
      extract.totalDays,
    ],
    [
      "globalContext.countries.Japan.baselineDate",
      data.globalContext.countries.Japan.baselineDate,
      extract.baselineDate,
    ],
  ];

  const failures = checks
    .filter(([, actual, expected]) => actual !== expected)
    .map(([path, actual, expected]) => `  ${path}: 期待 ${expected} / 実際 ${actual}`);

  if (failures.length > 0) {
    throw new Error(`置換結果の検証に失敗:\n${failures.join("\n")}`);
  }

  // 他セクションを巻き込んでいないか（US の基準日は別データなので変わってはいけない）
  if (data.globalContext.countries.US.baselineDate === extract.baselineDate) {
    throw new Error("US.baselineDate が書き換わっている（置換範囲の誤り）");
  }
}

// ─── main ────────────────────────────────────────────

async function main() {
  const raw = readFileSync(RESERVES_PATH, "utf8");
  const current = JSON.parse(raw);
  const currentTotal = current.oil.totalReserveDays;
  const currentBaseline = current.meta.baselineDate;

  const text = await fetchPdfText();
  const extract = extractLatest(text);

  console.log(
    `抽出: ${extract.publishedAt}公表（${extract.baselineDate}時点） ` +
      `国家${extract.nationalDays} / 民間${extract.privateDays} / ` +
      `共同${extract.jointDays} / 合計${extract.totalDays}日`,
  );

  validate(extract, currentTotal);

  if (extract.baselineDate === currentBaseline && extract.totalDays === currentTotal) {
    console.log(`変化なし（${currentBaseline}時点・${currentTotal}日）。更新しない`);
    return;
  }

  const updated = applyUpdate(raw, extract);
  verify(updated, extract);

  console.log(
    `更新: 合計 ${currentTotal}日(${currentBaseline}) → ${extract.totalDays}日(${extract.baselineDate})`,
  );

  if (DRY_RUN) {
    console.log("--dry-run のため書き込みはしない");
    return;
  }

  writeFileSync(RESERVES_PATH, updated);
  console.log(`${RESERVES_PATH} を更新した`);

  // GitHub Actions に変更ありを伝える。
  // baselineDate / totalDays はワークフロー側が「本番へ実際に届いたか」を
  // 検証するのに使う（デプロイが失敗しても誰も気付かない状態を避けるため）。
  if (process.env.GITHUB_OUTPUT) {
    const summary = `備蓄日数を${extract.totalDays}日へ更新（${extract.baselineDate}時点・国家${extract.nationalDays}/民間${extract.privateDays}/共同${extract.jointDays}）`;
    writeFileSync(
      process.env.GITHUB_OUTPUT,
      `changed=true\nsummary=${summary}\nbaselineDate=${extract.baselineDate}\ntotalDays=${extract.totalDays}\n`,
      { flag: "a" },
    );
  }
}

main().catch((err) => {
  console.error(`エラー: ${err.message}`);
  process.exit(1);
});
