const { spawn } = require("node:child_process");
const path = require("node:path");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [path.resolve(__dirname, "..")], {
  env,
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
  // This child is the app's GUI. SW_HIDE can hide its first native window on Windows.
  windowsHide: false,
});
console.log("Starter Musikkvideouka i et eget programvindu …");
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
