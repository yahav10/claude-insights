import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseFrontmatter,
  parseSections,
  parseSkillFile,
  runChecks,
  auditSkill,
  formatAuditReport,
  applyFixes,
  discoverSkills,
} from '../skill-auditor.js';

function makeSkillDir(name: string, frontmatter: string, body: string): { filePath: string; dir: string } {
  const base = mkdtempSync(join(tmpdir(), 'ci-skill-'));
  const skillDir = join(base, '.claude', 'skills', name);
  mkdirSync(skillDir, { recursive: true });
  const filePath = join(skillDir, 'SKILL.md');
  const content = frontmatter ? `---\n${frontmatter}\n---\n\n${body}` : body;
  writeFileSync(filePath, content);
  return { filePath, dir: base };
}

function makeFullSkill(name: string, overrides?: {
  description?: string;
  extraFrontmatter?: string;
  body?: string;
}): { filePath: string; dir: string } {
  const desc = overrides?.description ??
    `Migrate tests to Playwright. Use when converting legacy tests. Do NOT use for manual test writing.`;
  const extra = overrides?.extraFrontmatter ?? '';
  const body = overrides?.body ?? `# ${name}\n\n## Step 1: Setup\n\n1. Install dependencies\n2. Configure\n\n\`\`\`typescript\nconst x = 1;\n\`\`\`\n\n## Troubleshooting\n\nSee [references/errors.md](references/errors.md) for common issues.\n`;

  const fm = `name: ${name}\ndescription: ${desc}\nallowed-tools: ["Read", "Glob", "Grep", "Bash"]\nmetadata:\n  author: test-team\n  version: 1.0.0${extra ? '\n' + extra : ''}`;

  return makeSkillDir(name, fm, body);
}

// ─── parseFrontmatter ───

describe('parseFrontmatter', () => {
  it('parses simple key-value fields', () => {
    const result = parseFrontmatter('name: my-skill\ndescription: A test skill');
    expect(result.name).toBe('my-skill');
    expect(result.description).toBe('A test skill');
  });

  it('handles multi-line block scalar (|)', () => {
    const result = parseFrontmatter('name: my-skill\ndescription: |\n  Line one.\n  Line two.\nallowed-tools: ["Read"]');
    expect(result.name).toBe('my-skill');
    expect(result.description).toContain('Line one.');
    expect(result.description).toContain('Line two.');
    expect(result['allowed-tools']).toBe('["Read"]');
  });

  it('returns empty object for empty string', () => {
    expect(parseFrontmatter('')).toEqual({});
  });

  it('preserves inline array as raw string', () => {
    const result = parseFrontmatter('allowed-tools: ["Read", "Glob", "Grep"]');
    expect(result['allowed-tools']).toBe('["Read", "Glob", "Grep"]');
  });
});

// ─── parseSections ───

describe('parseSections', () => {
  it('parses multiple ## sections', () => {
    const body = '## Setup\n\nContent 1\n\n## Usage\n\nContent 2\n';
    const sections = parseSections(body);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe('Setup');
    expect(sections[0].level).toBe(2);
    expect(sections[1].heading).toBe('Usage');
  });

  it('handles nested ### sections', () => {
    const body = '## Parent\n\nContent\n\n### Child\n\nNested content\n';
    const sections = parseSections(body);
    expect(sections).toHaveLength(2);
    expect(sections[1].heading).toBe('Child');
    expect(sections[1].level).toBe(3);
  });

  it('returns empty array for no headings', () => {
    expect(parseSections('Just plain text.')).toEqual([]);
  });
});

// ─── parseSkillFile ───

