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
