// Draws the profile README cards (stats and top languages) as SVG, in light
// and dark versions, from public GitHub data. No dependencies.
// Usage: node scripts/cards.mjs [username] [outDir]
// Set GITHUB_TOKEN to raise the API rate limit (the workflow does this).
import { mkdir, writeFile } from "node:fs/promises";

const USER = process.argv[2] || "IsmailT04";
const OUT = process.argv[3] || "out";
const SKIP_LANGS = new Set(["HTML", "CSS", "SCSS", "Makefile", "Dockerfile", "Shell", "PowerShell", "Batchfile"]);
const SKIP_REPOS = new Set([USER, `${USER}.github.io`]);

const LANG_COLORS = {
  Go: "#00ADD8", Java: "#b07219", "C#": "#178600", C: "#7a7a7a", TypeScript: "#3178c6",
  JavaScript: "#f1e05a", Python: "#3572A5", Kotlin: "#A97BFF", Yacc: "#4B6C4B", Lex: "#DBCA00",
  Assembly: "#6E4C13", "C++": "#f34b7d", Rust: "#dea584", SQL: "#e38c00", Dart: "#00B4AB",
};

const THEMES = {
  light: { bg: "#ffffff", line: "#e1e7e7", fg: "#0e1516", muted: "#5b696b", accent: "#087f92", track: "#eef2f2", bar0: "#d9eff2" },
  dark: { bg: "#111819", line: "#1d2729", fg: "#e7eeee", muted: "#8b9a9c", accent: "#42c6d8", track: "#0d1314", bar0: "#1d2729" },
};

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";
const W = 420, H = 200;

const api = async (path) => {
  const headers = { "User-Agent": "profile-cards", Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
};

async function contributions() {
  const res = await fetch(`https://github.com/users/${USER}/contributions`, { headers: { "User-Agent": "Mozilla/5.0 (profile-cards)" } });
  if (!res.ok) throw new Error(`contributions → HTTP ${res.status}`);
  const html = await res.text();
  const counts = new Map();
  for (const m of html.matchAll(/<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const n = /^(\d[\d,]*) contribution/.exec(m[2].trim());
    counts.set(m[1], n ? Number(n[1].replace(/,/g, "")) : 0);
  }
  const days = [];
  for (const m of html.matchAll(/<td\b[^>]*class="ContributionCalendar-day"[^>]*>/g)) {
    const date = /data-date="([^"]+)"/.exec(m[0])?.[1];
    const id = /\bid="([^"]+)"/.exec(m[0])?.[1];
    if (date) days.push({ d: date, c: counts.get(id) ?? 0 });
  }
  days.sort((a, b) => a.d.localeCompare(b.d));
  if (days.length < 300) throw new Error(`calendar parse failed: only ${days.length} days`);
  return days;
}

function streaks(days) {
  let longest = 0, run = 0;
  for (const x of days) { run = x.c > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let i = days.length - 1;
  if (days[i].c === 0) i--; // today can still be empty
  let current = 0;
  while (i >= 0 && days[i].c > 0) { current++; i--; }
  return { current, longest };
}

function weeks(days) {
  const out = [];
  for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7).reduce((s, x) => s + x.c, 0));
  return out.slice(-52);
}

async function repoData() {
  const repos = (await api(`/users/${USER}/repos?per_page=100&type=owner`)).filter((r) => !r.fork);
  const bytes = new Map();
  for (const r of repos) {
    if (SKIP_REPOS.has(r.name)) continue;
    for (const [lang, n] of Object.entries(await api(`/repos/${USER}/${r.name}/languages`))) {
      if (!SKIP_LANGS.has(lang)) bytes.set(lang, (bytes.get(lang) ?? 0) + n);
    }
  }
  const total = [...bytes.values()].reduce((a, b) => a + b, 0);
  const sorted = [...bytes].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 5).map(([name, n]) => ({ name, pct: (n / total) * 100 }));
  const rest = 100 - top.reduce((s, x) => s + x.pct, 0);
  if (sorted.length > 5 && rest > 0.05) top.push({ name: "Other", pct: rest });
  return { repos: repos.length, stars: repos.reduce((s, r) => s + r.stargazers_count, 0), langs: top };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => n.toLocaleString("en-US");

