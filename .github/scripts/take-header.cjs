/**
 * Xヘッダー画像用スクリーンショット (1500x500)
 *
 * Usage: node .github/scripts/take-header.cjs [page]
 * page: dashboard(default), tanker, clock, map
 */
const { chromium } = require('playwright');

const pageArg = process.argv[2] || 'dashboard';
const pages = {
  dashboard: { path: '/dashboard', selector: null },
  tanker: { path: '/last-tanker', selector: '[data-screenshot="tanker-map"]' },
  clock: { path: '/countdown', selector: '[data-screenshot="flow-timeline"]' },
  map: { path: '/collapse-map', selector: '[data-screenshot="collapse-map"]' },
};
const target = pages[pageArg] || pages.dashboard;

(async () => {
  const browser = await chromium.launch();
  // 1500x500 — Xヘッダーサイズ。ダークモードで撮影
  const page = await browser.newPage({ viewport: { width: 1500, height: 500 }, colorScheme: 'dark' });

  console.log(`Loading: https://surviveasonejp.org${target.path}`);
  await page.goto('https://surviveasonejp.org' + target.path, { waitUntil: 'networkidle', timeout: 30000 });

  if (target.selector) {
    try {
      await page.waitForSelector(target.selector, { state: 'attached', timeout: 10000 });
      const el = await page.$(target.selector);
      if (el) {
        await el.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      console.log('Selector not found, using default viewport:', e.message);
    }
  }

  await page.waitForTimeout(2000); // アニメーション完了待ち
  await page.screenshot({ path: 'x-header.png', type: 'png' });
  await browser.close();
  console.log(`Saved: x-header.png (1500x500, ${pageArg})`);
})();
