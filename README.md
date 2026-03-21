# Anthropic SDK Repository Health Tracker

[![Aggregate Repository Data](https://github.com/localden/ant-repo-data-tracker/actions/workflows/aggregate.yml/badge.svg)](https://github.com/localden/ant-repo-data-tracker/actions/workflows/aggregate.yml)
[![Deploy to GitHub Pages](https://github.com/localden/ant-repo-data-tracker/actions/workflows/deploy.yml/badge.svg)](https://github.com/localden/ant-repo-data-tracker/actions/workflows/deploy.yml)

Project designed to monitor the health of Anthropic open-source SDK repositories. **Only public repositories are tracked**.

Tracked repositories:

- [anthropic-sdk-python](https://github.com/anthropics/anthropic-sdk-python)
- [anthropic-sdk-typescript](https://github.com/anthropics/anthropic-sdk-typescript)
- [anthropic-sdk-go](https://github.com/anthropics/anthropic-sdk-go)
- [anthropic-sdk-java](https://github.com/anthropics/anthropic-sdk-java)
- [anthropic-sdk-csharp](https://github.com/anthropics/anthropic-sdk-csharp)
- [anthropic-sdk-ruby](https://github.com/anthropics/anthropic-sdk-ruby)
- [anthropic-sdk-php](https://github.com/anthropics/anthropic-sdk-php)

## Prerequisites

### Node.js

Node.js 18+ is required for the data aggregation scripts.

```bash
# Using nvm (recommended)
nvm install 18
nvm use 18

# Or via apt
sudo apt update
sudo apt install -y nodejs npm
```

### Hugo

Hugo is required to build the static site dashboard.

**Ubuntu/Debian:**

```bash
# Option 1: Snap (recommended - always up to date)
sudo snap install hugo

# Option 2: apt (may be older version)
sudo apt update
sudo apt install -y hugo

# Option 3: Download latest release directly (if you need extended version)
HUGO_VERSION="0.141.0"
wget https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.deb
sudo dpkg -i hugo_extended_${HUGO_VERSION}_linux-amd64.deb
rm hugo_extended_${HUGO_VERSION}_linux-amd64.deb
```

**macOS:**

```bash
brew install hugo
```

**Verify installation:**

```bash
hugo version
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Create a GitHub Personal Access Token

The aggregator needs a GitHub token to fetch data from the SDK repositories.

1. Go to [GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. Click **"Generate new token"**
3. Configure the token:
   - **Token name**: `Anthropic SDK Dashboard Aggregator`
   - **Expiration**: Choose an appropriate expiration (e.g., 90 days)
   - **Resource owner**: Your username
   - **Repository access**: Select **"Public Repositories (read-only)"**
   - **Permissions**: No additional permissions needed (public repo read is default)
4. Click **"Generate token"**
5. Copy the token

### 3. Run Data Aggregation

```bash
# Set your token
export GITHUB_TOKEN=ghp_your_token_here

# Build the TypeScript aggregator
npm run build

# Run the aggregation (fetches data from GitHub)
npm run aggregate

# Or do a dry run first to see what would happen
npm run aggregate -- --dry-run --verbose
```

This will:
- Fetch issues, PRs, commits, and repository stats from each configured SDK repository
- Compute metrics (assignment status, time-to-assignment, review times, hotspots, etc.)
- Write JSON files to `data/`

### 4. Build and Preview the Site

```bash
# Start the Hugo development server
hugo server

# Open http://localhost:1313 in your browser
```

### 5. Build for Production

```bash
hugo --minify
# Output is in public/
```

## CLI Options

```bash
npm run aggregate -- [options]

Options:
  --dry-run, -n    Compute metrics but don't write files
  --verbose, -v    Enable verbose logging
  --config <path>  Path to repos.json config file (default: ./repos.json)
  --help, -h       Show help message
```

## Configuration

Edit `repos.json` to add or remove repositories:

```json
{
  "repositories": [
    {
      "owner": "anthropics",
      "repo": "anthropic-sdk-python",
      "name": "Python SDK",
      "description": "Official Python SDK for the Anthropic API"
    }
  ]
}
```

Issue and PR triage is tracked by **assignment status** — an issue or PR is considered triaged once it has an assignee. The dashboard surfaces unassigned items and time-to-first-assignment.

## GitHub Actions Setup

The repository includes GitHub Actions workflows that automatically:
1. Run data aggregation every 2 hours
2. Commit updated data to the repository
3. Build and deploy the Hugo site to GitHub Pages

### Setting Up GitHub Actions

#### Step 1: Create a Fine-Grained Personal Access Token

1. Go to [GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. Click **"Generate new token"**
3. Configure the token:
   - **Token name**: `Anthropic SDK Dashboard GitHub Actions`
   - **Expiration**: 90 days (or longer; you'll need to rotate it when it expires)
   - **Resource owner**: Your username
   - **Repository access**: Select **"Public Repositories (read-only)"**
   - **Permissions**: No additional permissions needed
4. Click **"Generate token"**
5. Copy the token

#### Step 2: Add the Token as a Repository Secret

1. Go to your repository's **Settings** > **Secrets and variables** > **Actions**
2. Click **New repository secret**
3. Name: `GH_PAT`
4. Value: Paste your personal access token
5. Click **Add secret**

#### Step 3: Enable GitHub Pages

1. Go to your repository's **Settings** > **Pages**
2. Under **Build and deployment**:
   - Source: **GitHub Actions**
3. Save

#### Step 4: Run the Workflow

The workflow runs automatically on:
- **Schedule**: Every 2 hours (`0 */2 * * *`)
- **Manual trigger**: Go to **Actions** > **Aggregate Repository Data** > **Run workflow**

## Project Structure

```
├── hugo.toml              # Hugo configuration
├── repos.json             # Repository and maintainer configuration
├── content/               # Markdown content pages
│   ├── _index.md         # Homepage
│   ├── issues.md         # Issues page
│   ├── pulls.md          # Pull requests page
│   ├── contributors.md   # Contributors page
│   └── health.md         # Health & trends page
├── layouts/               # Hugo templates
│   ├── _default/         # Base templates
│   ├── partials/         # Reusable components
│   └── index.html        # Homepage template
├── static/                # Static assets
│   ├── css/main.css      # Styles (built from assets/css/main.css)
│   └── js/               # JavaScript
├── data/                  # JSON data files (generated by aggregator)
│   ├── repos.json        # Repository index
│   └── repos/<owner>/<repo>/
│       ├── metrics.json  # Current computed metrics
│       ├── contributors.json
│       └── snapshots/    # Daily metric snapshots
├── src/                   # TypeScript aggregation scripts
│   ├── index.ts          # Entry point
│   ├── aggregator.ts     # Main orchestration
│   ├── cli.ts            # CLI argument parsing
│   ├── github/           # GitHub API integration
│   ├── metrics/          # Metric calculators
│   ├── data/             # Data writers
│   ├── types/            # TypeScript interfaces
│   └── utils/            # Utility functions
├── .github/workflows/     # GitHub Actions
│   ├── aggregate.yml     # Data sync workflow
│   └── deploy.yml        # GitHub Pages deploy workflow
└── public/                # Generated site (gitignored)
```

## License

MIT
