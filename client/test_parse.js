const fs = require('fs');

const bciContent = `
P 380403.5 5506976.5 QVAR c_1
P 380391.5 5506987.5 QVAR c_1
P 380633.5 5507134.5 HFIX 243.32
P 380633.5 5507133.5 HFIX 243.33
P 380633.5 5507132.5 FREE
`;

const lines = bciContent.split('\n');
const points = [];
for (const line of lines) {
    const p = line.trim().split(/\s+/);
    if (p.length < 4) continue;
    const type = p[0];
    if (type === 'P') {
      const x = parseFloat(p[1]);
      const y = parseFloat(p[2]);
      const bType = p[3];
      if (!isNaN(x) && !isNaN(y)) {
        points.push({ x, y, type: bType });
      }
    }
}
console.log(points);
