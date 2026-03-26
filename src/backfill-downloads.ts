/**
 * One-off: seed existing daily snapshots with downloads.daily (and downloads.total
 * for npm) from registry range APIs. NuGet/RubyGems have no history API; Packagist's
 * history API is per-version and complex — all three are skipped here.
 *
 * Run: npm run build && npm run backfill
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { loadConfig } from './config/loader.js';
import { fetchNpmRange } from './downloads/npm.js';
import { fetchPypiRange } from './downloads/pypi.js';
import type { DailySnapshot, PackageConfig } from './types/index.js';

async function fetchHistory(
  pkg: PackageConfig,
  earliest: string,
  today: string
): Promise<{ daily: Map<string, number>; cumulative?: Map<string, number> }> {
  switch (pkg.registry) {
    case 'npm': {
      // Range from earliest snapshot date covers all our snapshots and lets us
      // compute a running sum.
      const daily = await fetchNpmRange(pkg.name, earliest, today);
      let running = 0;
      const cumulative = new Map<string, number>();
      for (const date of [...daily.keys()].sort()) {
        running += daily.get(date) ?? 0;
        cumulative.set(date, running);
      }
      // Shift to absolute: add everything before `earliest` so totals are true all-time.
      // @anthropic-ai/sdk was created 2023-01-31 — over the 18-month range cap, so we
      // chunk the prior range in 540-day windows. The range API is inclusive on both
      // ends, so subtract each chunk's end day to avoid double-counting the boundary.
      const chunks: Array<[string, string]> = [];
      let cursor = '2023-01-01';
      while (cursor < earliest) {
        const next = new Date(new Date(cursor).getTime() + 540 * 86400000).toISOString().split('T')[0];
        chunks.push([cursor, next < earliest ? next : earliest]);
        cursor = next;
      }
      let priorSum = 0;
      for (const [a, b] of chunks) {
        const chunk = await fetchNpmRange(pkg.name, a, b);
        priorSum += [...chunk.values()].reduce((s, v) => s + v, 0) - (chunk.get(b) ?? 0);
      }
      for (const [d, v] of cumulative) cumulative.set(d, v + priorSum);
      return { daily, cumulative };
    }
    case 'pypi': {
      const daily = await fetchPypiRange(pkg.name);
      // pypistats caps at ~6 months, so this cumulative is "since pypistats retention
      // window" not true all-time. Still useful as a trend baseline.
      let running = 0;
      const cumulative = new Map<string, number>();
      for (const date of [...daily.keys()].sort()) {
        running += daily.get(date) ?? 0;
        cumulative.set(date, running);
      }
      return { daily, cumulative };
    }
    case 'nuget':
    case 'rubygems':
    case 'packagist':
      return { daily: new Map() };
  }
}

async function main() {
  const config = await loadConfig();
  const today = new Date().toISOString().split('T')[0];

  for (const repo of config.repositories) {
    if (!repo.package) continue;

    const snapDir = join('data', 'repos', repo.owner, repo.repo, 'snapshots');
    let files: string[];
    try {
      files = (await readdir(snapDir)).filter((f) => f.endsWith('.json')).sort();
    } catch {
      console.log(`[skip] ${repo.repo}: no snapshots dir`);
      continue;
    }
    if (files.length === 0) continue;

    const earliest = files[0].replace('.json', '');
    console.log(`[${repo.repo}] fetching ${repo.package.registry} history ${earliest}..${today}`);

    const { daily, cumulative } = await fetchHistory(repo.package, earliest, today);

    let patched = 0;
    for (const file of files) {
      const path = join(snapDir, file);
      const date = file.replace('.json', '');
      const dl = daily.get(date);
      if (dl === undefined) continue;

      const snap: DailySnapshot = JSON.parse(await readFile(path, 'utf-8'));
      snap.downloads = { daily: dl };
      const cum = cumulative?.get(date);
      if (cum !== undefined) snap.downloads.total = cum;

      await writeFile(path, JSON.stringify(snap, null, 2));
      patched++;
    }
    console.log(`[${repo.repo}] patched ${patched}/${files.length} snapshots`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
