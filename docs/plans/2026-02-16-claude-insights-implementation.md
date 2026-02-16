# Claude Insights CLI — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone CLI tool that parses Claude Code `/insight` report HTML and generates actionable files (todo list, CLAUDE.md rules, hook settings, custom skills).

**Architecture:** Single-pass pipeline — cheerio parses HTML into typed `ReportData`, analyzer derives insights and output structures, generator writes files to user-chosen directory. Interactive prompt via `node:readline` asks user where to place output.

**Tech Stack:** Node 20, TypeScript 5.7, cheerio (HTML parsing), commander (CLI args), node:readline (interactive prompts)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `bin/claude-insights.js`
- Create: `src/types.ts` (empty placeholder)
- Create: `src/index.ts` (empty placeholder)

**Step 1: Initialize package.json**

```json
{
  "name": "claude-insights",
  "version": "1.0.0",
  "description": "CLI tool to analyze Claude Code /insight reports and generate actionable files",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "claude-insights": "./bin/claude-insights.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "keywords": ["claude", "insights", "cli"],
  "license": "MIT"
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create bin shim**

Create `bin/claude-insights.js`:
```javascript
#!/usr/bin/env node
import '../dist/index.js';
```

**Step 4: Install dependencies**

Run: `cd /Users/tomyahav/Documents/claude-insights && npm install cheerio commander`
Run: `cd /Users/tomyahav/Documents/claude-insights && npm install -D typescript @types/node`

**Step 5: Create placeholder source files**

Create `src/types.ts` with an empty export.
Create `src/index.ts` with `console.log("claude-insights")`.

**Step 6: Verify build works**

Run: `cd /Users/tomyahav/Documents/claude-insights && npm run build`
Expected: Compiles to `dist/` with no errors.

Run: `node /Users/tomyahav/Documents/claude-insights/dist/index.js`
Expected: Prints "claude-insights"

**Step 7: Commit**

```bash
cd /Users/tomyahav/Documents/claude-insights && git init && git add -A && git commit -m "chore: scaffold claude-insights project"
```

---

### Task 2: Types

**Files:**
- Create: `src/types.ts`

**Step 1: Write the ReportData interface and output types**

```typescript
export interface StatItem {
  value: string;
  label: string;
}

export interface GlanceItem {
  label: string;
  text: string;
}

export interface ProjectArea {
  name: string;
  count: string;
  description: string;
}

export interface BarItem {
  label: string;
  value: number;
  width: number;
}

export interface ChartData {
  title: string;
  bars: BarItem[];
}

export interface Narrative {
  paragraphs: string[];
  keyInsight: string;
}

export interface BigWin {
  title: string;
  description: string;
}

export interface FrictionCategory {
  title: string;
  description: string;
  examples: string[];
}

export interface ClaudeMdItem {
  code: string;
  why: string;
}

export interface FeatureCard {
  title: string;
  oneliner: string;
  why: string;
  examples: string[];
}

export interface PatternCard {
  title: string;
  summary: string;
  detail: string;
  prompt: string;
}

export interface HorizonCard {
  title: string;
  possible: string;
  tip: string;
  prompt: string;
}

export interface FunEnding {
  headline: string;
  detail: string;
}

export interface ReportData {
  title: string;
  subtitle: string;
  stats: StatItem[];
  glance: GlanceItem[];
  projects: ProjectArea[];
  charts: ChartData[];
  narrative: Narrative;
  wins: BigWin[];
  frictions: FrictionCategory[];
  claudeMdItems: ClaudeMdItem[];
  features: FeatureCard[];
  patterns: PatternCard[];
  horizon: HorizonCard[];
  funEnding: FunEnding;
}

// --- Analyzer output types ---

export interface TodoItem {
  task: string;
  steps: string;
  priority: 'High' | 'Medium' | 'Low';
  estTime: string;
  expectedWin: string;
  source: 'friction' | 'claude-md' | 'feature' | 'pattern';
}

export interface SkillFile {
  filename: string;
  content: string;
}

