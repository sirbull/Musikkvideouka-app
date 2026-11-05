const api = window.musikk;
const $ = (id) => document.getElementById(id);
const rows = new Map();
const scoreEditors = new Map();
const reducedImageMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let current, toastTimer;

function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 6000);
}
function clearToast() {
  clearTimeout(toastTimer);
  $("toast").hidden = true;
}
async function command(action, payload) {
  try {
    await api.command(action, payload);
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}
function confirmAction(title, detail, label) {
  $("confirm-title").textContent = title;
  $("confirm-detail").textContent = detail;
  $("confirm-ok").textContent = label;
  return new Promise((resolve) => {
    const dialog = $("confirm-dialog");
    const finish = (result) => {
      dialog.close();
      dialog.oncancel = null;
      resolve(result);
    };
    $("confirm-cancel").onclick = () => finish(false);
    $("confirm-ok").onclick = () => finish(true);
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    dialog.showModal();
    $("confirm-cancel").focus();
  });
}
function newProject() {
  const dialog = $("new-project-dialog");
  if (!dialog.open) {
    $("new-project-name").value = "";
    dialog.showModal();
  }
  $("new-project-name").focus();
}
async function resetPoints() {
  if (
    await confirmAction(
      "Nullstill alle poeng?",
      "Alle poengsummer settes til 0. Du kan angre etterpå.",
      "Nullstill",
    )
  )
    await command("reset-points");
}
async function action(name) {
  if (
    ["new", "open", "save", "save-as", "import", "reset-points"].includes(
      name,
    ) &&
    !(await prepareProjectChange())
  )
    return;
  if (name === "new") newProject();
  if (name === "reset-points") resetPoints();
  if (name === "toggle-decimals") {
    const enabled = !current.document.settings.allowDecimals;
    if (!enabled && !(await prepareProjectChange())) return;
    if (await command("decimals", { enabled })) clearToast();
  }
  if (
    ["open", "save", "save-as", "import", "download-excel-template"].includes(name)
  )
    await command(name);
}

async function prepareProjectChange() {
  for (const editor of scoreEditors.values()) {
    if (!(await editor.commit())) {
      editor.focus();
      return false;
    }
  }
  return true;
}
window.prepareProjectChange = prepareProjectChange;

function showScoreValue(points, value) {
  points.value = formatScore(value);
  points.style.fontSize = points.value.length > 11 ? "12px" : points.value.length > 8 ? "14px" : "";
}

function createScoreEditor(points, id, adjustment = false) {
  const scoreHint = adjustment
    ? "Endre poeng: 5 eller +5 legger til, -5 trekker fra, *2 ganger og /2 deler. Enter beregner."
    : "Skriv en poengsum eller et regnestykke, f.eks. 23-5 eller +1. Enter beregner.";
  let pendingScore = null;
  const savedScore = () =>
    current.document.groups.find((g) => g.id === id)?.points ?? 0;
  const resetValue = (value) => {
    if (adjustment) points.value = "";
    else showScoreValue(points, value);
  };
  function cancelScore() {
    if (pendingScore) return;
    resetValue(savedScore());
    delete points.dataset.draft;
    points.removeAttribute("aria-invalid");
    points.title = scoreHint;
  }
  async function commitScore() {
    if (pendingScore) return pendingScore;
    if (points.dataset.draft !== "true") return true;
    const expression = points.value.trim();
    if (!expression) {
      cancelScore();
      return true;
    }
    points.readOnly = true;
    points.setAttribute("aria-busy", "true");
    pendingScore = (async () => {
      try {
        await api.command(adjustment ? "adjust-points" : "calculate-points", { id, expression });
        const latest = await api.getState().catch(() => current);
        resetValue(
          latest.document.groups.find((g) => g.id === id)?.points ?? savedScore(),
        );
        delete points.dataset.draft;
        points.removeAttribute("aria-invalid");
        points.title = scoreHint;
        clearToast();
        return true;
      } catch (error) {
        const latest = await api.getState().catch(() => current);
        if (latest.saveError) {
          // A disk failure may happen after the score was applied. Never apply a relative expression twice.
          resetValue(
            latest.document.groups.find((g) => g.id === id)?.points ?? savedScore(),
          );
          delete points.dataset.draft;
        } else {
          points.setAttribute("aria-invalid", "true");
          points.title = error.message;
        }
        toast(error.message);
        return false;
      } finally {
        points.readOnly = false;
        points.removeAttribute("aria-busy");
        pendingScore = null;
      }
    })();
    return pendingScore;
  }
  points.title = scoreHint;
  points.onfocus = () => points.select();
  points.oninput = () => {
    points.dataset.draft = "true";
    points.removeAttribute("aria-invalid");
    points.title = scoreHint;
  };
  points.onblur = () => commitScore();
  points.onkeydown = async (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelScore();
      points.blur();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (await commitScore()) {
        if (!adjustment) points.blur();
      }
    }
    if (
      (event.key === "ArrowUp" || event.key === "ArrowDown") &&
      !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
    ) {
      event.preventDefault();
      // Move to the same column in the neighbouring group, saving this field first.
      if (!(await commitScore())) return;
      const row = points.closest(".group-row");
      const target = (event.key === "ArrowUp" ? row?.previousElementSibling : row?.nextElementSibling)
        ?.querySelector(adjustment ? ".points-adjustment" : ".points-input");
      target?.focus();
      target?.select();
    }
  };
  scoreEditors.set(points, {
    commit: commitScore,
    cancel: cancelScore,
    focus: () => points.focus(),
    busy: () => !!pendingScore,
  });
}

