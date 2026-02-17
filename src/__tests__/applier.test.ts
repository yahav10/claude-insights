import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mergeClaudeMd, mergeSettings, placeSkills, applyToProject, formatApplySummary } from '../applier.js';
import type { AnalyzerOutput, SkillFile, ApplyResult } from '../types.js';

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
    claudeMdAdditions: '# CLAUDE.md Additions\n\n## General Rules\n\nAlways check imports before adding new ones.\n\n> _Why: Prevents duplicate imports._\n\nNever modify files outside the stated scope.\n\n> _Why: Keeps changes focused._\n',
    settingsJson: {
      hooks: {
        PreToolUse: [
          { type: 'prompt', prompt: 'Check existing patterns first', description: 'Verify approach' },
        ],
      },
    },
    skills: [
      {
        skillName: 'widget-errors',
        dirName: 'widget-errors',
        filename: 'SKILL.md',
        content: '---\nname: widget-errors\ndescription: Fix widget errors\n---\n\n## Steps\n\n1. Diagnose\n',
      },
    ],
    readmeContent: '# Insights Output\n\nPlacement guide content here.\n',
    mcpRecommendations: [
      {
        serverName: 'playwright',
        description: 'Visual testing',
        installCommand: 'npx @anthropic-ai/mcp-server-playwright',
        configBlock: { command: 'npx', args: ['@anthropic-ai/mcp-server-playwright'] },
        matchedFrictions: ['CSS Issues'],
      },
    ],
    ...overrides,
  };
}

describe('mergeClaudeMd', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('appends new rules to existing CLAUDE.md', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const claudeMdPath = join(tempDir, 'CLAUDE.md');
    writeFileSync(claudeMdPath, '# My Project Rules\n\nExisting rule about linting.\n');

    const output = makeOutput();
    const result = mergeClaudeMd(output, tempDir);

    const content = readFileSync(claudeMdPath, 'utf-8');
    expect(content).toContain('# My Project Rules');
    expect(content).toContain('Existing rule about linting.');
    expect(content).toContain('## Claude Insights Additions');
    expect(content).toContain('Always check imports before adding new ones.');
    expect(content).toContain('Never modify files outside the stated scope.');
    expect(result.status).toBe('updated');
    expect(result.rulesAdded).toBe(2);
    expect(result.rulesSkipped).toBe(0);
  });

  it('skips rules that already exist (exact + fuzzy dedup via significantWords overlap)', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const claudeMdPath = join(tempDir, 'CLAUDE.md');
    // Existing content already has a rule about checking imports (fuzzy match)
    writeFileSync(claudeMdPath, '# Rules\n\nAlways check your imports before you add any new ones to the project.\n');

    const output = makeOutput();
    const result = mergeClaudeMd(output, tempDir);

    const content = readFileSync(claudeMdPath, 'utf-8');
    // The imports rule should be skipped (fuzzy match), scope rule should be added
    expect(result.rulesSkipped).toBeGreaterThanOrEqual(1);
    expect(result.rulesAdded).toBeGreaterThanOrEqual(1);
    // The scope rule should still appear
    expect(content).toContain('Never modify files outside the stated scope.');
  });

  it('creates CLAUDE.md if it does not exist', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const claudeMdPath = join(tempDir, 'CLAUDE.md');

    const output = makeOutput();
    const result = mergeClaudeMd(output, tempDir);

    expect(existsSync(claudeMdPath)).toBe(true);
    const content = readFileSync(claudeMdPath, 'utf-8');
    expect(content).toContain('## Claude Insights Additions');
    expect(content).toContain('Always check imports before adding new ones.');
    expect(result.status).toBe('created');
    expect(result.rulesAdded).toBe(2);
  });

  it('preserves existing content unchanged', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const claudeMdPath = join(tempDir, 'CLAUDE.md');
    const existingContent = '# My Project\n\n## Important Rules\n\nDo not touch production database.\n\n## Testing\n\nAlways run tests before pushing.\n';
    writeFileSync(claudeMdPath, existingContent);

    const output = makeOutput();
    mergeClaudeMd(output, tempDir);

    const content = readFileSync(claudeMdPath, 'utf-8');
    expect(content).toContain('# My Project');
    expect(content).toContain('Do not touch production database.');
    expect(content).toContain('Always run tests before pushing.');
  });

  it('returns unchanged when all rules already exist', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const claudeMdPath = join(tempDir, 'CLAUDE.md');
    // Write content that includes both rules already
    writeFileSync(claudeMdPath, '# Rules\n\nAlways check imports before adding new ones.\n\nNever modify files outside the stated scope.\n');

    const output = makeOutput();
    const result = mergeClaudeMd(output, tempDir);

    expect(result.status).toBe('unchanged');
    expect(result.rulesAdded).toBe(0);
    expect(result.rulesSkipped).toBe(2);
  });

  it('handles empty claudeMdAdditions gracefully', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const claudeMdPath = join(tempDir, 'CLAUDE.md');
    writeFileSync(claudeMdPath, '# Rules\n\nExisting rule.\n');

    const output = makeOutput({ claudeMdAdditions: '# CLAUDE.md Additions\n\n' });
    const result = mergeClaudeMd(output, tempDir);

    expect(result.status).toBe('unchanged');
    expect(result.rulesAdded).toBe(0);
  });
});

