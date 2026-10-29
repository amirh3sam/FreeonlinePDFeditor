// End-to-end tests for PDF Studio. Run: npm test
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

let fx;
before(async () => { await H.launch(); fx = await H.makeFixtures(); });
after(H.close);

// Each test gets a fresh browser context; any uncaught page error fails the test.
function t(name, fn, opts) {
  test(name, opts || {}, async () => {
    const pg = await H.newPage(opts && opts.viewport);
    try { await fn(pg); assert.deepEqual(pg.errors, [], 'page threw errors'); }
    finally { await pg.context().close(); }
  });
}

const TOOLS = ['merge', 'split', 'compress', 'edit', 'sign', 'fill-forms', 'organize', 'rotate', 'page-numbers', 'watermark', 'pdf-to-jpg', 'jpg-to-pdf'];

describe('Home & navigation', () => {
  t('home lists all 12 tools', async pg => {
    await pg.goto(H.APP); const hrefs = await pg.$$eval('#toolGrid .tool', a => a.map(x => x.getAttribute('href')));
    assert.deepEqual(hrefs, TOOLS.map(x => '#' + x));
  });
  t('every tool card opens its own page with title and pick button', async pg => {
    await pg.goto(H.APP);
    for (const id of TOOLS) {
      await pg.click(`#toolGrid a[href="#${id}"]`); await pg.waitForSelector('#fSelect:not(.hide)');
      const title = await pg.textContent('#fTitle'); assert.ok(title.length > 3, id);
      assert.ok(await pg.isVisible('#fPick'), id);
      assert.match(await pg.title(), /PDF Studio/);
      await pg.click('#flow .homebtn'); await pg.waitForSelector('#home:not(.hide)');
    }
  });
  t('top nav links route correctly', async pg => {
    await pg.goto(H.APP); const links = await pg.$$eval('#home .tnav a', a => a.map(x => x.getAttribute('href')));
    assert.ok(links.includes('#merge') && links.includes('#jpg-to-pdf') && links.includes('#'));
  });
  t('wrong file type is rejected with a message', async pg => {
    await H.openTool(pg, 'merge', [fx.png]); assert.match(await H.toastText(pg), /PDF/);
    await H.openTool(pg, 'jpg-to-pdf', [fx.single]); assert.match(await H.toastText(pg), /image/i);
  });
});

describe('Merge PDF', () => {
  t('merges in order and keeps all pages', async pg => {
    await H.openWork(pg, 'merge', [fx.three, fx.two]); await H.go(pg);
    const out = await H.grab(pg); assert.equal(out.name, 'merged.pdf');
    const r = await H.inspect(out.bytes); assert.equal(r.count, 5);
    assert.match(r.pages[0].text, /Alpha/); assert.match(r.pages[3].text, /Delta/);
    assert.equal(r.pages[1].rotate, 90, 'original /Rotate kept');
  });
  t('reorder and remove files', async pg => {
    await H.openWork(pg, 'merge', [fx.three, fx.two, fx.single]);
    await pg.click('#fGrid .pcard:nth-child(1) [data-a=r]');          // two, three, single
    await pg.click('#fGrid .pcard:nth-child(3) [data-a=x]');          // two, three
    assert.equal(await pg.$$eval('#fGrid .pcard', c => c.length), 2);
    await H.go(pg); const r = await H.inspect((await H.grab(pg)).bytes);
    assert.equal(r.count, 5); assert.match(r.pages[0].text, /Delta/); assert.match(r.pages[2].text, /Alpha/);
  });
  t('back to options and merge again', async pg => {
    await H.openWork(pg, 'merge', [fx.single, fx.two]); await H.go(pg); await pg.click('#fBack'); await H.go(pg);
    assert.equal((await H.inspect((await H.grab(pg)).bytes)).count, 3);
  });
});