function createRow(group) {
  const row = document.createElement("div");
  row.className = "group-row";
  row.dataset.id = group.id;
  row.innerHTML = `<span class="group-index"></span><button class="group-avatar" title="Velg bilde"><span class="avatar-content"></span><span class="photo-hover">${icon("image")}</span></button><input class="group-name" maxlength="100" autocomplete="off"><input class="points-input" type="text" inputmode="text" maxlength="120" autocomplete="off" spellcheck="false"><input class="points-adjustment" type="text" inputmode="text" maxlength="120" autocomplete="off" spellcheck="false"><button class="delete-group" title="Slett gruppe">${icon("trash")}</button>`;
  const name = row.querySelector(".group-name");
  let nameEdit = crypto.randomUUID();
  name.onfocus = () => { nameEdit = crypto.randomUUID(); };
  name.oninput = () => command("rename-group", { id: group.id, name: name.value, editId: nameEdit });
  name.onkeydown = (event) => {
    if (event.key === "Enter") { event.preventDefault(); name.blur(); }
  };
  createScoreEditor(row.querySelector(".points-input"), group.id);
  createScoreEditor(row.querySelector(".points-adjustment"), group.id, true);
  row.querySelector(".group-avatar").onclick = () =>
    command("image", { id: group.id });
  row.querySelector(".delete-group").onclick = async () => {
    const label =
      current.document.groups.find((g) => g.id === group.id)?.name ||
      "denne gruppen";
    if (
      await confirmAction(
        `Slett ${label}?`,
        "Gruppen fjernes fra listen. Du kan angre med Ctrl+Z.",
        "Slett",
      )
    )
      await command("remove-group", { id: group.id });
  };
  return row;
}

const displayPicker = $("display-select"),
  displayList = $("display-options");
let selectedDisplay = null,
  displayPickedByUser = false;

