/**
 * Main aggregation orchestrator
 */

import type { CliArgs } from './cli.js';
import { createGitHubClient } from './github/client.js';
import { fetchIssues } from './github/issues.js';
import { fetchPullRequests } from './github/pulls.js';
import { fetchHotspotData } from './github/hotspots.js';
import { fetchRepoStats } from './github/repo.js';
import { fetchCommits } from './github/commits.js';
import { fetchDownloads } from './downloads/index.js';
import { fetchPypiVersions, mergeVersionData, deriveDownloadMetrics } from './downloads/bigquery.js';
import { calculateIssueMetrics } from './metrics/issues.js';
import { calculatePRMetrics } from './metrics/pulls.js';
import { calculateContributorMetrics } from './metrics/contributors.js';
import { calculateHotspots } from './metrics/hotspots.js';
import {
  writeMetrics,
  updateContributors,
  writeSnapshot,
  writeRepoIndex,
  loadRecentSnapshots,
  writeDownloadsSidecar,
  writeVersionDownloads,
  loadVersionDownloads,
} from './data/writers.js';
import { loadConfig, createDefaultConfig } from './config/loader.js';
import type { Metrics, RepoConfig, ReposConfig, DownloadMetrics } from './types/index.js';
import {
  spinner,
  header,
  subheader,
  success,
  warning,
  info,
  keyValue,
  style,
  divider,
  newline,
  formatNumber,
  box,
} from './cli/output.js';

