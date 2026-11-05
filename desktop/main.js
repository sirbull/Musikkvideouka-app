const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  screen,
  powerSaveBlocker,
  nativeImage,
  session,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { randomUUID } = require("node:crypto");
const { Project, atomicWrite, MAX_IMAGE, MAX_FILE } = require("./project.cjs");

const ROOT = path.resolve(__dirname, "..");
const UI = path.join(ROOT, "public");
let controlWindow,
  audienceWindow,
  project,
  projectPath = null;
let saveError = null,
  savedAt = null,
  saving = false;
let presentation = { mode: "scoreboard", running: false, displayId: null };
let queue = Promise.resolve();
let blocker = null,
  closing = false,
  pendingOpen = null;
let recoveryPath, sessionPath;
let closeRequested = false;

const enqueue = (task) => {
  const next = queue.then(task);
  queue = next.catch(() => {});
  return next;
};

function displays() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `${d.label || `Skjerm ${i + 1}`} · ${d.size.width} × ${d.size.height}${d.id === primary ? " (hovedskjerm)" : ""}`,
    primary: d.id === primary,
  }));
}

function state() {
  return {
    ...project.view(),
    projectPath,
    fileName: projectPath ? path.basename(projectPath) : "Nytt prosjekt",
    savedAt,
    saving,
    saveError,
    displays: displays(),
    presentation,
  };
}

function broadcast() {
  if (!project) return;
  const snapshot = state();
  for (const win of [controlWindow, audienceWindow])
    if (win && !win.isDestroyed())
      win.webContents.send("project-state", snapshot);
}

async function persist() {
  saving = true;
  saveError = null;
  broadcast();
  try {
    const bytes = await project.encode();
    await atomicWrite(recoveryPath, bytes);
    await atomicWrite(
      sessionPath,
      Buffer.from(JSON.stringify({ projectPath })),
      false,
    );
    if (projectPath) await atomicWrite(projectPath, bytes);
    savedAt = new Date().toISOString();
  } catch (error) {
    saveError = `Kunne ikke lagre: ${error.message}`;
    throw error;
  } finally {
    saving = false;
    broadcast();
  }
}

async function readProject(filePath) {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_FILE)
    throw new Error("Prosjektfilen er for stor (maksimalt 256 MB).");
  return Project.decode(await fs.readFile(filePath));
}

async function openProject(filePath) {
  const loaded = await readProject(filePath);
  // Preserve the current project before replacing it, including when the new file is invalid.
  await persist();
  project = loaded;
  projectPath = filePath.toLowerCase().endsWith(".bak") ? null : filePath;
  presentation.mode = "scoreboard";
  await persist();
  app.addRecentDocument(filePath);
}

async function keepUntitled() {
  if (projectPath || !project.document.groups.length) return true;
  if (
    !project.past.length &&
    !project.future.length &&
    project.document.groups.every((g) => !g.name && !g.points && !g.image)
  )
    return true;
  const answer = await dialog.showMessageBox(controlWindow, {
    type: "question",
    buttons: ["Lagre prosjekt …", "Fortsett uten egen fil", "Avbryt"],
    defaultId: 0,
    cancelId: 2,
    message: "Vil du ta vare på dette prosjektet?",
    detail:
      "Velg en prosjektfil hvis du vil åpne dette prosjektet igjen senere. Den lokale gjenopprettingskopien vil bli erstattet av neste prosjekt.",
  });
  if (answer.response === 2) return false;
  if (answer.response === 0) return saveAs();
  return true;
}

async function saveAs() {
  const result = await dialog.showSaveDialog(controlWindow, {
    title: "Lagre prosjekt",
    defaultPath:
      projectPath ||
      `${project.document.title.replace(/[<>:"/\\|?*]/g, "-").trim() || "Musikkvideouka"}.mvuka`,
    filters: [{ name: "Musikkvideouka-prosjekt", extensions: ["mvuka"] }],
  });
  if (result.canceled) return false;
  const destination = /\.mvuka$/i.test(result.filePath)
    ? result.filePath
    : `${result.filePath}.mvuka`;
  const bytes = await project.encode();
  await atomicWrite(destination, bytes);
  projectPath = destination;
  await persist();
  app.addRecentDocument(destination);
  return true;
}