describe('Split PDF', () => {
  t('pick pages by tapping thumbnails', async pg => {
    await H.openWork(pg, 'split', [fx.three]);
    await pg.click('#fGrid .pcard:nth-child(1)'); await pg.click('#fGrid .pcard:nth-child(3)');
    assert.equal(await pg.inputValue('#rngIn'), '1, 3');
    await H.go(pg); const r = await H.inspect((await H.grab(pg)).bytes);
    assert.equal(r.count, 2); assert.match(r.pages[1].text, /Charlie/);
  });
  t('pick pages by typing a range', async pg => {
    await H.openWork(pg, 'split', [fx.three]); await pg.fill('#rngIn', '2-3');
    assert.equal(await pg.$$eval('#fGrid .pcard.sel', c => c.length), 2);
    await H.go(pg); const r = await H.inspect((await H.grab(pg)).bytes); assert.equal(r.count, 2); assert.match(r.pages[0].text, /Bravo/);
  });
  t('nothing selected shows a message', async pg => {
    await H.openWork(pg, 'split', [fx.three]); await pg.click('#fGo'); assert.match(await H.toastText(pg), /at least one/);
  });
  t('split by custom ranges into a zip', async pg => {
    await H.openWork(pg, 'split', [fx.three]); await H.seg(pg, 'mode', 'ranges'); await pg.fill('#rngsIn', '1-2, 3');
    await H.go(pg); const out = await H.grab(pg); assert.match(out.name, /\.zip$/);
    const files = await H.unzip(out.bytes); const names = Object.keys(files); assert.equal(names.length, 2);
    assert.equal((await H.inspect(files[names[0]])).count, 2); assert.equal((await H.inspect(files[names[1]])).count, 1);
  });
  t('invalid range shows a message', async pg => {
    await H.openWork(pg, 'split', [fx.three]); await H.seg(pg, 'mode', 'ranges'); await pg.fill('#rngsIn', 'abc');
    await pg.click('#fGo'); assert.match(await H.toastText(pg), /valid range/);
  });
  t('split every page', async pg => {
    await H.openWork(pg, 'split', [fx.three]); await H.seg(pg, 'mode', 'every'); await H.go(pg);
    const files = await H.unzip((await H.grab(pg)).bytes); assert.equal(Object.keys(files).length, 3);
    for (const b of Object.values(files)) assert.equal((await H.inspect(b)).count, 1);
  });
});

describe('Compress PDF', () => {
  for (const level of ['extreme', 'rec', 'less']) {
    t(`level "${level}" makes the file smaller and keeps pages`, async pg => {
      await H.openWork(pg, 'compress', [fx.heavy]); await H.seg(pg, 'level', level); await H.go(pg);
      assert.match(await pg.textContent('#fInfo'), /% smaller/);
      const out = await H.grab(pg); const orig = require('fs').statSync(fx.heavy).size;
      assert.ok(out.bytes.length < orig * 0.5, `${out.bytes.length} vs ${orig}`);
      assert.equal((await H.inspect(out.bytes)).count, 3);
    }, { timeout: 120000 });
  }
  t('already-small PDF is not made bigger', async pg => {
    await H.openWork(pg, 'compress', [fx.single]); await pg.click('#fGo');
    assert.match(await H.toastText(pg), /already well optimised/); assert.ok(await pg.isVisible('#fWork'));
  });
});

