const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { zipSync, strToU8, unzipSync, strFromU8 } = require("fflate");
const { Project, atomicWrite, MAX_GROUPS } = require("../desktop/project.cjs");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6wKQAAAAASUVORK5CYII=",
  "base64",
);
const add = (project) => {
  project.apply("add-group", { name: "Etterklang" });
  return project.document.groups.at(-1).id;
};

test("new named projects start with five genuinely empty groups and no undo history", () => {
  const project = Project.create("  Musikkvideouka 2026  ");
  assert.equal(project.document.title, "Musikkvideouka 2026");
  assert.equal(project.document.groups.length, 5);
  assert.equal(new Set(project.document.groups.map((g) => g.id)).size, 5);
  assert.ok(
    project.document.groups.every(
      (g) => g.name === "" && g.points === 0 && g.image === null,
    ),
  );
  assert.equal(project.view().canUndo, false);
  assert.throws(() => Project.create("  "), /prosjektnavn/);
});

test("song titles are a separate field, merge typing into one undo step, and older projects without them still open", async () => {
  const project = Project.create("Show");
  const id = project.document.groups[0].id;
  for (const song of ["Ne", "Neon nights  "])
    project.apply("song-title", { id, song, editId: "song-edit" });
  assert.equal(project.document.groups[0].song, "Neon nights");
  assert.equal(project.document.groups[0].name, "");
  assert.equal(project.past.length, 1);
  assert.equal(project.view().undoLabel, "Endre tittel");
  assert.throws(() => project.apply("song-title", { id, song: "x".repeat(201) }), /tittel/);
  const restored = Project.decode(await project.encode());
  assert.equal(restored.document.groups[0].song, "Neon nights");
  const older = structuredClone(project.document);
  for (const group of older.groups) delete group.song;
  assert.equal(new Project(older).document.groups[0].song, undefined);
});

test("typing an absolute score and project name merges into one undo step per field edit", async () => {
  const project = Project.create("Show");
  const id = project.document.groups[0].id;
  for (const points of [1, 12, 120])
    project.apply("set-points", { id, points, editId: "score-edit" });
  assert.equal(project.past.length, 1);
  project.undo();
  assert.equal(project.document.groups[0].points, 0);
  project.redo();
  assert.equal(project.document.groups[0].points, 120);
  project.apply("rename-group", { id, name: "" });
  assert.equal(project.document.groups[0].name, "");
  assert.throws(() => project.apply("set-points", { id, points: 1.2 }));
  for (const title of ["S", "Show 2026"])
    project.apply("title", { title, subtitle: "", editId: "title-edit" });
  const restored = Project.decode(await project.encode());
  restored.undo();
  assert.equal(restored.document.title, "Show");
  assert.equal(restored.document.groups[0].points, 120);
});

test("portable archive preserves image bytes, points, settings and undo/redo after reopening", async () => {
  const project = new Project();
  const id = add(project);
  project.addImage(id, png);
  project.apply("points", { id, delta: 12 });
  project.apply("motion", { enabled: false });
  project.undo();
  const restored = Project.decode(await project.encode());
  assert.equal(restored.document.groups[0].points, 12);
  assert.deepEqual(
    Buffer.from(restored.assets[restored.document.groups[0].image]),
    png,
  );
  assert.match(
    restored.view().document.groups[0].imageUrl,
    /^data:image\/png;base64,/,
  );
  assert.equal(restored.view().canRedo, true);
  restored.redo();
  assert.equal(restored.document.settings.motion, false);
  restored.undo();
  restored.undo();
  assert.equal(restored.document.groups[0].points, 0);
});

test("deleting a group keeps its image available when undone, including across save/open", async () => {
  const project = new Project();
  const id = add(project);
  project.addImage(id, png);
  const image = project.document.groups[0].image;
  project.apply("remove-group", { id });
  const reopened = Project.decode(await project.encode());
  assert.equal(reopened.document.groups.length, 0);
  reopened.undo();
  assert.deepEqual(Buffer.from(reopened.assets[image]), png);
  assert.equal(reopened.document.groups[0].id, id);
});