// The control panel's own screen opens a movable window; any other screen opens fullscreen.
function displayChoice(display) {
  const element = document.createElement("span");
  element.className = "display-choice";
  const title = document.createElement("span"),
    detail = document.createElement("small");
  if (current.isBrowser) title.textContent = display.label;
  else {
    title.textContent = display.current ? "Vindu på din skjerm" : "Fullskjerm";
    detail.textContent = display.label;
  }
  element.append(title, detail);
  return element;
}
function chooseDisplay(id) {
  selectedDisplay = id;
  const display = current?.displays.find((d) => d.id === id);
  $("display-icon").innerHTML = icon(display && !display.current ? "fullscreen" : "screen");
  $("display-current").replaceChildren(
    display ? displayChoice(display) : "Ingen skjerm funnet",
  );
  for (const option of displayList.children)
    option.setAttribute("aria-selected", Number(option.dataset.id) === id);
}
function displayListOpen() {
  return displayList.matches(":popover-open");
}
function closeDisplayList(focusPicker = true) {
  if (displayListOpen()) displayList.hidePopover();
  if (focusPicker) displayPicker.focus();
}
function placeDisplayList() {
  const box = displayPicker.getBoundingClientRect();
  displayList.style.left = `${box.left}px`;
  displayList.style.width = `${box.width}px`;
  displayList.style.top = `${box.bottom + 6}px`;
  // Open upwards when the list would run off the bottom of the window.
  const height = displayList.offsetHeight;
  if (height && box.bottom + 6 + height > innerHeight - 8 && box.top - 6 - height >= 8)
    displayList.style.top = `${box.top - 6 - height}px`;
}
displayList.addEventListener("beforetoggle", (event) => {
  if (event.newState === "open") placeDisplayList();
});
displayList.addEventListener("toggle", (event) => {
  const open = event.newState === "open";
  displayPicker.setAttribute("aria-expanded", open);
  if (!open) return;
  placeDisplayList();
  (displayList.querySelector('[aria-selected="true"]') || displayList.firstElementChild)?.focus();
});
displayPicker.addEventListener("keydown", (event) => {
  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !displayPicker.disabled) {
    event.preventDefault();
    if (!displayListOpen()) displayList.showPopover();
  }
});
displayList.addEventListener("click", (event) => {
  const option = event.target.closest('[role="option"]');
  if (!option) return;
  displayPickedByUser = true;
  chooseDisplay(Number(option.dataset.id));
  closeDisplayList();
});
displayList.addEventListener("keydown", (event) => {
  const options = [...displayList.children],
    index = options.indexOf(document.activeElement);
  const move = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: options.length - 1 }[event.key];
  if (move !== undefined) {
    event.preventDefault();
    options[(move + options.length) % options.length]?.focus();
  } else if ((event.key === "Enter" || event.key === " ") && options[index]) {
    event.preventDefault();
    options[index].click();
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeDisplayList();
  } else if (event.key === "Tab") closeDisplayList();
});

