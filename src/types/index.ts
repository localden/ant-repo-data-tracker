/**
 * Type definitions for Anthropic SDK Repository Data Tracker
 */

// =============================================================================
// Repository Stats
// =============================================================================

export interface RepositoryStats {
  stars: number;
  forks: number;
}

// =============================================================================
// Response Time Metrics
// =============================================================================

export interface ResponseTimeMetrics {
  avg_hours: number;
  median_hours: number;
  p90_hours: number;
  p95_hours: number;
}

// =============================================================================
// Issue Metrics
// =============================================================================

export interface CloseTimeMetrics {
  avg_days: number;
  median_days: number;
  p90_days: number;
}

export interface IssueListEntry {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  daysOpen: number;
  labels: string[];
  commentCount: number;
  assignees: string[];
}

export interface IssueMetrics {
  open_count: number;
  closed_7d: number;
  closed_30d: number;
  closed_90d: number;
  opened_7d: number;
  opened_30d: number;
  opened_90d: number;
  assigned_count: number;
  unassigned_count: number;
  unassigned_24h: number;
  unassigned_7d: number;
  unassigned_30d: number;
  /** Open issues with at least one assignee, sorted by oldest first */
  assigned_issues: IssueListEntry[];
  /** Open issues with no assignee, sorted by oldest first */
  unassigned_issues: IssueListEntry[];
  by_label: Record<string, number>;
  /** Time from issue creation to first assignment */
  assignment_time: ResponseTimeMetrics;
  close_time: CloseTimeMetrics;
  label_coverage_pct: number;
  unlabeled_count: number;
  stale_30d: number;
  stale_60d: number;
  stale_90d: number;
  reopen_rate: number;
}

// =============================================================================
// Pull Request Metrics
// =============================================================================

export interface MergeTimeMetrics {
  avg_hours: number;
  median_hours: number;
}

export interface PRListEntry {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  daysOpen: number;
  labels: string[];
  isDraft: boolean;
  additions: number;
  deletions: number;
  reviewCount: number;
  author: string | null;
  assignees: string[];
}

export interface PRMetrics {
  open_count: number;
  merged_7d: number;
  merged_30d: number;
  merged_90d: number;
  opened_7d: number;
  opened_30d: number;
  opened_90d: number;
  closed_not_merged_90d: number;
  draft_count: number;
  assigned_count: number;
  unassigned_count: number;
  unassigned_24h: number;
  unassigned_7d: number;
  /** Open PRs with at least one assignee, sorted by oldest first */
  assigned_prs: PRListEntry[];
  /** Open PRs with no assignee, sorted by oldest first */
  unassigned_prs: PRListEntry[];
  /** Time from PR creation to first review (any reviewer, excluding bots/self) */
  review_time: ResponseTimeMetrics;
  /** Time from PR creation to first assignment */
  assignment_time: ResponseTimeMetrics;
  merge_time: MergeTimeMetrics;
  code_review_rate_pct: number;
  rejection_rate_pct: number;
  avg_reviews_per_pr: number;
  by_size: {
    small: number;
    medium: number;
    large: number;
  };
}

// =============================================================================
// Contributor Metrics
// =============================================================================

export interface ContributorMetrics {
  total_known: number;
  active_30d: number;
  first_time_30d: number;
  retention_rate_pct: number;
  churned_30d: number;
  commits_per_week_avg: number;
  commits_per_week_trend: number[];
  /** Internal: full list of contributor usernames (for append-only tracking) */
  allContributors: string[];
  /** Internal: contributors active in previous 30d window (for retention tracking) */
  previousPeriodContributors: string[];
}

// =============================================================================
// Hotspot Analysis
// =============================================================================

export interface FileHotspot {
  path: string;
  pr_count: number;
  total_changes: number;
}

export interface DirectoryHotspot {
  path: string;
  pr_count: number;
  file_count: number;
}

export interface HotspotMetrics {
  by_file: FileHotspot[];
  by_directory: DirectoryHotspot[];
  top_n: number;
}

// =============================================================================
// Full Metrics (metrics.json)
// =============================================================================

export interface Metrics {
  timestamp: string;
  repository: RepositoryStats;
  issues: IssueMetrics;
  pulls: PRMetrics;
  contributors: Omit<ContributorMetrics, 'allContributors' | 'previousPeriodContributors'>;
  hotspots: HotspotMetrics;
  downloads?: DownloadMetrics;
}

// =============================================================================
// Daily Snapshot
// =============================================================================