describe('Organize & Rotate', () => {
  t('organize: move, rotate, delete, add blank, add PDF', async pg => {
    await H.openWork(pg, 'organize', [fx.three]);
    await pg.click('#fGrid .pcard:nth-child(1) [data-a=r]');           // Bravo, Alpha, Charlie
    await pg.click('#fGrid .pcard:nth-child(3) [data-a=o]');           // rotate Charlie
    await pg.click('#fGrid .pcard:nth-child(1) [data-a=x]');           // Alpha, Charlie
    await pg.click('#fGrid .addcard:last-child');                       // + blank
    const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('#fGrid .addcard:nth-last-child(2)')]); await fc.setFiles(fx.two);
    await pg.waitForFunction(() => S.pages.length === 5);
    await H.go(pg); const r = await H.inspect((await H.grab(pg)).bytes);
    assert.equal(r.count, 5);
    assert.match(r.pages[0].text, /Alpha/); assert.match(r.pages[1].text, /Charlie/); assert.equal(r.pages[1].rotate, 90);
    assert.equal(r.pages[2].text, ''); assert.match(r.pages[3].text, /Delta/);
  });
  t('cannot delete the only page', async pg => {
    await H.openWork(pg, 'organize', [fx.single]); await pg.click('#fGrid .pcard:nth-child(1) [data-a=x]'); assert.match(await H.toastText(pg), /only page/);
  });
  t('rotate all right / left / single page', async pg => {
    await H.openWork(pg, 'rotate', [fx.three]);
    await pg.click('#rotR'); let r = await H.inspect((await (async () => { await H.go(pg); return H.grab(pg); })()).bytes);
    assert.deepEqual(r.pages.map(p => p.rotate), [90, 180, 90]);
    await pg.click('#fBack'); await pg.click('#rotL'); await pg.click('#rotL');
    await H.go(pg); r = await H.inspect((await H.grab(pg)).bytes); assert.deepEqual(r.pages.map(p => p.rotate), [270, 0, 270]);
    await pg.click('#fBack'); await pg.click('#fGrid .pcard:nth-child(2)');
    await H.go(pg); r = await H.inspect((await H.grab(pg)).bytes); assert.deepEqual(r.pages.map(p => p.rotate), [270, 90, 270]);
  });
});

describe('Page numbers', () => {
  const cases = [['n', 'bc', 1, /\b1\b.*\b2\b.*\b3\b/], ['page', 'tr', 1, /Page 1.*Page 2.*Page 3/], ['of', 'bl', 1, /Page 1 of 3.*Page 3 of 3/], ['n', 'tl', 5, /\b5\b.*\b7\b/]];
  for (const [fmt, pos, start, re] of cases) {
    t(`format "${fmt}" at ${pos}, start ${start}`, async pg => {
      await H.openWork(pg, 'page-numbers', [fx.three]); await H.seg(pg, 'fmt', fmt); await H.seg(pg, 'pos', pos);
      await pg.fill('#pnSt', String(start)); await pg.fill('#pnS', '14'); await H.go(pg);
      const r = await H.inspect((await H.grab(pg)).bytes); assert.match(r.text, re);
    });
  }
});

describe('Watermark', () => {
  t('centered, default settings', async pg => {
    await H.openWork(pg, 'watermark', [fx.three]); await pg.fill('#wmT', 'DRAFT'); await H.go(pg);
    const r = await H.inspect((await H.grab(pg)).bytes);
    for (const p of r.pages) assert.equal((p.text.match(/DRAFT/g) || []).length, 1);
  });
  for (const angle of ['0', '90', '-45']) {
    t(`tiled at ${angle}°, black, size and transparency`, async pg => {
      await H.openWork(pg, 'watermark', [fx.three]); await pg.fill('#wmT', 'SECRET'); await H.seg(pg, 'wmode', 'tile'); await H.seg(pg, 'angle', angle);
      await pg.click('[data-wc="#111111"]'); await pg.fill('#wmS', '30'); await pg.fill('#wmO', '50');
      assert.ok(await pg.$$eval('#fGrid .pcard:first-child .wm', w => w.length) > 3, 'preview tiles');
      await H.go(pg); const r = await H.inspect((await H.grab(pg)).bytes);
      for (const p of r.pages) assert.ok((p.text.match(/SECRET/g) || []).length > 3);
    });
  }
  t('non-Latin watermark is drawn as an image', async pg => {
    await H.openWork(pg, 'watermark', [fx.single]); await pg.fill('#wmT', 'محرمانه'); await H.go(pg);
    const r = await H.inspect((await H.grab(pg)).bytes); assert.ok(r.pages[0].images >= 1);
  });
  t('empty text shows a message', async pg => {
    await H.openWork(pg, 'watermark', [fx.single]); await pg.fill('#wmT', ' '); await pg.click('#fGo'); assert.match(await H.toastText(pg), /watermark text/);
  });
});

