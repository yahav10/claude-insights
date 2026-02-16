# claude-insights

Standalone CLI tool that parses Claude Code `/insight` report HTML files and generates actionable output: a prioritized to-do list, CLAUDE.md rules, hook settings, and custom skills — all tailored to your specific usage patterns and friction points.

## Install

```bash
cd claude-insights
npm install
npm run build
```

## Usage

```bash
# With interactive project path prompt
node dist/index.js analyze path/to/report.html

# Non-interactive (direct output to a directory)
node dist/index.js analyze path/to/report.html --output-dir ./my-project

# Using the bin shim
./bin/claude-insights.js analyze path/to/report.html
```

### Finding your report

The Claude Code `/insight` report is typically at:
```
~/.claude/usage-data/report.html
```

### Example

```bash
node dist/index.js analyze ~/.claude/usage-data/report.html --output-dir ~/Documents/nexxen-workspace/nexxen-webapp
```

## Output Files

| File | Description |
|------|-------------|
| `insights-todo.md` | Prioritized task table with steps, estimated time, and expected friction reduction |
| `CLAUDE.md-additions.md` | Ready-to-paste CLAUDE.md rules organized by section (General, CSS, Testing, Debugging) |
| `.claude/settings-insights.json` | Hook configurations (e.g., auto-run type-check after edits) |
| `.claude/skills/insights-review.SKILL.md` | Verify-first workflow — forces Claude to check codebase before proposing changes |
| `.claude/skills/fix-css.SKILL.md` | CSS guardrails — Shadow DOM awareness, narrow scoping, regression checks |
| `.claude/skills/debug-structured.SKILL.md` | Structured debugging — reproduce first, evidence before fixes |
| `insights-README.md` | Placement guide for generated files |

## Placement Guide

1. **CLAUDE.md**: Copy the rules from `CLAUDE.md-additions.md` into your project's root `CLAUDE.md`
2. **Settings**: Merge `settings-insights.json` into your existing `.claude/settings.json`
3. **Skills**: Copy `.claude/skills/*.SKILL.md` files into your project's `.claude/skills/` directory
4. **Test**: Start a new Claude Code session and run `/insights-review` on your next task

## How It Works

1. **Parse**: Reads the HTML report using cheerio, extracting stats, project areas, frictions, wins, CLAUDE.md suggestions, features, patterns, and horizon items
2. **Analyze**: Derives a prioritized to-do list from frictions (High priority), CLAUDE.md rules (High), features (Medium), and patterns (Medium). Generates tailored skill files from friction + pattern data
3. **Generate**: Writes all output files to the chosen directory

## Tech Stack

- Node.js 20+, TypeScript
- cheerio (HTML parsing)
- commander (CLI arguments)
- node:readline (interactive prompts)