export interface AnalyzerOutput {
  todos: TodoItem[];
  claudeMdAdditions: string;
  settingsJson: object;
  skills: SkillFile[];
  readmeContent: string;
}
```

**Step 2: Verify build**

Run: `cd /Users/tomyahav/Documents/claude-insights && npm run build`
Expected: No errors.

**Step 3: Commit**

```bash
cd /Users/tomyahav/Documents/claude-insights && git add src/types.ts && git commit -m "feat: add ReportData and output type definitions"
```

---

### Task 3: Parser

**Files:**
- Create: `src/parser.ts`

**Step 1: Write the parser**

The parser loads an HTML file, uses cheerio to extract each section into `ReportData`. Key selectors:

- `h1` → title
- `.subtitle` → subtitle
- `.stat` → iterate, `.stat-value` + `.stat-label`
- `.glance-section` → iterate, extract `strong` text as label, full text as text
- `.project-area` → `.area-name`, `.area-count`, `.area-desc`
- `.chart-card` → `.chart-title`, then `.bar-row` children: `.bar-label`, `.bar-value`, `.bar-fill` style width
- `.narrative p` → paragraphs, `.key-insight` → key insight
- `.big-win` → `.big-win-title`, `.big-win-desc`
- `.friction-category` → `.friction-title`, `.friction-desc`, `.friction-examples li`
- `.claude-md-item` → `.cmd-code`, `.cmd-why`
- `.feature-card` → `.feature-title`, `.feature-oneliner`, `.feature-why`, `.example-code`
- `.pattern-card` → `.pattern-title`, `.pattern-summary`, `.pattern-detail`, `.copyable-prompt`
- `.horizon-card` → `.horizon-title`, `.horizon-possible`, `.horizon-tip`, nested `code` in `.pattern-prompt`
- `.fun-ending` → `.fun-headline`, `.fun-detail`

```typescript
import * as cheerio from 'cheerio';
import { readFileSync } from 'node:fs';
import type { ReportData } from './types.js';

