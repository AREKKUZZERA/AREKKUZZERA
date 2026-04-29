import puppeteer from "puppeteer";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const TEMPLATE = path.join(ROOT, "scripts", "sc-insights-template.html");
const WIDTH = 960;
const HEIGHT = 586;
const MAX_BAR_PX = 280;
const FETCH_TIMEOUT_MS = 15_000;

function fail(message, error) {
  console.error(`Error: ${message}`);
  if (error) console.error(error);
  process.exit(1);
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function formatNumber(value) {
  return numberOrZero(value).toLocaleString("en-US");
}

function formatAxis(value) {
  const number = numberOrZero(value);
  if (number >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(number % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (number >= 1_000) return `${Math.round(number / 1_000)}K`;
  return String(number);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function niceMax(value) {
  const number = Math.max(numberOrZero(value), 1);
  const magnitude = 10 ** Math.floor(Math.log10(number));
  const normalized = number / magnitude;
  const rounded = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  return rounded * magnitude;
}

function replaceAllPlaceholders(template, values) {
  return Object.entries(values).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, String(value)),
    template
  );
}

async function fetchDashboardData() {
  const apiUrl = process.env.DASHBOARD_API_URL?.trim();
  if (!apiUrl) fail("DASHBOARD_API_URL secret is not set.");

  try {
    new URL(apiUrl);
  } catch {
    fail("DASHBOARD_API_URL is not a valid URL.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    console.log(`Fetching dashboard data from ${apiUrl}`);
    const res = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    if (!res.ok) fail(`API responded with HTTP ${res.status}.`);
    return await res.json();
  } catch (error) {
    fail("Failed to fetch dashboard data.", error);
  } finally {
    clearTimeout(timeout);
  }
}

function buildHtml(template, data) {
  const yearly = Array.isArray(data?.history?.yearly) ? data.history.yearly : [];
  const playsByYear = yearly.map((item) => numberOrZero(item?.plays));
  const maxPlays = Math.max(...playsByYear, 1);
  const yMax = niceMax(maxPlays);
  const yTick = yMax / 5;
  const barsHtml = yearly
    .map((item, index) => {
      const plays = playsByYear[index];
      const height = Math.round((plays / yMax) * MAX_BAR_PX);
      const fill = height > 0 ? `<div class="fill" style="height: ${height}px"></div>` : "";
      return `<div class="bar-col"><div class="bar">${fill}</div><div class="year">${escapeHtml(item?.label)}</div></div>`;
    })
    .join("\n          ");

  return replaceAllPlaceholders(template, {
    TOTAL_PLAYS: formatNumber(data?.playback_count),
    SINCE_YEAR: escapeHtml(data?.sinceYear ?? 2016),
    PLAYS_CHIP: formatNumber(data?.playback_count),
    LIKES: formatNumber(data?.likes),
    COMMENTS: formatNumber(data?.comments),
    REPOSTS: formatNumber(data?.reposts),
    DOWNLOADS: formatNumber(data?.downloads),
    Y_LABEL_0: formatAxis(yMax),
    Y_LABEL_1: formatAxis(yMax - yTick),
    Y_LABEL_2: formatAxis(yMax - 2 * yTick),
    Y_LABEL_3: formatAxis(yMax - 3 * yTick),
    Y_LABEL_4: formatAxis(yMax - 4 * yTick),
    Y_LABEL_5: "0",
    BARS: barsHtml
  });
}

async function render(html) {
  await fs.mkdir(DIST, { recursive: true });

  console.log("Rendering preview");
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts?.ready);

    const pngBuffer = await page.screenshot({
      path: path.join(DIST, "soundcloud-insights.png"),
      fullPage: false,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT }
    });

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <image href="data:image/png;base64,${pngBuffer.toString("base64")}" width="${WIDTH}" height="${HEIGHT}"/>
</svg>`;

    await fs.writeFile(path.join(DIST, "soundcloud-insights.svg"), svgContent, "utf8");
    await fs.copyFile(
      path.join(DIST, "soundcloud-insights.svg"),
      path.join(DIST, "soundcloud-insights-dark.svg")
    );
  } finally {
    await browser.close();
  }
}

const [data, template] = await Promise.all([
  fetchDashboardData(),
  fs.readFile(TEMPLATE, "utf8")
]);

await render(buildHtml(template, data));
console.log("soundcloud-insights.svg written to dist/");