test("new changes invalidate redo and zero-point changes do not add undo history", () => {
  const project = new Project();
  const id = add(project);
  project.apply("points", { id, delta: 12 });
  project.undo();
  project.apply("points", { id, delta: 5 });
  assert.equal(project.view().canRedo, false);
  const length = project.past.length;
  project.apply("points", { id, delta: 0 });
  assert.equal(project.past.length, length);
  assert.equal(project.document.groups[0].points, 5);
});

test("a continuous name edit autosaves each input but undoes as one change", async () => {
  const project = new Project();
  const id = add(project);
  for (const name of ["N", "Ne", "Neo", "Neon"])
    project.apply("rename-group", { id, name, editId: "edit-1" });
  assert.equal(project.past.length, 2);
  const restored = Project.decode(await project.encode());
  assert.equal(restored.document.groups[0].name, "Neon");
  restored.undo();
  assert.equal(restored.document.groups[0].name, "Etterklang");
  restored.redo();
  assert.equal(restored.document.groups[0].name, "Neon");
});

test("bad score transactions leave document and history intact", () => {
  const project = new Project();
  const id = add(project);
  const before = structuredClone(project.document);
  for (const delta of [1.5, NaN, Infinity, 1000000, "12"])
    assert.throws(() => project.apply("points", { id, delta }));
  assert.throws(() => project.apply("points", { id: "missing", delta: 12 }));
  assert.deepEqual(project.document, before);
  assert.equal(project.past.length, 1);
});

test("archives reject traversal, missing assets, future formats and malformed history", async () => {
  assert.throws(
    () => Project.decode(zipSync({ "../outside.png": png })),
    /ukjente filer/,
  );
  const project = new Project();
  const id = add(project);
  project.addImage(id, png);
  const files = unzipSync(await project.encode());
  const image = project.document.groups[0].image;
  const withoutImage = { ...files };
  delete withoutImage[image];
  assert.throws(
    () => Project.decode(zipSync(withoutImage)),
    /mangler et bilde/,
  );
  const manifest = JSON.parse(strFromU8(files["project.json"]));
  manifest.version = 999;
  assert.throws(
    () =>
      Project.decode(
        zipSync({
          ...files,
          "project.json": strToU8(JSON.stringify(manifest)),
        }),
      ),
    /støttes ikke/,
  );
  manifest.version = 1;
  manifest.history.past[0].after.groups[0].points = "bad";
  assert.throws(
    () =>
      Project.decode(
        zipSync({
          ...files,
          "project.json": strToU8(JSON.stringify(manifest)),
        }),
      ),
    /Poeng/,
  );
});

test("image tampering is detected and duplicate images are stored only once", async () => {
  const project = new Project();
  const one = add(project),
    two = add(project);
  project.addImage(one, png);
  project.addImage(two, png);
  assert.equal(Object.keys(project.assets).length, 1);
  const files = unzipSync(await project.encode());
  const name = project.document.groups[0].image;
  files[name] = new Uint8Array([...png, 0]);
  assert.throws(() => Project.decode(zipSync(files)), /skadet/);
});

test("atomic saves preserve a readable previous version and clean up temporary files", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mvuka-test-"));
  try {
    const destination = path.join(directory, "show.mvuka");
    const project = new Project();
    const id = add(project);
    await atomicWrite(destination, await project.encode());
    project.apply("points", { id, delta: -5 });
    await atomicWrite(destination, await project.encode());
    assert.equal(
      Project.decode(await fs.readFile(destination)).document.groups[0].points,
      -5,
    );
    assert.equal(
      Project.decode(await fs.readFile(`${destination}.bak`)).document.groups[0]
        .points,
      0,
    );
    assert.deepEqual((await fs.readdir(directory)).sort(), [
      "show.mvuka",
      "show.mvuka.bak",
    ]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("history is bounded and group limit is validated", async () => {
  const project = new Project();
  const id = add(project);
  for (let n = 0; n < 220; n++) project.apply("points", { id, delta: 1 });
  assert.equal(project.past.length, 200);
  const reopened = Project.decode(await project.encode());
  assert.equal(reopened.document.groups[0].points, 220);
  for (let n = 1; n < MAX_GROUPS; n++) add(project);
  assert.throws(() => add(project), /maksimalt/);
});