describe('PDF to JPG', () => {
  for (const [dpi, w] of [['100', 850], ['150', 1275], ['220', 1870]]) {
    t(`quality ${dpi} dpi gives ${w}px-wide JPGs`, async pg => {
      await H.openWork(pg, 'pdf-to-jpg', [fx.three]); await H.seg(pg, 'dpi', dpi); await H.go(pg);
      const out = await H.grab(pg); assert.match(out.name, /\.zip$/);
      const files = await H.unzip(out.bytes); const names = Object.keys(files); assert.equal(names.length, 3);
      const sizes = names.map(n => H.jpegSize(files[n]));
      assert.equal(sizes[0].w, w); assert.equal(sizes[1].h, w, 'rotated page is landscape');
    }, { timeout: 90000 });
  }
  t('single-page PDF gives one .jpg', async pg => {
    await H.openWork(pg, 'pdf-to-jpg', [fx.single]); await H.go(pg); const out = await H.grab(pg);
    assert.match(out.name, /\.jpg$/); assert.ok(H.jpegSize(out.bytes).w > 100);
  });
});

describe('JPG to PDF', () => {
  const cases = [
    ['fit', 'auto', '0', [[792, 594], [475, 792]]],
    ['a4', 'auto', '20', [[842, 595], [595, 842]]],
    ['a4', 'portrait', '0', [[595, 842], [595, 842]]],
    ['letter', 'landscape', '40', [[792, 612], [792, 612]]],
  ];
  for (const [size, orient, margin, dims] of cases) {
    t(`${size} / ${orient} / margin ${margin}`, async pg => {
      await H.openWork(pg, 'jpg-to-pdf', [fx.png, fx.jpg]); await H.seg(pg, 'size', size); await H.seg(pg, 'orient', orient); await H.seg(pg, 'margin', margin);
      await H.go(pg); const r = await H.inspect((await H.grab(pg)).bytes);
      assert.equal(r.count, 2); assert.deepEqual(r.pages.map(p => [p.w, p.h]), dims);
      r.pages.forEach(p => assert.equal(p.images, 1));
    });
  }
  t('reorder and remove images', async pg => {
    await H.openWork(pg, 'jpg-to-pdf', [fx.png, fx.jpg, fx.png]);
    await pg.click('#fGrid .pcard:nth-child(1) [data-a=r]'); await pg.click('#fGrid .pcard:nth-child(3) [data-a=x]');
    await H.go(pg); const r = await H.inspect((await H.grab(pg)).bytes);
    assert.equal(r.count, 2); assert.ok(r.pages[0].h > r.pages[0].w, 'tall image first');
  });
});

