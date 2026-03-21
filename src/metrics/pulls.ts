/**
 * Calculate pull request metrics
 */

import type { PullRequestData, PRMetrics, GitHubPullRequest, PRListEntry } from '../types/index.js';
import { average, median, percentile, msToHours, round } from '../utils/stats.js';
import { isBot } from '../utils/bots.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const SMALL_THRESHOLD = 100;
const MEDIUM_THRESHOLD = 500;

/**
 * Get the timestamp of the first assignment on a PR, or null if never assigned.
 */
function getFirstAssignmentTime(pr: GitHubPullRequest): number | null {
  const assignEvents = pr.timelineItems.nodes
    .filter((e) => e.__typename === 'AssignedEvent' && e.createdAt)
    .map((e) => new Date(e.createdAt!).getTime())
    .sort((a, b) => a - b);

  return assignEvents.length > 0 ? assignEvents[0] : null;
}

/**
 * Calculate time to first review (from any non-bot, non-self reviewer).
 */
function getTimeToFirstReview(pr: GitHubPullRequest): number | null {
  const prAuthor = pr.author?.login;

  const eligibleReviews = pr.reviews.nodes
    .filter((review) => {
      const author = review.author?.login;
      if (!author) return false;
      if (author === prAuthor) return false;
      if (isBot(author)) return false;
      return true;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (eligibleReviews.length === 0) return null;

  const firstReview = new Date(eligibleReviews[0].createdAt).getTime();
  const prCreated = new Date(pr.createdAt).getTime();

  return firstReview - prCreated;
}

/**
 * Get PR size category based on lines changed
 */
function getPRSize(pr: GitHubPullRequest): 'small' | 'medium' | 'large' {
  const totalLines = pr.additions + pr.deletions;
  if (totalLines < SMALL_THRESHOLD) return 'small';
  if (totalLines < MEDIUM_THRESHOLD) return 'medium';
  return 'large';
}

/**
 * Calculate all PR metrics
 */
export function calculatePRMetrics(
  pulls: PullRequestData,
  owner?: string,
  repo?: string
): PRMetrics {
  const now = Date.now();

  const mergedPRs = pulls.closed.filter((pr) => pr.mergedAt !== null);
  const closedNotMerged = pulls.closed.filter((pr) => pr.mergedAt === null);
  const allPRs = [...pulls.open, ...pulls.closed];

  // Volume metrics
  const open_count = pulls.open.length;
  const merged_7d = mergedPRs.filter(
    (pr) => pr.mergedAt && now - new Date(pr.mergedAt).getTime() < SEVEN_DAYS_MS
  ).length;
  const merged_30d = mergedPRs.filter(
    (pr) => pr.mergedAt && now - new Date(pr.mergedAt).getTime() < THIRTY_DAYS_MS
  ).length;
  const merged_90d = mergedPRs.filter(
    (pr) => pr.mergedAt && now - new Date(pr.mergedAt).getTime() < NINETY_DAYS_MS
  ).length;
  const closed_not_merged_90d = closedNotMerged.filter(
    (pr) => pr.closedAt && now - new Date(pr.closedAt).getTime() < NINETY_DAYS_MS
  ).length;

  const opened_7d = allPRs.filter(
    (pr) => now - new Date(pr.createdAt).getTime() < SEVEN_DAYS_MS
  ).length;
  const opened_30d = allPRs.filter(
    (pr) => now - new Date(pr.createdAt).getTime() < THIRTY_DAYS_MS
  ).length;
  const opened_90d = allPRs.filter(
    (pr) => now - new Date(pr.createdAt).getTime() < NINETY_DAYS_MS
  ).length;

  const draft_count = pulls.open.filter((pr) => pr.isDraft).length;

  // Assignment status for open PRs
  let unassigned_24h = 0;
  let unassigned_7d = 0;
  const assignedPRs: PRListEntry[] = [];
  const unassignedPRs: PRListEntry[] = [];

  for (const pr of pulls.open) {
    const age = now - new Date(pr.createdAt).getTime();
    const daysOpen = Math.floor(age / (24 * 60 * 60 * 1000));
    const assignees = pr.assignees.nodes.map(a => a.login);

    const entry: PRListEntry = {
      number: pr.number,
      title: pr.title,
      url: owner && repo
        ? `https://github.com/${owner}/${repo}/pull/${pr.number}`
        : `#${pr.number}`,
      createdAt: pr.createdAt,
      daysOpen,
      labels: pr.labels.nodes.map(l => l.name),
      isDraft: pr.isDraft,
      additions: pr.additions,
      deletions: pr.deletions,
      reviewCount: pr.reviews.totalCount,
      author: pr.author?.login || null,
      assignees,
    };

    if (assignees.length > 0) {
      assignedPRs.push(entry);
    } else {
      unassignedPRs.push(entry);
      if (!pr.isDraft) {
        if (age > TWENTY_FOUR_HOURS_MS) unassigned_24h++;
        if (age > SEVEN_DAYS_MS) unassigned_7d++;
      }
    }
  }

  const assigned_count = assignedPRs.length;
  const unassigned_count = unassignedPRs.length;
  assignedPRs.sort((a, b) => b.daysOpen - a.daysOpen);
  unassignedPRs.sort((a, b) => b.daysOpen - a.daysOpen);

  // Time to first assignment
  const assignmentTimes: number[] = [];
  for (const pr of allPRs) {
    const firstAssigned = getFirstAssignmentTime(pr);
    if (firstAssigned !== null) {
      const created = new Date(pr.createdAt).getTime();
      assignmentTimes.push(firstAssigned - created);
    }
  }
  const sortedAssignmentTimes = assignmentTimes.map((t) => msToHours(t)).sort((a, b) => a - b);

  // Time to first review (any reviewer, not filtered by maintainer)
  const reviewTimes: number[] = [];
  for (const pr of [...pulls.open, ...mergedPRs]) {
    if (pr.isDraft) continue;
    const reviewTime = getTimeToFirstReview(pr);
    if (reviewTime !== null) {
      reviewTimes.push(reviewTime);
    }
  }
  const sortedReviewTimes = reviewTimes.map((t) => msToHours(t)).sort((a, b) => a - b);

  // Merge time (creation to merge)
  const mergeTimes = mergedPRs
    .filter((pr) => pr.mergedAt)
    .map((pr) => {
      const created = new Date(pr.createdAt).getTime();
      const merged = new Date(pr.mergedAt!).getTime();
      return msToHours(merged - created);
    })
    .sort((a, b) => a - b);

  // Size breakdown (open PRs)
  const by_size = { small: 0, medium: 0, large: 0 };
  for (const pr of pulls.open) {
    by_size[getPRSize(pr)]++;
  }

  // Code review rate: % of merged PRs (90d) that had at least one review
  const mergedWithReview = mergedPRs.filter(
    (pr) => pr.mergedAt && now - new Date(pr.mergedAt).getTime() < NINETY_DAYS_MS && pr.reviews.totalCount > 0
  ).length;
  const code_review_rate_pct = merged_90d > 0
    ? round((mergedWithReview / merged_90d) * 100, 1)
    : 0;

  // PR rejection rate: % of closed PRs (90d) that were not merged
  const totalClosed90d = merged_90d + closed_not_merged_90d;
  const rejection_rate_pct = totalClosed90d > 0
    ? round((closed_not_merged_90d / totalClosed90d) * 100, 1)
    : 0;

  // Average reviews per merged PR (90d)
  const recentMergedPRs = mergedPRs.filter(
    (pr) => pr.mergedAt && now - new Date(pr.mergedAt).getTime() < NINETY_DAYS_MS
  );
  const totalReviews = recentMergedPRs.reduce((sum, pr) => sum + pr.reviews.totalCount, 0);
  const avg_reviews_per_pr = recentMergedPRs.length > 0
    ? round(totalReviews / recentMergedPRs.length, 1)
    : 0;

  return {
    open_count,
    merged_7d,
    merged_30d,
    merged_90d,
    opened_7d,
    opened_30d,
    opened_90d,
    closed_not_merged_90d,
    draft_count,
    assigned_count,
    unassigned_count,
    unassigned_24h,
    unassigned_7d,
    assigned_prs: assignedPRs,
    unassigned_prs: unassignedPRs,
    review_time: {
      avg_hours: round(average(sortedReviewTimes)),
      median_hours: round(median(sortedReviewTimes)),
      p90_hours: round(percentile(sortedReviewTimes, 90)),
      p95_hours: round(percentile(sortedReviewTimes, 95)),
    },
    assignment_time: {
      avg_hours: round(average(sortedAssignmentTimes)),
      median_hours: round(median(sortedAssignmentTimes)),
      p90_hours: round(percentile(sortedAssignmentTimes, 90)),
      p95_hours: round(percentile(sortedAssignmentTimes, 95)),
    },
    merge_time: {
      avg_hours: round(average(mergeTimes)),
      median_hours: round(median(mergeTimes)),
    },
    code_review_rate_pct,
    rejection_rate_pct,
    avg_reviews_per_pr,
    by_size,
  };
}
