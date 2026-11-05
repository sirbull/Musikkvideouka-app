const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

(async () => {
  const { default: pngToIco } = await import("png-to-ico");
  const root = path.resolve(__dirname, "..");
  const source = path.join(root, "DESIGN", "logo.svg");
  await fs.mkdir(path.join(root, "public", "brand"), { recursive: true });
  await fs.copyFile(source, path.join(root, "public", "brand", "logo.svg"));
  // The supplied mark is black; use a white mark on a transparent square for dark window chrome.
  const icon = await sharp(source)
    .resize(440, 440, { fit: "contain", background: "#00000000" })
    .negate({ alpha: false })
    .extend({ top: 36, bottom: 36, left: 36, right: 36, background: "#00000000" })
    .png()
    .toBuffer();
  await fs.writeFile(path.join(root, "assets", "icon.png"), icon);
  await sharp(icon)
    .resize(128, 128)
    .png()
    .toFile(path.join(root, "public", "brand", "icon.png"));
  const sizes = await Promise.all(
    [16, 24, 32, 48, 64, 128, 256].map((size) =>
      sharp(icon).resize(size, size).png().toBuffer(),
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
