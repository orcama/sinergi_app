import postcss from 'postcss';
import { readFile } from 'node:fs/promises';
import config from './postcss.config.mjs';
const css = await readFile('./app/globals.css', 'utf8');
const plugins = [];
for (const [name, opts] of Object.entries(config.plugins)) {
  const mod = (await import(name)).default;
  plugins.push(mod(opts ?? {}));
}
try {
  const result = await postcss(plugins).process(css, { from: './app/globals.css' });
  console.log('OK, output length:', result.css.length);
} catch (e) {
  console.error('PROCESS ERROR:', e.message);
  process.exit(1);
}
