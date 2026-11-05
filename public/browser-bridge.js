// Browser-only adapter. Electron continues using its isolated preload bridge.
(() => {
  if (window.musikk || !["http:", "https:"].includes(location.protocol)) return;
  const isControl = !location.pathname.includes("publikum");
  const listeners = new Set();
  let events = null,
    audience = null,
    observedAudience = false;

  function notice(message) {
    window.dispatchEvent(new CustomEvent("musikk-notice", { detail: message }));
  }
  async function send(action, payload) {
    const response = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok)
      throw new Error(result.error || "Handlingen kunne ikke fullføres.");
    if (result.notice) notice(result.notice);
  }
  function pick(accept) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.hidden = true;
      document.body.append(input);
      input.onchange = () => {
        const file = input.files[0] || null;
        input.remove();
        resolve(file);
      };
      input.oncancel = () => {
        input.remove();
        resolve(null);
      };
      input.click();
    });
  }
  function base64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("Filen kunne ikke leses."));
      reader.readAsDataURL(file);
    });
  }
  async function imageCopy(file) {
    if (file.size > 12 * 1024 * 1024)
      throw new Error("Bildet er for stort. Maksimalt 12 MB.");
    return base64(file);
  }
  async function download(template = false) {
    const response = await fetch(template ? "/api/excel-template" : "/api/project");
    if (!response.ok)
      throw new Error(
        template
          ? "Excel-malen kunne ikke lastes ned. Prøv igjen."
          : "Prosjektfilen kunne ikke lastes ned. Kontroller lagringsmeldingen.",
      );
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const encodedName = response.headers
      .get("Content-Disposition")
      ?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
    link.download = encodedName
      ? decodeURIComponent(encodedName)
      : template
        ? "Musikkvideouka-mal.xlsx"
        : "Musikkvideouka.mvuka";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    notice(
      template
        ? "Excel-malen er lastet ned."
        : "Prosjektfilen er lastet ned. Arbeidskopien fortsetter å lagres automatisk lokalt.",
    );
  }

  window.musikk = {
    isBrowser: true,
    getState: async () => {
      const response = await fetch("/api/state");
      if (!response.ok)
        throw new Error(
          "Ingen forbindelse til den lokale serveren. Start den med npm run start:browser.",
        );
      return response.json();
    },
    onState: (callback) => {
      listeners.add(callback);
      if (!events) {
        events = new EventSource("/api/events");
        events.onmessage = (event) => {
          const state = JSON.parse(event.data);
          for (const listener of listeners) listener(state);
          if (isControl && document.getElementById("browser-status"))
            document.getElementById("browser-status").textContent =
              "NETTLESERTEST";
        };
        events.onerror = () => {
          if (isControl && document.getElementById("browser-status"))
            document.getElementById("browser-status").textContent =
              "SERVER FRAKOBLET";
        };
      }
      return () => {
        listeners.delete(callback);
        if (!listeners.size) {
          events.close();
          events = null;
        }
      };
    },
    command: async (action, payload) => {
      if (!isControl)
        throw new Error("Publikumsvisningen kan bare vise resultater.");
      switch (action) {
        case "open": {
          const file = await pick(".mvuka,.bak");
          if (!file) return;
          if (file.size > 256 * 1024 * 1024)
            throw new Error("Prosjektfilen er for stor (maksimalt 256 MB).");
          return send("open", { name: file.name, bytes: await base64(file) });
        }
        case "save":
        case "save-as":
          return download();
        case "download-excel-template":
          return download(true);
        case "image": {
          const file = await pick("image/*,.jfif,.jpe,.avif,.tif,.tiff,.svg");
          if (file)
            await send("image", {
              id: payload.id,
              bytes: await imageCopy(file),
            });
          return;
        }
        case "import": {
          const file = await pick(".xlsx");
          if (!file) return;
          if (file.size > 20 * 1024 * 1024)
            throw new Error("Excel-filen er for stor (maksimalt 20 MB).");
          if (
            !confirm(
              "Importer grupper fra Excel? Gruppene i arbeidskopien erstattes. Du kan angre importen med Ctrl+Z.",
            )
          )
            return;
          return send("import", { bytes: await base64(file) });
        }
        case "new":
          return send("new", payload);
        case "start-presentation": {
          // Must open synchronously from the click, before awaiting a network request.
          audience = window.open(
            "/publikum",
            "musikkvideouka-publikum",
            "popup,width=1280,height=720",
          );
          if (!audience)
            throw new Error(
              "Nettleseren blokkerte vinduet. Tillat sprettoppvinduer for denne lokale siden, eller åpne /publikum i et eget vindu.",
            );
          observedAudience = true;
          try {
            await send(action);
          } catch (error) {
            audience.close();
            observedAudience = false;
            throw error;
          }
          return;
        }
        case "stop-presentation":
          if (audience && !audience.closed) audience.close();
          else {
            const previous = window.open("", "musikkvideouka-publikum");
            previous?.close();
          }
          observedAudience = false;
          return send(action);
        default:
          return send(action, payload);
      }
    },
  };

  if (isControl) {
    document.getElementById("browser-file-menu").hidden = false;
    const banner = document.createElement("div");
    banner.className = "browser-test-note";
    banner.innerHTML =
      '<strong id="browser-status">NETTLESERTEST</strong><span>Arbeidskopien lagres automatisk på denne maskinen. Bruk «Last ned prosjekt» for å ta med en .mvuka-fil.</span>';
    document.querySelector(".workspace").prepend(banner);
    document
      .querySelectorAll('[data-command="save"], [data-command="save-as"]')
      .forEach((button) => {
        button.firstChild.textContent = "Last ned prosjekt";
        button.title =
          "Last ned en komplett .mvuka-fil med bilder og historikk";
      });
    setInterval(() => {
      if (observedAudience && audience?.closed) {
        observedAudience = false;
        send("stop-presentation").catch(() => {});
      }
    }, 500);
    addEventListener("keydown", (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.repeat)
        return;
      const action = { s: "save", o: "open", n: "new" }[
        event.key.toLowerCase()
      ];
      if (!action) return;
      event.preventDefault();
      if (action === "new") {
        window.dispatchEvent(
          new CustomEvent("musikk-action", { detail: "new" }),
        );
        return;
      }
      window.musikk.command(action).catch((error) => notice(error.message));
    });
  }
})();
