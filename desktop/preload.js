const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("musikk", {
  onAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on("project-action", listener);
    return () => ipcRenderer.removeListener("project-action", listener);
  },
  getState: () => ipcRenderer.invoke("project:get"),
  getFullscreen: () => ipcRenderer.invoke("audience:fullscreen", "get"),
  toggleFullscreen: () => ipcRenderer.invoke("audience:fullscreen", "toggle"),
  onFullscreen: (callback) => {
    const listener = (_event, fullscreen) => callback(fullscreen);
    ipcRenderer.on("audience:fullscreen", listener);
    return () => ipcRenderer.removeListener("audience:fullscreen", listener);
  },
  command: async (action, payload) => {
    const result = await ipcRenderer.invoke("project:command", action, payload);
    if (!result.ok) throw new Error(result.error);
  },
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("project-state", listener);
    return () => ipcRenderer.removeListener("project-state", listener);
  },
});
