const fs = require('fs');
const path = require('path');

const themesDir = path.resolve(__dirname, '..', 'themes');
const files = fs.readdirSync(themesDir).filter(f => f.endsWith('.css'));
const PREFIX = '#mdr-content';

function prefixRuleSelector(selector) {
  return selector.split(',').map(s => {
    s = s.trim();
    s = PREFIX + ' ' + s;
    s = s.replace(new RegExp(PREFIX + ' body\\b', 'g'), PREFIX);
    s = s.replace(new RegExp(PREFIX + ' html\\b', 'g'), PREFIX);
    return s;
  }).join(', ');
}

for (const file of files) {
  let css = fs.readFileSync(path.join(themesDir, file), 'utf-8');

  // Strip CSS block comments to avoid false positives with { } inside comments
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // Extract @import and @charset statements so they don't interfere with {} parsing
  const imports = [];
  css = css.replace(/@(import|charset)\s+[^;]+;/g, (match) => {
    imports.push(match);
    return '';
  });

  let result = imports.join('\n') + (imports.length ? '\n' : '');
  let depth = 0;
  let buf = '';

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      let selector = buf.trim();
      if (!selector) {
        result += '{';
        depth++;
        buf = '';
        continue;
      }
      if (depth === 0 && selector.startsWith('@')) {
        result += selector + ' {';
      } else {
        result += prefixRuleSelector(selector) + ' {';
      }
      buf = '';
      depth++;
    } else if (ch === '}') {
      depth--;
      result += buf + '}';
      buf = '';
    } else {
      buf += ch;
    }
  }
  result += buf;

  result = result.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();

  fs.writeFileSync(path.join(themesDir, file), result);
  console.log('Processed', file);
}
