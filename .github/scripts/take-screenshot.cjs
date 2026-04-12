const { chromium } = require('playwright');

// スクリーンショット対象の決定:
// 1. リリースbody内の <!-- screenshot: /path --> 指定を最優先
// 2. フォールバック: <!-- tweet: --> ブロックを除いたbodyのキーワードマッチ
const rawBody = process.env.RELEASE_BODY || '';

// <!-- screenshot: /collapse-map --> 形式の明示指定
const screenshotMatch = rawBody.match(/<!--\s*screenshot:\s*(\/[^\s]*)\s*-->/);

// キーワードマッチ用: <!-- tweet: --> ブロックを除外してからマッチ
const bodyForKeywords = rawBody.replace(/<!--\s*tweet:[\s\S]*?-->/g, '').toLowerCase();

const targets = [
  { match: ['タンカー', 'tanker', 'ais', '航跡', '港', '到着タイムライン', '船団'], page: '/tanker-tracker', selector: '[data-screenshot="tanker-map"]', fallback: null },
  { match: ['地図', 'map', '崩壊順', 'collapse map', 'エリア', '地域', '備蓄基地', '物流'], page: '/collapse-map', selector: '[data-screenshot="collapse-map"]' },
  { match: ['食料', 'food', 'サプライチェーン'], page: '/food-collapse', selector: '[data-screenshot="food-collapse"]' },
  { match: ['family', '家庭', 'サバイバル'], page: '/family', selector: '[data-screenshot="family-rank"]' },
  { match: ['フロー', 'simulation', 'カウントダウン', 'clock', 'タイムライン'], page: '/countdown', selector: '[data-screenshot="flow-timeline"]' },
  { match: ['iea', '国際', '備蓄比較', '各国'], page: '/', selector: '[data-screenshot="iea-comparison"]' },
  { match: ['備蓄', 'prepare', 'ガイド', 'チェックリスト', '行動'], page: '/prepare', selector: '[data-screenshot="prepare-guide"]' },
];

let targetPage = '/';
let targetSelector = null;
let fallbackSelector = null;

if (screenshotMatch) {
  // 明示指定: パスから対応するselectorを探す
  targetPage = screenshotMatch[1];
  const matched = targets.find(t => t.page === targetPage);
  if (matched) {
    targetSelector = matched.selector;
    fallbackSelector = matched.fallback || null;
  }
  console.log('Screenshot explicitly specified:', targetPage);
} else {
  // キーワードマッチ（tweetブロック除外済みのbodyで判定）
  for (const t of targets) {
    if (t.match.some(m => bodyForKeywords.includes(m))) {
      targetPage = t.page;
      targetSelector = t.selector;
      fallbackSelector = t.fallback || null;
      break;
    }
  }
}

console.log('Screenshot target:', targetPage, 'selector:', targetSelector, 'fallback:', fallbackSelector);

async function findAndScroll(page, selector, label) {
  await page.waitForSelector(selector, { state: 'attached', timeout: 10000 });
  await page.waitForTimeout(500);
  const el = await page.$(selector);
  if (el) {
    await el.evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.waitForTimeout(2000);
    console.log('Scrolled to element (' + label + '):', selector);
    return true;
  }
  return false;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: 'light' });

  // ページ読み込み（networkidle で完了を待つ、30秒）
  await page.goto('https://surviveasonejp.org' + targetPage, { waitUntil: 'networkidle', timeout: 30000 });

  // 地図・グラフ・表の位置までスクロールしてからスクショ
  if (targetSelector) {
    let found = false;
    try {
      found = await findAndScroll(page, targetSelector, 'primary');
    } catch (e) {
      console.log('Primary selector not found:', e.message);
    }
    // フォールバックセレクタで再試行
    if (!found && fallbackSelector) {
      try {
        found = await findAndScroll(page, fallbackSelector, 'fallback');
      } catch (e) {
        console.log('Fallback selector not found:', e.message);
      }
    }
    if (!found) {
      console.log('No matching element found, using default viewport');
    }
  }

  await page.screenshot({ path: 'screenshot.png', type: 'png' });
  await browser.close();
  console.log('Screenshot saved for:', targetPage);
})();
