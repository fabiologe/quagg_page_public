import { readFileSync } from 'node:fs';
import { parse, compileScript } from 'vue/compiler-sfc';
let schlecht = 0;
for (const datei of process.argv.slice(2)) {
  const quelle = readFileSync(datei, 'utf8');
  const { descriptor, errors } = parse(quelle, { filename: datei });
  if (errors.length) { console.error('PARSE', datei, errors[0].message); schlecht = 1; continue; }
  try {
    compileScript(descriptor, { id: datei, inlineTemplate: true });
    console.log('ok  ', datei);
  } catch (e) { console.error('FEHL', datei, e.message); schlecht = 1; }
}
process.exit(schlecht);
