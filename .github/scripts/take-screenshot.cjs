const { chromium } = require('playwright');

// リリースノートのキーワードからスクリーンショット対象ページとフォーカス要素を判定
const body = (process.env.RELEASE_BODY || '').toLowerCase();
const targets = [
  { match: ['タンカー', 'tanker', 'ais', '航跡', '港'], page: '/last-tanker', selector: '[data-screenshot="tanker-map"]' },
  { match: ['地図', 'map', '崩壊順', 'collapse map', 'エリア', '地域', '備蓄基地'], page: '/collapse-map', selector: '[data-screenshot="collapse-map"]' },
  { match: ['食料', 'food', 'サプライチェーン'], page: '/food-collapse', selector: '[data-screenshot="food-collapse"]' },
  { match: ['family', '家庭', 'サバイバル'], page: '/family', selector: '[data-screenshot="family-rank"]' },
  { match: ['フロー', 'simulation', 'カウントダウン', 'clock', 'タイムライン'], page: '/countdown', selector: '[data-screenshot="flow-timeline"]' },
  { match: ['iea', '国際', '備蓄比較', '各国'], page: '/', selector: '[data-screenshot="iea-comparison"]' },
  { match: ['備蓄', 'prepare', 'ガイド', 'チェックリスト', '行動'], page: '/prepare', selector: '[data-screenshot="prepare-guide"]' },
];

let targetPage = '/';
let targetSelector = null;
for (const t of targets) {
  if (t.match.some(m => body.includes(m))) {
    targetPage = t.page;
    targetSelector = t.selector;
    break;
  }
}

console.log('Screenshot target:', targetPage, 'selector:', targetSelector);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: 'dark' });

  // ページ読み込み（networkidle で完了を待つ、30秒）
  await page.goto('https://surviveasonejp.org' + targetPage, { waitUntil: 'networkidle', timeout: 30000 });

  // 地図・グラフ・表の位置までスクロールしてからスクショ
  if (targetSelector) {
    try {
      // SPAレンダリング完了を待機（DOMに追加されればOK、最大15秒）
      await page.waitForSelector(targetSelector, { state: 'attached', timeout: 15000 });
      await page.waitForTimeout(500);
      const el = await page.$(targetSelector);
      if (el) {
        // 要素をビューポート上端に配置
        await el.evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await page.waitForTimeout(1000);
        console.log('Scrolled to element:', targetSelector);
      } else {
        console.log('Element not found after waitForSelector:', targetSelector);
      }
    } catch (e) {
      console.log('Selector not found, using default viewport:', e.message);
    }
  }

  await page.screenshot({ path: 'screenshot.png', type: 'png' });
  await browser.close();
  console.log('Screenshot saved for:', targetPage);
})();
