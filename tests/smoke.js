// Quick look at a deployed site: prints what headless Chrome actually sees.
const H = require('./helpers');
(async () => {
  await H.launch(); const pg = await H.newPage(); const logs = [];
  pg.on('console', m => logs.push(m.type() + ': ' + m.text()));
  pg.on('requestfailed', r => logs.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText));
  const res = await pg.goto(H.APP, { waitUntil: 'load' });
  await pg.waitForTimeout(1500);
  const info = await pg.evaluate(() => ({ title: document.title, tools: document.querySelectorAll('#toolGrid .tool').length, pdfjs: !!window.pdfjsLib, pdflib: !!window.PDFLib, zip: !!window.JSZip, view: typeof VIEW !== 'undefined' ? VIEW : 'n/a', body: document.body.innerText.slice(0, 120).replace(/\s+/g, ' ') }));
  console.log(`::notice title=Smoke ${H.APP}::status=${res && res.status()} ${JSON.stringify(info)} errors=${JSON.stringify(pg.errors)} logs=${JSON.stringify(logs.slice(0, 8))}`);
  await H.close();
})();
