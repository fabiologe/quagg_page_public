
import { transformToWGS84 } from './KostraHelper.js';

console.log("Testing WGS84 -> WGS84 (Kaiserslautern)");
const res1 = transformToWGS84(7.7690, 49.4447, 'EPSG:4326');
console.log(`Input: 7.7690, 49.4447. Output: ${JSON.stringify(res1)}`);

console.log("Testing UTM32N -> WGS84 (Kaiserslautern approx)");
// K-Town UTM 32N: approx E 410000, N 5477000 (Very rough, check online or trust conversion)
// Actually 7.769, 49.4447 -> UTM is approx 32U 410740 5477640
const utxE = 410740;
const utxN = 5477640;
const res2 = transformToWGS84(utxE, utxN, 'EPSG:25832');
console.log(`Input: ${utxE}, ${utxN}. Output: ${JSON.stringify(res2)}`);

if (res2 && Math.abs(res2[0] - 7.769) < 0.1 && Math.abs(res2[1] - 49.44) < 0.1) {
    console.log("SUCCESS: UTM Transformation worked.");
} else {
    console.log("FAILURE: UTM Transformation bad/missing.");
}
