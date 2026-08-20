/**
 * Zet de gebouwde app om in één HTML-bestand, zodat hij als losse pagina te
 * bekijken is. Alle JavaScript en CSS gaan inline; er wordt niets van buiten
 * geladen.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = 'dist-demo';
const assets = join(dist, 'assets');
const files = await readdir(assets);

const js = files.find((file) => file.endsWith('.js'));
const css = files.find((file) => file.endsWith('.css'));
if (!js) throw new Error('Geen JavaScript-bundel gevonden in ' + assets);

const script = await readFile(join(assets, js), 'utf8');
const style = css ? await readFile(join(assets, css), 'utf8') : '';

if (/^\s*import\s/m.test(script)) {
  throw new Error('De bundel bevat nog imports; inline plaatsen zou breken.');
}

const html = `<title>Volleybal scouting</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<style>${style}</style>
<div id="root"></div>
<script type="module">${script}</script>
`;

const target = join(dist, 'volleybal-scouting.html');
await writeFile(target, html, 'utf8');
console.log(`${target} — ${(html.length / 1024).toFixed(0)} kB`);