function secureWindow(options, filename) {
  const win = new BrowserWindow({
    icon: path.join(ROOT, "assets", "icon.png"),
    backgroundColor: "#081321",
    show: false,
    ...options,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.loadFile(path.join(UI, filename));
  win.once("ready-to-show", () => win.show());
  return win;
}

function startPresentation(displayId) {
  const display = screen.getAllDisplays().find((d) => d.id === displayId);
  if (!display)
    throw new Error("Skjermen er ikke tilkoblet. Velg en skjerm på nytt.");
  if (audienceWindow && !audienceWindow.isDestroyed()) audienceWindow.close();
  const external =
    display.id !== screen.getDisplayMatching(controlWindow.getBounds()).id;
  const win = secureWindow(
    {
      title: "Musikkvideouka · Publikum",
      x: display.bounds.x + (external ? 0 : 40),
      y: display.bounds.y + (external ? 0 : 60),
      width: external
        ? display.bounds.width
        : Math.min(1120, display.workArea.width - 80),
      height: external
        ? display.bounds.height
        : Math.min(700, display.workArea.height - 100),
      fullscreen: external,
      autoHideMenuBar: true,
    },
    "publikum.html",
  );
  audienceWindow = win;
  const fullscreenChanged = () => {
    win.setMenuBarVisibility(false);
    win.webContents.send("audience:fullscreen", win.isFullScreen());
  };
  win.on("enter-full-screen", fullscreenChanged);
  win.on("leave-full-screen", fullscreenChanged);
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.isAutoRepeat) return;
    if (input.key === "F11" || (input.key === "Escape" && win.isFullScreen())) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
  presentation = { ...presentation, running: true, displayId };
  if (blocker === null)
    blocker = powerSaveBlocker.start("prevent-display-sleep");
  win.on("closed", () => {
    if (audienceWindow !== win) return;
    audienceWindow = null;
    presentation.running = false;
    if (blocker !== null) {
      powerSaveBlocker.stop(blocker);
      blocker = null;
    }
    broadcast();
  });
  broadcast();
}

async function pickImage(id) {
  if (!project.document.groups.some((g) => g.id === id))
    throw new Error("Gruppen finnes ikke.");
  const result = await dialog.showOpenDialog(controlWindow, {
    title: "Velg gruppebilde",
    properties: ["openFile"],
    filters: [
      { name: "Bilder", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
    ],
  });
  if (result.canceled) return;
  const filePath = result.filePaths[0];
  if ((await fs.stat(filePath)).size > MAX_IMAGE)
    throw new Error("Bildet er for stort. Maksimalt 12 MB.");
  const source = await fs.readFile(filePath);
  const image = nativeImage.createFromBuffer(source);
  if (image.isEmpty())
    throw new Error("Bildet kunne ikke åpnes. Velg et annet bilde.");
  // Embed a bounded, portable raster copy. The original file is never modified.
  const dimensions = image.getSize();
  const resized =
    Math.max(dimensions.width, dimensions.height) > 1000
      ? image.resize(
          dimensions.width >= dimensions.height
            ? { width: 1000 }
            : { height: 1000 },
        )
      : image;
  project.addImage(id, resized.toPNG());
  await persist();
}

async function importExcel() {
  const result = await dialog.showOpenDialog(controlWindow, {
    title: "Importer grupper fra Excel",
    properties: ["openFile"],
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (result.canceled) return;
  const filePath = result.filePaths[0];
  if ((await fs.stat(filePath)).size > 20 * 1024 * 1024)
    throw new Error("Excel-filen er for stor (maksimalt 20 MB).");
  const { readSheet } = require("read-excel-file/node");
  const rows = await readSheet(filePath, 1);
  if (!rows.length) throw new Error("Excel-filen er tom.");
  const headers = rows[0].map((c) =>
    String(c || "")
      .trim()
      .toLowerCase(),
  );
  const nameColumn = headers.indexOf("navn");
  const pointsColumn = headers.indexOf("poeng");
  const imageColumn = headers.indexOf("bilde");
  if (nameColumn < 0)
    throw new Error(
      "Første rad må inneholde kolonnen «Navn». Valgfrie kolonner er «Poeng» og «Bilde».",
    );
  const groups = [];
  const assets = {};
  let missing = 0;
  const { createHash } = require("node:crypto");
  for (const row of rows.slice(1)) {
    if (!row[nameColumn]) continue;
    const group = {
      id: randomUUID(),
      name: String(row[nameColumn]).trim(),
      points: pointsColumn < 0 ? 0 : Number(row[pointsColumn] || 0),
      image: null,
    };
    const imageRef =
      imageColumn >= 0 ? String(row[imageColumn] || "").trim() : "";
    if (imageRef) {
      try {
        // Only image files inside the selected spreadsheet's folder can be imported automatically.
        const base = path.dirname(filePath);
        const resolved = path.resolve(base, imageRef);
        const relative = path.relative(base, resolved);
        if (
          relative.startsWith("..") ||
          path.isAbsolute(relative) ||
          /^https?:/i.test(imageRef)
        )
          throw new Error("Velg bildet manuelt");
        if ((await fs.stat(resolved)).size > MAX_IMAGE)
          throw new Error("For stort");
        const image = nativeImage.createFromBuffer(await fs.readFile(resolved));
        if (image.isEmpty()) throw new Error("Ugyldig bilde");
        const size = image.getSize();
        const png = (
          Math.max(size.width, size.height) > 1000
            ? image.resize(
                size.width >= size.height ? { width: 1000 } : { height: 1000 },
              )
            : image
        ).toPNG();
        group.image = `assets/${createHash("sha256").update(png).digest("hex")}.png`;
        assets[group.image] = new Uint8Array(png);
      } catch {
        missing++;
      }
    }
    groups.push(group);
  }
  if (!groups.length)
    throw new Error("Ingen grupper ble funnet i Excel-filen.");
  // Stage validation before changing the active project or its assets.
  const staged = new Project({ ...project.document, groups });
  const answer = await dialog.showMessageBox(controlWindow, {
    type: "question",
    buttons: ["Importer", "Avbryt"],
    defaultId: 0,
    cancelId: 1,
    message: `Importer ${groups.length} grupper?`,
    detail: `Gruppene i prosjektet erstattes. Du kan angre importen.${missing ? ` ${missing} bilder kunne ikke importeres. Legg til disse med bildeknappen etterpå.` : ""}`,
  });
  if (answer.response !== 0) return;
  Object.assign(project.assets, assets);
  project.edit("Importer Excel", (doc) => {
    doc.groups = staged.document.groups;
  });
  await persist();
}

async function runCommand(action, payload) {
  switch (action) {
    case "undo":
      if (project.undo()) await persist();
      break;
    case "redo":
      if (project.redo()) await persist();
      break;
    case "save":
      if (projectPath) await persist();
      else await saveAs();
      break;
    case "save-as":
      await saveAs();
      break;
    case "open": {
      const result = await dialog.showOpenDialog(controlWindow, {
        title: "Åpne prosjekt",
        properties: ["openFile"],
        filters: [
          { name: "Musikkvideouka-prosjekt", extensions: ["mvuka", "bak"] },
        ],
      });
      if (!result.canceled && (await keepUntitled()))
        await openProject(result.filePaths[0]);
      break;
    }
    case "new": {
      const created = Project.create(payload?.title ?? "");
      if (await keepUntitled()) {
        await persist();
        project = created;
        projectPath = null;
        presentation.mode = "scoreboard";
        await persist();
      }
      break;
    }
    case "image":
      await pickImage(payload?.id);
      break;
    case "import":
      await importExcel();
      break;
    case "download-excel-template": {
      const result = await dialog.showSaveDialog(controlWindow, {
        title: "Last ned Excel-mal",
        defaultPath: "Musikkvideouka-mal.xlsx",
        filters: [{ name: "Excel-arbeidsbok", extensions: ["xlsx"] }],
      });
      if (!result.canceled && result.filePath)
        await fs.copyFile(
          path.join(ROOT, "assets", "Musikkvideouka-mal.xlsx"),
          result.filePath,
        );
      break;
    }
    case "demo": {
      if (project.document.groups.some((g) => g.name || g.points || g.image))
        throw new Error(
          "Opprett et tomt prosjekt før du legger inn eksempelgrupper.",
        );
      const names = [
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
      project.edit("Legg til eksempelgrupper", (doc) => {
        doc.groups = names.map((name, i) => ({
          id: randomUUID(),
          name,
          points: [84, 76, 72, 65, 61, 58, 54, 49, 43, 38, 32, 24][i],
          image: null,
        }));
      });
      await persist();
      break;
    }
    case "start-presentation":
      startPresentation(payload?.displayId);
      break;
    case "stop-presentation":
      audienceWindow?.close();
      break;
    case "presentation-mode":
      if (!["scoreboard", "pause", "black", "winner"].includes(payload?.mode))
        throw new Error("Ukjent visningsmodus.");
      if (payload.mode === "winner" && !project.document.groups.some((g) => g.name.trim()))
        throw new Error("Skriv inn minst ett gruppenavn før du viser vinneren.");
      presentation.mode = payload.mode;
      broadcast();
      break;
    default:
      if (project.apply(action, payload)) await persist();
  }
}

function report(error) {
  if (controlWindow && !controlWindow.isDestroyed())
    dialog.showErrorBox("Handlingen kunne ikke fullføres", error.message);
}

function buildMenu() {
  const command = (action) => () => {
    if (["open", "save", "save-as", "import"].includes(action))
      controlWindow.webContents.send("project-action", action);
    else enqueue(() => runCommand(action)).catch(report);
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      {
        label: "File",
        submenu: [
          {
            label: "Nytt prosjekt",
            accelerator: "CmdOrCtrl+N",
            click: () => {
              controlWindow.show();
              controlWindow.focus();
              controlWindow.webContents.send("project-action", "new");
            },
          },
          {
            label: "Åpne …",
            accelerator: "CmdOrCtrl+O",
            click: command("open"),
          },
          {
            label: "Lagre",
            accelerator: "CmdOrCtrl+S",
            click: command("save"),
          },
          {
            label: "Lagre som …",
            accelerator: "CmdOrCtrl+Shift+S",
            click: command("save-as"),
          },
          { type: "separator" },
          { label: "Importer fra Excel …", click: command("import") },
          {
            label: "Last ned Excel-mal",
            click: command("download-excel-template"),
          },
          { type: "separator" },
          { role: "quit", label: "Avslutt" },
        ],
      },
      // Undo/redo is handled in the control window to preserve native text editing inside fields.
      {
        label: "Rediger",
        submenu: [
          { label: "Angre prosjektendring", click: command("undo") },
          { label: "Gjør om prosjektendring", click: command("redo") },
          { type: "separator" },
          {
            label: "Nullstill alle poeng …",
            click: () =>
              controlWindow.webContents.send("project-action", "reset-points"),
          },
          { type: "separator" },
          { role: "cut", label: "Klipp ut" },
          { role: "copy", label: "Kopier" },
          { role: "paste", label: "Lim inn" },
          { role: "selectAll", label: "Merk alt" },
        ],
      },
      {
        label: "Visning",
        submenu: [
          {
            label: "Animasjoner",
            type: "checkbox",
            checked: project.document.settings.motion,
            click: (item) =>
              enqueue(() =>
                runCommand("motion", { enabled: item.checked }),
              ).catch(report),
          },
          { role: "togglefullscreen", label: "Fullskjerm", accelerator: "F11" },
          ...(!app.isPackaged ? [{ role: "toggleDevTools" }] : []),
        ],
      },
    ]),
  );
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (_event, argv) => {
    const file = argv.find((a) => a.toLowerCase().endsWith(".mvuka"));
    if (controlWindow) {
      if (controlWindow.isMinimized()) controlWindow.restore();
      controlWindow.show();
      controlWindow.focus();
    }
    if (file)
      enqueue(async () => {
        if (await keepUntitled()) await openProject(path.resolve(file));
      }).catch(report);
  });
  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    if (!project) pendingOpen = filePath;
    else
      enqueue(async () => {
        if (await keepUntitled()) await openProject(filePath);
      }).catch(report);
  });
  app
    .whenReady()
    .then(async () => {
      recoveryPath = path.join(app.getPath("userData"), "recovery.mvuka");
      sessionPath = path.join(app.getPath("userData"), "session.json");
      session.defaultSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      project = Project.create();
      let startupNotice = null;
      try {
        project = await readProject(recoveryPath);
        try {
          projectPath =
            JSON.parse(await fs.readFile(sessionPath, "utf8")).projectPath ||
            null;
        } catch {
          projectPath = null;
        }
      } catch (error) {
        if (error.code !== "ENOENT") {
          try {
            project = await readProject(`${recoveryPath}.bak`);
            startupNotice =
              "Prosjektet ble gjenopprettet fra sikkerhetskopien.";
          } catch {
            startupNotice =
              "Den siste økten kunne ikke gjenopprettes. Åpne en lagret prosjektfil eller sikkerhetskopi.";
          }
        }
      }
      if (
        !projectPath &&
        !project.document.groups.length &&
        !project.past.length &&
        !project.future.length
      )
        project = Project.create(project.document.title);
      controlWindow = secureWindow(
        {
          title: "Musikkvideouka",
          width: 1500,
          height: 980,
          minWidth: 1100,
          minHeight: 720,
          autoHideMenuBar: false,
        },
        "admin.html",
      );
      controlWindow.on("close", (event) => {
        if (closing) return;
        event.preventDefault();
        if (closeRequested) return;
        closeRequested = true;
        (async () => {
          // Flush completed score expressions before entering the save queue; their IPC commands use that queue too.
          if (
            (await controlWindow.webContents.executeJavaScript(
              "window.prepareProjectChange?.() ?? true",
            )) === false
          )
            return;
          await enqueue(async () => {
            try {
              await persist();
            } catch (error) {
              const result = await dialog.showMessageBox(controlWindow, {
                type: "warning",
                buttons: ["Tilbake til programmet", "Avslutt likevel"],
                defaultId: 0,
                cancelId: 0,
                message: "Prosjektet kunne ikke lagres.",
                detail: `${error.message}\nGå tilbake og prøv «Lagre som» til en annen mappe.`,
              });
              if (result.response === 0) return;
            }
            closing = true;
            audienceWindow?.close();
            controlWindow.close();
            app.quit();
          });
        })()
          .catch(report)
          .finally(() => {
            closeRequested = false;
          });
      });
      ipcMain.handle("project:get", (event) => {
        if (
          ![controlWindow, audienceWindow].some(
            (win) =>
              win && !win.isDestroyed() && event.sender === win.webContents,
          ) ||
          event.senderFrame !== event.sender.mainFrame
        )
          throw new Error("Ingen tilgang.");
        return state();
      });
      ipcMain.handle("audience:fullscreen", (event, action) => {
        if (
          !audienceWindow || audienceWindow.isDestroyed() ||
          event.sender !== audienceWindow.webContents ||
          event.senderFrame !== event.sender.mainFrame ||
          event.senderFrame.url !== pathToFileURL(path.join(UI, "publikum.html")).href
        )
          throw new Error("Ingen tilgang.");
        if (action === "toggle") {
          audienceWindow.setMenuBarVisibility(false);
          audienceWindow.setFullScreen(!audienceWindow.isFullScreen());
        } else if (action !== "get") throw new Error("Ukjent handling.");
        return audienceWindow.isFullScreen();
      });
      ipcMain.handle("project:command", async (event, action, payload) => {
        if (
          event.sender !== controlWindow.webContents ||
          event.senderFrame !== event.sender.mainFrame ||
          event.senderFrame.url !==
            pathToFileURL(path.join(UI, "admin.html")).href
        )
          return { ok: false, error: "Ingen tilgang." };
        try {
          await enqueue(() => runCommand(action, payload));
          return { ok: true };
        } catch (error) {
          broadcast();
          return { ok: false, error: error.message };
        }
      });
      screen.on("display-added", broadcast);
      screen.on("display-metrics-changed", broadcast);
      screen.on("display-removed", (_event, display) => {
        if (presentation.displayId === display.id) audienceWindow?.close();
        broadcast();
      });
      buildMenu();
      // A disconnected drive or read-only project must not prevent recovery from opening.
      // Keep the app available so the operator can choose a new location with Save As.
      try {
        await persist();
      } catch {
        /* persist already publishes the visible save error */
      }
      const launchFile =
        pendingOpen ||
        process.argv.slice(1).find((a) => a.toLowerCase().endsWith(".mvuka"));
      if (launchFile) {
        try {
          await openProject(path.resolve(launchFile));
        } catch (error) {
          report(error);
        }
      }
      if (startupNotice)
        await dialog.showMessageBox(controlWindow, {
          type: "info",
          message: startupNotice,
        });
    })
    .catch((error) => {
      dialog.showErrorBox("Programmet kunne ikke starte", error.message);
      app.exit(1);
    });
}
app.on("window-all-closed", () => app.quit());