describe('mergeSettings', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('merges new hooks into existing hooks', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const settingsDir = join(tempDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, 'settings.json'), JSON.stringify({
      hooks: {
        Stop: [{ type: 'prompt', prompt: 'Existing stop hook' }],
      },
    }, null, 2));

    const output = makeOutput();
    const result = mergeSettings(output, tempDir);

    const settings = JSON.parse(readFileSync(join(settingsDir, 'settings.json'), 'utf-8'));
    // Should have both the existing Stop hook and the new PreToolUse hook
    expect(settings.hooks.Stop).toHaveLength(1);
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(result).toBe('updated');
  });

  it('does not duplicate existing hook entries', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const settingsDir = join(tempDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, 'settings.json'), JSON.stringify({
      hooks: {
        PreToolUse: [
          { type: 'prompt', prompt: 'Check existing patterns first', description: 'Verify approach' },
        ],
      },
    }, null, 2));

    const output = makeOutput({ mcpRecommendations: [] });
    const result = mergeSettings(output, tempDir);

    const settings = JSON.parse(readFileSync(join(settingsDir, 'settings.json'), 'utf-8'));
    // Should still have only 1 PreToolUse hook (no duplication)
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(result).toBe('unchanged');
  });

  it('creates settings.json if not exist', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const settingsPath = join(tempDir, '.claude', 'settings.json');

    const output = makeOutput();
    const result = mergeSettings(output, tempDir);

    expect(existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(result).toBe('created');
  });

  it('preserves non-hook settings', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const settingsDir = join(tempDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, 'settings.json'), JSON.stringify({
      permissions: { allow: ['Read', 'Write'] },
      hooks: {
        Stop: [{ type: 'prompt', prompt: 'Existing stop hook' }],
      },
    }, null, 2));

    const output = makeOutput();
    mergeSettings(output, tempDir);

    const settings = JSON.parse(readFileSync(join(settingsDir, 'settings.json'), 'utf-8'));
    expect(settings.permissions).toEqual({ allow: ['Read', 'Write'] });
  });

  it('merges MCP server configs into existing mcpServers', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const settingsDir = join(tempDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, 'settings.json'), JSON.stringify({
      mcpServers: {
        postgres: { command: 'npx', args: ['@anthropic-ai/mcp-server-postgres'] },
      },
    }, null, 2));

    const output = makeOutput();
    const result = mergeSettings(output, tempDir);

    const settings = JSON.parse(readFileSync(join(settingsDir, 'settings.json'), 'utf-8'));
    // Should have both existing postgres and new playwright
    expect(settings.mcpServers.postgres).toBeDefined();
    expect(settings.mcpServers.playwright).toBeDefined();
    expect(result).toBe('updated');
  });

  it('does not duplicate existing MCP server entries', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const settingsDir = join(tempDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, 'settings.json'), JSON.stringify({
      mcpServers: {
        playwright: { command: 'npx', args: ['@anthropic-ai/mcp-server-playwright'] },
      },
    }, null, 2));

    const output = makeOutput({ settingsJson: {}, mcpRecommendations: [
      {
        serverName: 'playwright',
        description: 'Visual testing',
        installCommand: 'npx @anthropic-ai/mcp-server-playwright',
        configBlock: { command: 'npx', args: ['@anthropic-ai/mcp-server-playwright'] },
        matchedFrictions: ['CSS Issues'],
      },
    ] });
    mergeSettings(output, tempDir);

    const settings = JSON.parse(readFileSync(join(settingsDir, 'settings.json'), 'utf-8'));
    // playwright should exist but not be duplicated (still an object, not array)
    expect(settings.mcpServers.playwright).toBeDefined();
  });

  it('returns unchanged when settings already contain all hooks and servers', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const settingsDir = join(tempDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, 'settings.json'), JSON.stringify({
      hooks: {
        PreToolUse: [
          { type: 'prompt', prompt: 'Check existing patterns first', description: 'Verify approach' },
        ],
      },
      mcpServers: {
        playwright: { command: 'npx', args: ['@anthropic-ai/mcp-server-playwright'] },
      },
    }, null, 2));

    const output = makeOutput();
    const result = mergeSettings(output, tempDir);

    expect(result).toBe('unchanged');
  });
});

