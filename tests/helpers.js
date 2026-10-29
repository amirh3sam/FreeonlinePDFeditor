// Shared helpers for the PDF Studio end-to-end tests.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const JSZip = require('jszip');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

const ROOT = path.join(__dirname, '..');
// BASE_URL=https://freeonlinepdfeditor.vercel.app runs the same tests against the live site
const APP = (process.env.BASE_URL || '').replace(/\/$/, '') || 'file://' + path.join(ROOT, 'index.html');
const FIX = path.join(__dirname, '.fixtures');
const OUT = path.join(__dirname, '.out');

// Serve the CDN libraries from node_modules so tests are fast and offline-safe.
const CDN = {
  'pdf.min.js': require.resolve('pdfjs-dist/build/pdf.min.js'),
  'pdf.worker.min.js': require.resolve('pdfjs-dist/build/pdf.worker.min.js'),
  'pdf-lib.min.js': require.resolve('pdf-lib/dist/pdf-lib.min.js'),
  'jszip.min.js': require.resolve('jszip/dist/jszip.min.js'),
};

let browser;
async function launch() { browser = await chromium.launch(); fs.mkdirSync(FIX, { recursive: true }); fs.mkdirSync(OUT, { recursive: true }); return browser; }
async function close() { if (browser) await browser.close(); }

async function newPage(viewport = { width: 1300, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const pg = await ctx.newPage();
  pg.errors = [];
  pg.on('pageerror', e => pg.errors.push(e.message));
  if (process.env.LIVE_CDN) return pg; // production smoke: load the real libraries from cdnjs / Google Fonts
  await pg.route('https://cdnjs.cloudflare.com/**', r => {
    const f = CDN[r.request().url().split('/').pop()];
    return f ? r.fulfill({ body: fs.readFileSync(f), contentType: 'text/javascript' }) : r.abort();
  });
  await pg.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  return pg;
}

/* ---------- fixtures ---------- */
async function makeFixtures() {
  const f = {};
  const mk = async (name, build) => { const d = await PDFDocument.create(); await build(d); const p = path.join(FIX, name); fs.writeFileSync(p, await d.save()); f[name.replace(/\W.*/, '')] = p; };
  await mk('three.pdf', async d => {
    const font = await d.embedFont(StandardFonts.Helvetica);
    ['Alpha', 'Bravo', 'Charlie'].forEach((w, i) => { const p = d.addPage([612, 792]); p.drawText(`${w} page`, { x: 72, y: 700, size: 24, font }); if (i === 1) p.setRotation(degrees(90)); });
  });
  await mk('two.pdf', async d => { const font = await d.embedFont(StandardFonts.Helvetica); ['Delta', 'Echo'].forEach(w => d.addPage([612, 792]).drawText(`${w} page`, { x: 72, y: 700, size: 24, font })); });
  await mk('single.pdf', async d => { const font = await d.embedFont(StandardFonts.Helvetica); d.addPage([612, 792]).drawText('Solo page', { x: 72, y: 700, size: 24, font }); });
  await mk('form.pdf', async d => {
    const font = await d.embedFont(StandardFonts.Helvetica); const p = d.addPage([612, 792]); const form = d.getForm();
    p.drawText('Price: $100 per month', { x: 72, y: 690, size: 14, font, color: rgb(.8, 0, 0) });
    form.createTextField('name').addToPage(p, { x: 140, y: 632, width: 250, height: 22 });
    form.createCheckBox('agree').addToPage(p, { x: 140, y: 595, width: 16, height: 16 });
    const rg = form.createRadioGroup('plan'); rg.addOptionToPage('basic', p, { x: 140, y: 555, width: 16, height: 16 }); rg.addOptionToPage('pro', p, { x: 200, y: 555, width: 16, height: 16 });
    const dd = form.createDropdown('state'); dd.addOptions(['GA', 'NY', 'CA']); dd.addToPage(p, { x: 140, y: 512, width: 100, height: 22 });
    form.createTextField('fa').addToPage(p, { x: 140, y: 472, width: 250, height: 22 });
  });
  // images made by a real browser canvas
  const pg = await newPage();
  await pg.setContent('<canvas></canvas>');
  const img = async (w, h, type, noise) => Buffer.from((await pg.evaluate(([w, h, type, noise]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    if (noise) { const id = x.createImageData(w, h); for (let i = 0; i < id.data.length; i += 4) { id.data[i] = Math.random() * 255; id.data[i + 1] = (i / 4 % w) / w * 255; id.data[i + 2] = 120; id.data[i + 3] = 255; } x.putImageData(id, 0, 0); }
    else { x.fillStyle = '#3fe0c5'; x.fillRect(0, 0, w, h); x.fillStyle = '#000'; x.font = '40px sans-serif'; x.fillText('PHOTO', 20, h / 2); }
    return c.toDataURL(type, .95);
  }, [w, h, type, noise])).split(',')[1], 'base64');
  fs.writeFileSync(f.png = path.join(FIX, 'wide.png'), await img(400, 300, 'image/png'));
  fs.writeFileSync(f.jpg = path.join(FIX, 'tall.jpg'), await img(300, 500, 'image/jpeg'));
  const noise = await img(1200, 1600, 'image/png', true);
  await pg.context().close();
  await mk('heavy.pdf', async d => { const im = await d.embedPng(noise); for (let i = 0; i < 3; i++) d.addPage([612, 792]).drawImage(im, { x: 0, y: 0, width: 612, height: 792 }); });
  return f;
}

/* ---------- app driving ---------- */
async function openTool(pg, id, files) {
  await pg.goto(APP + '#' + id); await pg.waitForSelector('#fPick:visible');
  const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('#fPick')]);
  await fc.setFiles(files);
}
async function openWork(pg, id, files) { await openTool(pg, id, files); await pg.waitForSelector('#fWork:not(.hide)'); await pg.waitForTimeout(250); }
async function go(pg) { await pg.click('#fGo'); await pg.waitForSelector('#fDone:not(.hide)', { timeout: 60000 }); }
async function grab(pg, selector = '#fDl') {
  const [d] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click(selector)]);
  const p = path.join(OUT, Date.now() + '-' + d.suggestedFilename()); await d.saveAs(p);
  return { name: d.suggestedFilename(), path: p, bytes: fs.readFileSync(p) };
}
async function toastText(pg) { await pg.waitForSelector('#toast.show'); return (await pg.textContent('#toast')).trim(); }
const seg = (pg, name, v) => pg.click(`[data-seg="${name}"] [data-v="${v}"]`);
async function openEditor(pg, file, viewport) {
  await openTool(pg, 'fill-forms', [file]); await pg.waitForFunction(() => VIEW === 'editor' && S.pages.length > 0);
  await pg.waitForTimeout(400);
}
// click a point given in PDF display points on page i of the editor
async function at(pg, i, x, y, noScroll) {
  const el = (await pg.$$('.page svg'))[i]; const z = await pg.evaluate(() => S.zoom);
  // scroll the editor so the exact point is in the middle of the screen
  if (!noScroll) await el.evaluate((svg, [y, z]) => { const v = document.getElementById('viewer'); const r = svg.getBoundingClientRect(), vr = v.getBoundingClientRect(); v.scrollTop += (r.top + y * z) - (vr.top + vr.height / 2); }, [y, z]);
  const b = await el.boundingBox();
  return [b.x + x * z, b.y + y * z];
}
async function drag(pg, i, x1, y1, x2, y2) { await at(pg, i, (x1 + x2) / 2, (y1 + y2) / 2); const a = await at(pg, i, x1, y1, true), b = await at(pg, i, x2, y2, true); await pg.mouse.move(...a); await pg.mouse.down(); await pg.mouse.move(...b, { steps: 6 }); await pg.mouse.up(); }
async function tap(pg, i, x, y) { await pg.mouse.click(...await at(pg, i, x, y)); }