export function parseReport(filePath: string): ReportData {
  const html = readFileSync(filePath, 'utf-8');
  const $ = cheerio.load(html);

  // Title & subtitle
  const title = $('h1').first().text().trim();
  const subtitle = $('.subtitle').first().text().trim();

  // Stats
  const stats = $('.stat').map((_, el) => ({
    value: $(el).find('.stat-value').text().trim(),
    label: $(el).find('.stat-label').text().trim(),
  })).get();

  // At a glance
  const glance = $('.glance-section').map((_, el) => {
    const strong = $(el).find('strong').first().text().trim().replace(/:$/, '');
    const text = $(el).text().trim();
    return { label: strong, text };
  }).get();

  // Projects
  const projects = $('.project-area').map((_, el) => ({
    name: $(el).find('.area-name').text().trim(),
    count: $(el).find('.area-count').text().trim(),
    description: $(el).find('.area-desc').text().trim(),
  })).get();

  // Charts
  const charts = $('.chart-card').map((_, el) => {
    const chartTitle = $(el).find('.chart-title').first().text().trim();
    const bars = $(el).find('.bar-row').map((_, row) => {
      const label = $(row).find('.bar-label').text().trim();
      const valueText = $(row).find('.bar-value').text().trim();
      const value = parseInt(valueText, 10) || 0;
      const fillStyle = $(row).find('.bar-fill').attr('style') || '';
      const widthMatch = fillStyle.match(/width:\s*([\d.]+)%/);
      const width = widthMatch ? parseFloat(widthMatch[1]) : 0;
      return { label, value, width };
    }).get();
    return { title: chartTitle, bars };
  }).get();

  // Narrative
  const narrativeParagraphs = $('.narrative p').map((_, el) => $(el).text().trim()).get();
  const keyInsight = $('.key-insight').first().text().trim();
  const narrative = { paragraphs: narrativeParagraphs, keyInsight };

  // Big wins
  const wins = $('.big-win').map((_, el) => ({
    title: $(el).find('.big-win-title').text().trim(),
    description: $(el).find('.big-win-desc').text().trim(),
  })).get();

  // Frictions
  const frictions = $('.friction-category').map((_, el) => ({
    title: $(el).find('.friction-title').text().trim(),
    description: $(el).find('.friction-desc').text().trim(),
    examples: $(el).find('.friction-examples li').map((_, li) => $(li).text().trim()).get(),
  })).get();

  // CLAUDE.md items
  const claudeMdItems = $('.claude-md-item').map((_, el) => ({
    code: $(el).find('.cmd-code').text().trim(),
    why: $(el).find('.cmd-why').text().trim(),
  })).get();

  // Features
  const features = $('.feature-card').map((_, el) => ({
    title: $(el).find('.feature-title').text().trim(),
    oneliner: $(el).find('.feature-oneliner').text().trim(),
    why: $(el).find('.feature-why').text().trim(),
    examples: $(el).find('.example-code').map((_, code) => $(code).text().trim()).get(),
  })).get();

  // Patterns
  const patterns = $('.pattern-card').map((_, el) => ({
    title: $(el).find('.pattern-title').text().trim(),
    summary: $(el).find('.pattern-summary').text().trim(),
    detail: $(el).find('.pattern-detail').text().trim(),
    prompt: $(el).find('.copyable-prompt').text().trim(),
  })).get();

  // Horizon
  const horizon = $('.horizon-card').map((_, el) => ({
    title: $(el).find('.horizon-title').text().trim(),
    possible: $(el).find('.horizon-possible').text().trim(),
    tip: $(el).find('.horizon-tip').text().trim(),
    prompt: $(el).find('.pattern-prompt code').text().trim(),
  })).get();

  // Fun ending
  const funEnding = {
    headline: $('.fun-headline').first().text().trim(),
    detail: $('.fun-detail').first().text().trim(),
  };

  return {
    title, subtitle, stats, glance, projects, charts,
    narrative, wins, frictions, claudeMdItems, features,
    patterns, horizon, funEnding,
  };
}
```

**Step 2: Quick smoke test — add a temporary main to parser.ts**

Add to bottom of `src/parser.ts` temporarily:
```typescript
// Smoke test - remove after verification
if (process.argv[2] === '--smoke') {
  const data = parseReport(process.argv[3]);
  console.log(JSON.stringify(data, null, 2).slice(0, 2000));
}
```

Run: `cd /Users/tomyahav/Documents/claude-insights && npm run build && node dist/parser.js --smoke /Users/tomyahav/.claude/usage-data/report.html`
Expected: JSON output showing title "Claude Code Insights", stats array with 5 items, projects array with 5 items, frictions array with 3 items.

**Step 3: Remove the smoke test code from parser.ts**

**Step 4: Verify build clean**

Run: `cd /Users/tomyahav/Documents/claude-insights && npm run build`
Expected: No errors.

**Step 5: Commit**

```bash
cd /Users/tomyahav/Documents/claude-insights && git add src/parser.ts && git commit -m "feat: add HTML parser with cheerio extraction"
```

---

### Task 4: Analyzer

**Files:**
- Create: `src/analyzer.ts`

**Step 1: Write the analyzer**

The analyzer takes `ReportData` and produces `AnalyzerOutput`:

```typescript
import type { ReportData, AnalyzerOutput, TodoItem, SkillFile } from './types.js';

export function analyze(data: ReportData): AnalyzerOutput {
  const todos = buildTodos(data);
  const claudeMdAdditions = buildClaudeMdAdditions(data);
  const settingsJson = buildSettings(data);
  const skills = buildSkills(data);
  const readmeContent = buildReadme();
  return { todos, claudeMdAdditions, settingsJson, skills, readmeContent };
}
```

**buildTodos**: Iterates frictions (High priority), claudeMdItems (High), features (Medium), patterns (Medium/Low). Assigns estimated time and expected win percentages based on friction bar values. Sorts by priority.

For each friction, map to a concrete task:
- "Premature Solutions Without Codebase Verification" → "Add verify-first rule to CLAUDE.md + create insights-review skill"
- "Repeated CSS and Visual Styling Failures" → "Create CSS guardrails skill + add Shadow DOM rules to CLAUDE.md"
- "Debugging Wrong Root Causes" → "Create structured debugging skill + add debugging rules to CLAUDE.md"

For each CLAUDE.md item, the task is "Add [section] rule to CLAUDE.md".

For each feature, the task is "Set up [feature name]".

**buildClaudeMdAdditions**: Groups the `.cmd-code` blocks by their section header (parsed from the `data-text` attribute context — "General Rules", "CSS & Styling", "Testing", "Debugging"). Outputs a markdown file:

```markdown
# CLAUDE.md Additions
## General Rules
- Rule 1...
- Rule 2...

## CSS & Styling
- Rule...

