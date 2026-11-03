const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("musikk", {
  onAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on("project-action", listener);
    return () => ipcRenderer.removeListener("project-action", listener);
  },
  getState: () => ipcRenderer.invoke("project:get"),
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
