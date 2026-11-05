const { randomUUID, createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { zip, unzipSync, strToU8, strFromU8 } = require("fflate");
const { calculateScore, normalisePoints } = require("./score-expression.cjs");

const FORMAT = "no.musikkvideouka.project";
const MAX_FILE = 256 * 1024 * 1024;
const MAX_IMAGE = 12 * 1024 * 1024;
const MAX_GROUPS = 48;
const HISTORY_LIMIT = 200;
const copy = (value) => structuredClone(value);
const fail = (message) => {
  throw new Error(message);
};
const text = (value, max, label) =>
  typeof value === "string" && value.length <= max
    ? value
    : fail(`Ugyldig ${label}.`);

function emptyDocument() {
  return {
    id: randomUUID(),
    title: "Musikkvideouka",
    subtitle: "",
    groups: [],
    settings: { motion: true, allowDecimals: false },
  };
}

function validateDocument(doc) {
  if (!doc || typeof doc !== "object") fail("Prosjektet mangler innhold.");
  text(doc.id, 100, "prosjekt-ID");
  text(doc.title, 120, "tittel");
  text(doc.subtitle, 180, "undertittel");
  if (!doc.settings || typeof doc.settings.motion !== "boolean" ||
      (doc.settings.allowDecimals !== undefined && typeof doc.settings.allowDecimals !== "boolean"))
    fail("Ugyldige visningsinnstillinger.");
  if (!Array.isArray(doc.groups) || doc.groups.length > MAX_GROUPS)
    fail(`Prosjektet kan ha maksimalt ${MAX_GROUPS} grupper.`);
  const ids = new Set();
  for (const g of doc.groups) {
    text(g.id, 100, "gruppe-ID");
    if (!g.id || ids.has(g.id)) fail("Gruppene må ha unike ID-er.");
    ids.add(g.id);
    text(g.name, 100, "gruppenavn");
    // Projects from before song titles existed have no song field.
    if (g.song !== undefined) text(g.song, 200, "tittel");
    if (normalisePoints(g.points, !!doc.settings.allowDecimals) !== g.points)
      fail("Poeng kan ha maksimalt seks desimaler.");
    if (
      g.image !== null &&
      !/^assets\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(g.image)
    )
      fail("Ugyldig bildereferanse.");
    if (g.imageStill != null && (!g.image || !/^assets\/[a-f0-9]{64}\.png$/.test(g.imageStill)))
      fail("Ugyldig stillbilde for animasjon.");
  }
  return doc;
}

function imageType(bytes) {
  const b = Buffer.from(bytes);
  if (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255)
    return "jpg";
  if (
    b.length >= 12 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  if (["GIF87a", "GIF89a"].includes(b.toString("ascii", 0, 6))) return "gif";
  fail("Velg et PNG-, JPEG-, WebP- eller GIF-bilde.");
}

function snapshots(document, past, future) {
  return [
    document,
    ...past.flatMap((e) => [e.before, e.after]),
    ...future.flatMap((e) => [e.before, e.after]),
  ];
}

function referencedAssets(document, past, future) {
  const refs = new Set();
  for (const doc of snapshots(document, past, future)) {
    for (const group of doc.groups) {
      if (group.image) refs.add(group.image);
      if (group.imageStill) refs.add(group.imageStill);
    }
  }
  return refs;
}

class Project {
  static create(title = "Musikkvideouka") {
    const name = text(title, 120, "prosjektnavn").trim();
    if (!name) fail("Skriv inn et prosjektnavn.");
    return new Project({
      ...emptyDocument(),
      title: name,
      groups: Array.from({ length: 5 }, () => ({
        id: randomUUID(),
        name: "",
        song: "",
        points: 0,
        image: null,
      })),
    });
  }

  constructor(document = emptyDocument(), assets = {}, past = [], future = []) {
    this.document = validateDocument(copy(document));
    this.assets = assets;
    this.past = past;
    this.future = future;
  }

  edit(label, mutate, mergeKey = null) {
    const before = copy(this.document);
    const after = copy(before);
    mutate(after);
    validateDocument(after);
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    this.document = after;
    const previous = this.past.at(-1);
    if (mergeKey && previous?.mergeKey === mergeKey && !this.future.length) {
      previous.after = after;
      if (JSON.stringify(previous.before) === JSON.stringify(after))
        this.past.pop();
    } else
      this.past.push({
        label,
        before,
        after,
        ...(mergeKey ? { mergeKey } : {}),
      });
    this.past = this.past.slice(-HISTORY_LIMIT);
    this.future = [];
    this.pruneAssets();
    return true;
  }

  apply(action, payload = {}) {
    if (!payload || typeof payload !== "object") fail("Ugyldig endring.");
    const groupIn = (doc) =>
      doc.groups.find((g) => g.id === payload.id) ||
      fail("Gruppen finnes ikke lenger.");
    switch (action) {
      case "add-group":
        return this.edit("Ny gruppe", (doc) => {
          doc.groups.push({
            id: randomUUID(),
            name: payload.name ?? "",
            song: payload.song ?? "",
            points: 0,
            image: null,
          });
        });
      case "remove-group":
        return this.edit("Slett gruppe", (doc) => {
          groupIn(doc);
          doc.groups = doc.groups.filter((g) => g.id !== payload.id);
        });
      case "rename-group":
        return this.edit(
          "Endre gruppenavn",
          (doc) => {
            groupIn(doc).name = text(payload.name, 100, "gruppenavn").trim();
          },
          typeof payload.editId === "string"
            ? `name:${payload.id}:${text(payload.editId, 100, "redigerings-ID")}`
            : null,
        );
      case "song-title":
        return this.edit(
          "Endre tittel",
          (doc) => {
            groupIn(doc).song = text(payload.song, 200, "tittel").trim();
          },
          typeof payload.editId === "string"
            ? `song:${payload.id}:${text(payload.editId, 100, "redigerings-ID")}`
            : null,
        );
      case "points":
        return this.edit("Gi poeng", (doc) => {
          if (typeof payload.delta !== "number" || !Number.isFinite(payload.delta))
            fail("Skriv inn et helt antall poeng.");
          groupIn(doc).points = normalisePoints(groupIn(doc).points + payload.delta, !!doc.settings.allowDecimals);
        });
      case "set-points":
        return this.edit(
          "Endre poeng",
          (doc) => {
            groupIn(doc).points = normalisePoints(payload.points, !!doc.settings.allowDecimals);
          },
          typeof payload.editId === "string"
            ? `points:${payload.id}:${text(payload.editId, 100, "redigerings-ID")}`
            : null,
        );
      case "calculate-points":
      case "adjust-points":
        return this.edit("Endre poeng", (doc) => {
          const group = groupIn(doc);
          group.points = calculateScore(payload.expression, group.points, {
            allowDecimals: !!doc.settings.allowDecimals,
            adjustment: action === "adjust-points",
          });
        });
      case "decimals":
        return this.edit("Endre desimalpoeng", (doc) => {
          if (typeof payload.enabled !== "boolean") fail("Ugyldig innstilling.");
          if (!payload.enabled && doc.groups.some((g) => !Number.isInteger(g.points)))
            fail("Prosjektet inneholder desimalpoeng. Endre disse til heltall før du slår av desimaler.");
          doc.settings.allowDecimals = payload.enabled;
        });
      case "title":
        return this.edit(
          "Endre arrangement",
          (doc) => {
            const title = text(payload.title, 120, "prosjektnavn").trim();
            if (!title) fail("Skriv inn et prosjektnavn.");
            doc.title = title;
            doc.subtitle = text(payload.subtitle, 180, "undertittel").trim();
          },
          typeof payload.editId === "string"
            ? `title:${text(payload.editId, 100, "redigerings-ID")}`
            : null,
        );
      case "motion":
        return this.edit("Endre animasjoner", (doc) => {
          if (typeof payload.enabled !== "boolean")
            fail("Ugyldig innstilling.");
          doc.settings.motion = payload.enabled;
        });
      case "reset-points":
        return this.edit("Nullstill poeng", (doc) => {
          doc.groups.forEach((g) => {
            g.points = 0;
          });
        });
      default:
        fail("Ukjent endring.");
    }
  }

  addImage(id, bytes, stillBytes = null) {
    if (bytes.length > MAX_IMAGE)
      fail("Bildet er for stort. Maksimal størrelse er 12 MB.");
    const type = imageType(bytes);
    const name = `assets/${createHash("sha256").update(bytes).digest("hex")}.${type}`;
    if (!this.document.groups.some((g) => g.id === id))
      fail("Gruppen finnes ikke.");
    let stillName = null;
    if (stillBytes) {
      if (stillBytes.length > MAX_IMAGE || imageType(stillBytes) !== "png")
        fail("Ugyldig stillbilde for animasjon.");
      stillName = `assets/${createHash("sha256").update(stillBytes).digest("hex")}.png`;
    }
    this.assets[name] = new Uint8Array(bytes);
    if (stillName) this.assets[stillName] = new Uint8Array(stillBytes);
    return this.edit("Endre bilde", (doc) => {
      const group = doc.groups.find((g) => g.id === id);
      group.image = name;
      if (stillName) group.imageStill = stillName;
      else delete group.imageStill;
    });
  }

  undo() {
    const entry = this.past.pop();
    if (!entry) return false;
    this.future.push(entry);
    this.document = copy(entry.before);
    return true;
  }

  redo() {
    const entry = this.future.pop();
    if (!entry) return false;
    this.past.push(entry);
    this.document = copy(entry.after);
    return true;
  }

  pruneAssets() {
    const refs = referencedAssets(this.document, this.past, this.future);
    for (const name of Object.keys(this.assets))
      if (!refs.has(name)) delete this.assets[name];
  }

  async encode() {
    this.pruneAssets();
    const manifest = {
      format: FORMAT,
      // Older app versions discard unknown asset references, so protect animation posters with v2.
      version: snapshots(this.document, this.past, this.future).some((doc) => doc.settings.allowDecimals) ? 3 :
        snapshots(this.document, this.past, this.future).some((doc) => doc.groups.some((g) => g.imageStill)) ? 2 : 1,
      document: this.document,
      history: { past: this.past, future: this.future },
    };
    const files = {
      "project.json": [strToU8(JSON.stringify(manifest)), { level: 6 }],
    };
    for (const [name, bytes] of Object.entries(this.assets))
      files[name] = [bytes, { level: 0 }];
    return new Promise((resolve, reject) =>
      zip(files, (error, result) => {
        if (error) reject(error);
        else if (result.length > MAX_FILE)
          reject(new Error("Prosjektet er for stort (maksimalt 256 MB)."));
        else resolve(result);
      }),
    );
  }

  static decode(bytes) {
    if (bytes.length > MAX_FILE)
      fail("Prosjektfilen er for stor (maksimalt 256 MB).");
    let totalSize = 0;
    let count = 0;
    const files = unzipSync(new Uint8Array(bytes), {
      filter: (entry) => {
        count++;
        totalSize += entry.originalSize;
        if (
          count > 1000 ||
          totalSize > MAX_FILE ||
          entry.originalSize >
            (entry.name === "project.json" ? 24 * 1024 * 1024 : MAX_IMAGE)
        )
          fail("Prosjektfilen inneholder for mye data.");
        if (
          entry.name !== "project.json" &&
          !/^assets\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(entry.name)
        )
          fail("Prosjektfilen inneholder ukjente filer.");
        return true;
      },
    });
    if (!files["project.json"])
      fail("Dette er ikke en Musikkvideouka-prosjektfil.");
    const manifest = JSON.parse(strFromU8(files["project.json"]));
    if (manifest.format !== FORMAT || ![1, 2, 3].includes(manifest.version))
      fail("Prosjektformatet støttes ikke av denne versjonen.");
    validateDocument(manifest.document);
    const past = manifest.history?.past;
    const future = manifest.history?.future;
    if (
      !Array.isArray(past) ||
      !Array.isArray(future) ||
      past.length + future.length > HISTORY_LIMIT
    )
      fail("Ugyldig angrehistorikk.");
    for (const entry of [...past, ...future]) {
      text(entry.label, 100, "historikk");
      validateDocument(entry.before);
      validateDocument(entry.after);
    }
    const assets = {};
    for (const name of referencedAssets(manifest.document, past, future)) {
      if (!files[name]) fail("Prosjektfilen mangler et bilde.");
      const type = imageType(files[name]);
      if (
        !name.endsWith(`.${type}`) ||
        createHash("sha256").update(files[name]).digest("hex") !==
          name.slice(7, 71)
      )
        fail("Et bilde i prosjektet er skadet.");
      assets[name] = files[name];
    }
    return new Project(manifest.document, assets, past, future);
  }

  view() {
    const document = copy(this.document);
    for (const group of document.groups) {
      const bytes = this.assets[group.image];
      const ext = group.image?.split(".").pop();
      group.imageUrl = bytes
        ? `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${Buffer.from(bytes).toString("base64")}`
        : null;
      const still = this.assets[group.imageStill];
      group.imageStillUrl = still
        ? `data:image/png;base64,${Buffer.from(still).toString("base64")}`
        : null;
    }
    return {
      document,
      canUndo: !!this.past.length,
      canRedo: !!this.future.length,
      undoLabel: this.past.at(-1)?.label,
      redoLabel: this.future.at(-1)?.label,
    };
  }
}

async function retryFileOperation(operation) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= 4 || !["EPERM", "EBUSY", "EACCES"].includes(error.code))
        throw error;
      // Windows indexers/virus scanners may briefly hold a file after it is written.
      await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
    }
  }
}

async function atomicWrite(filePath, bytes, backup = true) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporary, "wx");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (backup) {
      try {
        await retryFileOperation(() =>
          fs.copyFile(filePath, `${filePath}.bak`),
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    await retryFileOperation(() => fs.rename(temporary, filePath));
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

module.exports = {
  Project,
  atomicWrite,
  emptyDocument,
  MAX_IMAGE,
  MAX_FILE,
  MAX_GROUPS,
};
