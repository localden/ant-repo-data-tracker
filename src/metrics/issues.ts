/**
 * Calculate issue metrics
 */

import type { IssueData, IssueMetrics, GitHubIssue, IssueListEntry } from '../types/index.js';
import { average, median, percentile, msToHours, msToDays, round } from '../utils/stats.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Get the timestamp of the first assignment on an issue (from timeline events),
 * or null if never assigned.
 */
function getFirstAssignmentTime(issue: GitHubIssue): number | null {
  const assignEvents = issue.timelineItems.nodes
    .filter((e) => e.__typename === 'AssignedEvent' && e.createdAt)
    .map((e) => new Date(e.createdAt!).getTime())
    .sort((a, b) => a - b);

  return assignEvents.length > 0 ? assignEvents[0] : null;
}

/**
 * Check if an issue has been reopened
 */
function hasBeenReopened(issue: GitHubIssue): boolean {
  return issue.timelineItems.nodes.some((event) => event.__typename === 'ReopenedEvent');
}

/**
 * Calculate all issue metrics
 */
export function calculateIssueMetrics(
  issues: IssueData,
  owner?: string,
  repo?: string
): IssueMetrics {
  const now = Date.now();
  const allIssues = [...issues.open, ...issues.closed];
  const closedIssues = issues.closed;

  // Volume metrics
  const open_count = issues.open.length;
  const closed_7d = closedIssues.filter(
    (i) => i.closedAt && now - new Date(i.closedAt).getTime() < SEVEN_DAYS_MS
  ).length;
  const closed_30d = closedIssues.filter(
    (i) => i.closedAt && now - new Date(i.closedAt).getTime() < THIRTY_DAYS_MS
  ).length;
  const closed_90d = closedIssues.filter(
    (i) => i.closedAt && now - new Date(i.closedAt).getTime() < NINETY_DAYS_MS
  ).length;

  const opened_7d = allIssues.filter(
    (i) => now - new Date(i.createdAt).getTime() < SEVEN_DAYS_MS
  ).length;
  const opened_30d = allIssues.filter(
    (i) => now - new Date(i.createdAt).getTime() < THIRTY_DAYS_MS
  ).length;
  const opened_90d = allIssues.filter(
    (i) => now - new Date(i.createdAt).getTime() < NINETY_DAYS_MS
  ).length;

  // Assignment status for open issues
  let unassigned_24h = 0;
  let unassigned_7d = 0;
  let unassigned_30d = 0;
  const assignedIssues: IssueListEntry[] = [];
  const unassignedIssues: IssueListEntry[] = [];

  for (const issue of issues.open) {
    const age = now - new Date(issue.createdAt).getTime();
    const daysOpen = Math.floor(age / (24 * 60 * 60 * 1000));
    const assignees = issue.assignees.nodes.map(a => a.login);

    const entry: IssueListEntry = {
      number: issue.number,
      title: issue.title,
      url: owner && repo
        ? `https://github.com/${owner}/${repo}/issues/${issue.number}`
        : `#${issue.number}`,
      createdAt: issue.createdAt,
      daysOpen,
      labels: issue.labels.nodes.map(l => l.name),
      commentCount: issue.comments.totalCount,
      assignees,
    };

    if (assignees.length > 0) {
      assignedIssues.push(entry);
    } else {
      unassignedIssues.push(entry);
      if (age > TWENTY_FOUR_HOURS_MS) unassigned_24h++;
      if (age > SEVEN_DAYS_MS) unassigned_7d++;
      if (age > THIRTY_DAYS_MS) unassigned_30d++;
    }
  }

  const assigned_count = assignedIssues.length;
  const unassigned_count = unassignedIssues.length;
  assignedIssues.sort((a, b) => b.daysOpen - a.daysOpen);
  unassignedIssues.sort((a, b) => b.daysOpen - a.daysOpen);

  // Time to first assignment (across all issues that have ever been assigned)
  const assignmentTimes: number[] = [];
  for (const issue of allIssues) {
    const firstAssigned = getFirstAssignmentTime(issue);
    if (firstAssigned !== null) {
      const created = new Date(issue.createdAt).getTime();
      assignmentTimes.push(firstAssigned - created);
    }
  }
  const sortedAssignmentTimes = assignmentTimes
    .map((t) => msToHours(t))
    .sort((a, b) => a - b);

  // Label breakdown and coverage
  const by_label: Record<string, number> = {};
  let labeledCount = 0;
  for (const issue of issues.open) {
    const hasLabels = issue.labels.nodes.length > 0;
    if (hasLabels) {
      labeledCount++;
      for (const label of issue.labels.nodes) {
        by_label[label.name] = (by_label[label.name] || 0) + 1;
      }
    }
  }
  const unlabeled_count = issues.open.length - labeledCount;
  const label_coverage_pct = issues.open.length > 0
    ? round((labeledCount / issues.open.length) * 100, 1)
    : 0;

  // Time to close
  const closeTimes = closedIssues
    .filter((i) => i.closedAt)
    .map((i) => {
      const created = new Date(i.createdAt).getTime();
      const closed = new Date(i.closedAt!).getTime();
      return msToDays(closed - created);
    })
    .sort((a, b) => a - b);

  // Stale issues (open issues without recent activity)
  let stale_30d = 0;
  let stale_60d = 0;
  let stale_90d = 0;

  for (const issue of issues.open) {
    const age = now - new Date(issue.updatedAt).getTime();
    if (age > THIRTY_DAYS_MS) stale_30d++;
    if (age > SIXTY_DAYS_MS) stale_60d++;
    if (age > NINETY_DAYS_MS) stale_90d++;
  }

  // Reopen rate
  const reopenedCount = closedIssues.filter(hasBeenReopened).length;
  const reopen_rate = closedIssues.length > 0 ? round(reopenedCount / closedIssues.length, 2) : 0;

  return {
    open_count,
    closed_7d,
    closed_30d,
    closed_90d,
    opened_7d,
    opened_30d,
    opened_90d,
    assigned_count,
    unassigned_count,
    unassigned_24h,
    unassigned_7d,
    unassigned_30d,
    assigned_issues: assignedIssues,
    unassigned_issues: unassignedIssues,
    by_label,
    assignment_time: {
      avg_hours: round(average(sortedAssignmentTimes)),
      median_hours: round(median(sortedAssignmentTimes)),
      p90_hours: round(percentile(sortedAssignmentTimes, 90)),
      p95_hours: round(percentile(sortedAssignmentTimes, 95)),
    },
    close_time: {
      avg_days: round(average(closeTimes)),
      median_days: round(median(closeTimes)),
      p90_days: round(percentile(closeTimes, 90)),
    },
    label_coverage_pct,
    unlabeled_count,
    stale_30d,
    stale_60d,
    stale_90d,
    reopen_rate,
  };
}
