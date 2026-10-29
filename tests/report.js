// Turns node:test output into one GitHub annotation (GitHub only shows 10 per step).
const fs = require('fs');
const lines = fs.readFileSync(process.argv[2] || 'result.txt', 'utf8').split('\n').filter(l => !/Warning|polyfill|^Require stack|^- /.test(l));
const summary = lines.filter(l => /ℹ (tests|pass|fail)/.test(l)).join('  ');
const failed = lines.filter(l => /^\s+✖ /.test(l)).map(l => l.trim().replace(/\s*\([\d.]+ms\)/, ''));
const i = lines.findIndex(l => /^✖ failing tests:/.test(l));
const details = i < 0 ? [] : lines.slice(i, i + 60).filter(l => !/^\s+at /.test(l));
const enc = s => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
console.log(`::error title=${summary}::${enc(['FAILED (' + failed.length + '):', ...failed, '', ...details].join('\n'))}`);