export interface DailySnapshot {
  date: string;
  issues: {
    open: number;
    closed_7d: number;
    closed_30d: number;
    closed_90d: number;
    opened_7d: number;
    opened_30d: number;
    opened_90d: number;
    assigned: number;
    unassigned: number;
    unassigned_24h: number;
    unassigned_7d: number;
    unassigned_30d: number;
    stale_30d: number;
    stale_60d: number;
    stale_90d: number;
    reopen_rate: number;
    assignment_time: {
      avg_hours: number;
      median_hours: number;
      p90_hours: number;
      p95_hours: number;
    };
    close_time: {
      avg_days: number;
      median_days: number;
      p90_days: number;
    };
    label_coverage_pct: number;
  };
  pulls: {
    open: number;
    merged_7d: number;
    merged_30d: number;
    merged_90d: number;
    opened_7d: number;
    opened_30d: number;
    opened_90d: number;
    closed_not_merged_90d: number;
    draft_count: number;
    assigned: number;
    unassigned: number;
    unassigned_24h: number;
    unassigned_7d: number;
    review_time: {
      avg_hours: number;
      median_hours: number;
      p90_hours: number;
      p95_hours: number;
    };
    assignment_time: {
      avg_hours: number;
      median_hours: number;
      p90_hours: number;
      p95_hours: number;
    };
    merge_time: {
      avg_hours: number;
      median_hours: number;
    };
    code_review_rate_pct: number;
    rejection_rate_pct: number;
    avg_reviews_per_pr: number;
    by_size: {
      small: number;
      medium: number;
      large: number;
    };
  };
  repository: RepositoryStats;
  contributors: {
    total: number;
    active_30d: number;
    first_time_30d: number;
    retention_rate_pct: number;
    churned_30d: number;
    commits_per_week_avg: number;
  };
  downloads?: DownloadMetrics;
}

// =============================================================================
// Contributors File
// =============================================================================

export interface ContributorsData {
  lastUpdated: string;
  contributors: string[];
}

// =============================================================================
// GitHub API Types - Issues
// =============================================================================

export interface GitHubComment {
  createdAt: string;
  author: {
    login: string;
  } | null;
}

export interface GitHubTimelineEvent {
  __typename?: string;
  createdAt?: string;
  isCrossRepository?: boolean;
  source?: {
    __typename?: 'PullRequest' | 'Issue';
    number?: number;
    state?: 'OPEN' | 'CLOSED' | 'MERGED';
  };
}

export interface GitHubIssue {
  id: string;
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  author: {
    login: string;
  } | null;
  assignees: {
    nodes: Array<{ login: string }>;
  };
  labels: {
    nodes: Array<{ name: string }>;
  };
  comments: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    nodes: GitHubComment[];
    totalCount: number;
  };
  timelineItems: {
    nodes: GitHubTimelineEvent[];
  };
}

export interface IssueData {
  open: GitHubIssue[];
  closed: GitHubIssue[];
}

// =============================================================================
// GitHub API Types - Pull Requests
// =============================================================================

export interface GitHubReview {
  createdAt: string;
  state: string;
  author: {
    login: string;
  } | null;
}

export interface GitHubPullRequest {
  id: string;
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  author: {
    login: string;
  } | null;
  assignees: {
    nodes: Array<{ login: string }>;
  };
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: {
    nodes: Array<{ name: string }>;
  };
  reviews: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    nodes: GitHubReview[];
    totalCount: number;
  };
  comments: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    nodes: GitHubComment[];
    totalCount: number;
  };
  timelineItems: {
    nodes: GitHubTimelineEvent[];
  };
}

export interface PullRequestData {
  open: GitHubPullRequest[];
  closed: GitHubPullRequest[];
}

// =============================================================================
// GitHub API Types - Hotspots
// =============================================================================

export interface GitHubPRFile {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
}

export interface HotspotRawData {
  prNumber: number;
  files: GitHubPRFile[];
}

// =============================================================================
// Package Downloads
// =============================================================================

export type PackageRegistry = 'npm' | 'pypi' | 'nuget' | 'rubygems' | 'packagist';

export interface PackageConfig {
  registry: PackageRegistry;
  name: string;
}

export interface DownloadMetrics {
  /** Yesterday's downloads. npm/pypi/packagist native; nuget/rubygems derived from consecutive total diff. */
  daily?: number;
  /** Last 7 days sum. pypi native; others summed from snapshots at render time. */
  last_week?: number;
  /** Last 30 days sum. pypi native only. */
  last_month?: number;
  /** All-time cumulative. nuget/rubygems/packagist native; npm maintained as running sum; pypi omitted (pypistats caps at 6mo). */
  total?: number;
}

/**
 * Per-version download breakdown (PyPI only, sourced from BigQuery).
 * Written to data/repos/<owner>/<repo>/versions.json by the daily bigquery workflow.
 */
export interface VersionDownloadsData {
  lastUpdated: string;
  /** version -> cumulative count within the tracked window */
  totals: Record<string, number>;
  /** YYYY-MM-DD -> version -> daily count */
  daily: Record<string, Record<string, number>>;
}

// =============================================================================
// Repository Configuration
// =============================================================================

export interface RepoConfig {
  owner: string;
  repo: string;
  name?: string;
  description?: string;
  package?: PackageConfig;
}

export interface ReposConfig {
  repositories: RepoConfig[];
}

/** Helper to get the path segments for a repository */
export function repoPath(config: RepoConfig): { owner: string; repo: string } {
  return { owner: config.owner, repo: config.repo };
}
