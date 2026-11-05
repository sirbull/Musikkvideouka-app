const sharp = require("sharp");
const { MAX_IMAGE } = require("./project.cjs");

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "jfif", "jpe", "webp", "gif", "avif", "tif", "tiff", "svg"];
const MAX_PIXELS = 100_000_000;
const FORMATS = "PNG, JPEG/JFIF, WebP, GIF, AVIF, TIFF eller SVG";

async function prepareImage(source) {
  const bytes = Buffer.from(source);
  if (bytes.length > MAX_IMAGE)
    throw new Error("Bildet er for stort. Maksimalt 12 MB.");
  try {
    const metadata = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata();
    if (!["png", "jpeg", "webp", "gif", "heif", "tiff", "svg"].includes(metadata.format))
      throw new Error("Unsupported format");
    const animated = ["gif", "webp"].includes(metadata.format) && metadata.pages > 1;
    const resize = { width: 1000, height: 1000, fit: "inside", withoutEnlargement: true };
    const still = () => sharp(bytes, { limitInputPixels: MAX_PIXELS, autoOrient: true })
      .resize(resize).toColourspace("srgb").png().toBuffer();
    let image, poster = null, type = "png";
    if (animated) {
      const pipeline = sharp(bytes, { animated: true, limitInputPixels: MAX_PIXELS }).resize(resize);
      type = metadata.format;
      image = await (type === "gif"
        ? pipeline.gif({ effort: 3, loop: metadata.loop ?? 0, delay: metadata.delay })
        : pipeline.webp({ quality: 85, effort: 3, loop: metadata.loop ?? 0, delay: metadata.delay }))
        .toBuffer();
      poster = await still();
    } else image = await still();
    if (image.length > MAX_IMAGE || (poster && poster.length > MAX_IMAGE))
      throw new Error("Bildet blir for stort etter import. Velg et mindre bilde (maksimalt 12 MB).");
    return { bytes: image, poster, type };
  } catch (error) {
    if (/for stort/.test(error.message)) throw error;
    if (/pixel limit/i.test(error.message))
      throw new Error("Bildet eller animasjonen har for mange piksler. Velg en mindre utgave.");
    throw new Error(`Bildet kunne ikke åpnes. Velg et gyldig bilde i ${FORMATS}-format.`);
  }
}

module.exports = { prepareImage, IMAGE_EXTENSIONS };
