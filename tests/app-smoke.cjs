// Integration tests run the real Electron app with hidden test windows and isolated data.
// No desktop input injection, network service or debug port is used.
const { app, BrowserWindow, dialog, Menu } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Project } = require("../desktop/project.cjs");
const { readSheet } = require("read-excel-file/node");
const sharp = require("sharp");
const { imageFixtures } = require("./helpers/image-fixtures.cjs");
const output = path.resolve(__dirname, "..", "test-results");
const userData =
  process.env.MVUKA_SMOKE_RESUME || path.join(output, `smoke-${Date.now()}`);
app.setPath("userData", userData);
BrowserWindow.prototype.show = function () {};
const windows = [];
const errors = [];
app.on("browser-window-created", (_event, win) => {
  windows.push(win);
  win.webContents.on("render-process-gone", (_event, details) =>
    errors.push(details.reason),
  );
});
let selectedFile = null,
  saveDestination = null,
  lastImageOptions = null;
dialog.showOpenDialog = async (_parent, options) => {
  if (options.title === "Velg gruppebilde") lastImageOptions = options;
  return selectedFile
    ? { canceled: false, filePaths: [selectedFile] }
    : { canceled: true, filePaths: [] };
};
dialog.showSaveDialog = async () =>
  saveDestination
    ? { canceled: false, filePath: saveDestination }
    : { canceled: true };
dialog.showMessageBox = async () => ({ response: 0 });
dialog.showErrorBox = (title, message) => {
  errors.push(`${title}: ${message}`);
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const js = (win, code) => win.webContents.executeJavaScript(code);
async function until(condition, label, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await condition()) return;
    } catch {}
    await delay(60);
  }
  throw new Error(`Timed out: ${label}`);
}
const get = (win) => js(win, "window.musikk.getState()");
const command = (win, action, payload) =>
  js(
    win,
    `window.musikk.command(${JSON.stringify(action)}, ${JSON.stringify(payload)})`,
  );
async function screenshot(win, filename) {
  // A first capture wakes Chromium's hidden surface. Wait for two paint frames
  // before the final capture, so screenshots match the asserted DOM state.
  for (let attempt = 0; ; attempt++) {
    try {
      await win.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
      await delay(300);
    }
  }
  await js(
    win,
    "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
  await fs.writeFile(
    path.join(output, filename),
    (
      await win.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      })
    ).toPNG(),
  );
}
const checks = [];
function check(name) {
  checks.push(name);
  console.log(`PASS ${name}`);
}

