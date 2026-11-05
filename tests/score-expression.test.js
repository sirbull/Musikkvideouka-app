const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calculateScore } = require("../desktop/score-expression.cjs");
const { Project } = require("../desktop/project.cjs");

test("score expressions accept totals, relative adjustments and normal operator precedence", () => {
  for (const [input, current, expected] of [
    ["23-5", 23, 18],
    ["+1", 23, 24],
    ["-5", 23, 18],
    ["17", 23, 17],
    ["23 + 5 * 2", 23, 33],
    ["(23-5)*2", 23, 36],
    ["*2", 23, 46],
    ["/2", 24, 12],
    ["=-5", 23, -5],
    ["=+1", 23, 1],
    ["0", 23, 0],
    ["-5", -3, -8],
    ["23−5", 23, 18],
    ["3×4", 0, 12],
    ["24÷2", 0, 12],
    ["3,5*2", 0, 7],
    ["1.5+0.5", 0, 2],
    ["+1+2", 23, 26],
    ["2*-3", 0, -6],
    ["2*(3+4)", 0, 14],
    ["= -0", 0, 0],
    ["(0.1+0.2)*10", 0, 3],
  ])
    assert.equal(calculateScore(input, current), expected, input);
});

test("invalid, fractional, out-of-range or executable expressions are rejected", () => {
  for (const expression of [
    "",
    " ",
    "+",
    "23-",
    "23+",
    "1/0",
    "1/(2-2)",
    "3/2",
    "0,0000001",
    "1.0000001",
    "1000000",
    "=-1000000",
    "999999*999999*999999",
    "NaN",
    "Infinity",
    "2**3",
    "Math.round(1)",
    "process.exit()",
    "globalThis.x=1",
    "alert(1)",
    "(2+3",
    "2+3)",
    "12 34",
    "1;2",
    "2(3)",
    "2e3",
    "(",
    "=",
  ])
    assert.throws(() => calculateScore(expression, 23), undefined, expression);
  assert.throws(() => calculateScore("1".repeat(121), 0));
  assert.throws(() => calculateScore("(".repeat(25) + "1" + ")".repeat(25), 0));
});

test("each relative calculation uses the current score, saves one undo step and survives reopening", async () => {
  const project = Project.create("Show");
  const id = project.document.groups[0].id;
  project.apply("set-points", { id, points: 23 });
  const start = project.past.length;
  project.apply("calculate-points", { id, expression: "23-5" });
  assert.equal(project.document.groups[0].points, 18);
  assert.equal(project.past.length, start + 1);
  project.apply("calculate-points", { id, expression: "+1" });
  project.apply("calculate-points", { id, expression: "+1" });
  assert.equal(project.document.groups[0].points, 20);
  const before = structuredClone(project.document),
    historyLength = project.past.length;
  assert.throws(() =>
    project.apply("calculate-points", { id, expression: "1/0" }),
  );
  assert.deepEqual(project.document, before);
  assert.equal(project.past.length, historyLength);
  const restored = Project.decode(await project.encode());
  restored.undo();
  assert.equal(restored.document.groups[0].points, 19);
  restored.redo();
  assert.equal(restored.document.groups[0].points, 20);
});

test("adjustment input adds bare values and expressions, while operators use the current total", () => {
  const adjustment = { adjustment: true };
  for (const [expression, expected] of [["5", 28], ["+5", 28], ["-5", 18], ["*2", 46], ["2+3", 28], ["(2+3)*2", 33]])
    assert.equal(calculateScore(expression, 23, adjustment), expected);
  assert.equal(calculateScore("/2", 24, adjustment), 12);
  assert.throws(() => calculateScore("/2", 23, adjustment), /helt antall/);
  assert.equal(calculateScore("/2", 23, { adjustment: true, allowDecimals: true }), 11.5);
});

test("optional decimal scores accept commas and dots, stabilise floating point and keep small values usable", () => {
  const decimals = { allowDecimals: true };
  for (const [expression, current, expected] of [
    ["/2", 5, 2.5], ["*2", 2.5, 5], ["+0,1", 0.2, 0.3], ["-3", 2.5, -0.5],
    ["1/3", 0, 0.333333], ["*2", 0.000001, 0.000002], ["=-0,25", 9, -0.25],
  ]) assert.equal(calculateScore(expression, current, decimals), expected);
  for (const expression of ["1/0", "Infinity", "1000000", "=-1000000", "process.exit()"])
    assert.throws(() => calculateScore(expression, 2.5, decimals));
});

test("decimal mode persists with scores and history, and disabling it never rounds existing totals", async () => {
  const project = Project.create("Desimaler");
  const id = project.document.groups[0].id;
  assert.equal(project.document.settings.allowDecimals, false);
  project.apply("set-points", { id, points: 5 });
  assert.throws(() => project.apply("adjust-points", { id, expression: "/2" }));
  project.apply("decimals", { enabled: true });
  project.apply("adjust-points", { id, expression: "/2" });
  assert.equal(project.document.groups[0].points, 2.5);
  const before = structuredClone(project.document);
  assert.throws(() => project.apply("decimals", { enabled: false }), /inneholder desimalpoeng/);
  assert.deepEqual(project.document, before);
  const reopened = Project.decode(await project.encode());
  assert.equal(reopened.document.settings.allowDecimals, true);
  assert.equal(reopened.document.groups[0].points, 2.5);
  reopened.undo();
  assert.equal(reopened.document.groups[0].points, 5);
  reopened.redo();
  assert.equal(reopened.document.groups[0].points, 2.5);
  reopened.apply("adjust-points", { id, expression: "*2" });
  reopened.apply("decimals", { enabled: false });
  assert.equal(reopened.document.groups[0].points, 5);
  assert.equal(reopened.document.settings.allowDecimals, false);
  assert.equal(Project.decode(await reopened.encode()).document.settings.allowDecimals, false);
});
