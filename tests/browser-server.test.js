const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createDevServer } = require("../scripts/dev-server.cjs");
const { Project } = require("../desktop/project.cjs");
const { readSheet } = require("read-excel-file/node");
const { imageFixtures } = require("./helpers/image-fixtures.cjs");

async function fixture(t, dataDir) {
  const directory =
    dataDir || (await fs.mkdtemp(path.join(os.tmpdir(), "mvuka-browser-")));
  const instance = await createDevServer({ dataDir: directory });
  await new Promise((resolve) =>
    instance.server.listen(0, "127.0.0.1", resolve),
  );
  const base = `http://127.0.0.1:${instance.server.address().port}`;
  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      await instance.close();
    }
  };
  t.after(async () => {
    await close();
    if (!dataDir) await fs.rm(directory, { recursive: true, force: true });
  });
  const get = async () => (await fetch(`${base}/api/state`)).json();
  const command = async (action, payload) => {
    const response = await fetch(`${base}/api/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  };
  return { ...instance, directory, base, get, command, close };
}

test("browser mode serves the real interface and rejects cross-origin writes and file traversal", async (t) => {
  const server = await fixture(t);
  const control = await fetch(server.base);
  assert.match(await control.text(), /browser-bridge.js/);
  assert.equal((await fetch(`${server.base}/publikum`)).status, 200);
  assert.equal(
    (await fetch(`${server.base}/brand/icon.png`)).headers.get("Content-Type"),
    "image/png",
  );
  assert.equal(
    (await fetch(`${server.base}/%2e%2e%5cpackage.json`)).status,
    404,
  );
  const forbidden = await fetch(`${server.base}/api/command`, {
    method: "POST",
    headers: {
      Origin: "https://elsewhere.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "add-group" }),
  });
  assert.equal(forbidden.status, 403);
  assert.equal((await server.get()).document.groups.length, 5);
  assert.ok(
    (await server.get()).document.groups.every(
      (g) => g.name === "" && g.points === 0 && g.image === null,
    ),
  );
});

test("browser scores, images and persistent redo round-trip through downloadable mvuka files and server restart", async (t) => {
  const server = await fixture(t);
  await server.command("add-group", { name: "Etterklang" });
  const id = (await server.get()).document.groups[0].id;
  const png = await fs.readFile(
    path.resolve(__dirname, "..", "public/brand/icon.png"),
  );
  await server.command("image", { id, bytes: png.toString("base64") });
  const importedPng = Buffer.from((await server.get()).document.groups[0].imageUrl.split(",")[1], "base64");
  await Promise.all(
    Array.from({ length: 8 }, () =>
      server.command("points", { id, delta: 12 }),
    ),
  );
  assert.equal((await server.get()).document.groups[0].points, 96);
  await server.command("undo");
  const downloaded = await fetch(`${server.base}/api/project`);
  const bytes = Buffer.from(await downloaded.arrayBuffer());
  const portable = Project.decode(bytes);
  assert.equal(portable.document.groups[0].points, 84);
  assert.equal(portable.view().canRedo, true);
  assert.deepEqual(
    Buffer.from(portable.assets[portable.document.groups[0].image]),
    importedPng,
  );
  const oldCopy = (await server.get()).projectPath;
  await assert.rejects(server.command("new", { title: "  " }), /prosjektnavn/);
  assert.equal((await server.get()).projectPath, oldCopy);
  await server.command("new", { title: "Nytt show" });
  assert.equal((await server.get()).document.groups.length, 5);
  assert.equal((await server.get()).document.title, "Nytt show");
  assert.equal(
    Project.decode(await fs.readFile(oldCopy)).document.groups[0].points,
    84,
  );
  await server.command("open", {
    name: "Årets show.mvuka",
    bytes: bytes.toString("base64"),
  });
  const lastCopy = (await server.get()).projectPath;
  assert.notEqual(lastCopy, oldCopy);
  await server.close();
  const restarted = await fixture(t, server.directory);
  const state = await restarted.get();
  assert.equal(state.document.groups[0].points, 84);
  assert.ok(state.document.groups[0].imageUrl);
  assert.equal(state.canRedo, true);
  assert.equal(state.projectPath, lastCopy);
  await restarted.command("redo");
  assert.equal((await restarted.get()).document.groups[0].points, 96);
  assert.equal(
    Project.decode(await fs.readFile(lastCopy)).document.groups[0].points,
    96,
  );
  const header = (await fetch(`${restarted.base}/api/project`)).headers.get(
    "Content-Disposition",
  );
  assert.match(header, /%C3%85rets/);
});

test("browser subscribers receive live score and presentation changes", async (t) => {
  const server = await fixture(t);
  const controller = new AbortController();
  const response = await fetch(`${server.base}/api/events`, {
    signal: controller.signal,
  });
  assert.match(response.headers.get("Content-Type"), /text\/event-stream/);
  const reader = response.body.getReader();
  t.after(() => {
    controller.abort();
  });
  let buffer = "";
  async function nextMatching(predicate) {
    for (;;) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary >= 0) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (event.startsWith("data: ")) {
          const state = JSON.parse(event.slice(6));
          if (predicate(state)) return state;
        }
      } else {
        const part = await reader.read();
        assert.equal(part.done, false);
        buffer += new TextDecoder().decode(part.value);
      }
    }
  }
  assert.equal((await nextMatching(() => true)).document.groups.length, 5);
  await server.command("demo");
  assert.equal(
    (await nextMatching((s) => s.document.groups.length === 12)).document.groups
      .length,
    12,
  );
  await server.command("start-presentation");
  assert.equal(
    (await nextMatching((s) => s.presentation.running)).presentation.running,
    true,
  );
  await server.command("presentation-mode", { mode: "black" });
  assert.equal(
    (await nextMatching((s) => s.presentation.mode === "black")).presentation
      .mode,
    "black",
  );
  controller.abort();
});

test("winner mode requires a named group and returns to the scoreboard without changing scores or history", async (t) => {
  const server = await fixture(t);
  await assert.rejects(server.command("presentation-mode", { mode: "winner" }), /gruppenavn/);
  assert.equal((await server.get()).presentation.mode, "scoreboard");
  const id = (await server.get()).document.groups[0].id;
  await server.command("rename-group", { id, name: "Vinnerlaget" });
  await server.command("set-points", { id, points: 92 });
  const before = await server.get();
  await server.command("presentation-mode", { mode: "winner" });
  const finale = await server.get();
  assert.equal(finale.presentation.mode, "winner");
  assert.deepEqual(finale.document, before.document);
  assert.equal(finale.canUndo, before.canUndo);
  await server.command("presentation-mode", { mode: "scoreboard" });
  assert.equal((await server.get()).presentation.mode, "scoreboard");
  await server.command("new", { title: "Neste finale" });
  assert.equal((await server.get()).presentation.mode, "scoreboard");
});

test("decimal adjustments persist through browser downloads and reopen without losing score precision or history", async (t) => {
  const server = await fixture(t);
  const id = (await server.get()).document.groups[0].id;
  await server.command("set-points", { id, points: 5 });
  await assert.rejects(server.command("adjust-points", { id, expression: "/2" }), /helt antall/);
  await server.command("decimals", { enabled: true });
  await server.command("adjust-points", { id, expression: "/2" });
  await server.command("adjust-points", { id, expression: "+0,25" });
  assert.equal((await server.get()).document.groups[0].points, 2.75);
  const response = await fetch(`${server.base}/api/project`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await server.command("new", { title: "Neste prosjekt" });
  await server.command("open", { name: "desimaler.mvuka", bytes: bytes.toString("base64") });
  assert.equal((await server.get()).document.settings.allowDecimals, true);
  assert.equal((await server.get()).document.groups[0].points, 2.75);
  await assert.rejects(server.command("decimals", { enabled: false }), /inneholder desimalpoeng/);
  await server.command("undo");
  assert.equal((await server.get()).document.groups[0].points, 2.5);
  await server.command("redo");
  assert.equal((await server.get()).document.groups[0].points, 2.75);
});

test("Excel template downloads as a readable workbook without changing the project", async (t) => {
  const server = await fixture(t);
  const before = await server.get();
  const response = await fetch(`${server.base}/api/excel-template`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /spreadsheetml.sheet/);
  assert.match(response.headers.get("Content-Disposition"), /attachment; filename="Musikkvideouka-mal.xlsx"/);
  const bytes = Buffer.from(await response.arrayBuffer());
  const rows = await readSheet(bytes, 1);
  assert.deepEqual(rows[0].slice(0, 3), ["Navn", "Bilde", "Poeng"]);
  assert.ok(rows.slice(1, 6).every((row) => row[0] === null && row[1] === null && row[2] === 0));
  assert.deepEqual((await server.get()).document, before.document);
  assert.equal((await server.get()).canUndo, before.canUndo);
});

test("browser Excel import is undoable and reports images requiring manual selection", async (t) => {
  const server = await fixture(t);
  await server.command("add-group", { name: "Før import" });
  const bytes = await fs.readFile(
    path.resolve(__dirname, "..", "Musikkvideouka.xlsx"),
  );
  const result = await server.command("import", {
    bytes: bytes.toString("base64"),
  });
  assert.match(result.notice, /bildene/);
  assert.equal((await server.get()).document.groups.length, 17);
  await server.command("undo");
  assert.equal((await server.get()).document.groups.at(-1).name, "Før import");
  await assert.rejects(server.command("open", { bytes: "not a project" }));
  assert.equal((await server.get()).document.groups.at(-1).name, "Før import");
});

test("browser uploads normalize TIFF and preserve portable GIF animation and its still image", async (t) => {
  const server = await fixture(t);
  const images = await imageFixtures();
  const id = (await server.get()).document.groups[0].id;
  await server.command("image", { id, bytes: images.tiff.toString("base64") });
  assert.match((await server.get()).document.groups[0].imageUrl, /^data:image\/png/);
  await server.command("image", { id, bytes: images.gif.toString("base64") });
  const group = (await server.get()).document.groups[0];
  assert.match(group.imageUrl, /^data:image\/gif/);
  assert.match(group.imageStillUrl, /^data:image\/png/);
  await assert.rejects(server.command("image", { id, bytes: Buffer.from("bad image").toString("base64") }), /kunne ikke åpnes/);
  assert.equal((await server.get()).document.groups[0].image, group.image);
  const download = await fetch(`${server.base}/api/project`);
  const portable = Project.decode(Buffer.from(await download.arrayBuffer()));
  assert.equal(portable.view().document.groups[0].imageStillUrl, group.imageStillUrl);
  assert.equal(portable.view().document.groups[0].imageUrl, group.imageUrl);
});
