const { test } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { prepareImage } = require("../desktop/images.cjs");
const { Project, MAX_IMAGE } = require("../desktop/project.cjs");
const { imageFixtures } = require("./helpers/image-fixtures.cjs");
const { unzipSync, strFromU8, zipSync } = require("fflate");
const fixtures = imageFixtures();

test("PNG, JPEG, WebP, AVIF, TIFF and SVG import as bounded, displayable PNG images", async () => {
  const inputs = await fixtures;
  for (const type of ["png", "jpeg", "webp", "avif", "tiff", "svg"]) {
    const image = await prepareImage(inputs[type]);
    assert.equal(image.type, "png", type);
    assert.equal(image.poster, null, type);
    const metadata = await sharp(image.bytes).metadata();
    assert.equal(metadata.width, 1000, type);
    assert.equal(metadata.height, 500, type);
    const pixels = await sharp(image.bytes).raw().toBuffer();
    assert.ok(pixels[0] > 240 && pixels[2] < 15, `${type} retains the red image`);
  }
});

test("animated GIF and WebP retain frames, timing, looping and a separate still image through save, reopen and undo/redo", async () => {
  const inputs = await fixtures;
  for (const type of ["gif", "animatedWebp"]) {
    const image = await prepareImage(inputs[type]);
    const metadata = await sharp(image.bytes, { animated: true }).metadata();
    assert.equal(metadata.pages, 2);
    assert.equal(metadata.width, 1000);
    assert.equal(metadata.pageHeight, 500);
    assert.deepEqual(metadata.delay, [120, 240]);
    assert.equal(metadata.loop, 0);
    const first = await sharp(image.bytes, { page: 0 }).raw().toBuffer();
    const second = await sharp(image.bytes, { page: 1 }).raw().toBuffer();
    assert.ok(first[0] > first[2] && second[2] > second[0]);
    assert.equal((await sharp(image.poster).metadata()).format, "png");

    const project = Project.create();
    const id = project.document.groups[0].id;
    project.addImage(id, image.bytes, image.poster);
    project.undo();
    assert.equal(project.document.groups[0].image, null);
    const archive = await project.encode();
    const files = unzipSync(archive);
    assert.equal(JSON.parse(strFromU8(files["project.json"])).version, 2);
    const reopened = Project.decode(archive);
    reopened.redo();
    const group = reopened.view().document.groups[0];
    assert.match(group.imageUrl, /^data:image\/(gif|webp);base64,/);
    assert.match(group.imageStillUrl, /^data:image\/png;base64,/);
    assert.deepEqual(Buffer.from(reopened.assets[group.image]), image.bytes);
    assert.deepEqual(Buffer.from(reopened.assets[group.imageStill]), image.poster);
    delete files[group.imageStill];
    assert.throws(() => Project.decode(zipSync(files)), /mangler et bilde/);
    reopened.addImage(id, inputs.png);
    assert.equal(reopened.document.groups[0].imageStill, undefined);
    reopened.undo();
    assert.equal(reopened.document.groups[0].imageStill, group.imageStill);
  }
});

test("camera orientation is applied, and malformed, oversized and excessive-pixel images fail before import", async () => {
  const rotated = await sharp({ create: { width: 80, height: 40, channels: 3, background: "red" } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const image = await prepareImage(rotated);
  const metadata = await sharp(image.bytes).metadata();
  assert.equal(metadata.width, 40);
  assert.equal(metadata.height, 80);
  await assert.rejects(prepareImage(Buffer.from("not an image")), /kunne ikke åpnes/);
  await assert.rejects(prepareImage(Buffer.alloc(MAX_IMAGE + 1)), /for stort/);
  await assert.rejects(prepareImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="50000" height="50000"/>')), /piksler/);
});