const frame = (t, title, body, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${t.bg}" stroke="${t.line}"/>
<text x="24" y="34" font-family="${MONO}" font-size="11" letter-spacing="1" fill="${t.muted}">${esc(title.toUpperCase())}</text>
${body}
</svg>
`;

function statsCard(t, s) {
  const wk = s.weeks, max = Math.max(1, ...wk);
  const bw = (W - 48) / wk.length, baseY = H - 22, maxH = 34;
  const bars = wk.map((v, i) => {
    const h = v === 0 ? 2 : Math.max(3, (v / max) * maxH);
    return `<rect x="${(24 + i * bw + 0.75).toFixed(2)}" y="${(baseY - h).toFixed(2)}" width="${(bw - 1.5).toFixed(2)}" height="${h.toFixed(2)}" rx="1" fill="${v === 0 ? t.bar0 : t.accent}"${v === 0 ? "" : ` opacity="${(0.45 + 0.55 * (v / max)).toFixed(2)}"`}/>`;
  }).join("\n");
  const stat = (x, value, label) => `<text x="${x}" y="122" font-family="${SANS}" font-size="18" font-weight="600" fill="${t.fg}">${esc(value)}</text>
<text x="${x}" y="140" font-family="${SANS}" font-size="11" fill="${t.muted}">${esc(label)}</text>`;
  const body = `<text x="${W - 24}" y="34" text-anchor="end" font-family="${MONO}" font-size="11" fill="${t.muted}">last 12 months</text>
<text x="24" y="78" font-family="${SANS}" font-size="34" font-weight="700" fill="${t.accent}">${fmt(s.total)}</text>
<text x="${24 + String(fmt(s.total)).length * 19 + 10}" y="78" font-family="${SANS}" font-size="13" fill="${t.muted}">contributions</text>
${stat(24, `${s.current} days`, "current streak")}
${stat(150, `${s.longest} days`, "longest streak")}
${stat(276, `${s.repos} · ${s.stars}★`, "public repos · stars")}
${bars}`;
  return frame(t, "GitHub activity", body, `${fmt(s.total)} contributions in the last 12 months, longest streak ${s.longest} days`);
}

function langCard(t, langs) {
  const x0 = 24, barW = W - 48;
  let x = x0;
  const segs = langs.map((l, i) => {
    const w = (l.pct / 100) * barW;
    const r = `<rect x="${x.toFixed(2)}" y="58" width="${Math.max(0, w - (i < langs.length - 1 ? 2 : 0)).toFixed(2)}" height="10" fill="${LANG_COLORS[l.name] ?? t.muted}"/>`;
    x += w;
    return r;
  }).join("\n");
  const legend = langs.map((l, i) => {
    const cx = i % 2 === 0 ? 24 : 222, cy = 100 + Math.floor(i / 2) * 30;
    return `<circle cx="${cx + 5}" cy="${cy - 4}" r="5" fill="${LANG_COLORS[l.name] ?? t.muted}"/>
<text x="${cx + 18}" y="${cy}" font-family="${SANS}" font-size="14" fill="${t.fg}">${esc(l.name)}</text>
<text x="${cx + 174}" y="${cy}" text-anchor="end" font-family="${MONO}" font-size="12" fill="${t.muted}">${l.pct.toFixed(1)}%</text>`;
  }).join("\n");
  const body = `<text x="${W - 24}" y="34" text-anchor="end" font-family="${MONO}" font-size="11" fill="${t.muted}">public repos</text>
<clipPath id="bar"><rect x="${x0}" y="58" width="${barW}" height="10" rx="5"/></clipPath>
<rect x="${x0}" y="58" width="${barW}" height="10" rx="5" fill="${t.track}"/>
<g clip-path="url(#bar)">
${segs}
</g>
${legend}`;
  return frame(t, "Top languages", body, `Top languages: ${langs.map((l) => `${l.name} ${l.pct.toFixed(0)}%`).join(", ")}`);
}

const [days, repo] = await Promise.all([contributions(), repoData()]);
const stats = { total: days.reduce((s, x) => s + x.c, 0), ...streaks(days), weeks: weeks(days), repos: repo.repos, stars: repo.stars };

await mkdir(OUT, { recursive: true });
for (const [name, t] of Object.entries(THEMES)) {
  await writeFile(`${OUT}/stats-${name}.svg`, statsCard(t, stats));
  await writeFile(`${OUT}/languages-${name}.svg`, langCard(t, repo.langs));
}
console.log(`${USER}: ${stats.total} contributions, streak ${stats.current}/${stats.longest}, ${repo.repos} repos, ${repo.stars} stars`);
console.log(repo.langs.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", "));
