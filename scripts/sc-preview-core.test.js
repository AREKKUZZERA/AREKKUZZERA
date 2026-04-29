import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHtml,
  escapeHtml,
  formatAxis,
  niceMax,
  numberOrZero
} from "./sc-preview-core.js";

test("normalizes invalid numbers to zero", () => {
  assert.equal(numberOrZero(undefined), 0);
  assert.equal(numberOrZero(-12), 0);
  assert.equal(numberOrZero("42"), 42);
});

test("formats axis labels compactly", () => {
  assert.equal(formatAxis(1500), "2K");
  assert.equal(formatAxis(1_500_000), "1.5M");
  assert.equal(niceMax(319000), 500000);
});

test("escapes API-provided text before inserting HTML", () => {
  assert.equal(escapeHtml("<script>alert('x')</script>"), "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
});

test("builds preview HTML from dashboard payload", () => {
  const template = [
    "{{TOTAL_PLAYS}}",
    "{{SINCE_YEAR}}",
    "{{PLAYS_CHIP}}",
    "{{LIKES}}",
    "{{COMMENTS}}",
    "{{REPOSTS}}",
    "{{DOWNLOADS}}",
    "{{Y_LABEL_0}}",
    "{{Y_LABEL_1}}",
    "{{Y_LABEL_2}}",
    "{{Y_LABEL_3}}",
    "{{Y_LABEL_4}}",
    "{{Y_LABEL_5}}",
    "{{BARS}}"
  ].join("\n");

  const html = buildHtml(template, {
    playback_count: 12345,
    sinceYear: "20<16",
    likes: 10,
    comments: 5,
    reposts: 2,
    downloads: 1,
    history: {
      yearly: [{ label: "20<24", plays: 100 }]
    }
  });

  assert.match(html, /12,345/);
  assert.match(html, /20&lt;16/);
  assert.match(html, /20&lt;24/);
  assert.doesNotMatch(html, /\{\{[A-Z_0-9]+\}\}/);
});

test("fails when the template contains unknown placeholders", () => {
  assert.throws(
    () => buildHtml("{{TOTAL_PLAYS}}\n{{UNKNOWN_PLACEHOLDER}}", { playback_count: 1 }),
    /Unresolved template placeholders: UNKNOWN_PLACEHOLDER/
  );
});