describe('Editor — forms & text', () => {
  t('fill every kind of form field (incl. Persian)', async pg => {
    await H.openEditor(pg, fx.form);
    assert.equal(await pg.$$eval('.ff', f => f.length), 6);
    await pg.fill('.ff[data-field="0|name"]', 'Amir Hesam'); await pg.check('.ff[data-field="0|agree"]');
    await (await pg.$$('.ff[data-field="0|plan"]'))[1].check(); await pg.selectOption('.ff[data-field="0|state"]', 'NY');
    await pg.fill('.ff[data-field="0|fa"]', 'امیر');
    const out = await H.grab(pg, '#saveBtn'); const r = await H.inspect(out.bytes);
    assert.match(r.text, /Amir Hesam/); assert.match(r.text, /NY/);
    assert.equal(r.pages[0].annots.filter(a => a.subtype === 'Widget').length, 0, 'form flattened');
    assert.ok(r.pages[0].images >= 1, 'Persian value drawn');
  });
  t('edit existing text keeps colour and replaces wording', async pg => {
    await H.openEditor(pg, fx.form); await pg.click('[data-tool=edittext]'); await pg.waitForSelector('.ti');
    await H.tap(pg, 0, 120, 98); await pg.keyboard.press('End');
    for (let i = 0; i < 5; i++) await pg.keyboard.press('Backspace'); await pg.keyboard.type('year');
    await pg.click('[data-tool=select]');
    const a = await pg.evaluate(() => S.pages[0].annots[0]); assert.equal(a.text, 'Price: $100 per year'); assert.ok(a.cover); assert.notEqual(a.color, '#111111', 'red sampled');
    const r = await H.inspect((await H.grab(pg, '#saveBtn')).bytes); assert.match(r.text, /per year/);
  });
  t('add text, change font/size/colour, multi-line', async pg => {
    await H.openEditor(pg, fx.single); await pg.click('[data-tool=text]'); await H.tap(pg, 0, 100, 300);
    await pg.keyboard.type('Line one\nLine two'); await pg.click('[data-tool=select]'); await H.tap(pg, 0, 110, 300);
    await pg.selectOption('#fontSel', 'serif'); await pg.click('#swatches [data-c="#1d4ed8"]');
    await pg.$eval('#size', e => { e.value = 30; e.dispatchEvent(new Event('input')); });
    const a = await pg.evaluate(() => S.pages[0].annots[0]); assert.deepEqual([a.font, a.color, a.size], ['serif', '#1d4ed8', 30]);
    const r = await H.inspect((await H.grab(pg, '#saveBtn')).bytes); assert.match(r.text, /Line one.*Line two/);
  });
  t('switching tools never recolours the selected item (regression)', async pg => {
    await H.openEditor(pg, fx.single); await pg.click('[data-tool=text]'); await H.tap(pg, 0, 100, 300); await pg.keyboard.type('Keep me black');
    await pg.click('[data-tool=select]'); await H.tap(pg, 0, 110, 300); assert.ok(await pg.evaluate(() => !!selAnnot()));
    for (const tool of ['highlight', 'pen', 'text', 'edittext']) await pg.click(`[data-tool=${tool}]`);
    assert.equal(await pg.evaluate(() => S.pages[0].annots[0].color), '#111111');
  });
  t('Persian added text is embedded as an image', async pg => {
    await H.openEditor(pg, fx.single); await pg.click('[data-tool=text]'); await H.tap(pg, 0, 100, 300); await pg.keyboard.type('سلام');
    await pg.click('[data-tool=select]'); assert.ok((await H.inspect((await H.grab(pg, '#saveBtn')).bytes)).pages[0].images >= 1);
  });
});