function render(state) {
  current = state;
  const doc = state.document;
  $("decimal-toggle").setAttribute("aria-checked", !!doc.settings.allowDecimals);
  if (document.activeElement !== $("project-name"))
    $("project-name").value = doc.title;
  $("project-name").title = state.projectPath || "Prosjektnavn";
  document.title = `${doc.title} – Musikkvideouka`;
  $("undo").disabled = !state.canUndo;
  $("redo").disabled = !state.canRedo;
  $("undo").title =
    `Angre${state.undoLabel ? ": " + state.undoLabel : ""} (Ctrl+Z)`;
  $("redo").title =
    `Gjør om${state.redoLabel ? ": " + state.redoLabel : ""} (Ctrl+Y)`;
  $("save-status").classList.toggle("error", !!state.saveError);
  $("save-status").innerHTML = icon(state.saveError ? "info" : "check");
  const status = document.createElement("span");
  status.textContent = state.saveError
    ? "Lagring feilet"
    : state.saving
      ? "Lagrer …"
      : state.projectPath
        ? "Lagret"
        : "Lagret lokalt";
  $("save-status").append(status);
  $("save-error").hidden = !state.saveError;
  $("save-error").textContent = state.saveError
    ? `${state.saveError} Velg File → Lagre som for å prøve en annen mappe.`
    : "";
  $("empty-state").hidden = doc.groups.length > 0;
  $("add-group").disabled = doc.groups.length >= 48;
  for (const [id, row] of rows)
    if (!doc.groups.some((g) => g.id === id)) {
      row.remove();
      rows.delete(id);
      scoreEditors.delete(row.querySelector(".points-input"));
      scoreEditors.delete(row.querySelector(".points-adjustment"));
    }
  doc.groups.forEach((group, index) => {
    let row = rows.get(group.id);
    if (!row) {
      row = createRow(group);
      rows.set(group.id, row);
    }
    if ($("groups").children[index] !== row)
      $("groups").insertBefore(row, $("groups").children[index] || null);
    row.querySelector(".group-index").textContent = index + 1;
    const name = row.querySelector(".group-name"),
      points = row.querySelector(".points-input");
    if (document.activeElement !== name) name.value = group.name;
    if (document.activeElement !== points && points.dataset.draft !== "true")
      showScoreValue(points, group.points);
    name.placeholder = `Gruppenavn ${index + 1}`;
    name.setAttribute("aria-label", `Navn på gruppe ${index + 1}`);
    points.setAttribute(
      "aria-label",
      `Poeng for ${group.name || "gruppe " + (index + 1)}`,
    );
    row.querySelector(".points-adjustment").setAttribute("aria-label", `Endre poeng for ${group.name || "gruppe " + (index + 1)}`);
    row
      .querySelector(".group-avatar")
      .setAttribute(
        "aria-label",
        `Velg bilde for ${group.name || "gruppe " + (index + 1)}`,
      );
    row
      .querySelector(".delete-group")
      .setAttribute(
        "aria-label",
        `Slett ${group.name || "gruppe " + (index + 1)}`,
      );
    const avatar = row.querySelector(".avatar-content");
    const still = !doc.settings.motion || reducedImageMotion.matches;
    const imageKey = (still && group.imageStill) || group.image || "";
    const imageUrl = (still && group.imageStillUrl) || group.imageUrl;
    if (avatar.dataset.image !== imageKey) {
      if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = "";
        avatar.replaceChildren(image);
      } else avatar.innerHTML = icon("image");
      avatar.dataset.image = imageKey;
    }
  });
  const signature = JSON.stringify(state.displays);
  if (displayList.dataset.displays !== signature) {
    closeDisplayList(displayList.contains(document.activeElement));
    displayList.replaceChildren(
      ...[...state.displays]
        .sort((a, b) => !!b.current - !!a.current)
        .map((display) => {
          const option = document.createElement("div");
          option.setAttribute("role", "option");
          option.tabIndex = -1;
          option.dataset.id = display.id;
          option.innerHTML = icon(display.current ? "screen" : "fullscreen");
          option.append(displayChoice(display));
          return option;
        }),
    );
    // Keep a screen the operator picked; otherwise prefer a newly connected external screen.
    const selected =
      state.displays.find((d) => d.id === selectedDisplay && (displayPickedByUser || !d.current)) ||
      state.displays.find((d) => !d.current) ||
      state.displays[0];
    chooseDisplay(selected?.id ?? null);
    displayList.dataset.displays = signature;
  }
  $("display-help").textContent = state.isBrowser
    ? "Flytt publikumsvinduet til riktig skjerm og velg Fullskjerm."
    : state.displays.length > 1
      ? "Vinduet kan dras over til en annen skjerm. Fullskjerm åpnes direkte på den valgte skjermen."
      : "Én skjerm tilkoblet. Publikum åpnes i et eget vindu.";
  $("start-show").hidden = state.presentation.running;
  $("stop-show").hidden = !state.presentation.running;
  $("presentation-modes").hidden = !state.presentation.running;
  const finale = state.presentation.mode === "winner";
  $("finish-show").hidden = finale;
  $("finish-show").disabled = !doc.groups.some((group) => group.name.trim());
  $("back-to-board").hidden = !finale;
  displayPicker.disabled = state.presentation.running || !state.displays.length;
  if (displayPicker.disabled) closeDisplayList(false);
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle(
      "selected",
      button.dataset.mode === state.presentation.mode,
    );
    button.setAttribute(
      "aria-pressed",
      button.dataset.mode === state.presentation.mode,
    );
  });
  sendPreview();
}
function sendPreview() {
  if (current)
    $("preview").contentWindow?.postMessage(
      { type: "musikk-preview", state: current },
      "*",
    );
}
$("preview").onload = sendPreview;
reducedImageMotion.addEventListener("change", () => {
  if (current) render(current);
});
$("add-group").onclick = () => command("add-group");
$("undo").onclick = () => command("undo");
$("redo").onclick = () => command("redo");
$("start-show").onclick = () =>
  command("start-presentation", { displayId: selectedDisplay });
