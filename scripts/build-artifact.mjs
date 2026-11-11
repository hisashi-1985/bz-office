// dist/ のビルド結果を1つのHTMLにまとめ、claude.ai の公開ページ（Artifact）用に出力する。
// 使い方: npm run build && node scripts/build-artifact.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf-8');
const js = html.match(/<script[^>]*src="\.?\/?([^"]+\.js)"[^>]*><\/script>/);
const css = html.match(/<link[^>]*href="\.?\/?([^"]+\.css)"[^>]*>/);
if (!js) throw new Error('JS が見つかりません。先に npm run build を実行してください');

const jsCode = readFileSync(join(dist, js[1]), 'utf-8').replace(/<\/script/gi, '<\\/script');
const cssCode = css ? readFileSync(join(dist, css[1]), 'utf-8').replace(/<\/style/gi, '<\\/style') : '';

const page = `<title>売上・入金管理</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${cssCode}</style>
<div id="root"></div>
<script type="module">${jsCode}</script>
`;
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/sales-app.html', page);
console.log(`artifact/sales-app.html (${(page.length / 1024).toFixed(0)} KB)`);