describe('Editor — drawing tools', () => {
  t('every drawing tool creates an annotation and saves', async pg => {
    await H.openEditor(pg, fx.single);
    await pg.click('[data-tool=pen]'); await H.drag(pg, 0, 100, 400, 200, 450);
    await pg.click('[data-tool=highlight]'); await H.drag(pg, 0, 70, 80, 250, 105);
    await pg.click('[data-tool=whiteout]'); await H.drag(pg, 0, 300, 300, 400, 350);
    await pg.click('[data-tool=rect]'); await H.drag(pg, 0, 300, 400, 450, 480);
    await pg.click('[data-tool=line]'); await H.drag(pg, 0, 72, 520, 540, 520);
    await pg.click('[data-tool=arrow]'); await H.drag(pg, 0, 72, 560, 300, 600);
    await pg.click('[data-tool=check]'); await H.tap(pg, 0, 100, 650);
    await pg.click('[data-tool=cross]'); await H.tap(pg, 0, 150, 650);
    await pg.click('[data-tool=date]'); await H.tap(pg, 0, 300, 650);
    await pg.click('[data-tool=note]'); await H.tap(pg, 0, 500, 60); await pg.keyboard.type('Review this'); await pg.click('[data-tool=select]');
    const types = await pg.evaluate(() => S.pages[0].annots.map(a => a.type + (a.kind || '') + (a.arrow ? '>' : '')));
    assert.deepEqual(types, ['path', 'highlight', 'whiteout', 'rect', 'line', 'line>', 'markcheck', 'markcross', 'text', 'note']);
    const today = await pg.evaluate(() => today());
    const r = await H.inspect((await H.grab(pg, '#saveBtn')).bytes);
    assert.ok(r.text.includes(today), 'date stamp'); const note = r.pages[0].annots.find(a => a.subtype === 'Text');
    assert.ok(note, 'sticky note saved as a real PDF comment'); assert.equal(note.contentsObj.str, 'Review this');
  });
  t('tiny accidental drags are ignored', async pg => {
    await H.openEditor(pg, fx.single); await pg.click('[data-tool=rect]'); await H.drag(pg, 0, 100, 100, 101, 101);
    assert.equal(await pg.evaluate(() => S.pages[0].annots.length), 0);
  });
  t('select, move, resize, delete, eraser', async pg => {
    await H.openEditor(pg, fx.single); await pg.click('[data-tool=rect]'); await H.drag(pg, 0, 100, 100, 200, 200);
    await pg.click('[data-tool=select]'); await H.drag(pg, 0, 150, 100, 250, 150);
    let a = await pg.evaluate(() => S.pages[0].annots[0]); assert.ok(Math.abs(a.x - 200) < 3 && Math.abs(a.y - 150) < 3, 'moved');
    const h = await pg.$('.handle'); const b = await h.boundingBox(); await pg.mouse.move(b.x + 5, b.y + 5); await pg.mouse.down(); await pg.mouse.move(b.x + 60, b.y + 60, { steps: 4 }); await pg.mouse.up();
    a = await pg.evaluate(() => S.pages[0].annots[0]); assert.ok(a.w > 120, 'resized');
    await pg.click('#delBtn'); assert.equal(await pg.evaluate(() => S.pages[0].annots.length), 0);
    await pg.keyboard.press('Control+z'); assert.equal(await pg.evaluate(() => S.pages[0].annots.length), 1, 'undo');
    await pg.click('[data-tool=erase]'); await H.tap(pg, 0, a.x, a.y + 20); assert.equal(await pg.evaluate(() => S.pages[0].annots.length), 0, 'erased');
    await pg.click('#undoBtn'); await pg.click('#redoBtn'); assert.equal(await pg.evaluate(() => S.pages[0].annots.length), 0, 'redo');
  });
  t('insert image and keep aspect ratio on resize', async pg => {
    await H.openEditor(pg, fx.single); await pg.setInputFiles('#imgIn', fx.png); await pg.waitForSelector('#hint:visible'); await H.tap(pg, 0, 300, 400);
    const a = await pg.evaluate(() => S.pages[0].annots[0]); assert.equal(a.type, 'image'); assert.ok(Math.abs(a.w / a.h - 4 / 3) < .01);
    assert.equal((await H.inspect((await H.grab(pg, '#saveBtn')).bytes)).pages[0].images, 1);
  });
  t('keyboard shortcuts switch tools', async pg => {
    await H.openEditor(pg, fx.single);
    for (const [k, tool] of [['t', 'text'], ['d', 'pen'], ['h', 'highlight'], ['w', 'whiteout'], ['b', 'rect'], ['l', 'line'], ['a', 'arrow'], ['n', 'note'], ['e', 'erase'], ['x', 'edittext'], ['v', 'select']]) {
      await pg.keyboard.press(k); assert.equal(await pg.evaluate(() => S.tool), tool, k);
    }
  });
  t('zoom in/out', async pg => {
    await H.openEditor(pg, fx.single); const z0 = await pg.evaluate(() => S.zoom); await pg.click('#zIn'); assert.ok(await pg.evaluate(() => S.zoom) > z0); await pg.click('#zOut'); await pg.click('#zOut'); assert.ok(await pg.evaluate(() => S.zoom) < z0);
  });
});

