---
name: analyze-insights
description: Analyze Claude Code /insight report and generate actionable files
allowed-tools: ["Bash", "Read", "Write"]
context: fork
argument-hint: "<path-to-report.html>"
---

## When to Use This Skill

- When you have a Claude Code /insight report HTML file to analyze
- After running `/insight` in Claude Code and saving the HTML report
- When you want to generate skills, CLAUDE.md rules, hooks, and todos from your usage patterns

## Steps

1. **Locate the report**: Find the /insight HTML report file. Common locations:
   - `~/.claude/usage-data/report.html`
   - A saved file from the browser after running `/insight`

2. **Run the analysis**: Execute claude-insights against the report:
   ```bash
   npx claude-insights analyze <report-file> -o ./insights
   ```

3. **Review the output**: Check the generated files in the output directory:
   - `insights-todo.md` — Prioritized task list
   - `CLAUDE.md-additions.md` — Rules to add to your CLAUDE.md
   - `.claude/settings-insights.json` — Hook configurations
   - `.claude/skills/*/SKILL.md` — Generated skills
   - `insights-README.md` — Placement guide

4. **Apply directly** (alternative): Use `--apply` to merge directly into your project:
   ```bash
   npx claude-insights analyze <report-file> --apply
   ```

5. **Verify**: Check that the generated rules and skills make sense for your project.

## Rules

- Always review generated output before applying to your project
- The `--apply` mode deduplicates rules — safe to run multiple times
- Generated skills are based on YOUR friction patterns and are project-specific

## Examples

```bash
# Standard analysis with output directory
npx claude-insights analyze ~/report.html -o ./my-project

# Auto-apply to current project
npx claude-insights analyze ~/report.html --apply

# With facet data enrichment
npx claude-insights analyze ~/report.html --apply --facets

# Watch for report changes
npx claude-insights watch ~/report.html -o ./my-project

# Team aggregation
npx claude-insights team report1.html report2.html -o ./team-output
```