describe('placeSkills', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates skill directories under .claude/skills/', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const skills: SkillFile[] = [
      { skillName: 'widget-errors', dirName: 'widget-errors', filename: 'SKILL.md', content: 'Skill content' },
      { skillName: 'css-review', dirName: 'css-review', filename: 'SKILL.md', content: 'CSS skill content' },
    ];

    const count = placeSkills(skills, tempDir);

    expect(existsSync(join(tempDir, '.claude', 'skills', 'widget-errors', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'skills', 'css-review', 'SKILL.md'))).toBe(true);
    expect(count).toBe(2);
  });

  it('overwrites existing skills on update', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const skillDir = join(tempDir, '.claude', 'skills', 'widget-errors');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), 'Old content');

    const skills: SkillFile[] = [
      { skillName: 'widget-errors', dirName: 'widget-errors', filename: 'SKILL.md', content: 'New updated content' },
    ];

    placeSkills(skills, tempDir);

    const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8');
    expect(content).toBe('New updated content');
  });

  it('returns 0 for empty skills array', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const count = placeSkills([], tempDir);
    expect(count).toBe(0);
  });
});

describe('applyToProject', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('calls all merge functions and returns ApplyResult', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const output = makeOutput();
    const result = applyToProject(output, tempDir);

    expect(result).toHaveProperty('claudeMdStatus');
    expect(result).toHaveProperty('settingsStatus');
    expect(result).toHaveProperty('skillsPlaced');
    expect(result).toHaveProperty('rulesAdded');
    expect(result).toHaveProperty('rulesSkipped');
  });

  it('returns created status when no prior files exist', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    const output = makeOutput();
    const result = applyToProject(output, tempDir);

    expect(result.claudeMdStatus).toBe('created');
    expect(result.settingsStatus).toBe('created');
    expect(result.skillsPlaced).toBe(1);
    expect(result.rulesAdded).toBe(2);
  });

  it('returns updated status when merging into existing files', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    // Create existing CLAUDE.md and settings.json
    writeFileSync(join(tempDir, 'CLAUDE.md'), '# Existing Rules\n\nSome rule here.\n');
    const settingsDir = join(tempDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, 'settings.json'), JSON.stringify({
      hooks: { Stop: [{ type: 'prompt', prompt: 'existing' }] },
    }, null, 2));

    const output = makeOutput();
    const result = applyToProject(output, tempDir);

    expect(result.claudeMdStatus).toBe('updated');
    expect(result.settingsStatus).toBe('updated');
  });

  it('returns unchanged when all rules already exist', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-apply-'));
    // Pre-populate with all the rules
    writeFileSync(join(tempDir, 'CLAUDE.md'), '# Rules\n\nAlways check imports before adding new ones.\n\nNever modify files outside the stated scope.\n');
    const settingsDir = join(tempDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, 'settings.json'), JSON.stringify({
      hooks: {
        PreToolUse: [
          { type: 'prompt', prompt: 'Check existing patterns first', description: 'Verify approach' },
        ],
      },
      mcpServers: {
        playwright: { command: 'npx', args: ['@anthropic-ai/mcp-server-playwright'] },
      },
    }, null, 2));

    const output = makeOutput();
    const result = applyToProject(output, tempDir);

    expect(result.claudeMdStatus).toBe('unchanged');
    expect(result.settingsStatus).toBe('unchanged');
    expect(result.rulesSkipped).toBe(2);
  });
});

describe('formatApplySummary', () => {
  it('formats created status correctly', () => {
    const result: ApplyResult = {
      claudeMdStatus: 'created',
      settingsStatus: 'created',
      skillsPlaced: 3,
      rulesAdded: 5,
      rulesSkipped: 0,
    };
    const summary = formatApplySummary(result);
    expect(summary).toContain('CLAUDE.md');
    expect(summary).toContain('created');
    expect(summary).toContain('settings.json');
    expect(summary).toContain('3');
    expect(summary).toContain('5 rules added');
  });

  it('formats updated status correctly', () => {
    const result: ApplyResult = {
      claudeMdStatus: 'updated',
      settingsStatus: 'updated',
      skillsPlaced: 2,
      rulesAdded: 3,
      rulesSkipped: 1,
    };
    const summary = formatApplySummary(result);
    expect(summary).toContain('updated');
    expect(summary).toContain('3 rules added');
    expect(summary).toContain('1 skipped');
  });

  it('formats unchanged status correctly', () => {
    const result: ApplyResult = {
      claudeMdStatus: 'unchanged',
      settingsStatus: 'unchanged',
      skillsPlaced: 0,
      rulesAdded: 0,
      rulesSkipped: 4,
    };
    const summary = formatApplySummary(result);
    expect(summary).toContain('unchanged');
    expect(summary).toContain('0 rules added');
    expect(summary).toContain('4 skipped');
  });
});
