import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generate } from '../generator.js';
import type { AnalyzerOutput } from '../types.js';

function makeOutput(overrides?: Partial<AnalyzerOutput>): AnalyzerOutput {
  return {
    todos: [
      {
        task: 'Fix friction: Widget Errors',
        steps: '1. Review\n2. Fix\n3. Test',
        priority: 'High',
        estTime: '5 min',
        expectedWin: 'Less friction',
        source: 'friction',
      },
    ],
    claudeMdAdditions: '# CLAUDE.md Additions\n\n## General Rules\n\nAlways check imports\n',
    settingsJson: { hooks: { 'pre-commit': 'npm run lint' } },
    skills: [
      {
        filename: 'widget-errors.SKILL.md',
        content: '---\nname: widget-errors\ndescription: Fix widget errors\n---\n\n## Steps\n\n1. Diagnose\n',
      },
    ],
    readmeContent: '# Insights Output\n\nPlacement guide content here.\n',
    ...overrides,
  };
}

describe('generator', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates the expected file structure', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-gen-'));
    const output = makeOutput();
    const files = generate(output, tempDir);

    expect(existsSync(join(tempDir, 'insights-todo.md'))).toBe(true);
    expect(existsSync(join(tempDir, 'CLAUDE.md-additions.md'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'settings-insights.json'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'skills', 'widget-errors.SKILL.md'))).toBe(true);
    expect(existsSync(join(tempDir, 'insights-README.md'))).toBe(true);
    expect(files).toHaveLength(5);
  });

  it('creates skill files in the correct directory', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-gen-'));
    const output = makeOutput({
      skills: [
        { filename: 'skill-one.SKILL.md', content: 'Skill one content' },
        { filename: 'skill-two.SKILL.md', content: 'Skill two content' },
      ],
    });
    generate(output, tempDir);

    expect(existsSync(join(tempDir, '.claude', 'skills', 'skill-one.SKILL.md'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'skills', 'skill-two.SKILL.md'))).toBe(true);

    const content = readFileSync(join(tempDir, '.claude', 'skills', 'skill-one.SKILL.md'), 'utf-8');
    expect(content).toBe('Skill one content');
  });

  it('returns correct file paths', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-gen-'));
    const output = makeOutput();
    const files = generate(output, tempDir);

    expect(files).toContain(join(tempDir, 'insights-todo.md'));
    expect(files).toContain(join(tempDir, 'CLAUDE.md-additions.md'));
    expect(files).toContain(join(tempDir, '.claude', 'settings-insights.json'));
    expect(files).toContain(join(tempDir, '.claude', 'skills', 'widget-errors.SKILL.md'));
    expect(files).toContain(join(tempDir, 'insights-README.md'));
  });

  it('writes valid JSON for settings', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-gen-'));
    const output = makeOutput();
    generate(output, tempDir);

    const settingsRaw = readFileSync(join(tempDir, '.claude', 'settings-insights.json'), 'utf-8');
    const parsed = JSON.parse(settingsRaw);
    expect(parsed).toHaveProperty('hooks');
    expect(parsed.hooks['pre-commit']).toBe('npm run lint');
  });

  it('writes todo markdown with table format', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-gen-'));
    const output = makeOutput();
    generate(output, tempDir);

    const todo = readFileSync(join(tempDir, 'insights-todo.md'), 'utf-8');
    expect(todo).toContain('# Insights To-Do List');
    expect(todo).toContain('Widget Errors');
    expect(todo).toContain('Priority');
  });

  it('handles empty skills array', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-gen-'));
    const output = makeOutput({ skills: [] });
    const files = generate(output, tempDir);

    // Should still create the base files (todo, claude-md, settings, readme) = 4
    expect(files).toHaveLength(4);
    expect(existsSync(join(tempDir, '.claude', 'skills'))).toBe(true);
  });

  it('writes empty JSON object for empty settings', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-gen-'));
    const output = makeOutput({ settingsJson: {} });
    generate(output, tempDir);

    const settingsRaw = readFileSync(join(tempDir, '.claude', 'settings-insights.json'), 'utf-8');
    expect(JSON.parse(settingsRaw)).toEqual({});
  });
});
