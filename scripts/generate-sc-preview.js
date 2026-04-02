import puppeteer from "puppeteer";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const TEMPLATE = path.join(ROOT, "scripts", "sc-insights-template.html");

const apiUrl = process.env.DASHBOARD_API_URL?.trim();
if (!apiUrl) {
  console.error("❌  DASHBOARD_API_URL secret is not set.");
  process.exit(1);
}

console.log(`⬇  Fetching dashboard data from ${apiUrl} …`);

const res = await fetch(apiUrl, { headers: { Accept: "application/json" } });
if (!res.ok) {
  console.error(`❌  API responded with HTTP ${res.status}`);
  process.exit(1);
}

const data = await res.json();
console.log(`✅  Got data — ${data.playback_count?.toLocaleString()} total plays`);

const yearly = data.history?.yearly ?? [];

const MAX_BAR_PX = 280;
const maxPlays = Math.max(...yearly.map((y) => y.plays ?? 0), 1);

const bars = yearly.map((y) => ({
  label: y.label,
  height: Math.round(((y.plays ?? 0) / maxPlays) * MAX_BAR_PX)
}));

const template = await fs.readFile(TEMPLATE, "utf8");

function fmt(n) {
  return Number(n ?? 0).toLocaleString("en-US");
}

const totalPlays = data.playback_count ?? 0;
const yMax = Math.ceil(totalPlays / 200000) * 200000;
const yTick = yMax / 5;

function fmtY(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

const yAxisLabels = [
  fmtY(yMax),
  fmtY(yMax - yTick),
  fmtY(yMax - 2 * yTick),
  fmtY(yMax - 3 * yTick),
  fmtY(yMax - 4 * yTick),
  "0"
];

const barsHtml = bars
  .map(({ label, height }) => {
    const fill =
      height > 0
        ? `<div class="fill" style="height: ${height}px"></div>`
        : "";
    return `<div class="bar-col"><div class="bar">${fill}</div><div class="year">${label}</div></div>`;
  })
  .join("\n          ");

const html = template
  .replace("{{TOTAL_PLAYS}}", fmt(totalPlays))
  .replace("{{SINCE_YEAR}}", String(data.sinceYear ?? 2016))
  .replace("{{PLAYS_CHIP}}", fmt(data.playback_count))
  .replace("{{LIKES}}", fmt(data.likes))
  .replace("{{COMMENTS}}", fmt(data.comments))
  .replace("{{REPOSTS}}", fmt(data.reposts))
  .replace("{{DOWNLOADS}}", fmt(data.downloads))
  .replace("{{Y_LABEL_0}}", yAxisLabels[0])
  .replace("{{Y_LABEL_1}}", yAxisLabels[1])
  .replace("{{Y_LABEL_2}}", yAxisLabels[2])
  .replace("{{Y_LABEL_3}}", yAxisLabels[3])
  .replace("{{Y_LABEL_4}}", yAxisLabels[4])
  .replace("{{Y_LABEL_5}}", yAxisLabels[5])
  .replace("{{BARS}}", barsHtml);

await fs.mkdir(DIST, { recursive: true });

console.log("🎨  Launching Puppeteer …");
const browser = await puppeteer.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
});
const page = await browser.newPage();

await page.setViewport({ width: 960, height: 586, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "networkidle0" });

await page.screenshot({
  path: path.join(DIST, "soundcloud-insights.png"),
  fullPage: false,
  clip: { x: 0, y: 0, width: 960, height: 586 }
});

const pngBuffer = await fs.readFile(path.join(DIST, "soundcloud-insights.png"));
const b64 = pngBuffer.toString("base64");

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="960" height="586">
  <image href="data:image/png;base64,${b64}" width="960" height="586"/>
</svg>`;

await fs.writeFile(path.join(DIST, "soundcloud-insights.svg"), svgContent, "utf8");

await fs.copyFile(
  path.join(DIST, "soundcloud-insights.svg"),
  path.join(DIST, "soundcloud-insights-dark.svg")
);

await browser.close();

console.log("✅  soundcloud-insights.svg written to dist/");
