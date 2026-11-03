const stage = document.getElementById("stage");
const board = document.getElementById("board");
const nodes = new Map();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const preview = new URLSearchParams(location.search).has("preview");
let displayed = null,
  currentId = null,
  signature = null,
  pending = [],
  processing = false,
  epoch = 0,
  latestState = null;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function scaleStage() {
  stage.style.setProperty(
    "--stage-scale",
    Math.min(innerWidth / 1600, innerHeight / 900),
  );
}
addEventListener("resize", scaleStage);
scaleStage();

function rowFor(group) {
  let row = nodes.get(group.id);
  if (!row) {
    row = document.createElement("div");
    row.className = "stage-row";
    row.dataset.id = group.id;
    row.innerHTML =
      '<div class="stage-avatar"></div><span class="stage-name"></span><div class="stage-points-wrap"><span class="stage-points"></span><span class="stage-unit">poeng</span></div>';
    nodes.set(group.id, row);
    board.append(row);
  }
  const avatar = row.querySelector(".stage-avatar");
  if (
    avatar.dataset.image !== (group.image || "") ||
    avatar.dataset.name !== group.name
  ) {
    avatar.replaceChildren();
    if (group.imageUrl) {
      const image = document.createElement("img");
      image.src = group.imageUrl;
      image.alt = "";
      avatar.append(image);
    } else
      avatar.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m21 16-6-6L3 21"/></svg>';
    avatar.dataset.image = group.image || "";
    avatar.dataset.name = group.name;
  }
  row.querySelector(".stage-name").textContent = group.name;
  return row;
}

function ranked(groups) {
  // Stable tie order is the original group order, independent of animation timing.
  return [...groups].sort((a, b) => b.points - a.points);
}

function layout(doc, animate, token) {
  const list = ranked(doc.groups);
  const count = list.length;
  const gap = count > 20 ? 4 : count > 12 ? 7 : 11;
  const leaderExtra = 0.24;
  const rowHeight = Math.min(
    76,
    (board.clientHeight - gap * Math.max(0, count - 1)) /
      Math.max(1, count + leaderExtra),
  );
  const width = board.clientWidth;
  const oldRects = new Map();
  // offset positions are in unscaled stage pixels, so the same motion works inside the preview.
  for (const [id, row] of nodes)
    oldRects.set(id, {
      x: row.offsetLeft,
      y: row.offsetTop,
      height: row.offsetHeight,
    });
  for (const [id, row] of nodes)
    if (!doc.groups.some((g) => g.id === id)) {
      row.remove();
      nodes.delete(id);
    }
  const animations = [];
  let y = 0;
  list.forEach((group, index) => {
    const row = rowFor(group);
    const height = rowHeight * (index === 0 ? 1 + leaderExtra : 1);
    const old = oldRects.get(group.id);
    row.style.setProperty("--row-h", `${height}px`);
    row.style.left = "0px";
    row.style.top = `${y}px`;
    row.style.width = `${width}px`;
    row.querySelector(".stage-points").textContent = group.points;
    row.classList.toggle("leader", index === 0);
    const medal = ["gold", "silver", "bronze"][index];
    if (medal) row.dataset.medal = medal;
    else delete row.dataset.medal;
    row.style.zIndex = String(count - index);
    if (animate && old && (old.y !== y || Math.abs(old.height - height) > 1)) {
      const animation = row.animate(
        [
          {
            transform: `translate(${old.x}px, ${old.y - y}px) scaleY(${old.height / height})`,
          },
          { transform: "translate(0,0) scaleY(1)" },
        ],
        { duration: 680, easing: "cubic-bezier(.22,1,.36,1)" },
      );
      animations.push(animation.finished.catch(() => {}));
    }
    y += height + gap;
  });
  return Promise.all(animations).then(() => token === epoch);
}

function headings(doc) {
  document.getElementById("stage-title").textContent = doc.title;
  document.getElementById("pause-title").textContent = doc.title;
  stage.classList.toggle(
    "no-motion",
    !doc.settings.motion || reducedMotion.matches,
  );
}

async function transition(doc, token) {
  headings(doc);
  const motion = doc.settings.motion && !reducedMotion.matches;
  const changes = displayed
    ? doc.groups.filter((g) => {
        const old = displayed.groups.find((o) => o.id === g.id);
        return old && old.points !== g.points && nodes.has(g.id);
      })
    : [];
  if (motion && changes.length) {
    await Promise.all(
      changes.map((group) => {
        const element = nodes.get(group.id).querySelector(".stage-points");
        element.textContent = group.points;
        return element
          .animate(
            [
              { transform: "scale(1)", color: "#eff6ff", offset: 0 },
              { transform: "scale(1.16)", color: "#ffdb75", offset: 0.42 },
              { transform: "scale(1)", color: "#ffdb75", offset: 1 },
            ],
            {
              duration: 460,
              easing: "cubic-bezier(.4,0,.2,1)",
              fill: "forwards",
            },
          )
          .finished.catch(() => {});
      }),
    );
    await wait(240);
    if (token !== epoch) return;
  }
  const move = layout(doc, motion && !!displayed, token);
  if (motion)
    for (const group of changes) {
      const element = nodes.get(group.id)?.querySelector(".stage-points");
      if (!element) continue;
      element.getAnimations().forEach((animation) => animation.cancel());
      element.animate([{ color: "#ffdb75" }, { color: "#eff6ff" }], {
        duration: 650,
        easing: "ease-out",
      });
    }
  await move;
  if (token === epoch) displayed = doc;
}

async function drain() {
  if (processing) return;
  processing = true;
  try {
    while (pending.length) {
      const doc = pending.shift();
      await transition(doc, epoch);
    }
  } finally {
    processing = false;
  }
}

function receive(state) {
  latestState = state;
  const doc = {
    ...state.document,
    groups: state.document.groups.filter((group) => group.name.trim()),
  };
  document.body.classList.toggle(
    "blackout",
    state.presentation.mode === "black",
  );
  document.getElementById("pause-overlay").hidden =
    state.presentation.mode !== "pause";
  document.getElementById("black-overlay").hidden =
    state.presentation.mode !== "black";
  window.winnerFinale.render(
    doc,
    state.presentation.mode === "winner",
    doc.settings.motion && !reducedMotion.matches,
  );
  // Save-status broadcasts must never restart or replay score animations.
  const nextSignature = JSON.stringify({
    id: doc.id,
    reducedMotion: reducedMotion.matches,
    title: doc.title,
    subtitle: doc.subtitle,
    settings: doc.settings,
    groups: doc.groups.map(({ id, name, points, image }) => ({
      id,
      name,
      points,
      image,
    })),
  });
  if (nextSignature === signature) return;
  signature = nextSignature;
  if (currentId !== doc.id || !doc.settings.motion || reducedMotion.matches) {
    epoch++;
    pending = [];
    for (const row of nodes.values()) {
      row.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      row.remove();
    }
    nodes.clear();
    currentId = doc.id;
    displayed = null;
    headings(doc);
    layout(doc, false, epoch);
    displayed = doc;
    return;
  }
  pending.push(doc);
  drain();
}

reducedMotion.addEventListener("change", () => {
  if (latestState) receive(latestState);
});

if (preview) {
  addEventListener("message", (event) => {
    if (event.source === window.parent && event.data?.type === "musikk-preview")
      receive(event.data.state);
  });
} else if (window.musikk) {
  window.musikk.onState(receive);
  window.musikk.getState().then(receive);
}
