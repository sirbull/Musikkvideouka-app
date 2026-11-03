const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

(async () => {
  const { default: pngToIco } = await import("png-to-ico");
  const root = path.resolve(__dirname, "..");
  const source = path.join(root, "assets", "icon-source.png");
  await fs.mkdir(path.join(root, "public", "brand"), { recursive: true });
  await sharp(source)
    .resize(512, 512)
    .png()
    .toFile(path.join(root, "assets", "icon.png"));
  await sharp(source)
    .resize(128, 128)
    .png()
    .toFile(path.join(root, "public", "brand", "icon.png"));
  const sizes = await Promise.all(
    [16, 24, 32, 48, 64, 128, 256].map((size) =>
      sharp(source).resize(size, size).png().toBuffer(),
    ),
  );
  await fs.writeFile(
    path.join(root, "assets", "icon.ico"),
    await pngToIco(sizes),
  );
  console.log("Ikoner laget i assets/ og public/brand/.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