async function run() {
  await fs.mkdir(output, { recursive: true });
  await until(
    () =>
      windows[0] &&
      get(windows[0]).then((s) => !!(s.savedAt || s.saveError) && !s.saving),
    "initial load",
  );
  const control = windows[0];
  if (process.env.MVUKA_SMOKE_RESUME) {
    const state = await get(control);
    assert.equal(state.document.groups.length, 48);
    assert.ok(state.document.groups.at(11).imageUrl);
    assert.equal(state.canRedo, true);
    assert.ok(
      state.saveError,
      "a blocked original file must leave the recovered app usable",
    );
    await fs.rmdir(`${state.projectPath}.bak`);
    await command(control, "save");
    assert.equal((await get(control)).saveError, null);
    await command(control, "redo");
    assert.equal((await get(control)).document.groups.length, 17);
    await command(control, "undo");
    assert.equal((await get(control)).document.groups.length, 48);
    const recoveredDocument = (await get(control)).document;
    await command(control, "image", { id: recoveredDocument.groups[0].id });
    const rememberedDirectory = path.join(userData, "image-picker");
    assert.equal(lastImageOptions.defaultPath, rememberedDirectory);
    await fs.rmdir(rememberedDirectory);
    await command(control, "image", { id: recoveredDocument.groups[0].id });
    assert.equal(lastImageOptions.defaultPath, undefined);
    assert.deepEqual((await get(control)).document, recoveredDocument);
    console.log("PASS image folder survives restart; a missing folder falls back and cancel preserves the project");
    console.log(
      "PASS restart recovers the last session, image and redo even when the original file cannot be written",
    );
    app.exit(0);
    return;
  }
  assert.equal((await get(control)).document.groups.length, 5);
  await until(
    () => js(control, "document.querySelectorAll('.group-row').length === 5"),
    "five blank rows",
  );
  assert.equal(
    await js(
      control,
      "[...document.querySelectorAll('.group-name')].every(input => input.value === '') && document.querySelectorAll('.avatar-content svg').length === 5 && !document.querySelector('.sidebar')",
    ),
    true,
  );
  assert.equal(control.isMenuBarVisible(), true);
  const fileMenu = Menu.getApplicationMenu().items.find(
    (item) => item.label === "File",
  );
  assert.ok(fileMenu);
  assert.equal(await js(control, "document.querySelector('#finish-show').disabled"), true);
  await assert.rejects(
    command(control, "presentation-mode", { mode: "winner" }),
    /gruppenavn/,
  );
  const templateMenu = fileMenu.submenu.items.find(
    (item) => item.label === "Last ned Excel-mal",
  );
  assert.ok(templateMenu);
  const beforeTemplate = await get(control);
  saveDestination = path.join(userData, "downloaded-template.xlsx");
  templateMenu.click();
  await until(
    () => fs.stat(saveDestination).then((stat) => stat.size > 0),
    "Excel template saved from File menu",
  );
  const templateRows = await readSheet(saveDestination, 1);
  assert.deepEqual(templateRows[0].slice(0, 3), ["Navn", "Bilde", "Poeng"]);
  assert.ok(templateRows.slice(1, 6).every((row) => row[0] === null && row[1] === null && row[2] === 0));
  saveDestination = null;
  await command(control, "download-excel-template");
  const afterTemplate = await get(control);
  assert.deepEqual(afterTemplate.document, beforeTemplate.document);
  assert.equal(afterTemplate.projectPath, beforeTemplate.projectPath);
  assert.equal(afterTemplate.canUndo, beforeTemplate.canUndo);
  check("File menu downloads a valid Excel template; saving and canceling preserve the project");
  const oldId = (await get(control)).document.id;
  fileMenu.submenu.items[0].click();
  await until(
    () => js(control, "document.querySelector('#new-project-dialog').open"),
    "new project dialog",
  );
  await js(
    control,
    "document.querySelector('#new-project-name').value = ' '; document.querySelector('#new-project-form').dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}))",
  );
  assert.equal((await get(control)).document.id, oldId);
  await js(
    control,
    "document.querySelector('#new-project-name').value = 'Musikkvideouka 2026'; document.querySelector('#new-project-form').dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}))",
  );
  await until(
    async () => (await get(control)).document.id !== oldId,
    "named new project",
  );
  assert.equal((await get(control)).document.title, "Musikkvideouka 2026");
  assert.equal((await get(control)).document.groups.length, 5);
  await until(
    () => js(control, "!document.querySelector('#new-project-dialog').open"),
    "new dialog closed",
  );
  check("five blank groups, visible File menu and required new-project name");
  await delay(500);
  await screenshot(control, "control-empty.png");
  const starterId = (await get(control)).document.groups[0].id;
  await js(
    control,
    "const field=document.querySelector('.group-name'); field.value='Testgruppe'; field.dispatchEvent(new Event('input', {bubbles:true}));",
  );
  await until(
    async () => (await get(control)).document.groups[0].name === "Testgruppe",
    "name autosave",
  );
  await js(
    control,
    "const score=document.querySelector('.points-input'); score.focus(); score.value='1'; score.dispatchEvent(new Event('input', {bubbles:true})); score.value='12'; score.dispatchEvent(new Event('input', {bubbles:true})); score.blur(); score.dispatchEvent(new FocusEvent('blur'));",
  );
  await until(
    async () =>
      (await get(control)).document.groups[0].points === 12 &&
      (await js(
        control,
        "!document.querySelector('.points-input').hasAttribute('aria-busy')",
      )),
    "direct score autosave",
  );
  await command(control, "undo");
  assert.equal((await get(control)).document.groups[0].points, 0);
  await command(control, "redo");
  assert.equal((await get(control)).document.groups[0].points, 12);
  const typeScore = (expression) =>
    js(
      control,
      `{ const scoreField=document.querySelector('.points-input'); scoreField.focus(); scoreField.value=${JSON.stringify(expression)}; scoreField.dispatchEvent(new Event('input',{bubbles:true})); }`,
    );
  const enterScore = async (expression, expected) => {
    await typeScore(expression);
    await js(
      control,
      "document.querySelector('.points-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))",
    );
    await until(
      async () =>
        (await get(control)).document.groups[0].points === expected &&
        (await js(
          control,
          `document.querySelector('.points-input').value === '${expected}' && !document.querySelector('.points-input').hasAttribute('aria-busy')`,
        )),
      `calculate ${expression}`,
    );
  };
  await typeScore("23");
  assert.equal(
    (await get(control)).document.groups[0].points,
    12,
    "draft numbers are not published before confirmation",
  );
  await enterScore("23", 23);
  await enterScore("23-5", 18);
  await enterScore("+1", 19);
  await js(
    control,
    "document.querySelector('.points-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))",
  );
  assert.equal(
    (await get(control)).document.groups[0].points,
    19,
    "Enter and blur never apply +1 twice",
  );
  await enterScore("-5", 14);
  await typeScore("23-");
  await js(
    control,
    "document.querySelector('.points-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))",
  );
  await until(
    () =>
      js(
        control,
        "document.querySelector('.points-input').getAttribute('aria-invalid') === 'true' && !document.querySelector('.points-input').readOnly",
      ),
    "invalid expression feedback",
  );
  assert.equal((await get(control)).document.groups[0].points, 14);
  assert.equal(
    await js(control, "window.prepareProjectChange()"),
    false,
    "invalid drafts cannot silently be lost by Save or Close",
  );
  await js(
    control,
    "document.querySelector('.points-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))",
  );
  assert.equal(
    await js(control, "document.querySelector('.points-input').value"),
    "14",
  );
  await typeScore("+2");
  // Hidden test windows do not always synthesize native focus events.
  await js(
    control,
    "document.querySelector('.points-input').blur(); document.querySelector('.points-input').dispatchEvent(new FocusEvent('blur'))",
  );
  await until(
    async () =>
      (await get(control)).document.groups[0].points === 16 &&
      (await js(
        control,
        "!document.querySelector('.points-input').hasAttribute('aria-busy')",
      )),
    "calculate on blur",
  );
  await typeScore("+1");
  assert.equal(await js(control, "window.prepareProjectChange()"), true);
  assert.equal(
    (await get(control)).document.groups[0].points,
    17,
    "pending arithmetic is flushed before Save or Close",
  );
  check(
    "arithmetic fields confirm once, reject invalid expressions and flush before saving",
  );
  assert.equal(await js(control, "[...document.querySelectorAll('.points-adjustment')].every(field => field.value === '' && !field.placeholder)"), true);
  assert.equal(await js(control, "document.querySelector('.points-adjustment').getBoundingClientRect().left > document.querySelector('.points-input').getBoundingClientRect().right"), true);
  await enterScore("10", 10);
  const enterAdjustment = async (expression, expected) => {
    await js(control, `{
      const field = document.querySelector('.points-adjustment');
      field.focus(); field.value = ${JSON.stringify(expression)};
      field.dispatchEvent(new Event('input', {bubbles:true}));
      field.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true,cancelable:true}));
    }`);
    await until(async () => (await get(control)).document.groups[0].points === expected &&
      await js(control, "document.querySelector('.points-adjustment').value === '' && !document.querySelector('.points-adjustment').readOnly"),
      `adjust ${expression}`);
  };
  await enterAdjustment("5", 15);
  await enterAdjustment("-3", 12);
  await enterAdjustment("*2", 24);
  await enterAdjustment("/2", 12);
  await enterAdjustment("2+3", 17);
  await js(control, "document.querySelector('.points-adjustment').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})); document.querySelector('.points-adjustment').dispatchEvent(new FocusEvent('blur'))");
  assert.equal((await get(control)).document.groups[0].points, 17);
  await js(control, "document.querySelector('.points-adjustment').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}))");
  await until(async () => (await get(control)).document.groups[0].points === 12, "adjustment undo shortcut");
  await js(control, "document.querySelector('.points-adjustment').dispatchEvent(new KeyboardEvent('keydown',{key:'y',ctrlKey:true,bubbles:true,cancelable:true}))");
  await until(async () => (await get(control)).document.groups[0].points === 17, "adjustment redo shortcut");
  await js(control, "const change = document.querySelector('.points-adjustment'); change.value='/2'; change.dispatchEvent(new Event('input',{bubbles:true})); change.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");
  await until(() => js(control, "document.querySelector('.points-adjustment').getAttribute('aria-invalid') === 'true' && !document.querySelector('.points-adjustment').readOnly"), "fractions need the decimal option");
  assert.equal((await get(control)).document.groups[0].points, 17);
  const decimalMenu = Menu.getApplicationMenu().getMenuItemById("allow-decimals");
  assert.equal(decimalMenu.checked, false);
  decimalMenu.click();
  await until(async () => (await get(control)).document.settings.allowDecimals === true, "File enables decimal scores even with a fractional draft");
  assert.equal(decimalMenu.checked, true);
  await js(control, "document.querySelector('.points-adjustment').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");
  await until(async () => (await get(control)).document.groups[0].points === 8.5 && await js(control, "document.querySelector('.points-adjustment').value === ''"), "fractional division applies after enabling decimals");
  await enterAdjustment("+0,25", 8.75);
  await enterAdjustment("*2", 17.5);
  assert.equal(await js(control, "document.querySelector('.points-input').value"), "17,5");
  await until(() => js(control, "document.querySelector('#preview').contentDocument.querySelector('.stage-points')?.textContent === '17,5'"), "preview displays decimal commas");
  await screenshot(control, "control-adjustment-decimals.png");
  await command(control, "presentation-mode", { mode: "winner" });
  await until(() => js(control, "document.querySelector('#preview').contentDocument.querySelector('#winner-points').textContent === '17,5'"), "finale displays decimal commas too");
  await command(control, "presentation-mode", { mode: "scoreboard" });
  await command(control, "undo");
  assert.equal((await get(control)).document.groups[0].points, 8.75);
  await command(control, "redo");
  assert.equal((await get(control)).document.groups[0].points, 17.5);
  await assert.rejects(command(control, "decimals", { enabled: false }), /inneholder desimalpoeng/);
  assert.equal(decimalMenu.checked, true);
  await enterScore("18", 18);
  decimalMenu.click();
  await until(async () => (await get(control)).document.settings.allowDecimals === false, "decimal option turns off after restoring whole scores");
  assert.equal(decimalMenu.checked, false);
  check("separate empty adjustment fields add, subtract, multiply and divide once; File controls decimal scores, formatting and undo/redo");
  while ((await get(control)).document.groups[0].points !== 0)
    await command(control, "undo");
  await command(control, "undo");
  assert.equal((await get(control)).document.groups[0].name, "");
  check("direct name and score inputs autosave and undo as field edits");
  await command(control, "demo");
  let state = await get(control);
  assert.equal(state.document.groups.length, 12);
  await until(
    () => js(control, "document.querySelectorAll('.group-row').length === 12"),
    "group rows",
  );
  const documentBeforeResize = (await get(control)).document;
  const widthBefore = await js(
    control,
    "document.querySelector('#groups-panel').getBoundingClientRect().width",
  );
  const previewBefore = await js(
    control,
    "document.querySelector('#presentation-panel').getBoundingClientRect().width",
  );
  await js(
    control,
    "document.querySelector('#panel-divider').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))",
  );
  assert.ok(
    await js(
      control,
      `document.querySelector('#groups-panel').getBoundingClientRect().width > ${widthBefore} && document.querySelector('#presentation-panel').getBoundingClientRect().width < ${previewBefore}`,
    ),
  );
  const beforeDrag = await js(
    control,
    "document.querySelector('#groups-panel').getBoundingClientRect().width",
  );
  await js(
    control,
    "const split=document.querySelector('#panel-divider'); const rect=split.getBoundingClientRect(); const x=rect.left+rect.width/2; const y=rect.top+30; split.dispatchEvent(new PointerEvent('pointerdown',{pointerId:23,button:0,clientX:x,clientY:y,bubbles:true})); split.dispatchEvent(new PointerEvent('pointermove',{pointerId:23,clientX:x-90,clientY:y,bubbles:true})); split.dispatchEvent(new PointerEvent('pointerup',{pointerId:23,button:0,clientX:x-90,clientY:y,bubbles:true}));",
  );
  const draggedWidth = await js(
    control,
    "document.querySelector('#groups-panel').getBoundingClientRect().width",
  );
  assert.ok(Math.abs(beforeDrag - draggedWidth - 90) < 2);
  assert.equal(
    await js(control, "document.body.classList.contains('resizing-panels')"),
    false,
  );
  assert.deepEqual((await get(control)).document, documentBeforeResize);
  control.webContents.reload();
  await until(
    () =>
      js(
        control,
        "document.querySelectorAll('.group-row').length === 12 && !!document.querySelector('#panel-divider').getAttribute('aria-valuetext')",
      ),
    "restore split after reload",
  );
  assert.ok(
    Math.abs(
      (await js(
        control,
        "document.querySelector('#groups-panel').getBoundingClientRect().width",
      )) - draggedWidth,
    ) < 2,
  );
  await js(
    control,
    "document.querySelector('#panel-divider').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))",
  );
  assert.ok(
    await js(
      control,
      "document.querySelector('#groups-panel').getBoundingClientRect().width >= 360 && document.querySelector('#groups').scrollWidth <= document.querySelector('#groups').clientWidth",
    ),
  );
  await js(
    control,
    "document.querySelector('#panel-divider').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))",
  );
  assert.ok(
    await js(
      control,
      "document.querySelector('#presentation-panel').getBoundingClientRect().width >= 280 && document.documentElement.scrollWidth <= innerWidth",
    ),
  );
  await screenshot(control, "control-wide-list.png");
  await js(
    control,
    "document.querySelector('#panel-divider').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))",
  );
  assert.ok(
    Math.abs(
      (await js(
        control,
        "document.querySelector('#groups-panel').getBoundingClientRect().width",
      )) - widthBefore,
    ) < 2,
  );
  assert.ok(
    await js(
      control,
      "[...document.querySelectorAll('.group-row')].every(row=>row.offsetHeight <= 42)",
    ),
  );
  check(
    "compact rows and draggable split resize both panes, persist and respect minimum widths",
  );
  const group = state.document.groups.at(-1);
  saveDestination = path.join(output, "smoke-project.mvuka");
  await command(control, "save");
  const sourceImage = path.resolve(
    __dirname,
    "..",
    "dummy_album_covers",
    "artist_1.png",
  );
  const imageDirectory = path.join(userData, "image-picker");
  await fs.mkdir(imageDirectory);
  const selectedImage = path.join(imageDirectory, "gruppe.png");
  await fs.copyFile(sourceImage, selectedImage);
  selectedFile = selectedImage;
  await command(control, "image", { id: group.id });
  assert.equal(lastImageOptions.defaultPath, undefined);
  selectedFile = null;
  await command(control, "image", { id: group.id });
  assert.equal(lastImageOptions.defaultPath, imageDirectory);
  await fs.unlink(selectedImage);
  await fs.rmdir(imageDirectory);
  await command(control, "image", { id: group.id });
  assert.equal(lastImageOptions.defaultPath, undefined);
  // Restore the folder to verify the persisted preference in the restart pass.
  await fs.mkdir(imageDirectory);
  check("image picker remembers the selected folder, preserves it on cancel and handles deleted folders");
  const formats = await imageFixtures();
  const animatedGroupId = (await get(control)).document.groups[0].id;
  for (const [extension, data] of [["webp", formats.webp], ["avif", formats.avif], ["tiff", formats.tiff], ["svg", formats.svg], ["gif", formats.gif]]) {
    selectedFile = path.join(imageDirectory, `gruppe.${extension}`);
    await fs.writeFile(selectedFile, data);
    await command(control, "image", { id: animatedGroupId });
    const imported = (await get(control)).document.groups[0];
    assert.match(imported.imageUrl, extension === "gif" ? /^data:image\/gif/ : /^data:image\/png/);
    await fs.unlink(selectedFile);
  }
  selectedFile = null;
  assert.ok(["webp", "gif", "avif", "tiff", "svg", "jfif"].every((ext) => lastImageOptions.filters[0].extensions.includes(ext)));
  const animatedProject = Project.decode(await fs.readFile(saveDestination));
  const animatedGroup = animatedProject.document.groups[0];
  assert.equal((await sharp(Buffer.from(animatedProject.assets[animatedGroup.image]), { animated: true }).metadata()).pages, 2);
  assert.ok(animatedProject.assets[animatedGroup.imageStill]);
  check("native image picker imports WebP, AVIF, TIFF, SVG and GIF; animation and its poster remain embedded after source deletion");
  state = await get(control);
  assert.match(
    state.document.groups.at(-1).imageUrl,
    /^data:image\/png;base64,/,
  );
  const file = Project.decode(await fs.readFile(saveDestination));
  assert.ok(file.document.groups.at(-1).image);
  assert.ok(Object.keys(file.assets).length);
  check("save-as and embedded image persist in portable project");

  const before = group.points;
  await Promise.all(
    Array.from({ length: 8 }, () =>
      command(control, "points", { id: group.id, delta: 12 }),
    ),
  );
  state = await get(control);
  assert.equal(state.document.groups.at(-1).points, before + 96);
  assert.equal(
    Project.decode(await fs.readFile(saveDestination)).document.groups.at(-1)
      .points,
    before + 96,
  );
  check("queued concurrent scores autosave without lost updates");

  // Keyboard events are dispatched within the renderer to verify app shortcut routing.
  await js(
    control,
    "document.activeElement.blur(); document.body.dispatchEvent(new KeyboardEvent('keydown', {key:'z',ctrlKey:true,bubbles:true}))",
  );
  await until(
    async () =>
      (await get(control)).document.groups.at(-1).points === before + 84,
    "Ctrl+Z",
  );
  await js(
    control,
    "document.body.dispatchEvent(new KeyboardEvent('keydown', {key:'y',ctrlKey:true,bubbles:true}))",
  );
  await until(
    async () =>
      (await get(control)).document.groups.at(-1).points === before + 96,
    "Ctrl+Y",
  );
  check("Ctrl+Z and Ctrl+Y route to project undo/redo");
  await command(control, "undo");
  selectedFile = saveDestination;
  await command(control, "open");
  assert.equal((await get(control)).canRedo, true);
  await command(control, "redo");
  assert.equal((await get(control)).document.groups.at(-1).points, before + 96);
  assert.ok((await get(control)).document.groups.at(-1).imageUrl);
  check("reopening restores images and persistent redo history");

  await js(control, "document.querySelector('#display-select').click()");
  await until(
    () => js(control, "document.querySelector('#display-options').matches(':popover-open') && document.activeElement.matches('#display-options [role=option][aria-selected=true]')"),
    "screen picker opens and focuses the selected screen",
  );
  const picker = await js(control, `(() => {
    const button = document.querySelector('#display-select').getBoundingClientRect();
    const list = document.querySelector('#display-options').getBoundingClientRect();
    return { below: list.top >= button.bottom, alignedLeft: Math.abs(list.left - button.left) < 1, sameWidth: Math.abs(list.width - button.width) < 1, expanded: document.querySelector('#display-select').getAttribute('aria-expanded'), options: document.querySelectorAll('#display-options [role=option]').length };
  })()`);
  assert.deepEqual(picker, { below: true, alignedLeft: true, sameWidth: true, expanded: "true", options: (await get(control)).displays.length });
  await screenshot(control, "control-screen-picker.png");
  await js(control, "document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true,cancelable:true}))");
  await until(
    () => js(control, "!document.querySelector('#display-options').matches(':popover-open') && document.activeElement.id === 'display-select'"),
    "Escape closes the screen picker and returns focus",
  );
  check("screen picker opens below its button, lists every screen and closes with Escape");

  state = await get(control);
  await command(control, "start-presentation", {
    displayId: state.displays[0].id,
  });
  await until(
    () =>
      windows.length > 1 &&
      js(windows[1], "document.querySelectorAll('.stage-row').length === 12"),
    "audience load",
  );
  const audience = windows[1];
  await assert.rejects(js(control, "window.musikk.getFullscreen()"), /Ingen tilgang/);
  await until(
    () => js(audience, "!document.querySelector('#audience-fullscreen').hidden"),
    "fullscreen button visible in audience window",
  );
  assert.equal(
    await js(control, "document.querySelector('#preview').contentDocument.querySelector('#audience-fullscreen').hidden"),
    true,
  );
  await js(audience, "document.querySelector('#audience-fullscreen').click()");
  await until(() => audience.isFullScreen(), "native audience fullscreen");
  await until(
    () => js(audience, "document.querySelector('#audience-fullscreen').hidden"),
    "fullscreen button hides during presentation",
  );
  assert.equal(audience.isMenuBarVisible(), false);
  audience.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  audience.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await until(() => !audience.isFullScreen(), "Escape exits native fullscreen");
  await until(
    () => js(audience, "!document.querySelector('#audience-fullscreen').hidden"),
    "fullscreen button returns after Escape",
  );
  check("audience button enters native fullscreen, hides the menu and itself, and Escape restores the window; preview stays clean");
  await until(
    () => js(audience, `document.querySelector('[data-id="${animatedGroupId}"] .stage-avatar img')?.src.startsWith('data:image/gif')`),
    "animated GIF appears in audience",
  );
  await command(control, "motion", { enabled: false });
  await until(
    () => js(audience, `document.querySelector('[data-id="${animatedGroupId}"] .stage-avatar img')?.src.startsWith('data:image/png')`),
    "motion off uses a still frame for audience GIF",
  );
  await until(
    () => js(control, `document.querySelector('[data-id="${animatedGroupId}"] .avatar-content img')?.src.startsWith('data:image/png') && document.querySelector('#preview').contentDocument.querySelector('[data-id="${animatedGroupId}"] .stage-avatar img')?.src.startsWith('data:image/png')`),
    "control and preview also stop GIF animation",
  );
  await command(control, "motion", { enabled: true });
  await until(
    () => js(audience, `document.querySelector('[data-id="${animatedGroupId}"] .stage-avatar img')?.src.startsWith('data:image/gif')`),
    "motion on restores animated GIF",
  );
  check("audience, preview and control show GIF animation and switch to its still frame when motion is disabled");
  const fullWidthRows = await js(
    audience,
    "[...document.querySelectorAll('.stage-row')].every(row => row.offsetLeft === 0 && Math.abs(row.offsetWidth - document.querySelector('#board').clientWidth) <= 1)",
  );
  assert.equal(
    fullWidthRows,
    true,
    "audience rows use the entire available width",
  );
  const medalStyles = await js(
    audience,
    "['gold','silver','bronze'].map(medal => { const row=document.querySelector('[data-medal=\"'+medal+'\"]'); const frame=getComputedStyle(row,'::before'); return {medal,height:row.offsetHeight,gradient:frame.backgroundImage,mask:frame.maskComposite,animation:frame.animationName}; })",
  );
  assert.ok(medalStyles[0].height > medalStyles[1].height);
  assert.equal(medalStyles[1].height, medalStyles[2].height);
  assert.equal(new Set(medalStyles.map((s) => s.gradient)).size, 3);
  assert.ok(
    medalStyles.every(
      (s) =>
        s.gradient.includes("linear-gradient") &&
        s.mask.split(",").every((value) => value.trim() === "exclude") &&
        s.animation === "metal-shimmer",
    ),
    JSON.stringify(medalStyles),
  );
  const shineBefore = await js(
    audience,
    "getComputedStyle(document.querySelector('[data-medal=gold]'),'::before').backgroundPosition",
  );
  await delay(250);
  const shineAfter = await js(
    audience,
    "getComputedStyle(document.querySelector('[data-medal=gold]'),'::before').backgroundPosition",
  );
  assert.notEqual(
    shineAfter,
    shineBefore,
    "metal stroke actually changes over time",
  );
  check(
    "full-width rows, larger leader and three distinct animated metallic strokes",
  );
  assert.equal(
    await js(audience, "document.querySelector('#stage-title').textContent"),
    "Musikkvideouka 2026",
  );
  assert.equal(
    await js(
      audience,
      "document.querySelectorAll('.stage-brand,.stage-intro,.stage-footer').length",
    ),
    0,
  );
  assert.equal(
    await js(
      audience,
      "document.querySelector('#stage').getAnimations().some(animation => animation.effect.getTiming().iterations === Infinity)",
    ),
    true,
  );
  const titleSize = await js(
    audience,
    "parseFloat(getComputedStyle(document.querySelector('#stage-title')).fontSize)",
  );
  assert.ok(titleSize <= 28);
  await assert.rejects(
    command(audience, "points", { id: group.id, delta: 100 }),
    /Ingen tilgang/,
  );
  await until(
    () =>
      js(
        audience,
        "[...document.querySelectorAll('.stage-row')].find(r=>r.classList.contains('leader')).querySelector('.stage-name').textContent === 'På repeat'",
      ),
    "initial audience rank",
  );
  check("audience window renders ranked data and cannot mutate project");

  const runner = state.document.groups[1];
  await command(control, "points", { id: runner.id, delta: 200 });
  await until(
    () =>
      js(
        audience,
        `document.querySelector('[data-id="${runner.id}"] .stage-points').textContent === '${runner.points + 200}'`,
      ),
    "new points",
  );
  const highlighted = await js(
    audience,
    `document.querySelector('[data-id="${runner.id}"] .stage-points').getAnimations().length > 0`,
  );
  assert.equal(highlighted, true);
  await until(
    () => js(audience, `(() => { const score=document.querySelector('[data-id="${runner.id}"] .stage-points'); const style=getComputedStyle(score); return new DOMMatrixReadOnly(style.transform).a >= 1.34 && style.color === 'rgb(255, 219, 96)' && document.querySelector('.leader').dataset.id !== '${runner.id}'; })()`),
    "score grows and becomes yellow before the row moves",
  );
  await until(
    () => js(audience, `document.querySelector('[data-id="${runner.id}"]').getAnimations().some(a => a.effect.getKeyframes().some(frame => frame.transform) && a.playState === 'running')`),
    "row starts moving after score emphasis",
  );
  await js(audience, `{
    const movingRow = document.querySelector('[data-id="${runner.id}"]');
    window.capturedRankMove = movingRow.getAnimations().find(a => a.effect.getKeyframes().some(frame => frame.transform));
    window.capturedRankMove.pause();
    window.capturedRankMove.currentTime = window.capturedRankMove.effect.getTiming().duration / 2;
  }`);
  const movingScore = await js(audience, `(() => {
    const row = document.querySelector('[data-id="${runner.id}"]');
    const score = row.querySelector('.stage-points');
    const style = getComputedStyle(score);
    const rect = score.getBoundingClientRect();
    return { scale: new DOMMatrixReadOnly(style.transform).a, color: style.color,
      clearOfName: rect.left > row.querySelector('.stage-name').getBoundingClientRect().right,
      clearOfUnit: rect.right < row.querySelector('.stage-unit').getBoundingClientRect().left };
  })()`);
  assert.ok(movingScore.scale >= 1.34);
  assert.equal(movingScore.color, "rgb(255, 219, 96)");
  assert.ok(movingScore.clearOfName && movingScore.clearOfUnit);
  await screenshot(audience, "audience-score-moving.png");
  await js(audience, "window.capturedRankMove.play()");
  await until(
    () =>
      js(
        audience,
        `document.querySelector('.leader').dataset.id === '${runner.id}' && document.querySelector('.leader').getAnimations().every(animation => !animation.effect.getKeyframes().some(frame => frame.transform))`,
      ),
    "animated rank change",
  );
  assert.equal(
    await js(
      audience,
      `document.querySelector('[data-id="${runner.id}"]').offsetTop`,
    ),
    0,
  );
  await until(
    () => js(audience, `(() => { const score=document.querySelector('[data-id="${runner.id}"] .stage-points'); return score.getAnimations().length === 0 && getComputedStyle(score).transform === 'none' && getComputedStyle(score).color === 'rgb(255, 255, 255)'; })()`),
    "score returns to normal only after the move",
  );
  check("score grows before moving, stays large and yellow throughout the move without overlapping text, then returns to normal");

  await Promise.all(Array.from({ length: 4 }, () => command(control, "points", { id: runner.id, delta: 1 })));
  await until(
    () => js(audience, `document.querySelector('[data-id="${runner.id}"] .stage-points').textContent === '${runner.points + 204}' && document.querySelector('[data-id="${runner.id}"] .stage-points').getAnimations().length === 0`),
    "rapid updates settle on the latest total",
  );
  await command(control, "set-points", { id: runner.id, points: runner.points + 200 });
  await until(
    () => js(audience, `document.querySelector('[data-id="${runner.id}"] .stage-points').textContent === '${runner.points + 200}' && document.querySelector('[data-id="${runner.id}"] .stage-points').getAnimations().length === 0`),
    "score correction settles without leaving a highlight",
  );
  check("rapid score changes and corrections reach their final total without leaving an animation or highlight behind");
  assert.equal(
    await js(
      audience,
      `document.querySelector('[data-medal=gold]').dataset.id === '${runner.id}' && document.querySelector('[data-medal=silver]').dataset.id === '${group.id}' && document.querySelector('[data-medal=bronze]').dataset.id === '${state.document.groups[0].id}'`,
    ),
    true,
  );
  const beforeFinale = await get(control);
  const originalWinnerPoints = beforeFinale.document.groups.find((g) => g.id === group.id).points;
  const originalRunnerPoints = beforeFinale.document.groups.find((g) => g.id === runner.id).points;
  await js(control, `{
    const field = document.querySelector('[data-id="${group.id}"] .points-input');
    field.focus();
    field.value = '500+7';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#finish-show').click();
  }`);
  await until(
    () => js(audience, `!document.querySelector('#winner-overlay').hidden && document.querySelector('#winner-overlay').dataset.winnerId === '${group.id}' && document.querySelector('#winner-points').textContent === '507'`),
    "Ferdig flushes the score expression and reveals the correct winner",
  );
  await until(
    () => js(control, `document.querySelector('#preview').contentDocument.querySelector('#winner-points').textContent === '507' && !document.querySelector('#back-to-board').hidden`),
    "winner preview matches the audience",
  );
  assert.equal((await get(control)).document.groups.find((g) => g.id === group.id).points, 507);
  const thirdId = state.document.groups[0].id;
  await until(
    () => js(audience, `document.querySelector('#podium-second').dataset.groupId === '${runner.id}' && document.querySelector('#podium-third').dataset.groupId === '${thirdId}'`),
    "silver and bronze show the correct runners-up",
  );
  assert.equal(await js(audience, `(() => {
    const gold = document.querySelector('#winner-portrait').getBoundingClientRect();
    const silver = document.querySelector('#podium-second .podium-portrait').getBoundingClientRect();
    const bronze = document.querySelector('#podium-third .podium-portrait').getBoundingClientRect();
    return silver.right < gold.left && bronze.left > gold.right && silver.width < gold.width && bronze.width < gold.width;
  })()`), true);
  assert.equal(await js(control, `document.querySelector('#preview').contentDocument.querySelector('#podium-second').dataset.groupId === '${runner.id}'`), true);
  await until(
    () => js(audience, "!!document.querySelector('#winner-portrait img')?.complete && document.querySelector('#winner-portrait img').naturalWidth > 0"),
    "winner photo loaded",
  );
  await until(
    () => js(audience, "document.querySelector('#confetti').getContext('2d').getImageData(0,0,1600,900).data.some((v,i) => i % 4 === 3 && v > 0)"),
    "confetti actually paints",
  );
  await delay(1250);
  await screenshot(audience, "audience-winner.png");
  await screenshot(control, "control-winner.png");
  await js(audience, "window.originalWinnerPhoto = document.querySelector('#winner-portrait img')");
  await command(control, "presentation-mode", { mode: "winner" });
  assert.equal(await js(audience, "window.originalWinnerPhoto === document.querySelector('#winner-portrait img')"), true);
  check("Ferdig commits pending scores, reveals the winner photo and confetti, and matches the preview without replaying on broadcasts");

  await command(control, "set-points", { id: runner.id, points: 507 });
  await until(
    () => js(audience, "document.querySelector('#winner-label').textContent === 'Delt førsteplass' && document.querySelector('#winner-counter').textContent === '1 av 2' && !!document.querySelector('#winner-portrait svg')"),
    "tied winners and missing photo fallback",
  );
  assert.equal(await js(audience, `document.querySelector('#podium-second').hidden && document.querySelector('#podium-third').dataset.groupId === '${thirdId}'`), true);
  await until(
    () => js(audience, `document.querySelector('#winner-overlay').dataset.winnerId === '${group.id}' && document.querySelector('#winner-counter').textContent === '2 av 2'`),
    "both tied winners get their turn",
  );
  await command(control, "motion", { enabled: false });
  await until(
    () => js(audience, "getComputedStyle(document.querySelector('.winner-rays')).animationName === 'none' && document.querySelector('#confetti').getContext('2d').getImageData(0,0,1600,900).data.every((v,i) => i % 4 !== 3 || v === 0)"),
    "motion off stops finale effects",
  );
  await js(control, "document.querySelector('#back-to-board').click()");
  await until(
    () => js(audience, "document.querySelector('#winner-overlay').hidden && getComputedStyle(document.querySelector('#board')).visibility === 'visible'"),
    "return to scoreboard",
  );
  await command(control, "set-points", { id: group.id, points: originalWinnerPoints });
  await command(control, "set-points", { id: runner.id, points: originalRunnerPoints });
  await command(control, "motion", { enabled: true });
  check("tied winners rotate fairly, missing photos use a trophy, reduced motion stops effects, and the scoreboard returns");
  await command(control, "presentation-mode", { mode: "pause" });
  await until(
    () => js(audience, "!document.querySelector('#pause-overlay').hidden"),
    "pause",
  );
  await command(control, "presentation-mode", { mode: "black" });
  await until(
    () => js(audience, "!document.querySelector('#black-overlay').hidden"),
    "black",
  );
  assert.equal(await js(audience, "document.querySelector('#audience-fullscreen').hidden"), true);
  await command(control, "presentation-mode", { mode: "scoreboard" });
  await command(control, "motion", { enabled: false });
  await until(
    () =>
      js(
        audience,
        "document.querySelector('#stage').classList.contains('no-motion')",
      ),
    "reduced motion",
  );
  check("pause, black screen and motion setting propagate");
  assert.equal(
    await js(
      audience,
      "getComputedStyle(document.querySelector('[data-medal=gold]'),'::before').animationName",
    ),
    "none",
  );
  const names = state.document.groups.map((g) => ({ id: g.id, name: g.name }));
  for (const item of names.slice(1))
    await command(control, "rename-group", { id: item.id, name: "" });
  await until(
    () => js(audience, "document.querySelectorAll('.stage-row').length === 1"),
    "single group layout",
  );
  assert.equal(
    await js(
      audience,
      "Math.abs(document.querySelector('.stage-row').offsetWidth - document.querySelector('#board').clientWidth) <= 1",
    ),
    true,
  );
  await screenshot(audience, "audience-one-group.png");
  await command(control, "presentation-mode", { mode: "winner" });
  await until(
    () => js(audience, "!document.querySelector('#winner-overlay').hidden && document.querySelector('#podium-second').hidden && document.querySelector('#podium-third').hidden"),
    "one-team finale hides both unused places",
  );
  await command(control, "rename-group", names[1]);
  await until(
    () => js(audience, "!document.querySelector('#podium-second').hidden && document.querySelector('#podium-third').hidden"),
    "two-team finale only shows first and second",
  );
  await command(control, "presentation-mode", { mode: "scoreboard" });
  await command(control, "rename-group", names[2]);
  check("finale podium ranks correctly, keeps the winner largest in the center, respects ties and omits missing places");
  await command(control, "motion", { enabled: true });
  await until(
    () => js(audience, "document.querySelectorAll('.stage-row').length === 3"),
    "three group layout",
  );
  await screenshot(audience, "audience-medals.png");
  await command(control, "motion", { enabled: false });
  const threeTeamHeight = await js(audience, "Math.max(...[...document.querySelectorAll('.stage-row')].map(row => row.offsetTop + row.offsetHeight)) / document.querySelector('#board').clientHeight");
  assert.ok(threeTeamHeight > 0.6 && threeTeamHeight < 0.8, `three teams leave natural space below (${threeTeamHeight})`);
  for (const item of names.slice(3, 10))
    await command(control, "rename-group", item);
  await until(
    () => js(audience, "document.querySelectorAll('.stage-row').length === 10"),
    "ten group layout",
  );
  const tenTeamHeight = await js(audience, "Math.max(...[...document.querySelectorAll('.stage-row')].map(row => row.offsetTop + row.offsetHeight)) / document.querySelector('#board').clientHeight");
  assert.ok(tenTeamHeight > 0.98 && tenTeamHeight <= 1.002, `ten teams fill the available height (${tenTeamHeight})`);
  assert.equal(await js(audience, "(() => { const photo=document.querySelector('.leader .stage-avatar').getBoundingClientRect(); const second=document.querySelector('[data-medal=silver]').getBoundingClientRect(); const header=document.querySelector('.stage-heading').getBoundingClientRect(); return photo.bottom < second.top && photo.top > header.bottom; })()"), true);
  await until(
    () => js(control, "document.querySelector('#preview').contentDocument.querySelectorAll('.stage-row').length === 10"),
    "preview follows automatic audience sizing",
  );
  await screenshot(audience, "audience-ten-groups.png");
  check("ten groups fill the available height, three groups retain breathing room, and the larger leader photo stays clear of its neighbors");
  for (const item of names.slice(10))
    await command(control, "rename-group", item);
  await until(
    () => js(audience, "document.querySelectorAll('.stage-row').length === 12"),
    "restore named groups",
  );
  check(
    "single-group screenshot fills width and podium styles follow ranked rows",
  );
  // Turning motion off also flushes any preview backlog from the rapid score test.
  await command(control, "motion", { enabled: true });
  await delay(600);
  await screenshot(control, "control-panel.png");
  await screenshot(audience, "audience.png");
  // Test a smaller supported control window and maximum audience density.
  control.setSize(1100, 760);
  await delay(250);
  const overflow = await js(
    control,
    "document.documentElement.scrollWidth > innerWidth",
  );
  assert.equal(overflow, false, "control panel must fit minimum window width");
  const visibleGroups = await js(
    control,
    "[...document.querySelectorAll('.group-row')].filter(row => row.getBoundingClientRect().bottom <= document.querySelector('#groups').getBoundingClientRect().bottom + 1).length",
  );
  assert.ok(
    visibleGroups >= 10,
    `at least ten editable groups fit without scrolling (got ${visibleGroups})`,
  );
  await screenshot(control, "control-compact.png");
  control.setSize(1500, 980);
  await command(control, "motion", { enabled: false });
  for (let i = 12; i < 48; i++)
    await command(control, "add-group", { name: `Gruppe ${i + 1}` });
  await until(
    () => js(audience, "document.querySelectorAll('.stage-row').length === 48"),
    "48 groups",
  );
  const fits = await js(
    audience,
    "[...document.querySelectorAll('.stage-row')].every(r => r.offsetTop >= 0 && r.offsetTop + r.offsetHeight <= document.querySelector('#board').clientHeight + 1 && r.offsetLeft + r.offsetWidth <= document.querySelector('#board').clientWidth + 1)",
  );
  assert.equal(fits, true);
  await delay(600);
  await screenshot(audience, "audience-48-groups.png");
  check("minimum control size and 48-group audience layout fit");
  // Re-import the existing spreadsheet: it has remote images, which must be reported, never fetched.
  selectedFile = path.resolve(__dirname, "..", "Musikkvideouka.xlsx");
  await command(control, "import");
  assert.equal((await get(control)).document.groups.length, 17);
  await command(control, "undo");
  assert.equal((await get(control)).document.groups.length, 48);
  check("existing Excel imports and can be undone");
  const arrow = (key) =>
    js(control, `document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'${key}',bubbles:true,cancelable:true}))`);
  const focusedField = () =>
    js(control, "(() => { const field = document.activeElement; return [[...document.querySelectorAll('.group-row')].indexOf(field.closest('.group-row')), field.className]; })()");
  const firstGroup = (await get(control)).document.groups[0];
  await js(control, `{
    const field = document.querySelector('.group-row .points-input');
    field.focus(); field.value = '${firstGroup.points + 7}';
    field.dispatchEvent(new Event('input', {bubbles:true}));
  }`);
  await arrow("ArrowDown");
  await until(async () => (await focusedField())[0] === 1, "ArrowDown moves to the next group");
  assert.deepEqual(await focusedField(), [1, "points-input"]);
  assert.equal((await get(control)).document.groups[0].points, firstGroup.points + 7);
  assert.equal(await js(control, "document.activeElement.selectionStart === 0 && document.activeElement.selectionEnd === document.activeElement.value.length"), true, "the next score is selected so typing replaces it");
  await arrow("ArrowUp");
  await until(async () => (await focusedField())[0] === 0, "ArrowUp moves to the previous group");
  await js(control, "document.querySelectorAll('.points-adjustment')[2].focus()");
  await arrow("ArrowUp");
  await until(async () => (await focusedField())[0] === 1, "ArrowUp in the change column");
  assert.deepEqual(await focusedField(), [1, "points-adjustment"]);
  await js(control, "document.activeElement.blur()");
  await command(control, "undo");
  check("arrow keys move between groups in the score columns and save the score first");
  // A backup path occupied by a directory causes the next atomic write to fail.
  // The previous project must survive, recovery must contain the latest change,
  // and a subsequent save to a working location must clear the visible error.
  const backupPath = `${saveDestination}.bak`;
  await fs.rm(backupPath, { force: true });
  await fs.mkdir(backupPath);
  const savedBeforeFailure = await fs.readFile(saveDestination);
  await assert.rejects(command(control, "points", { id: group.id, delta: 1 }));
  assert.ok((await get(control)).saveError);
  assert.deepEqual(await fs.readFile(saveDestination), savedBeforeFailure);
  assert.equal(
    Project.decode(
      await fs.readFile(path.join(userData, "recovery.mvuka")),
    ).document.groups.at(11).points,
    before + 97,
  );
  await fs.rmdir(backupPath);
  await command(control, "save");
  assert.equal((await get(control)).saveError, null);
  await command(control, "undo");
  // Restore an import redo entry for the subsequent restart check.
  await command(control, "import");
  await command(control, "undo");
  check(
    "failed autosave preserves previous file, writes recovery and reports failure",
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, "smoke-report.json"),
    JSON.stringify({ ok: true, checks, userData }, null, 2),
  );
  console.log(
    `PASS ${checks.length} app integration checks. Screenshots: test-results/`,
  );
  app.exit(0);
}
app.whenReady().then(() =>
  run().catch(async (error) => {
    console.error(error);
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(
      path.join(output, "smoke-report.json"),
      JSON.stringify(
        { ok: false, checks, error: error.stack, errors },
        null,
        2,
      ),
    );
    if (windows[0] && !windows[0].isDestroyed())
      await fs.writeFile(
        path.join(output, "failure.png"),
        (await windows[0].webContents.capturePage()).toPNG(),
      );
    app.exit(1);
  }),
);
require("../desktop/main.js");