## Testing
- Rule...

## Debugging
- Rule...
```

**buildSettings**: Extracts hook JSON from feature card examples. Returns:
```json
{
  "hooks": {
    "postEdit": {
      "command": "npx vue-tsc --noEmit --pretty 2>&1 | head -20",
      "description": "Type-check after edits to catch issues early"
    }
  }
}
```

**buildSkills**: Generates 3 skill files:

1. `insights-review.SKILL.md` — Based on the "verify first" pattern prompt + friction examples about premature solutions.
2. `fix-css.SKILL.md` — Based on the CSS friction + CSS guardrails pattern prompt + Shadow DOM constraints from CLAUDE.md items.
3. `debug-structured.SKILL.md` — Based on debugging friction + structured reproduction pattern prompt.

Each skill file follows the format:
```markdown
---
name: <skill-name>
description: <one-liner>
---

## Instructions
<prompt content from patterns/horizon>

## Context
<relevant friction examples and CLAUDE.md rules>
```

**buildReadme**: Static content explaining where to place each generated file.

**Step 2: Verify build**

Run: `cd /Users/tomyahav/Documents/claude-insights && npm run build`
Expected: No errors.

**Step 3: Commit**

```bash
cd /Users/tomyahav/Documents/claude-insights && git add src/analyzer.ts && git commit -m "feat: add analyzer deriving todos, rules, settings, and skills"
```

---

### Task 5: Generator

**Files:**
- Create: `src/generator.ts`

**Step 1: Write the generator**

```typescript
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnalyzerOutput } from './types.js';

export function generate(output: AnalyzerOutput, outputDir: string): string[] {
  // Create directories
  mkdirSync(join(outputDir, '.claude', 'skills'), { recursive: true });

  const files: string[] = [];

  // 1. insights-todo.md
  const todoPath = join(outputDir, 'insights-todo.md');
  writeFileSync(todoPath, formatTodoTable(output.todos));
  files.push(todoPath);

  // 2. CLAUDE.md-additions.md
  const claudeMdPath = join(outputDir, 'CLAUDE.md-additions.md');
  writeFileSync(claudeMdPath, output.claudeMdAdditions);
  files.push(claudeMdPath);

  // 3. settings-insights.json
  const settingsPath = join(outputDir, '.claude', 'settings-insights.json');
  writeFileSync(settingsPath, JSON.stringify(output.settingsJson, null, 2));
  files.push(settingsPath);

  // 4. Skills
  for (const skill of output.skills) {
    const skillPath = join(outputDir, '.claude', 'skills', skill.filename);
    writeFileSync(skillPath, skill.content);
    files.push(skillPath);
  }

  // 5. README
  const readmePath = join(outputDir, 'insights-README.md');
  writeFileSync(readmePath, output.readmeContent);
  files.push(readmePath);

  return files;
}
```

`formatTodoTable` renders the TodoItem array as a markdown table.

**Step 2: Verify build**

Run: `cd /Users/tomyahav/Documents/claude-insights && npm run build`
Expected: No errors.

**Step 3: Commit**

```bash
cd /Users/tomyahav/Documents/claude-insights && git add src/generator.ts && git commit -m "feat: add file generator writing output to disk"
```

---

### Task 6: CLI Entry Point with Interactive Prompt

**Files:**
- Modify: `src/index.ts`

**Step 1: Write the CLI**

```typescript
import { Command } from 'commander';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { parseReport } from './parser.js';
import { analyze } from './analyzer.js';
import { generate } from './generator.js';

const program = new Command();

program
  .name('claude-insights')
  .description('Analyze Claude Code /insight reports and generate actionable files')
  .version('1.0.0');

