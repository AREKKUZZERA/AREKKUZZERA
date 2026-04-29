export const WIDTH = 1120;
export const HEIGHT = 640;
export const MAX_BAR_PX = 286;
export const FETCH_TIMEOUT_MS = 15_000;

export function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function formatNumber(value) {
  return numberOrZero(value).toLocaleString("en-US");
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function formatAxis(value) {
  const number = numberOrZero(value);
  if (number >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(number % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (number >= 1_000) return `${Math.round(number / 1_000)}K`;
  return String(number);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function niceMax(value) {
  const number = Math.max(numberOrZero(value), 1);
  const magnitude = 10 ** Math.floor(Math.log10(number));
  const normalized = number / magnitude;
  const rounded = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  return rounded * magnitude;
}

export function replaceAllPlaceholders(template, values) {
  const html = Object.entries(values).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, String(value)),
    template
  );
  const unresolved = [...html.matchAll(/\{\{([A-Z_0-9]+)\}\}/g)].map((match) => match[1]);

  if (unresolved.length > 0) {
    throw new Error(`Unresolved template placeholders: ${[...new Set(unresolved)].join(", ")}`);
  }

  return html;
}

export function buildHtml(template, data) {
  const yearly = Array.isArray(data?.history?.yearly) ? data.history.yearly : [];
  const playsByYear = yearly.map((item) => numberOrZero(item?.plays));
  const maxPlays = Math.max(...playsByYear, 1);
  const yMax = niceMax(maxPlays);
  const yTick = yMax / 5;
  const barsHtml = yearly
    .map((item, index) => {
      const plays = playsByYear[index];
      const height = Math.round((plays / yMax) * MAX_BAR_PX);
      const isCurrent = item?.current === true || item?.isCurrent === true || index === yearly.length - 1;
      const bar = height > 0
        ? `<div class="bar ${isCurrent ? "current" : "past"}" style="height: ${height}px"></div>`
        : "";
      return `<div class="bar-col">${bar}<div class="year">${escapeHtml(item?.label)}</div></div>`;
    })
    .join("\n          ");
  const todayPlays = numberOrZero(firstValue(data?.today_plays, data?.todayPlays, data?.daily_plays, data?.dailyPlays));
  const growth = firstValue(data?.growthLabel, data?.growth_label, data?.growth_percent, data?.growthPercent);
  const growthBadge = todayPlays > 0
    ? `(+${formatNumber(todayPlays)} today)`
    : growth
      ? `(${escapeHtml(growth)})`
      : "";

  return replaceAllPlaceholders(template, {
    TOTAL_PLAYS: formatNumber(data?.playback_count),
    SINCE_YEAR: escapeHtml(data?.sinceYear ?? 2016),
    GROWTH_BADGE: growthBadge,
    PLAYS_CHIP: formatNumber(data?.playback_count),
    LIKES: formatNumber(data?.likes),
    COMMENTS: formatNumber(data?.comments),
    REPOSTS: formatNumber(data?.reposts),
    DOWNLOADS: formatNumber(data?.downloads),
    DOWNLOAD_LABEL: numberOrZero(data?.downloads) === 1 ? "download" : "downloads",
    Y_LABEL_0: formatAxis(yMax),
    Y_LABEL_1: formatAxis(yMax - yTick),
    Y_LABEL_2: formatAxis(yMax - 2 * yTick),
    Y_LABEL_3: formatAxis(yMax - 3 * yTick),
    Y_LABEL_4: formatAxis(yMax - 4 * yTick),
    Y_LABEL_5: "0",
    BARS: barsHtml
  });
}
