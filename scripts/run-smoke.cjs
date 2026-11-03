const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const electron = require("electron");
const child = spawn(
  electron,
  [path.join(__dirname, "..", "tests", "app-smoke.cjs")],
  { env, windowsHide: true, stdio: "inherit" },
);
child.on("exit", (code) => {
  if (code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }
  const report = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "test-results", "smoke-report.json"),
      "utf8",
    ),
  );
  const backup = path.join(
    __dirname,
    "..",
    "test-results",
    "smoke-project.mvuka.bak",
  );
  fs.rmSync(backup, { force: true });
  fs.mkdirSync(backup);
  const resumed = spawn(
    electron,
    [path.join(__dirname, "..", "tests", "app-smoke.cjs")],
    {
      env: { ...env, MVUKA_SMOKE_RESUME: report.userData },
      windowsHide: true,
      stdio: "inherit",
    },
  );
  resumed.on("exit", (exitCode) => {
    process.exitCode = exitCode ?? 1;
  });
  resumed.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
});
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