program
  .command('analyze')
  .description('Parse an insight report HTML file and generate output files')
  .argument('<file>', 'Path to the report.html file')
  .option('-o, --output-dir <path>', 'Output directory (skips interactive prompt)')
  .action(async (file: string, opts: { outputDir?: string }) => {
    // 1. Parse
    const filePath = resolve(file);
    if (!existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
    const data = parseReport(filePath);
    console.log(`\n✓ Parsed report: ${data.stats.find(s => s.label === 'Messages')?.value ?? '?'} messages, ${data.subtitle}`);

    // 2. Analyze
    const output = analyze(data);
    console.log(`✓ Analyzed: ${output.todos.length} tasks, ${output.skills.length} skills`);

    // 3. Determine output dir
    let outputDir: string;
    if (opts.outputDir) {
      outputDir = resolve(opts.outputDir);
    } else {
      outputDir = await promptForOutputDir(data);
    }

    // 4. Generate
    const files = generate(output, outputDir);
    console.log(`\n✓ Generated ${files.length} files in ${outputDir}/:`);
    for (const f of files) {
      console.log(`  - ${f.replace(outputDir + '/', '')}`);
    }
  });

async function promptForOutputDir(data: import('./types.js').ReportData): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const question = (q: string) => new Promise<string>((res) => rl.question(q, res));

  console.log('\nDetected project areas from your report:');
  data.projects.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name} (${p.count})`);
  });

  console.log('\nWhere should I generate the output files?');
  console.log('  [1] Current directory (./insights/)  ← default');
  console.log('  [2] Enter a project path');

  const choice = await question('\n> ');
  let dir: string;

  if (choice.trim() === '2') {
    const path = await question('Project path: ');
    dir = resolve(path.trim().replace(/^~/, process.env.HOME || '~'));
  } else {
    dir = resolve('./insights');
  }

  rl.close();
  return dir;
}

program.parse();
```

**Step 2: Build and test end-to-end**

Run: `cd /Users/tomyahav/Documents/claude-insights && npm run build`
Expected: No errors.

Run: `cd /Users/tomyahav/Documents/claude-insights && node dist/index.js analyze /Users/tomyahav/.claude/usage-data/report.html --output-dir /tmp/claude-insights-test`
Expected: Parses report, generates files in /tmp/claude-insights-test/, prints summary of generated files.

**Step 3: Verify generated files look correct**

Run: `cat /tmp/claude-insights-test/insights-todo.md`
Expected: Markdown table with prioritized tasks.

Run: `cat /tmp/claude-insights-test/CLAUDE.md-additions.md`
Expected: CLAUDE.md rules grouped by section.

Run: `cat /tmp/claude-insights-test/.claude/settings-insights.json`
Expected: Valid JSON with hooks config.

Run: `ls /tmp/claude-insights-test/.claude/skills/`
Expected: 3 .SKILL.md files.

**Step 4: Commit**

```bash
cd /Users/tomyahav/Documents/claude-insights && git add src/index.ts bin/claude-insights.js && git commit -m "feat: add CLI entry point with interactive prompt"
```

---

### Task 7: End-to-End Test Against Real Report

**Files:** None (testing only)

**Step 1: Run against the real report with --output-dir**

Run: `cd /Users/tomyahav/Documents/claude-insights && node dist/index.js analyze /Users/tomyahav/.claude/usage-data/report.html --output-dir /tmp/insights-e2e`

**Step 2: Validate each output file**

Check insights-todo.md has tasks derived from the 3 frictions (premature solutions, CSS failures, wrong root causes), 5 CLAUDE.md items, 3 features (hooks, skills, headless), and 3 patterns.

Check CLAUDE.md-additions.md has sections for General Rules, CSS & Styling, Testing, Debugging.

Check settings-insights.json has the `postEdit` hook with `npx vue-tsc --noEmit`.

Check skills reference Shadow DOM, verify-first, structured debugging content from the report.

Check insights-README.md has placement instructions.

**Step 3: Fix any issues found, rebuild, re-test**

**Step 4: Final commit**

```bash
cd /Users/tomyahav/Documents/claude-insights && git add -A && git commit -m "chore: finalize and verify end-to-end"
```

---

### Task 8: README

**Files:**
- Create: `README.md` (project root)

**Step 1: Write README.md**

Content covering:
- What it does (one paragraph)
- Install: `npm install` / `npm run build`
- Usage: `node dist/index.js analyze <report.html> [--output-dir <path>]`
- Output files list with descriptions
- Placement guide: "Copy CLAUDE.md-additions.md content to your project's root CLAUDE.md. Merge settings-insights.json into your .claude/settings.json. Copy skills to .claude/skills/. Test with /insights-review."

**Step 2: Commit**

```bash
cd /Users/tomyahav/Documents/claude-insights && git add README.md && git commit -m "docs: add README with usage and placement guide"
```
