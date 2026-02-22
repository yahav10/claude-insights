# claude-insights

Standalone CLI tool that parses Claude Code `/insight` report HTML files and generates actionable output: a prioritized to-do list, CLAUDE.md rules, hook settings, MCP server recommendations, and custom skills -- all tailored to your specific usage patterns and friction points.

**v1.3** adds friction annotations & false-positive filtering, domain-classified skills with improved quality, and natural example phrasing.

**v1.1** added auto-apply mode, trend tracking, watch mode, team aggregation, MCP recommendations, advanced hooks, and session facet enrichment.

## Install

```bash
# Global install (recommended)
npm install -g claude-insights

# Or run from source
cd claude-insights
npm install
npm run build
```

## Usage

```bash
# Auto-detect report and apply (simplest usage)
claude-insights analyze --apply

# Standard mode -- generate output files to a directory
claude-insights analyze path/to/report.html -o ./my-project

# Auto-apply mode -- merges directly into your project
claude-insights analyze path/to/report.html --apply

# With session facet data enrichment
claude-insights analyze path/to/report.html --apply --facets

# Wait for report to appear (while /insight is running in Claude Code)
claude-insights analyze --wait --apply

# Wait with custom timeout (600 seconds)
claude-insights analyze --wait 600 -o ./my-project

# Watch mode -- re-run on report changes
claude-insights watch path/to/report.html -o ./my-project

# View past analysis history
claude-insights history

# Compare two analysis runs
claude-insights diff 2026-01-15 2026-02-15

# Team aggregation -- combine multiple reports
claude-insights team report1.html report2.html -o ./team-output

# Annotate frictions -- mark false positives to filter from future runs
claude-insights annotate                              # Interactive walkthrough
claude-insights annotate --false-positive "CSS Issues" # Scriptable
claude-insights annotate --list                       # Show annotations
claude-insights annotate --clear                      # Clear all
```

### Auto-Detect

When no file argument is given, the CLI automatically looks for the report at `~/.claude/usage-data/report.html`. If found, it runs the analysis. If not, it prints instructions for generating one with `/insight`.

```bash
# These are equivalent:
claude-insights analyze
claude-insights analyze ~/.claude/usage-data/report.html
```

### Wait Mode

Use `--wait` to have the CLI watch for the report to appear. This is useful when you run `/insight` in Claude Code and want the analysis to start automatically once it finishes:

```bash
claude-insights analyze --wait --apply
```

### Example

```bash
claude-insights analyze --apply -o ~/Documents/my-project
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `analyze [file]` | Parse report and generate output files (auto-detects default path) |
| `analyze [file] --apply` | Parse and auto-merge into project (dedup-aware) |
| `analyze [file] --facets` | Enrich analysis with session facet data |
| `analyze --wait` | Wait for report to appear, then analyze (default 300s timeout) |
| `watch <file> -o <dir>` | Watch report file and re-run on changes |
| `history` | List past analysis runs |
| `diff <date1> <date2>` | Compare two analysis runs by date |
| `team <files...> -o <dir>` | Aggregate multiple team reports |
| `annotate [file]` | Interactive friction annotation walkthrough |
| `annotate --false-positive <title>` | Mark a friction as false-positive (skipped in future runs) |
| `annotate --useful <title>` | Mark a friction as useful |
| `annotate --list` | Show current annotations |
| `annotate --clear [title]` | Clear one or all annotations |

## Flags Reference

| Flag | Commands | Description |
|------|----------|-------------|
| `-o, --output-dir <path>` | analyze, watch | Output directory for generated files |
| `--apply` | analyze, watch | Merge directly into project (dedup-aware) |
| `--facets [dir]` | analyze, watch | Include session facet data from `~/.claude/usage-data/facets/` or a custom directory |
| `--wait [seconds]` | analyze | Wait for report to appear before analyzing (default 300s) |

## Output Files

| File | Description |
|------|-------------|
| `insights-todo.md` | Prioritized task table with steps, estimated time, and expected friction reduction |
| `CLAUDE.md-additions.md` | Ready-to-paste CLAUDE.md rules organized by section (General, CSS, Testing, Debugging) |
| `.claude/settings-insights.json` | Hook configurations and MCP server recommendations |
| `.claude/skills/<skill-name>/SKILL.md` | Generated skills following the Agent Skills directory standard |
| `insights-README.md` | Placement guide for generated files |

Trend tracking history is cached at `~/.claude-insights/history/` as dated JSON files.

## Agent Skills Standard

Generated skills follow the [agentskills.io](https://agentskills.io) open standard. Each skill lives in its own directory:

```
.claude/skills/
  fix-css/
    SKILL.md
  debug-structured/
    SKILL.md
  insights-review/
    SKILL.md
```

Skills include YAML frontmatter (`name`, `description`, `allowed-tools`, `context`, `argument-hint`) and are compatible with Claude Code, Cursor, Codex CLI, and VS Code Copilot.

Each generated skill includes:
- **Three-part description**: What it does, when to use it (with concrete scenarios), and negative triggers to prevent misfires
- **Domain-specific steps**: Tailored to the friction domain (CSS, debugging, testing, etc.)
- **"What Goes Wrong" section**: Real failure narratives from your sessions that Claude pattern-matches against
- **Verification checklist**: Gate that references past failures before task completion
- **Domain-specific argument hints**: e.g. `<file-or-component-path>` for CSS, `<issue-description-or-log-path>` for debugging

## Auto-Apply Mode

Use `--apply` to merge generated output directly into your project instead of writing separate files:

```bash
claude-insights analyze report.html --apply -o ./my-project
```

What `--apply` does:

- **CLAUDE.md**: Appends new rules under a `## Claude Insights Additions` section. Deduplication uses 80% significant-word overlap -- rules that already exist are skipped.
- **settings.json**: Deep-merges into `.claude/settings.json`. Hooks are merged by event key, MCP servers by server name. Existing entries are preserved.
- **Skills**: Placed directly into `.claude/skills/<skill-name>/SKILL.md`. Overwrites on update.

