(() => {
  const grid = document.querySelector(".workspace-grid");
  const divider = document.getElementById("panel-divider");
  const groups = document.getElementById("groups-panel");
  const storageKey = "musikkvideouka.controlSplit.v1";
  const defaultRatio = 0.52;
  let preferredRatio = defaultRatio;
  let activePointer = null,
    grabOffset = 0,
    startRatio = defaultRatio;

  try {
    const stored = localStorage.getItem(storageKey);
    const value = stored === null ? NaN : Number(stored);
    if (Number.isFinite(value) && value > 0 && value < 1)
      preferredRatio = value;
  } catch {
    /* Keep the default if local preferences are unavailable. */
  }

  function bounds() {
    const style = getComputedStyle(grid);
    const available = grid.getBoundingClientRect().width - divider.offsetWidth;
    const minimum = parseFloat(style.getPropertyValue("--min-groups-width"));
    const maximum =
      available - parseFloat(style.getPropertyValue("--min-preview-width"));
    return { available, minimum, maximum };
  }
  function applyRatio(ratio) {
    const { available, minimum, maximum } = bounds();
    if (available <= 0) return;
    const width = Math.max(minimum, Math.min(maximum, available * ratio));
    grid.style.setProperty("--groups-width", `${width}px`);
    const percent = Math.round((width / available) * 100);
    divider.setAttribute(
      "aria-valuemin",
      Math.round((minimum / available) * 100),
    );
    divider.setAttribute(
      "aria-valuemax",
      Math.round((maximum / available) * 100),
    );
    divider.setAttribute("aria-valuenow", percent);
    divider.setAttribute(
      "aria-valuetext",
      `Gruppeliste ${percent} %, forhåndsvisning ${100 - percent} %`,
    );
  }
  function save() {
    try {
      localStorage.setItem(storageKey, String(preferredRatio));
    } catch {}
  }
  function finish(cancelled = false) {
    if (activePointer === null) return;
    const pointer = activePointer;
    activePointer = null;
    document.body.classList.remove("resizing-panels");
    if (divider.hasPointerCapture(pointer))
      divider.releasePointerCapture(pointer);
    if (cancelled) {
      preferredRatio = startRatio;
      applyRatio(preferredRatio);
    } else save();
  }

  divider.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || activePointer !== null) return;
    event.preventDefault();
    divider.focus();
    activePointer = event.pointerId;
    startRatio = preferredRatio;
    grabOffset =
      event.clientX -
      grid.getBoundingClientRect().left -
      groups.getBoundingClientRect().width;
    document.body.classList.add("resizing-panels");
    try {
      divider.setPointerCapture(event.pointerId);
    } catch {}
  });
  divider.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointer) return;
    const { available, minimum, maximum } = bounds();
    if (available <= 0) return;
    const width = Math.max(
      minimum,
      Math.min(
        maximum,
        event.clientX - grid.getBoundingClientRect().left - grabOffset,
      ),
    );
    preferredRatio = width / available;
    applyRatio(preferredRatio);
  });
  divider.addEventListener("pointerup", (event) => {
    if (event.pointerId === activePointer) finish();
  });
  divider.addEventListener("pointercancel", (event) => {
    if (event.pointerId === activePointer) finish(true);
  });
  divider.addEventListener("lostpointercapture", () => finish());
  divider.addEventListener("dblclick", () => {
    preferredRatio = defaultRatio;
    applyRatio(preferredRatio);
    save();
  });
  divider.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activePointer !== null) {
      event.preventDefault();
      finish(true);
      return;
    }
    const { available, minimum, maximum } = bounds();
    if (available <= 0) return;
    const current = groups.getBoundingClientRect().width / available;
    const step = event.shiftKey ? 0.1 : 0.02;
    const ratio = {
      ArrowLeft: current - step,
      ArrowRight: current + step,
      Home: minimum / available,
      End: maximum / available,
      Enter: defaultRatio,
    }[event.key];
    if (ratio === undefined) return;
    event.preventDefault();
    preferredRatio = Math.max(
      minimum / available,
      Math.min(maximum / available, ratio),
    );
    applyRatio(preferredRatio);
    save();
  });
  window.addEventListener("blur", () => finish());
  new ResizeObserver(() => applyRatio(preferredRatio)).observe(grid);
  applyRatio(preferredRatio);
})();
