import sharp from "sharp";
import path from "node:path";

const publicDir = path.join(process.cwd(), "public");

function makeSvg(size: number): Buffer {
  const fontSize = Math.round(size * 0.375);
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="#c2410c"/>
  <text
    x="${size / 2}"
    y="${size / 2 + fontSize * 0.37}"
    font-family="system-ui, Arial, sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    fill="white"
    text-anchor="middle"
  >CW</text>
</svg>`;
  return Buffer.from(svg);
}

async function main() {
  await sharp(makeSvg(192)).png().toFile(path.join(publicDir, "icon-192.png"));
  console.log("✓ icon-192.png");

  await sharp(makeSvg(512)).png().toFile(path.join(publicDir, "icon-512.png"));
  console.log("✓ icon-512.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