export async function aggregate(args: CliArgs): Promise<void> {
  // Handle single-slice modes (split workflow)
  if (args.only === 'downloads') return aggregateDownloadsOnly(args);
  if (args.only === 'bigquery') return aggregateBigQuery(args);
  // --only=github falls through to the normal path with skipDownloads=true

  const { dryRun, verbose, configPath } = args;
  const client = createGitHubClient();
  const startTime = Date.now();

  // Load configuration
  let config: ReposConfig;
  const configSpinner = spinner('Loading configuration').start();
  try {
    if (args.owner && args.repo) {
      configSpinner.warn('Using legacy CLI mode (consider using repos.json instead)');
      config = createDefaultConfig(args.owner, args.repo);
    } else {
      config = await loadConfig(configPath);
      configSpinner.succeed(`Loaded ${config.repositories.length} repositories from config`);
    }
  } catch (error) {
    if (!configPath && !args.owner && !args.repo) {
      configSpinner.warn('No repos.json found, using default configuration');
      config = createDefaultConfig('anthropics', 'anthropic-sdk-python');
    } else {
      configSpinner.fail('Failed to load configuration');
      throw error;
    }
  }

  if (dryRun) {
    newline();
    warning('Dry run mode — no files will be written');
  }

  // Process each repository
  const repoCount = config.repositories.length;
  const skipDownloads = args.only === 'github';
  for (let i = 0; i < repoCount; i++) {
    const repoConfig = config.repositories[i];
    await aggregateRepository(client, repoConfig, dryRun, verbose, i + 1, repoCount, skipDownloads);
  }

  // Write global files
  newline();
  if (dryRun) {
    info('Would write global files:');
    keyValue('repositories', 'data/repos.json');
  } else {
    const writeSpinner = spinner('Writing global data files').start();
    await writeRepoIndex(config.repositories);
    writeSpinner.succeed('Global data files written');
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  newline();
  divider();
  success(`Aggregation complete in ${style.bold(duration + 's')}`);
}

/**
 * Aggregate data for a single repository
 */
async function aggregateRepository(
  client: ReturnType<typeof createGitHubClient>,
  repoConfig: RepoConfig,
  dryRun: boolean,
  verbose: boolean,
  repoIndex: number,
  totalRepos: number,
  skipDownloads = false
): Promise<void> {
  const { owner, repo } = repoConfig;
  const displayName = repoConfig.name || `${owner}/${repo}`;

  header(`[${repoIndex}/${totalRepos}] ${displayName}`);
  info(`${style.dim(`github.com/${owner}/${repo}`)}`);

  const issueSpinner = spinner('Fetching issues').start();
  const issues = await fetchIssues(client, owner, repo, verbose);
  issueSpinner.succeed(`Issues: ${style.bold(String(issues.open.length))} open, ${style.dim(String(issues.closed.length) + ' closed')}`);

  const prSpinner = spinner('Fetching pull requests').start();
  const pulls = await fetchPullRequests(client, owner, repo, verbose);
  prSpinner.succeed(`PRs: ${style.bold(String(pulls.open.length))} open, ${style.dim(String(pulls.closed.length) + ' closed/merged')}`);

  const mergedPRs = pulls.closed.filter((pr) => pr.mergedAt !== null);
  const hotspotSpinner = spinner(`Analyzing ${mergedPRs.length} merged PRs for hotspots`).start();
  const hotspotData = await fetchHotspotData(client, owner, repo, mergedPRs, verbose);
  hotspotSpinner.succeed(`Hotspots: analyzed ${style.bold(String(mergedPRs.length))} merged PRs`);

  const statsSpinner = spinner('Fetching repository stats').start();
  const repoStats = await fetchRepoStats(client, owner, repo);
  statsSpinner.succeed(`Stats: ${style.bold(formatNumber(repoStats.stars))} ⭐  ${style.bold(formatNumber(repoStats.forks))} forks`);

  // Fetch package downloads (if configured)
  let downloads: DownloadMetrics | undefined;
  if (repoConfig.package && !skipDownloads) {
    const dlSpinner = spinner(`Fetching ${repoConfig.package.registry} downloads`).start();
    try {
      const recent = await loadRecentSnapshots(repoConfig, 30);
      // Running-sum seed: use the most-recent snapshot that HAS a total, not
      // blindly yesterday's — a single lagged/failed day would otherwise break
      // the chain permanently.
      const prev = recent.find((s) => s.downloads?.total !== undefined) ?? recent[0];
      downloads = await fetchDownloads(repoConfig.package, prev);
      // Registries that don't report last_week natively: sum today + prior 6 snapshots.
      if (downloads.last_week === undefined && downloads.daily !== undefined) {
        downloads.last_week = recent.slice(0, 6).reduce((s, snap) => s + (snap.downloads?.daily ?? 0), downloads.daily);
      }
      if (downloads.last_month === undefined && downloads.daily !== undefined) {
        downloads.last_month = recent.slice(0, 29).reduce((s, snap) => s + (snap.downloads?.daily ?? 0), downloads.daily);
      }
      const headline = downloads.daily !== undefined ? `${formatNumber(downloads.daily)}/day` : `${formatNumber(downloads.total ?? 0)} total`;
      dlSpinner.succeed(`Downloads: ${style.bold(headline)} (${repoConfig.package.registry})`);
    } catch (err) {
      dlSpinner.warn(`Download stats unavailable: ${(err as Error).message}`);
    }
  }

  const commitSpinner = spinner('Fetching commit history (12 weeks)').start();
  const commitsResult = await fetchCommits(client, owner, repo, 12, verbose);
  commitSpinner.succeed(`Commits: ${style.bold(String(commitsResult.commits.length))} in last 12 weeks`);

  const metricsSpinner = spinner('Computing metrics').start();
  const issueMetrics = calculateIssueMetrics(issues, owner, repo);
  const prMetrics = calculatePRMetrics(pulls, owner, repo);
  const contributorMetrics = await calculateContributorMetrics(issues, pulls, commitsResult.commits, repoConfig);
  const hotspots = calculateHotspots(hotspotData);
  metricsSpinner.succeed('Metrics computed');

  const metrics: Metrics = {
    timestamp: new Date().toISOString(),
    repository: repoStats,
    issues: issueMetrics,
    pulls: prMetrics,
    contributors: contributorMetrics,
    hotspots,
    ...(downloads && { downloads }),
  };

  const repoPath = `data/repos/${owner}/${repo}`;
  if (dryRun) {
    newline();
    info('Would write files:');
    keyValue('metrics', `${repoPath}/metrics.json`);
    keyValue('contributors', `${repoPath}/contributors.json`);
    keyValue('snapshot', `${repoPath}/snapshots/${new Date().toISOString().split('T')[0]}.json`);

    if (verbose) {
      newline();
      subheader('Metrics Preview');
      box('Summary', [
        `Open Issues: ${issueMetrics.open_count} (${issueMetrics.assigned_count} assigned, ${issueMetrics.unassigned_count} unassigned)`,
        `Open PRs: ${prMetrics.open_count} (${prMetrics.assigned_count} assigned, ${prMetrics.unassigned_count} unassigned)`,
        `Active Contributors (30d): ${contributorMetrics.active_30d}`,
        `Unassigned Issues >24h: ${issueMetrics.unassigned_24h}`,
        `Unassigned PRs >24h: ${prMetrics.unassigned_24h}`,
      ]);
    }
  } else {
    const writeSpinner = spinner('Writing data files').start();
    await writeMetrics(metrics, repoConfig);
    await updateContributors(contributorMetrics.allContributors, repoConfig);
    await writeSnapshot(metrics, repoConfig);
    writeSpinner.succeed(`Data written to ${style.dim(repoPath + '/')}`);
  }
}

/**
 * Downloads-only mode (--only=downloads).
 * Writes a downloads.json sidecar per package-bearing repo; the commit job
 * jq-patches it into metrics.json and today's snapshot.
 */
async function aggregateDownloadsOnly(args: CliArgs): Promise<void> {
  const { dryRun, configPath, registry } = args;
  const startTime = Date.now();

  const config = await loadConfig(configPath);
  header(`Downloads-Only Aggregation${registry ? ` (${registry})` : ''}`);

  let failed = false;
  for (const repoConfig of config.repositories) {
    if (!repoConfig.package) continue;
    // PyPI is sourced from BigQuery (--only=bigquery); skip it here so we
    // have a single source of truth.
    if (repoConfig.package.registry === 'pypi') continue;
    if (registry && repoConfig.package.registry !== registry) continue;
    const dlSpinner = spinner(`${repoConfig.owner}/${repoConfig.repo} (${repoConfig.package.registry})`).start();
    try {
      const recent = await loadRecentSnapshots(repoConfig, 30);
      const prev = recent.find((s) => s.downloads?.total !== undefined) ?? recent[0];
      const downloads = await fetchDownloads(repoConfig.package, prev);
      if (downloads.last_week === undefined && downloads.daily !== undefined) {
        downloads.last_week = recent.slice(0, 6).reduce((s, snap) => s + (snap.downloads?.daily ?? 0), downloads.daily);
      }
      if (downloads.last_month === undefined && downloads.daily !== undefined) {
        downloads.last_month = recent.slice(0, 29).reduce((s, snap) => s + (snap.downloads?.daily ?? 0), downloads.daily);
      }
      if (!dryRun) await writeDownloadsSidecar(downloads, repoConfig);
      const headline = downloads.daily !== undefined ? `${formatNumber(downloads.daily)}/day` : `${formatNumber(downloads.total ?? 0)} total`;
      dlSpinner.succeed(`${repoConfig.package.name}: ${headline}`);
    } catch (err) {
      dlSpinner.fail(`${repoConfig.package.name}: ${(err as Error).message}`);
      failed = true;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  newline();
  // With --registry the job covers one ecosystem; a failure should surface
  // as a red subjob rather than being swallowed.
  if (failed && registry) throw new Error(`${registry} download fetch failed`);
  success(`Downloads aggregation complete in ${style.bold(duration + 's')}`);
}

/**
 * BigQuery mode (--only=bigquery).
 * Queries bigquery-public-data.pypi.file_downloads for per-version daily
 * counts since the last stored date, merges into versions.json.
 */
async function aggregateBigQuery(args: CliArgs): Promise<void> {
  const { dryRun, configPath } = args;
  const startTime = Date.now();

  const config = await loadConfig(configPath);
  header('BigQuery PyPI Aggregation');

  for (const repoConfig of config.repositories) {
    if (repoConfig.package?.registry !== 'pypi') continue;
    const pkg = repoConfig.package.name;
    const bqSpinner = spinner(`${pkg}: querying BigQuery`).start();
    try {
      const existing = await loadVersionDownloads(repoConfig);
      // Incremental: re-query from the last stored date (not +1) so partial
      // intra-day data gets refreshed on the next 2h run. First run bootstraps
      // 90 days back.
      const dates = existing ? Object.keys(existing.daily).sort() : [];
      const since = dates.length > 0
        ? dates[dates.length - 1]
        : new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];

      const fresh = await fetchPypiVersions(pkg, since);
      const merged = mergeVersionData(existing, fresh);
      const aggregate = deriveDownloadMetrics(merged);

      if (!dryRun) {
        await writeVersionDownloads(merged, repoConfig);
        await writeDownloadsSidecar(aggregate, repoConfig);
      }
      const nDays = Object.keys(fresh.daily).length;
      const nVersions = Object.keys(merged.totals).length;
      bqSpinner.succeed(`${pkg}: ${formatNumber(aggregate.daily ?? 0)}/day, ${nVersions} version(s), ${nDays} day(s) refreshed`);
    } catch (err) {
      bqSpinner.fail(`${pkg}: ${(err as Error).message}`);
      throw err;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  newline();
  success(`BigQuery aggregation complete in ${style.bold(duration + 's')}`);
}