describe('parseSkillFile', () => {
  it('parses a valid skill file', () => {
    const { filePath } = makeSkillDir('test-skill', 'name: test-skill\ndescription: A test', '# Hello\n\nWorld');
    const parsed = parseSkillFile(filePath);
    expect(parsed.folderName).toBe('test-skill');
    expect(parsed.frontmatter.name).toBe('test-skill');
    expect(parsed.frontmatter.description).toBe('A test');
    expect(parsed.body).toContain('Hello');
    expect(parsed.wordCount).toBeGreaterThan(0);
  });

  it('handles file with no frontmatter', () => {
    const { filePath } = makeSkillDir('no-fm', '', '# Just a body\n\nSome text here.');
    const parsed = parseSkillFile(filePath);
    expect(parsed.frontmatterRaw).toBe('');
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toContain('Just a body');
  });

  it('handles multi-line description', () => {
    const { filePath } = makeSkillDir('multi', 'name: multi\ndescription: |\n  First line.\n  Second line.', '# Body');
    const parsed = parseSkillFile(filePath);
    expect(parsed.frontmatter.description).toContain('First line.');
    expect(parsed.frontmatter.description).toContain('Second line.');
  });

  it('handles empty body', () => {
    const { filePath } = makeSkillDir('empty-body', 'name: empty-body\ndescription: A skill', '');
    const parsed = parseSkillFile(filePath);
    expect(parsed.body).toBe('');
    expect(parsed.wordCount).toBe(0);
  });
});

// ─── Critical checks ───

describe('critical checks', () => {
  it('fails when frontmatter delimiters are missing', () => {
    const { filePath } = makeSkillDir('no-delimiters', '', '# Just body text');
    const parsed = parseSkillFile(filePath);
    const result = auditSkill(parsed);
    expect(result.score).toBe(0);
    const check = result.checks.find(c => c.id === 'frontmatter-delimiters');
    expect(check?.passed).toBe(false);
  });

  it('fails when name is not kebab-case', () => {
    const { filePath } = makeSkillDir('bad-name', 'name: MySkill\ndescription: test', '# Body');
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'name-exists-kebab');
    expect(check?.passed).toBe(false);
  });

  it('fails when name does not match folder', () => {
    const { filePath } = makeSkillDir('folder-a', 'name: folder-b\ndescription: test', '# Body');
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'name-matches-folder');
    expect(check?.passed).toBe(false);
  });

  it('fails when description is missing', () => {
    const { filePath } = makeSkillDir('no-desc', 'name: no-desc', '# Body');
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'description-exists');
    expect(check?.passed).toBe(false);
  });

  it('passes when description is exactly 1024 chars', () => {
    const desc = 'a'.repeat(1024);
    const { filePath } = makeSkillDir('long-desc', `name: long-desc\ndescription: ${desc}`, '# Body');
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'description-length');
    expect(check?.passed).toBe(true);
  });

  it('fails when frontmatter contains XML tags', () => {
    const { filePath } = makeSkillDir('xml-fm', 'name: xml-fm\ndescription: <tag>bad</tag>', '# Body');
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'no-xml-frontmatter');
    expect(check?.passed).toBe(false);
  });

  it('fails when name contains reserved word', () => {
    const { filePath } = makeSkillDir('claude-helper', 'name: claude-helper\ndescription: test', '# Body');
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'no-reserved-name');
    expect(check?.passed).toBe(false);
  });
});

// ─── High checks ───