/* ---------- output inspection ---------- */
async function inspect(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i); const vp = p.getViewport({ scale: 1 });
    const text = (await p.getTextContent()).items.map(t => t.str).join(' ');
    const ops = await p.getOperatorList();
    const images = ops.fnArray.filter(f => f === pdfjs.OPS.paintImageXObject).length;
    const annots = await p.getAnnotations();
    pages.push({ rotate: p.rotate, w: Math.round(vp.width), h: Math.round(vp.height), text, images, annots });
  }
  const meta = await doc.getMetadata();
  await doc.destroy();
  return { count: pages.length, pages, text: pages.map(p => p.text).join(' | '), producer: meta.info.Producer, creator: meta.info.Creator };
}
async function unzip(bytes) { const z = await JSZip.loadAsync(bytes); const out = {}; for (const n of Object.keys(z.files).sort()) out[n] = await z.files[n].async('nodebuffer'); return out; }
function jpegSize(buf) {
  for (let i = 2; i < buf.length;) { if (buf[i] !== 0xFF) return null; const m = buf[i + 1], len = buf.readUInt16BE(i + 2); if (m >= 0xC0 && m <= 0xC3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }; i += 2 + len; }
  return null;
}

module.exports = { launch, close, newPage, makeFixtures, openTool, openWork, go, grab, toastText, seg, openEditor, at, drag, tap, inspect, unzip, jpegSize, APP };
