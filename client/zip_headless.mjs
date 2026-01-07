import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

const zip = new JSZip();
// Assuming running from client/
const outDir = 'src/features/flood-2D/solverHydro/build/headless_output';
const targetDir = 'public';

if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir);

if (!fs.existsSync(outDir)) {
    console.error("Output directory not found: ", outDir);
    process.exit(1);
}

const files = fs.readdirSync(outDir);
console.log(`Zipping ${files.length} files from ${outDir}...`);

for (const file of files) {
    const filePath = path.join(outDir, file);
    const content = fs.readFileSync(filePath);
    zip.file(file, content);
}

zip.generateAsync({ type: "nodebuffer" }).then(function (content) {
    const targetPath = path.join(targetDir, "results.zip");
    fs.writeFileSync(targetPath, content);
    console.log(`Created ${targetPath}`);
});