describe('high checks', () => {
  it('passes description-what when action verb present', () => {
    const { filePath } = makeSkillDir('verb-test', 'name: verb-test\ndescription: Migrate tests to new framework', '# Body');
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'description-what');
    expect(check?.passed).toBe(true);
  });

  it('fails description-what when no action verb', () => {
    const { filePath } = makeSkillDir('no-verb', 'name: no-verb\ndescription: A helpful tool for teams', '# Body');
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'description-what');
    expect(check?.passed).toBe(false);
  });

  it('passes description-when when trigger phrase present', () => {
    const { filePath } = makeSkillDir('trigger-test', 'name: trigger-test\ndescription: Fix bugs. Use when debugging errors.', '# Body');
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'description-when');
    expect(check?.passed).toBe(true);
  });

  it('passes description-negative when negative phrase present', () => {
    const { filePath } = makeSkillDir('neg-test', "name: neg-test\ndescription: Fix bugs. Don't use for new features.", '# Body');
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'description-negative');
    expect(check?.passed).toBe(true);
  });

  it('passes allowed-tools when field exists', () => {
    const { filePath } = makeSkillDir('tools-test', 'name: tools-test\ndescription: test\nallowed-tools: ["Read"]', '# Body');
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'allowed-tools');
    expect(check?.passed).toBe(true);
  });

  it('detects numbered steps in body', () => {
    const { filePath } = makeSkillDir('steps-test', 'name: steps-test\ndescription: test', '# Steps\n\n1. First step\n2. Second step');
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'has-steps');
    expect(check?.passed).toBe(true);
  });
});

// ─── Medium checks ───

describe('medium checks', () => {
  it('passes metadata check when field exists', () => {
    const { filePath } = makeSkillDir('meta-test', 'name: meta-test\ndescription: test\nmetadata:\n  author: me', '# Body');
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'has-metadata');
    expect(check?.passed).toBe(true);
  });

  it('detects troubleshooting section', () => {
    const { filePath } = makeSkillDir('trouble-test', 'name: trouble-test\ndescription: test', '## Troubleshooting\n\nFix errors.');
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'has-troubleshooting');
    expect(check?.passed).toBe(true);
  });

  it('fails word-count when body exceeds 5000 words', () => {
    const longBody = Array(5100).fill('word').join(' ');
    const { filePath } = makeSkillDir('long-body', 'name: long-body\ndescription: test', longBody);
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'word-count');
    expect(check?.passed).toBe(false);
  });

  it('detects references in body', () => {
    const { filePath } = makeSkillDir('ref-test', 'name: ref-test\ndescription: test', 'See [guide](references/guide.md)');
    const parsed = parseSkillFile(filePath);
    const check = runChecks(parsed).find(c => c.id === 'references-linked');
    expect(check?.passed).toBe(true);
  });
});

// ─── formatAuditReport ───

describe('formatAuditReport', () => {
  it('formats a perfect score report', () => {
    const { filePath } = makeFullSkill('perfect-skill');
    const parsed = parseSkillFile(filePath);
    const result = auditSkill(parsed);
    const report = formatAuditReport(result);
    expect(report).toContain('Score: 100/100');
    expect(report).toContain('PASS');
    expect(report).not.toContain('MISS');
  });

  it('formats report with failures and suggestions', () => {
    const { filePath } = makeSkillDir('partial-skill', 'name: partial-skill\ndescription: A tool for teams', '# Body\n\nText only.');
    const parsed = parseSkillFile(filePath);
    const result = auditSkill(parsed);
    const report = formatAuditReport(result);
    expect(report).toContain('MISS');
    expect(report).toContain('Suggestions');
  });
});

// ─── applyFixes ───

