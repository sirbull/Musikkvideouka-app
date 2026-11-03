const api = window.musikk;
const $ = (id) => document.getElementById(id);
const rows = new Map();
const scoreEditors = new Map();
let current, toastTimer;

function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 6000);
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

function createRow(group) {
  const row = document.createElement("div");
  row.className = "group-row";
  row.dataset.id = group.id;
  row.innerHTML = `<span class="group-index"></span><button class="group-avatar" title="Velg bilde"><span class="avatar-content"></span><span class="photo-hover">${icon("image")}</span></button><input class="group-name" maxlength="100" autocomplete="off"><input class="points-input" type="text" inputmode="text" maxlength="120" autocomplete="off" spellcheck="false"><button class="delete-group" title="Slett gruppe">${icon("trash")}</button>`;
  const name = row.querySelector(".group-name"),
    points = row.querySelector(".points-input");
  let nameEdit = crypto.randomUUID();
  name.onfocus = () => {
    nameEdit = crypto.randomUUID();
  };
  name.oninput = () =>
    command("rename-group", {
      id: group.id,
      name: name.value,
      editId: nameEdit,
    });
  const scoreHint =
    "Skriv en poengsum eller et regnestykke, f.eks. 23-5 eller +1. Enter beregner.";
  let pendingScore = null;
  const savedScore = () =>
    current.document.groups.find((g) => g.id === group.id)?.points ?? 0;
  function cancelScore() {
    if (pendingScore) return;
    points.value = savedScore();
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
        await api.command("calculate-points", { id: group.id, expression });
        const latest = await api.getState().catch(() => current);
        points.value =
          latest.document.groups.find((g) => g.id === group.id)?.points ??
          savedScore();
        delete points.dataset.draft;
        points.removeAttribute("aria-invalid");
        points.title = scoreHint;
        return true;
      } catch (error) {
        const latest = await api.getState().catch(() => current);
        if (latest.saveError) {
          // A disk failure may happen after the score was applied. Never apply a relative expression twice.
          points.value =
            latest.document.groups.find((g) => g.id === group.id)?.points ??
            savedScore();
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
      if (await commitScore()) points.blur();
    }
  };
  name.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      name.blur();
    }
  };
  scoreEditors.set(group.id, {
    commit: commitScore,
    cancel: cancelScore,
    focus: () => points.focus(),
    busy: () => !!pendingScore,
  });
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

function render(state) {
  current = state;
  const doc = state.document;
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
      scoreEditors.delete(id);
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
      points.value = group.points;
    name.placeholder = `Gruppenavn ${index + 1}`;
    name.setAttribute("aria-label", `Navn på gruppe ${index + 1}`);
    points.setAttribute(
      "aria-label",
      `Poeng for ${group.name || "gruppe " + (index + 1)}`,
    );
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
    if (avatar.dataset.image !== (group.image || "")) {
      if (group.imageUrl) {
        const image = document.createElement("img");
        image.src = group.imageUrl;
        image.alt = "";
        avatar.replaceChildren(image);
      } else avatar.innerHTML = icon("image");
      avatar.dataset.image = group.image || "";
    }
  });
  const select = $("display-select"),
    signature = JSON.stringify(state.displays);
  if (select.dataset.displays !== signature) {
    const previous = Number(select.value);
    select.replaceChildren(
      ...state.displays.map((display) => new Option(display.label, display.id)),
    );
    const selected =
      state.displays.find((d) => d.id === previous) ||
      state.displays.find((d) => !d.primary) ||
      state.displays[0];
    if (selected) select.value = selected.id;
    select.dataset.displays = signature;
  }
  $("display-help").textContent = state.isBrowser
    ? "Flytt publikumsvinduet til riktig skjerm og velg Fullskjerm."
    : state.displays.length > 1
      ? ""
      : "Én skjerm tilkoblet. Publikum åpnes i et eget vindu.";
  $("start-show").hidden = state.presentation.running;
  $("stop-show").hidden = !state.presentation.running;
  $("presentation-modes").hidden = !state.presentation.running;
  const finale = state.presentation.mode === "winner";
  $("finish-show").hidden = finale;
  $("finish-show").disabled = !doc.groups.some((group) => group.name.trim());
  $("back-to-board").hidden = !finale;
  select.disabled = state.presentation.running;
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
$("add-group").onclick = () => command("add-group");
$("undo").onclick = () => command("undo");
$("redo").onclick = () => command("redo");
$("start-show").onclick = () =>
  command("start-presentation", {
    displayId: Number($("display-select").value),
  });
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
  if (field && !field.matches(".points-input")) return;
  event.preventDefault();
  const editor = field
    ? scoreEditors.get(field.closest(".group-row").dataset.id)
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
