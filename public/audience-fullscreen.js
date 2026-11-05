(() => {
  if (new URLSearchParams(location.search).has("preview")) return;
  const button = document.getElementById("audience-fullscreen");
  const desktop = typeof window.musikk?.getFullscreen === "function";
  let fullscreen = !!document.fullscreenElement;
  const update = (value = fullscreen) => {
    fullscreen = value;
    button.hidden = fullscreen || document.body.classList.contains("blackout");
  };
  if (desktop) {
    window.musikk.onFullscreen(update);
    window.musikk.getFullscreen().then(update).catch(() => update(false));
  } else {
    document.addEventListener("fullscreenchange", () => update(!!document.fullscreenElement));
    update();
  }
  new MutationObserver(() => update()).observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  button.onclick = async () => {
    button.disabled = true;
    try {
      if (desktop) update(await window.musikk.toggleFullscreen());
      else await document.documentElement.requestFullscreen();
    } catch (error) {
      button.title = `Fullskjerm kunne ikke åpnes: ${error.message}. Prøv igjen eller bruk F11.`;
    } finally {
      button.disabled = false;
    }
  };
})();