describe('applyFixes', () => {
  it('injects allowed-tools into frontmatter', () => {
    const { filePath } = makeSkillDir('fix-tools', 'name: fix-tools\ndescription: Migrate tests. Use when converting. Do NOT use for new.', '## Troubleshooting\n\nFix things.\n\n## Step 1\n\n1. Do it\n\n```ts\ncode\n```\n\nSee [refs](references/x.md)');
    const parsed = parseSkillFile(filePath);
    const checks = runChecks(parsed);
    const fixed = applyFixes(parsed, checks);
    expect(fixed).toContain('allowed-tools:');
  });

  it('appends negative trigger to description', () => {
    const { filePath } = makeSkillDir('fix-neg', 'name: fix-neg\ndescription: Migrate tests. Use when converting.\nallowed-tools: ["Read"]\nmetadata:\n  author: x', '## Troubleshooting\n\nFix.\n\n## Step 1\n\n1. Do it\n\n```ts\ncode\n```\n\nSee [refs](references/x.md)');
    const parsed = parseSkillFile(filePath);
    const checks = runChecks(parsed);
    const fixed = applyFixes(parsed, checks);
    expect(fixed).toContain('Do NOT use');
  });

  it('adds troubleshooting section to body', () => {
    const { filePath } = makeSkillDir('fix-trouble', 'name: fix-trouble\ndescription: Migrate tests. Use when converting. Do NOT use for new.\nallowed-tools: ["Read"]\nmetadata:\n  author: x', '## Step 1\n\n1. Do it\n\n```ts\ncode\n```\n\nSee [refs](references/x.md)');
    const parsed = parseSkillFile(filePath);
    const checks = runChecks(parsed);
    const fixed = applyFixes(parsed, checks);
    expect(fixed).toContain('## Troubleshooting');
  });

  it('returns unchanged content when all checks pass', () => {
    const { filePath } = makeFullSkill('no-fix-needed');
    const parsed = parseSkillFile(filePath);
    const checks = runChecks(parsed);
    const fixed = applyFixes(parsed, checks);
    const original = readFileSync(filePath, 'utf-8');
    expect(fixed).toBe(original);
  });
});

// ─── discoverSkills ───

describe('discoverSkills', () => {
  it('finds skills in nested subdirectories', () => {
    const base = mkdtempSync(join(tmpdir(), 'ci-disc-'));
    const skillsDir = join(base, '.claude', 'skills');
    mkdirSync(join(skillsDir, 'skill-a'), { recursive: true });
    mkdirSync(join(skillsDir, 'skill-b'), { recursive: true });
    writeFileSync(join(skillsDir, 'skill-a', 'SKILL.md'), '---\nname: skill-a\n---\n');
    writeFileSync(join(skillsDir, 'skill-b', 'SKILL.md'), '---\nname: skill-b\n---\n');

    const results = discoverSkills(skillsDir);
    expect(results).toHaveLength(2);
    expect(results[0]).toContain('skill-a');
    expect(results[1]).toContain('skill-b');
  });

  it('discovers single SKILL.md file by direct path', () => {
    const { filePath } = makeSkillDir('direct', 'name: direct\ndescription: test', '# Body');
    const results = discoverSkills(filePath);
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(filePath);
  });

  it('returns empty array for empty directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ci-empty-'));
    const results = discoverSkills(dir);
    expect(results).toEqual([]);
  });
});

// ─── auditSkill scoring ───

describe('auditSkill scoring', () => {
  it('scores 100 for a perfect skill', () => {
    const { filePath } = makeFullSkill('perfect-score');
    const parsed = parseSkillFile(filePath);
    const result = auditSkill(parsed);
    expect(result.score).toBe(100);
    expect(result.fixableCount).toBe(0);
  });

  it('scores 0 when a critical check fails', () => {
    const { filePath } = makeSkillDir('critical-fail', '', '# No frontmatter');
    const parsed = parseSkillFile(filePath);
    const result = auditSkill(parsed);
    expect(result.score).toBe(0);
  });

  it('deducts correctly for mixed high/medium failures', () => {
    // Has frontmatter (passes critical) but missing: negative triggers (-10), allowed-tools (-10), metadata (-5), troubleshooting (-5)
    const { filePath } = makeSkillDir(
      'mixed-fail',
      'name: mixed-fail\ndescription: Migrate tests. Use when converting.',
      '## Step 1\n\n1. First step\n\n```ts\nconst x = 1;\n```\n\nSee [refs](references/x.md)',
    );
    const parsed = parseSkillFile(filePath);
    const result = auditSkill(parsed);
    // Expected: 100 - 10 (negative) - 10 (allowed-tools) - 5 (metadata) - 5 (troubleshooting) = 70
    expect(result.score).toBe(70);
    expect(result.fixableCount).toBeGreaterThan(0);
  });
});
