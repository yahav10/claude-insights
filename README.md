<div align="center">

# 🔬 claude-insights

**Turn your Claude Code `/insight` reports into actionable improvements.**

Parses insight HTML reports and generates prioritized to-dos, CLAUDE.md rules,
hook settings, MCP server recommendations, and custom skills — all tailored to your usage patterns.

[![npm version](https://img.shields.io/npm/v/claude-insights?color=blue&label=npm)](https://www.npmjs.com/package/claude-insights)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-brightgreen)](https://nodejs.org)

</div>

---

## ⚡ Quick Start

```bash
# Install globally
npm install -g claude-insights

# Auto-detect report and apply improvements
claude-insights analyze --apply
```

That's it. Your CLAUDE.md, settings, and skills are updated automatically.

---

## ✨ What's New

| Version | Highlights |
|---------|-----------|
| **v1.4** | 🔍 `skill audit` — validate SKILL.md files against the Claude Skills Guide, scored reports, auto-fix |
| **v1.3** | 🏷️ Friction annotations & false-positive filtering, domain-classified skills, natural examples |
| **v1.1** | 🚀 Auto-apply, trend tracking, watch mode, team aggregation, MCP recommendations, advanced hooks |

---

## 🛠️ Usage

```bash
# Standard mode — generate output files
claude-insights analyze path/to/report.html -o ./my-project

# Auto-apply — merge directly into your project (dedup-aware)
claude-insights analyze path/to/report.html --apply

# With session facet enrichment
claude-insights analyze path/to/report.html --apply --facets

# Wait for report (while /insight runs in Claude Code)
claude-insights analyze --wait --apply

# Watch mode — re-run on report changes
claude-insights watch path/to/report.html -o ./my-project
```

### 🔎 Auto-Detect

When no file is given, the CLI looks for the report at `~/.claude/usage-data/report.html` automatically.

```bash
# These are equivalent:
claude-insights analyze
claude-insights analyze ~/.claude/usage-data/report.html
```

---

## 📋 Commands

| Command | Description |
|---------|-------------|
| 📊 `analyze [file]` | Parse report and generate output files |
| 🔄 `analyze [file] --apply` | Parse and auto-merge into project (dedup-aware) |
| 📈 `analyze [file] --facets` | Enrich with session facet data |
| ⏳ `analyze --wait` | Wait for report to appear, then analyze |
| 👀 `watch <file> -o <dir>` | Watch report file and re-run on changes |
| 📜 `history` | List past analysis runs |
| 🔀 `diff <date1> <date2>` | Compare two analysis runs by date |
| 👥 `team <files...> -o <dir>` | Aggregate multiple team reports |
| 🏷️ `annotate` | Interactive friction annotation walkthrough |
| 🔍 `skill audit [path]` | Audit SKILL.md files against best practices |
| 🔧 `skill audit --fix` | Auto-fix all fixable issues |

### Flags

| Flag | Commands | Description |
|------|----------|-------------|
| `-o, --output-dir <path>` | analyze, watch | Output directory |
| `--apply` | analyze, watch | Merge directly into project |
| `--facets [dir]` | analyze, watch | Include session facet data |
| `--wait [seconds]` | analyze | Wait for report (default 300s) |

---

## 📦 Output Files

| File | What it gives you |
|------|-------------------|
| 📝 `insights-todo.md` | Prioritized task table with steps, time estimates, and friction reduction |
| 📜 `CLAUDE.md-additions.md` | Ready-to-paste rules organized by section (General, CSS, Testing, Debugging) |
| ⚙️ `.claude/settings-insights.json` | Hook configurations and MCP server recommendations |
| 🎯 `.claude/skills/<name>/SKILL.md` | Generated skills following the Agent Skills standard |
| 📖 `insights-README.md` | Placement guide for generated files |

---

## 🔄 Auto-Apply Mode

Use `--apply` to merge output directly into your project:

```bash
claude-insights analyze report.html --apply -o ./my-project
```

| Target | Behavior |
|--------|----------|
| **CLAUDE.md** | Appends new rules under `## Claude Insights Additions`. 80% word-overlap dedup — existing rules are skipped |
| **settings.json** | Deep-merges into `.claude/settings.json`. Hooks merge by event key, MCP servers by name |
| **Skills** | Placed into `.claude/skills/<name>/SKILL.md`. Overwrites on update |

> Safe to run multiple times. Duplicates are detected and skipped.

---

## 🎯 Agent Skills

Generated skills follow the [agentskills.io](https://agentskills.io) open standard:

```
.claude/skills/
  fix-css/
    SKILL.md
  debug-structured/
    SKILL.md
  insights-review/
    SKILL.md
```

Each skill includes:
- **Three-part description** — what, when to use (with scenarios), and negative triggers
- **Domain-specific steps** — tailored to the friction domain (CSS, debugging, testing)
- **"What Goes Wrong" section** — real failure narratives from your sessions
- **Verification checklist** — gates that reference past failures before completion
- **Argument hints** — e.g. `<file-or-component-path>` for CSS skills

Compatible with Claude Code, Cursor, Codex CLI, and VS Code Copilot.

---

## 🔍 Skill Audit

Validate any SKILL.md against the official Claude Skills Guide:

```bash
claude-insights skill audit                    # Auto-detect .claude/skills/
claude-insights skill audit path/to/skill/     # Audit one skill
claude-insights skill audit --fix              # Auto-fix all fixable issues
claude-insights skill audit --json             # JSON output for CI
```

### 17 Checks Across Three Severity Tiers

| Severity | Impact | Examples |
|----------|--------|----------|
| 🔴 **Critical** (score = 0) | Missing frontmatter, invalid name, reserved name, XML in frontmatter | 7 checks |
| 🟡 **High** (-10 each) | Missing action verb, triggers, negative triggers, steps, examples | 6 checks |
| 🟢 **Medium** (-5 each) | Missing metadata, troubleshooting, word count, file references | 4 checks |

### Fix Mode

`--fix` surgically modifies SKILL.md files — only inserts or appends, never deletes:
- **Frontmatter**: Injects `allowed-tools`, `metadata` fields
- **Description**: Appends negative triggers
- **Body**: Appends `## Troubleshooting` section

---

## 📈 Trend Tracking

Every analysis is saved to `~/.claude-insights/history/`:

```bash
claude-insights history                     # List past runs
claude-insights diff 2026-01-15 2026-02-15  # Compare two runs
```

Shows friction count changes, resolved vs. new patterns, and directional summary.

---

## 👥 Team Mode

Aggregate multiple `/insight` reports into shared team insights:

```bash
claude-insights team alice.html bob.html carol.html -o ./team-output
```

- Identifies **shared frictions** across team members with attribution
- Rules in 2+ reports receive **higher priority**
- Generates combined skills, todos, and CLAUDE.md rules

---

## 🏷️ Friction Annotations

Refine output over time by marking frictions:

```bash
claude-insights annotate                              # Interactive walkthrough
claude-insights annotate --false-positive "CSS Issues" # Mark as false positive
claude-insights annotate --useful "Debugging Failures" # Mark as useful
claude-insights annotate --list                       # View annotations
claude-insights annotate --clear                      # Clear all
```

False-positive frictions are filtered from future runs. Annotations persist at `~/.claude-insights/annotations.json` with fuzzy 80% word-overlap matching.

---

## 🔌 MCP Server Recommendations

The analyzer maps friction patterns to relevant MCP servers (Playwright, PostgreSQL, Fetch, Filesystem, Git):

- Server description and install command
- Ready-to-paste config for `.claude/settings.json`
- Matched frictions explaining why it was recommended

In `--apply` mode, MCP configs are merged automatically (existing servers preserved).

---

## ⚙️ Advanced Hooks

Hooks are generated from friction patterns across lifecycle events:

| Event | When it fires |
|-------|--------------|
| `PreToolUse` | Before Claude uses a tool (e.g., check patterns before CSS edits) |
| `PostToolUse` | After tool use (e.g., run tests after edits) |
| `Stop` | Before completing a task (e.g., verify root cause evidence) |

In `--apply` mode, hooks deep-merge by event key — existing hooks preserved.

---

## 🔧 How It Works

```
Report HTML ──▶ Parse (cheerio) ──▶ Filter (annotations) ──▶ Enrich (facets)
     │
     ▼
  Analyze ──▶ Prioritized todos, CLAUDE.md rules, skills, hooks, MCP configs
     │
     ▼
  Generate / Apply ──▶ Write files or merge into project (dedup-aware)
     │
     ▼
  Track ──▶ Save history, show trend report vs. previous run
```

## ⚙️ Tech Stack

| Component | Technology |
|-----------|-----------|
| 🔍 HTML Parsing | cheerio |
| 💻 CLI | Commander.js |
| 💬 Prompts | node:readline |
| 👀 File Watching | node:fs watch |
| 🧪 Testing | Vitest |
| 📝 Language | TypeScript, Node.js 20+ |

---

## 📖 Placement Guide

**Preferred** — automatic with dedup:
```bash
claude-insights analyze report.html --apply
```

**Manual** — review before placing:
1. Copy rules from `CLAUDE.md-additions.md` into your `CLAUDE.md`
2. Merge `settings-insights.json` into `.claude/settings.json`
3. Copy `.claude/skills/` directories into your project
4. Start a new Claude Code session and test

---

## 🤝 Contributing

Contributions welcome! Feel free to open issues or submit pull requests.

## 📄 License

MIT

---

<div align="center">

**Built with ❤️ for the Claude Code community**

*Stop repeating mistakes. Start learning from them.*

</div>