Safe to run multiple times. Duplicate rules and hooks are detected and skipped.

## Trend Tracking

Every analysis run is saved to `~/.claude-insights/history/`. Use the built-in commands to track progress over time:

```bash
# List all past runs
claude-insights history

# Compare two runs by date
claude-insights diff 2026-01-15 2026-02-15
```

The trend report shows:
- Friction count changes (resolved vs. new)
- Which specific friction patterns appeared or disappeared
- Directional summary (friction reduced, increased, or unchanged)

## Watch Mode

Re-runs the analysis pipeline automatically when the report file changes. Uses a 300ms debounce to avoid redundant runs.

```bash
claude-insights watch ~/.claude/usage-data/report.html -o ./my-project

# Or with auto-apply
claude-insights watch ~/.claude/usage-data/report.html --apply -o ./my-project
```

Stop with `Ctrl+C`.

## Team Mode

Aggregate multiple `/insight` reports into shared team insights. Requires at least 2 report files.

```bash
claude-insights team alice-report.html bob-report.html carol-report.html -o ./team-output
```

Team aggregation:
- Identifies **shared frictions** that appear across multiple team members, with member attribution and count
- Rules appearing in 2+ reports receive **higher priority** in the output
- Generates a combined set of skills, todos, and CLAUDE.md rules covering the full team

## MCP Server Recommendations

The analyzer maps your friction patterns to relevant MCP servers from a built-in registry (Playwright, PostgreSQL, Fetch, Filesystem, Git). When a friction matches, the output includes:

- Server description and install command
- Ready-to-paste config block for `.claude/settings.json` under `mcpServers`
- List of matched frictions explaining why the server was recommended

In `--apply` mode, MCP server configs are merged into `settings.json` automatically (existing servers are not overwritten).

## Advanced Hooks

Hooks are generated from friction patterns across Claude Code lifecycle events:

| Event | Trigger |
|-------|---------|
| `PreToolUse` | Before Claude uses a tool (e.g., check patterns before editing CSS) |
| `PostToolUse` | After tool use (e.g., run tests after edits) |
| `Stop` | Before completing a task (e.g., verify root cause evidence) |

Each hook targets a specific friction category. In `--apply` mode, hooks are deep-merged by event key -- existing hooks are preserved, duplicates are skipped.

## Using as a Claude Code Skill

The `skills/analyze-insights/` directory contains a ready-to-use Claude Code skill. To install:

1. Copy the `skills/` directory into your project's `.claude/` directory
2. Start a new Claude Code session
3. Run `/analyze-insights <path-to-report.html>`

## Placement Guide

**Preferred**: Use `--apply` mode for automatic, dedup-aware placement:
```bash
claude-insights analyze report.html --apply
```

**Manual**: If you prefer to review before placing:
1. **CLAUDE.md**: Copy rules from `CLAUDE.md-additions.md` into your project's root `CLAUDE.md`
2. **Settings**: Merge `settings-insights.json` into your existing `.claude/settings.json`
3. **Skills**: Copy `.claude/skills/<skill-name>/` directories into your project's `.claude/skills/`
4. **Test**: Start a new Claude Code session and invoke a generated skill on your next task

## Friction Annotations

Mark frictions as `useful` or `false-positive` to refine output over time. False-positive frictions are filtered out before skill/rule generation on subsequent runs.

```bash
# Interactive -- walk through each friction
claude-insights annotate

# Scriptable -- mark directly
claude-insights annotate --false-positive "Debugging Wrong Root Causes"
claude-insights annotate --useful "CSS Visual Styling Failures"

# View and manage
claude-insights annotate --list
claude-insights annotate --clear "Debugging Wrong Root Causes"
```

On the next `analyze` run, filtered frictions are reported:
```
⚠️  1 friction(s) marked as false-positive (skipped)
Found 2 friction areas across 47 sessions
```

Annotations persist at `~/.claude-insights/annotations.json` and use fuzzy title matching (80% word overlap) so minor rephrasing between reports doesn't break the match.

## How It Works

1. **Parse**: Reads the HTML report using cheerio, extracting stats, project areas, frictions, wins, CLAUDE.md suggestions, features, patterns, and horizon items
2. **Filter**: Removes frictions annotated as `false-positive` (see [Friction Annotations](#friction-annotations))
3. **Enrich** (optional): If `--facets` is set, parses session facet data (tool usage, session durations) and enriches the analysis
4. **Analyze**: Derives a prioritized to-do list from frictions (High priority), CLAUDE.md rules (High), features (Medium), and patterns (Medium). Generates domain-classified skills with tailored steps, "What Goes Wrong" failure narratives, and verification checklists
5. **Generate / Apply**: Writes output files to the chosen directory, or merges directly into the project with `--apply` (dedup-aware CLAUDE.md append, deep-merge settings, skill placement)
6. **Track**: Saves a history entry to `~/.claude-insights/history/` and displays a trend report comparing with the previous run

## Tech Stack

- Node.js 20+, TypeScript
- cheerio (HTML parsing)
- commander (CLI arguments)
- node:readline (interactive prompts)
- node:fs `watch` (watch mode)
- vitest (testing)