describe('Editor — signatures', () => {
  t('draw, type, save, reuse and delete signatures', async pg => {
    await H.openTool(pg, 'sign', [fx.single]); await pg.waitForSelector('#sigModal.show');
    const pad = await (await pg.$('#sigPad')).boundingBox();
    await pg.mouse.move(pad.x + 40, pad.y + 100); await pg.mouse.down(); await pg.mouse.move(pad.x + 200, pad.y + 60, { steps: 8 }); await pg.mouse.move(pad.x + 300, pad.y + 140, { steps: 8 }); await pg.mouse.up();
    await pg.click('#sigUse'); await H.tap(pg, 0, 300, 600);
    await pg.click('#signBtn'); await pg.click('#tabType'); await pg.fill('#sigType', 'Amir Hesam'); await pg.click('#sigUse'); await H.tap(pg, 0, 300, 700);
    assert.equal(await pg.evaluate(() => S.pages[0].annots.filter(a => a.type === 'image').length), 2);
    await pg.click('#signBtn'); assert.equal(await pg.$$eval('.ssig', s => s.length), 2, 'both remembered');
    await pg.click('.ssig:first-child img'); await H.tap(pg, 0, 100, 200);
    assert.equal(await pg.evaluate(() => S.pages[0].annots.filter(a => a.type === 'image').length), 3, 'reused');
    await pg.click('#signBtn'); await pg.click('.ssig:first-child b'); assert.equal(await pg.$$eval('.ssig', s => s.length), 1, 'deleted'); await pg.click('#sigCancel');
    assert.equal((await H.inspect((await H.grab(pg, '#saveBtn')).bytes)).pages[0].images, 3);
  });
  t('empty signature is refused', async pg => {
    await H.openTool(pg, 'sign', [fx.single]); await pg.waitForSelector('#sigModal.show'); await pg.click('#sigUse'); assert.match(await H.toastText(pg), /Draw your signature/);
  });
});

describe('Editor — pages & tools menu', () => {
  t('sidebar: move, rotate, delete, blank page, merge, page numbers', async pg => {
    await H.openEditor(pg, fx.three);
    await pg.click('.th:nth-child(1) [title="Move down"]'); await pg.click('.th:nth-child(1) [title=Rotate]');
    await pg.click('.th:nth-child(3) [title=Delete]'); await pg.click('#side .add:has-text("Blank page")');
    await pg.setInputFiles('#mergeIn', fx.two); await pg.waitForFunction(() => S.pages.length === 5);
    await pg.click('#side .add:has-text("Page numbers")'); await pg.selectOption('#pnFmt', 'of'); await pg.click('#pnApply');
    const r = await H.inspect((await H.grab(pg, '#saveBtn')).bytes);
    assert.equal(r.count, 5); assert.match(r.pages[0].text, /Bravo/); assert.equal(r.pages[0].rotate, 180); assert.match(r.pages[1].text, /Alpha/);
    assert.match(r.text, /Page 5 of 5/);
  });
  t('tools menu: extract, split, jpg, compress from the editor', async pg => {
    await H.openEditor(pg, fx.three);
    await pg.click('#moreBtn'); await pg.click('[data-go=extract]'); await pg.fill('#rangeIn', '1,3');
    assert.equal((await H.inspect((await H.grab(pg, '#doExtract')).bytes)).count, 2);
    await pg.click('#moreBtn'); await pg.click('[data-go=split]'); assert.equal(Object.keys(await H.unzip((await H.grab(pg, '#doSplit')).bytes)).length, 3);
    await pg.click('#moreBtn'); await pg.click('[data-go=jpg]'); assert.equal(Object.keys(await H.unzip((await H.grab(pg, '#doJpg')).bytes)).length, 3);
    await pg.click('#moreBtn'); await pg.click('[data-go=compress]'); await pg.click('#doCompress'); await pg.waitForFunction(() => document.querySelector('#cres').textContent.length > 0);
  }, { timeout: 90000 });
});

describe('Mobile', () => {
  t('home, a tool page and the editor work on a phone screen', async pg => {
    await pg.goto(H.APP); assert.equal(await pg.$$eval('#toolGrid .tool', t => t.length), 12);
    const w = await pg.evaluate(() => document.documentElement.scrollWidth); assert.ok(w <= 390, 'no sideways scroll');
    await H.openWork(pg, 'merge', [fx.single, fx.two]); assert.ok(await pg.isVisible('#fGo'));
    await H.go(pg); assert.equal((await H.inspect((await H.grab(pg)).bytes)).count, 3);
    await H.openEditor(pg, fx.single); assert.ok(await pg.isVisible('#pagesBtn')); await pg.click('#pagesBtn'); assert.ok(await pg.isVisible('.th'));
  }, { viewport: { width: 390, height: 800 } });
});
