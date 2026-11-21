import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'https://vn-lotte.mating.workers.dev';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();
page.on('console', (m) => { if (/category|loadmore|Error|error/i.test(m.text())) console.log('  [console]', m.text().slice(0, 140)); });
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 160)));

await page.goto(BASE + '/vi-nsg/category/dau-an-c201', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2500);

const diag = await page.evaluate(async () => {
  const out = { steps: [] };
  const m = location.pathname.match(/-c(\d+)$/);
  out.catId = m ? m[1] : null;
  out.steps.push(`catId=${out.catId}`);

  const sampleItem = document.querySelector('.item');
  out.sampleItem = !!sampleItem;
  out.steps.push(`sampleItem=${!!sampleItem}`);

  if (!sampleItem) return out;
  const sampleCol = sampleItem.closest('.col') || sampleItem.parentNode;
  out.sampleColClass = sampleCol?.className || '(none)';
  out.steps.push(`sampleCol.class=${sampleCol?.className}`);

  const grid = sampleCol?.parentNode;
  out.gridClass = grid?.className || '(none)';
  out.gridChildren = grid?.children?.length;
  out.steps.push(`grid.class=${grid?.className} children=${grid?.children?.length}`);

  /* 拿 cat-index */
  try {
    const r = await fetch('/data/cat-index.json', { cache: 'force-cache' });
    out.indexStatus = r.status;
    const j = await r.json();
    out.indexKeys = Object.keys(j).length;
    out.listLen = (j[out.catId] || []).length;
    out.meta = j._meta;
    out.steps.push(`index: status=${r.status} keys=${out.indexKeys} list[${out.catId}]=${out.listLen}`);
  } catch (e) {
    out.indexError = String(e).slice(0, 100);
    out.steps.push('index fetch failed');
  }

  /* 已渲染 sku 数 */
  const set = {};
  document.querySelectorAll('a[href*="/vi-nsg/product/"]').forEach((a) => {
    const mm = String(a.getAttribute('href') || '').match(/-(\d{8,14})(?:-\d{8,14})?-p\d+/);
    if (mm) set[mm[1]] = 1;
  });
  out.renderedSku = Object.keys(set).length;
  out.steps.push(`rendered=${out.renderedSku}`);

  out.btnExists = !!document.querySelector('.clone-loadmore');
  out.wrapExists = !!document.querySelector('.clone-loadmore-wrap');
  return out;
});

console.log(JSON.stringify(diag, null, 1));

await browser.close();
