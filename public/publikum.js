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

function rowFor(group, still) {
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
  const imageKey = (still && group.imageStill) || group.image || "";
  const imageUrl = (still && group.imageStillUrl) || group.imageUrl;
  if (avatar.dataset.image !== imageKey) {
    avatar.replaceChildren();
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = "";
      avatar.append(image);
    } else
      avatar.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m21 16-6-6L3 21"/></svg>';
    avatar.dataset.image = imageKey;
  }
  row.querySelector(".stage-name").textContent = group.name;
  return row;
}

function ranked(groups) {
  // Stable tie order is the original group order, independent of animation timing.
  return [...groups].sort((a, b) => b.points - a.points);
}

function showPoints(row, value) {
  const element = row.querySelector(".stage-points");
  element.textContent = formatScore(value);
  row.querySelector(".stage-points-wrap").style.setProperty("--score-space", `${Math.ceil(element.offsetWidth * 0.35)}px`);
}

function layout(doc, animate, token) {
  const list = ranked(doc.groups);
  const count = list.length;
  const minimumGap = count > 20 ? 4 : count > 12 ? 7 : 11;
  const leaderExtra = 0.24;
  const maxRowHeight = 144;
  const heightFor = (gap) => Math.min(
    maxRowHeight,
    (board.clientHeight - gap * Math.max(0, count - 1)) /
      Math.max(1, count + leaderExtra),
  );
  // Fill the board from about five teams upwards. With fewer teams, cap their
  // size and leave space below. Larger rows need more room for the leader's photo.
  const gap = Math.max(minimumGap, Math.ceil(heightFor(minimumGap) * 0.15 + 2));
  const rowHeight = heightFor(gap);
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
    const row = rowFor(group, !doc.settings.motion || reducedMotion.matches);
    const height = rowHeight * (index === 0 ? 1 + leaderExtra : 1);
    const old = oldRects.get(group.id);
    row.style.setProperty("--row-h", `${height}px`);
    row.style.left = "0px";
    row.style.top = `${y}px`;
    row.style.width = `${width}px`;
    showPoints(row, group.points);
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
        { duration: 850, easing: "cubic-bezier(.22,1,.36,1)" },
      );
      animations.push(animation.finished.catch(() => {}));
    }
    y += height + gap;
  });
  return Promise.all(animations).then(() => token === epoch);
}

function headings(doc) {
  const title = document.getElementById("stage-title");
  title.textContent = doc.title;
  title.style.fontSize = "";
  if (title.scrollWidth > title.clientWidth)
    title.style.fontSize = `${Math.max(18, 27 * title.clientWidth / title.scrollWidth)}px`;
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
  const highlights = [];
  const effects = [];
  const emphasized = { transform: "scale(1.35)", color: "#ffdb60" };
  try {
    if (motion && changes.length) {
      for (const group of changes) {
        const row = nodes.get(group.id);
        const element = row.querySelector(".stage-points");
        row.classList.add("score-changing");
        const normal = { transform: "scale(1)", color: getComputedStyle(element).color };
        showPoints(row, group.points);
        const grow = element.animate([normal, emphasized], {
          duration: 380,
          easing: "cubic-bezier(.22,1,.36,1)",
          fill: "forwards",
        });
        highlights.push({ row, element, normal, grow });
        effects.push(grow);
      }
      await Promise.all(effects.map((animation) => animation.finished.catch(() => {})));
      if (token !== epoch) return;
      await wait(220);
      if (token !== epoch) return;
    }

    // The grow effect holds its final frame until the row has landed.
    await layout(doc, motion && !!displayed, token);
    if (token !== epoch) return;
    if (highlights.length) {
      await wait(160);
      if (token !== epoch) return;
      const settling = highlights.map(({ element, normal, grow }) => {
        const animation = element.animate([emphasized, normal], {
          duration: 480,
          easing: "cubic-bezier(.4,0,.2,1)",
          fill: "forwards",
        });
        effects.push(animation);
        grow.cancel();
        return animation.finished.catch(() => {});
      });
      await Promise.all(settling);
    }
    if (token === epoch) displayed = doc;
  } finally {
    effects.forEach((animation) => animation.cancel());
    highlights.forEach(({ row }) => row.classList.remove("score-changing"));
  }
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
    groups: doc.groups.map(({ id, name, points, image, imageStill }) => ({
      id,
      name,
      points,
      image,
      imageStill,
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
  // Finish the current reveal, then show the latest total rather than building a long backlog.
  pending = [doc];
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