$("stop-show").onclick = () => command("stop-presentation");
let finishing = false;
$("finish-show").onclick = async () => {
  if (finishing) return;
  finishing = true;
  try {
    if (await prepareProjectChange())
      await command("presentation-mode", { mode: "winner" });
  } finally {
    finishing = false;
  }
};
$("back-to-board").onclick = () =>
  command("presentation-mode", { mode: "scoreboard" });
document.querySelectorAll("[data-mode]").forEach((button) => {
  button.onclick = () =>
    command("presentation-mode", { mode: button.dataset.mode });
});
document.querySelectorAll("[data-command]").forEach((button) => {
  button.onclick = () => {
    $("browser-file-menu").open = false;
    action(button.dataset.command);
  };
});
document.querySelectorAll("[data-action]").forEach((button) => {
  button.onclick = () => {
    $("browser-file-menu").open = false;
    action(button.dataset.action);
  };
});
$("cancel-new-project").onclick = () => $("new-project-dialog").close();
$("new-project-form").onsubmit = async (event) => {
  event.preventDefault();
  const input = $("new-project-name"),
    title = input.value.trim();
  input.setCustomValidity(title ? "" : "Skriv inn et prosjektnavn.");
  if (!input.reportValidity()) return;
  if (await command("new", { title })) $("new-project-dialog").close();
};
$("new-project-name").oninput = () =>
  $("new-project-name").setCustomValidity("");
let titleEdit = crypto.randomUUID();
$("project-name").onfocus = () => {
  titleEdit = crypto.randomUUID();
};
$("project-name").oninput = () => {
  const title = $("project-name").value.trim();
  if (title)
    command("title", {
      title,
      subtitle: current.document.subtitle,
      editId: titleEdit,
    });
};
$("project-name").onblur = () => {
  $("project-name").value = current.document.title;
};
$("project-name").onkeydown = (event) => {
  if (event.key === "Enter") $("project-name").blur();
};
addEventListener("musikk-action", (event) => action(event.detail));
addEventListener("musikk-notice", (event) => toast(event.detail));
document.addEventListener("keydown", (event) => {
  if (
    !(event.ctrlKey || event.metaKey) ||
    event.altKey ||
    event.repeat ||
    document.querySelector("dialog[open]")
  )
    return;
  const key = event.key.toLowerCase();
  if (key !== "z" && key !== "y") return;
  const field = event.target.closest?.(
    'input,textarea,[contenteditable="true"]',
  );
  if (field && !field.matches(".points-input,.points-adjustment")) return;
  event.preventDefault();
  const editor = field
    ? scoreEditors.get(field)
    : null;
  if (field?.dataset.draft === "true" && !editor.busy()) {
    editor.cancel();
    field.blur();
    return;
  }
  field?.blur();
  command(key === "y" || event.shiftKey ? "redo" : "undo");
});
if (api) {
  api.onAction?.(action);
  api.onState(render);
  api
    .getState()
    .then(render)
    .catch((error) => toast(error.message));
} else toast("Start programmet med npm start.");
