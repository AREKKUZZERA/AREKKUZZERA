import puppeteer from "puppeteer";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FETCH_TIMEOUT_MS,
  HEIGHT,
  WIDTH,
  buildHtml
} from "./sc-preview-core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const TEMPLATE = path.join(ROOT, "scripts", "sc-insights-template.html");
const MOCK_DATA = path.join(ROOT, "scripts", "mock-sc-data.json");

function fail(message, error) {
  console.error(`Error: ${message}`);
  if (error) console.error(error);
  process.exit(1);
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

async function readMockData() {
  console.log(`Reading mock data from ${MOCK_DATA}`);
  return JSON.parse(await fs.readFile(MOCK_DATA, "utf8"));
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
      omitBackground: true,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT }
    });

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <image href="data:image/png;base64,${pngBuffer.toString("base64")}" width="${WIDTH}" height="${HEIGHT}"/>
</svg>`;

    await fs.writeFile(path.join(DIST, "soundcloud-insights.svg"), svgContent, "utf8");
  } finally {
    await browser.close();
  }
}

const useMockData = process.argv.includes("--mock") || process.env.SC_PREVIEW_MOCK === "1";
const [data, template] = await Promise.all([
  useMockData ? readMockData() : fetchDashboardData(),
  fs.readFile(TEMPLATE, "utf8")
]);

await render(buildHtml(template, data));
console.log("soundcloud-insights.svg written to dist/");
