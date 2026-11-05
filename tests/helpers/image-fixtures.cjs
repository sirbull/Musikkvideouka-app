const sharp = require("sharp");

async function imageFixtures() {
  const create = (background) => sharp({ create: { width: 1200, height: 600, channels: 4, background } }).png().toBuffer();
  const red = await create("#ff0000");
  const blue = await create("#0000ff");
  const animated = () => sharp([red, blue], { join: { animated: true } });
  return {
    png: red,
    jpeg: await sharp(red).jpeg().toBuffer(),
    webp: await sharp(red).webp().toBuffer(),
    avif: await sharp(red).avif({ effort: 0 }).toBuffer(),
    tiff: await sharp(red).tiff({ compression: "lzw" }).toBuffer(),
    svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="red"/></svg>'),
    gif: await animated().gif({ delay: [120, 240], loop: 0 }).toBuffer(),
    animatedWebp: await animated().webp({ delay: [120, 240], loop: 0 }).toBuffer(),
  };
}

module.exports = { imageFixtures };
