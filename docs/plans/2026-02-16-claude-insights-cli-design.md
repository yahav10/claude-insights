# Claude Insights CLI — Design Document

**Date:** 2026-02-16
**Status:** Approved

## Overview

Standalone Node.js/TypeScript CLI tool that parses Claude Code `/insight` report HTML files and generates actionable output files (todo list, CLAUDE.md additions, hook settings, custom skills).

## Architecture

Single-pass pipeline: **Parse → Analyze → Generate**

### Parser (`parser.ts`)

Loads report HTML with cheerio. Extracts all data into a typed `ReportData` object using the report's CSS class selectors:

- `.stat-value` / `.stat-label` → stats
- `.glance-section` → at-a-glance summaries
- `.project-area` → project areas with session counts
- `.chart-card` / `.bar-row` → chart data (task types, tools, languages, etc.)
- `.narrative` / `.key-insight` → usage narrative
- `.big-win` → wins
- `.friction-category` → frictions with examples
- `.claude-md-item` / `.cmd-code` → CLAUDE.md suggestions
- `.feature-card` → feature recommendations (hooks, skills, headless)
- `.pattern-card` / `.copyable-prompt` → usage patterns with prompts
- `.horizon-card` → future workflow suggestions
- `.fun-ending` → fun ending quote

### Analyzer (`analyzer.ts`)

Takes `ReportData`, produces four output structures:

1. **TodoList**: Prioritized markdown table derived from frictions (→ fix tasks), CLAUDE.md items (→ copy tasks), features (→ setup tasks), patterns (→ try tasks). Priority based on friction severity (bar chart values).

2. **ClaudeMdAdditions**: All `.cmd-code` blocks organized under section headers (General Rules, CSS & Styling, Testing, Debugging).

3. **SettingsInsights**: Hook configurations extracted from feature card code blocks.

4. **Skills**: Skill files generated from top frictions + pattern prompts:
   - `insights-review.SKILL.md` — verify-first workflow
   - `fix-css.SKILL.md` — CSS guardrails with Shadow DOM constraints
   - `debug-structured.SKILL.md` — structured debugging protocol

### Generator (`generator.ts`)

Writes output files to the user-chosen directory:

```
<output-dir>/
├── insights-todo.md
├── CLAUDE.md-additions.md
├── .claude/settings-insights.json
├── .claude/skills/
│   ├── insights-review.SKILL.md
│   ├── fix-css.SKILL.md
│   └── debug-structured.SKILL.md
└── insights-README.md
```

Safety: never overwrites existing CLAUDE.md or .claude/settings.json.

### CLI (`index.ts`)

```
claude-insights analyze <file> [--output-dir <path>]
```

- If `--output-dir` provided: writes directly (non-interactive, for scripting)
- If not: shows interactive prompt listing detected projects, asks user for output path with default `./insights/`
- Uses `node:readline` for interactive prompt (no extra deps)

## Data Model

```typescript
interface ReportData {
  title: string;
  subtitle: string;
  stats: { value: string; label: string }[];
  glance: { label: string; text: string }[];
  projects: { name: string; count: string; description: string }[];
  charts: { title: string; bars: { label: string; value: number; width: number }[] }[];
  narrative: { paragraphs: string[]; keyInsight: string };
  wins: { title: string; description: string }[];
  frictions: { title: string; description: string; examples: string[] }[];
  claudeMdItems: { code: string; why: string }[];
  features: { title: string; oneliner: string; why: string; examples: string[] }[];
  patterns: { title: string; summary: string; detail: string; prompt: string }[];
  horizon: { title: string; possible: string; tip: string; prompt: string }[];
  funEnding: { headline: string; detail: string };
}
```

## Project Structure

```
~/Documents/claude-insights/
├── src/
│   ├── index.ts
│   ├── parser.ts
│   ├── analyzer.ts
│   ├── generator.ts
│   └── types.ts
├── bin/
│   └── claude-insights.js
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencies

- **cheerio**: HTML parsing
- **commander**: CLI argument parsing
- **typescript**, **@types/node**: dev dependencies

No markdown-it (we generate markdown with template literals). No web server.

## Build & Run

- `npm run build` → `tsc` compiles `src/` to `dist/`
- `npx claude-insights analyze report.html`
- `node dist/index.js analyze report.html`

## Decisions

- **Approach A (single-pass cheerio)** chosen over plugin architecture (over-engineered) and LLM-assisted (requires network/API key)
- **node:readline** for interactive prompts instead of inquirer (zero extra deps)
- **Separate output files** (CLAUDE.md-additions.md, settings-insights.json) instead of modifying existing files — safe, non-destructive
- **markdown-it dropped** — generating markdown doesn't require a markdown library
