import { describe, it, expect, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { parseReport } from '../parser.js';
import { analyze } from '../analyzer.js';
import { generate } from '../generator.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

describe('integration: full pipeline', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('full-report fixture produces complete output', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-int-'));

    // Parse
    const data = parseReport(fixturePath('full-report.html'));
    expect(data.frictions).toHaveLength(2);
    expect(data.claudeMdItems).toHaveLength(2);

    // Analyze
    const output = analyze(data);
    expect(output.skills).toHaveLength(2);
    expect(output.todos.length).toBeGreaterThan(0);

    // Generate
    const files = generate(output, tempDir);

    // Verify output files exist
    expect(existsSync(join(tempDir, 'insights-todo.md'))).toBe(true);
    expect(existsSync(join(tempDir, 'CLAUDE.md-additions.md'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'settings-insights.json'))).toBe(true);
    expect(existsSync(join(tempDir, 'insights-README.md'))).toBe(true);

    // Verify skill files exist in directory structure
    for (const skill of output.skills) {
      expect(existsSync(join(tempDir, '.claude', 'skills', skill.dirName, 'SKILL.md'))).toBe(true);
    }

    // Verify file contents have expected structure
    const todoContent = readFileSync(join(tempDir, 'insights-todo.md'), 'utf-8');
    expect(todoContent).toContain('# Insights To-Do List');
    expect(todoContent).toContain('Widget Configuration Errors');

    const claudeMd = readFileSync(join(tempDir, 'CLAUDE.md-additions.md'), 'utf-8');
    expect(claudeMd).toContain('# CLAUDE.md Additions');
    expect(claudeMd).toContain('CSS custom properties');

    const settings = JSON.parse(
      readFileSync(join(tempDir, '.claude', 'settings-insights.json'), 'utf-8')
    );
    expect(settings).toHaveProperty('hooks');

    const readme = readFileSync(join(tempDir, 'insights-README.md'), 'utf-8');
    expect(readme).toContain('Insights Output');

    // Verify correct number of files (todo + claude-md + settings + readme + 2 skills = 6)
    expect(files).toHaveLength(6);
  });

  it('empty-report fixture produces valid but minimal output', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-int-'));

    const data = parseReport(fixturePath('empty-report.html'));
    expect(data.frictions).toHaveLength(0);
    expect(data.claudeMdItems).toHaveLength(0);

    const output = analyze(data);
    expect(output.skills).toHaveLength(0);
    expect(output.todos).toHaveLength(0);

    const files = generate(output, tempDir);

    // Should still produce the base files
    expect(existsSync(join(tempDir, 'insights-todo.md'))).toBe(true);
    expect(existsSync(join(tempDir, 'CLAUDE.md-additions.md'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'settings-insights.json'))).toBe(true);
    expect(existsSync(join(tempDir, 'insights-README.md'))).toBe(true);

    // Settings should be empty JSON object
    const settings = JSON.parse(
      readFileSync(join(tempDir, '.claude', 'settings-insights.json'), 'utf-8')
    );
    expect(settings).toEqual({});

    // No skill files
    expect(files).toHaveLength(4);
  });

  it('minimal-report fixture produces 1 skill and correct todo items', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-int-'));

    const data = parseReport(fixturePath('minimal-report.html'));
    expect(data.frictions).toHaveLength(1);
    expect(data.claudeMdItems).toHaveLength(1);

    const output = analyze(data);
    expect(output.skills).toHaveLength(1);

    const frictionTodos = output.todos.filter(t => t.source === 'friction');
    const claudeMdTodos = output.todos.filter(t => t.source === 'claude-md');
    expect(frictionTodos).toHaveLength(1);
    expect(claudeMdTodos).toHaveLength(1);

    const files = generate(output, tempDir);
    // todo + claude-md + settings + readme + 1 skill = 5
    expect(files).toHaveLength(5);
  });
});

describe('skills/analyze-insights/SKILL.md', () => {
  it('exists and has valid frontmatter', () => {
    const skillPath = join(projectRoot, 'skills', 'analyze-insights', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    const content = readFileSync(skillPath, 'utf-8');
    expect(content).toContain('name: analyze-insights');
    expect(content).toContain('allowed-tools:');
    expect(content).toContain('context: fork');
  });

  it('contains required sections', () => {
    const skillPath = join(projectRoot, 'skills', 'analyze-insights', 'SKILL.md');
    const content = readFileSync(skillPath, 'utf-8');
    expect(content).toContain('## When to Use');
    expect(content).toContain('## Steps');
    expect(content).toContain('## Rules');
  });
});
