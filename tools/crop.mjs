// node tools/crop.mjs <in.png> <outprefix> [chunk=1800] [width]: split a tall screenshot into JPEG chunks for viewing.
import sharp from "sharp";
const [inp, pre, chunk = "1800", w] = process.argv.slice(2);
const m = await sharp(inp).metadata();
for (let i = 0, y = 0; y < m.height; i++, y += +chunk) {
  let s = sharp(inp).extract({ left: 0, top: y, width: m.width, height: Math.min(+chunk, m.height - y) });
  if (w) s = s.resize({ width: +w });
  await s.jpeg({ quality: 70 }).toFile(`${pre}-${i}.jpg`);
}
console.log(m.width, m.height);
