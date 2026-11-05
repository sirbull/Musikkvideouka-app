// Local browser development mode. Reuses the desktop project's format and history.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { prepareImage } = require("../desktop/images.cjs");
const { normalisePoints } = require("../desktop/score-expression.cjs");
const {
  Project,
  atomicWrite,
  MAX_FILE,
  MAX_IMAGE,
} = require("../desktop/project.cjs");

const ROOT = path.resolve(__dirname, "..");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const DEMO = [
  "Midnatt",
  "Blå timer",
  "Etterklang",
  "Neonlys",
  "Nordavind",
  "Frekvens",
  "Solskinn",
  "Under overflaten",
  "Ekko",
  "Siste dans",
  "Horisont",
  "På repeat",
];
const responseError = (message, status = 400) =>
  Object.assign(new Error(message), { status });

async function createDevServer({
  dataDir = path.join(ROOT, ".dev-data"),
} = {}) {
  await fs.mkdir(dataDir, { recursive: true });
  const sessionFile = path.join(dataDir, "session.json");
  let project = Project.create(),
    fileName = "Musikkvideouka.mvuka";
  let storageName = `${randomUUID()}.mvuka`;
  let savedAt = null,
    saving = false,
    saveError = null;
  let presentation = { mode: "scoreboard", running: false, displayId: 0 };
  let queue = Promise.resolve();
  const clients = new Set();
  const enqueue = (task) => {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  };

  try {
    const session = JSON.parse(await fs.readFile(sessionFile, "utf8"));
    if (!/^[a-f0-9-]{36}\.mvuka$/.test(session.storageName))
      throw new Error("Ugyldig øktfil.");
    const source = path.join(dataDir, session.storageName);
    try {
      project = Project.decode(await fs.readFile(source));
    } catch {
      project = Project.decode(await fs.readFile(`${source}.bak`));
    }
    storageName = session.storageName;
    fileName =
      typeof session.fileName === "string"
        ? session.fileName.slice(0, 150)
        : fileName;
    savedAt = (await fs.stat(source)).mtime.toISOString();
  } catch (error) {
    if (error.code !== "ENOENT")
      saveError = `Forrige økt kunne ikke gjenopprettes: ${error.message}. Åpne en lagret prosjektfil.`;
  }

  function state() {
    return {
      ...project.view(),
      isBrowser: true,
      projectPath: path.join(dataDir, storageName),
      fileName: `${fileName} · arbeidskopi`,
      savedAt,
      saving,
      saveError,
      displays: [
        {
          id: 0,
          primary: true,
          label: "Eget nettleservindu – flytt til publikumsskjermen",
        },
      ],
      presentation,
    };
  }
  function broadcast() {
    const message = `data: ${JSON.stringify(state())}\n\n`;
    for (const client of clients) client.write(message);
  }
  async function persist() {
    saving = true;
    saveError = null;
    broadcast();
    try {
      await atomicWrite(
        path.join(dataDir, storageName),
        await project.encode(),
      );
      await atomicWrite(
        sessionFile,
        Buffer.from(JSON.stringify({ storageName, fileName })),
        false,
      );
      savedAt = new Date().toISOString();
    } catch (error) {
      saveError = `Kunne ikke lagre arbeidskopien: ${error.message}`;
      throw error;
    } finally {
      saving = false;
      broadcast();
    }
  }

  function decodeFile(payload, max) {
    if (
      !payload ||
      typeof payload.bytes !== "string" ||
      payload.bytes.length > Math.ceil((max * 4) / 3) + 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(payload.bytes)
    )
      throw responseError("Filen er ugyldig eller for stor.");
    const bytes = Buffer.from(payload.bytes, "base64");
    if (bytes.length > max) throw responseError("Filen er for stor.");
    return bytes;
  }

  async function runCommand(action, payload) {
    switch (action) {
      case "new": {
        const created = Project.create(payload?.title ?? "");
        await persist();
        project = created;
        storageName = `${randomUUID()}.mvuka`;
        fileName = `${created.document.title}.mvuka`;
        presentation.mode = "scoreboard";
        await persist();
        break;
      }
      case "open": {
        const opened = Project.decode(decodeFile(payload, MAX_FILE));
        await persist();
        project = opened;
        storageName = `${randomUUID()}.mvuka`;
        fileName = path
          .basename(String(payload.name || "Musikkvideouka.mvuka"))
          .slice(0, 150);
        if (!/\.mvuka$/i.test(fileName)) fileName += ".mvuka";
        presentation.mode = "scoreboard";
        await persist();
        break;
      }
      case "save":
        await persist();
        break;
      case "undo":
        if (project.undo()) await persist();
        break;
      case "redo":
        if (project.redo()) await persist();
        break;
      case "image": {
        const image = await prepareImage(decodeFile(payload, MAX_IMAGE));
        project.addImage(payload?.id, image.bytes, image.poster);
        await persist();
        break;
      }
      case "import": {
        const { readSheet } = require("read-excel-file/node");
        const rows = await readSheet(decodeFile(payload, 20 * 1024 * 1024), 1);
        const headers = (rows[0] || []).map((value) =>
          String(value || "")
            .trim()
            .toLowerCase(),
        );
        const nameIndex = headers.indexOf("navn"),
          pointsIndex = headers.indexOf("poeng"),
          imageIndex = headers.indexOf("bilde");
        if (nameIndex < 0)
          throw responseError("Første rad må inneholde kolonnen «Navn».");
        const groups = rows
          .slice(1)
          .filter((row) => row[nameIndex])
          .map((row) => ({
            id: randomUUID(),
            name: String(row[nameIndex]).trim(),
            points: normalisePoints(pointsIndex < 0 ? 0 : Number(String(row[pointsIndex] || 0).replace(",", ".")), !!project.document.settings.allowDecimals),
            image: null,
          }));
        if (!groups.length)
          throw responseError("Ingen grupper ble funnet i Excel-filen.");
        project.edit("Importer Excel", (doc) => {
          doc.groups = groups;
        });
        await persist();
        if (imageIndex >= 0 && rows.slice(1).some((row) => row[imageIndex]))
          return {
            notice:
              "Gruppene er importert. Velg bildene med bildeknappene; nettleseren får ikke lese bildefilene ved siden av Excel-arket automatisk.",
          };
        break;
      }
      case "demo":
        if (project.document.groups.some((g) => g.name || g.points || g.image))
          throw responseError(
            "Opprett et tomt prosjekt før du legger til eksempelgrupper.",
          );
        project.edit("Legg til eksempelgrupper", (doc) => {
          doc.groups = DEMO.map((name, index) => ({
            id: randomUUID(),
            name,
            points: [84, 76, 72, 65, 61, 58, 54, 49, 43, 38, 32, 24][index],
            image: null,
          }));
        });
        await persist();
        break;
      case "start-presentation":
        presentation.running = true;
        broadcast();
        break;
      case "stop-presentation":
        presentation.running = false;
        broadcast();
        break;
      case "presentation-mode":
        if (!["scoreboard", "pause", "black", "winner"].includes(payload?.mode))
          throw responseError("Ukjent visningsmodus.");
        if (payload.mode === "winner" && !project.document.groups.some((g) => g.name.trim()))
          throw responseError("Skriv inn minst ett gruppenavn før du viser vinneren.");
        presentation.mode = payload.mode;
        broadcast();
        break;
      default:
        if (project.apply(action, payload)) await persist();
    }
    return {};
  }

  async function body(request) {
    if (request.headers["content-type"] !== "application/json")
      throw responseError("Forventet JSON.", 415);
    const limit = Math.ceil((MAX_FILE * 4) / 3) + 8192;
    if (Number(request.headers["content-length"]) > limit)
      throw responseError("Filen er for stor.", 413);
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > limit) throw responseError("Filen er for stor.", 413);
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw responseError("Ugyldig forespørsel.");
    }
  }
  function json(response, status, value) {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(value));
  }
  const server = http.createServer(async (request, response) => {
    try {
      const address = server.address();
      const allowedHosts = [
        `127.0.0.1:${address.port}`,
        `localhost:${address.port}`,
      ];
      if (!allowedHosts.includes(request.headers.host))
        throw responseError("Ugyldig lokal adresse.", 403);
      const origin = `http://${request.headers.host}`;
      if (request.headers.origin && request.headers.origin !== origin)
        throw responseError("Ingen tilgang fra andre nettsteder.", 403);
      const url = new URL(request.url, origin);
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Cache-Control", "no-store");
      if (request.method === "GET" && url.pathname === "/api/state")
        return json(response, 200, state());
      if (request.method === "GET" && url.pathname === "/api/events") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          Connection: "keep-alive",
          "Cache-Control": "no-cache",
        });
        clients.add(response);
        response.write(`data: ${JSON.stringify(state())}\n\n`);
        const heartbeat = setInterval(
          () => response.write(": alive\n\n"),
          15000,
        );
        request.on("close", () => {
          clearInterval(heartbeat);
          clients.delete(response);
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/command") {
        const data = await body(request);
        const result = await enqueue(() =>
          runCommand(data.action, data.payload),
        );
        return json(response, 200, { ok: true, ...result });
      }
      if (request.method === "GET" && url.pathname === "/api/excel-template") {
        const bytes = await fs.readFile(
          path.join(ROOT, "assets", "Musikkvideouka-mal.xlsx"),
        );
        response.writeHead(200, {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="Musikkvideouka-mal.xlsx"',
        });
        return response.end(bytes);
      }
      if (request.method === "GET" && url.pathname === "/api/project") {
        const bytes = await enqueue(async () => {
          await persist();
          return project.encode();
        });
        response.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="Musikkvideouka.mvuka"; filename*=UTF-8''${encodeURIComponent(fileName).replace(/'/g, "%27")}`,
        });
        return response.end(Buffer.from(bytes));
      }
      if (request.method !== "GET")
        throw responseError("Handlingen støttes ikke.", 405);
      const pathname =
        url.pathname === "/" || url.pathname === "/admin"
          ? "/admin.html"
          : url.pathname === "/publikum"
            ? "/publikum.html"
            : decodeURIComponent(url.pathname);
      const publicDir = path.join(ROOT, "public");
      const filename = path.resolve(publicDir, `.${pathname}`);
      const relative = path.relative(publicDir, filename);
      if (
        relative.startsWith("..") ||
        path.isAbsolute(relative) ||
        !MIME[path.extname(filename)]
      )
        throw responseError("Filen finnes ikke.", 404);
      const bytes = await fs.readFile(filename);
      response.writeHead(200, { "Content-Type": MIME[path.extname(filename)] });
      response.end(bytes);
    } catch (error) {
      if (!response.headersSent)
        json(response, error.status || (error.code === "ENOENT" ? 404 : 400), {
          ok: false,
          error: error.message,
        });
      else response.end();
    }
  });
  async function close() {
    await queue;
    for (const client of clients) client.end();
    server.closeIdleConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  return { server, close, dataDir };
}

if (require.main === module) {
  (async () => {
    const index = process.argv.indexOf("--port");
    const port = Number(
      index >= 0 ? process.argv[index + 1] : process.env.PORT || 3000,
    );
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("Bruk et portnummer mellom 1 og 65535.");
    const instance = await createDevServer();
    instance.server.on("error", (error) => {
      console.error(
        error.code === "EADDRINUSE"
          ? `Port ${port} er opptatt. Prøv: npm run start:browser -- --port ${port + 1}`
          : error.message,
      );
      process.exitCode = 1;
    });
    instance.server.listen(port, "127.0.0.1", () => {
      console.log(
        `\nMusikkvideouka · lokal nettlesertest\n\nKontrollpanel: http://127.0.0.1:${port}\nPublikum:     http://127.0.0.1:${port}/publikum\n\nÅpne kontrollpanelet i Edge eller Chrome.\nArbeidskopier lagres automatisk i ${instance.dataDir}\nLast ned .mvuka-filen for å flytte prosjektet.\nStopp med Ctrl+C.\n`,
      );
    });
    const stop = async () => {
      await instance.close();
      process.exit(0);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { createDevServer };
