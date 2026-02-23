import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import type { AuditCheck, AuditResult, FixResult, ParsedSkill, SkillSection } from './types.js';

// ─── Parsing ───

export function parseFrontmatter(raw: string): Record<string, string> {
  if (!raw || raw.trim().length === 0) return {};
  const result: Record<string, string> = {};
  const lines = raw.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
    if (match) {
      const key = match[1];
      const value = match[2].trim();

      if (value === '|') {
        // Block scalar: consume indented continuation lines
        const parts: string[] = [];
        i++;
        while (i < lines.length && /^\s+/.test(lines[i])) {
          parts.push(lines[i].replace(/^\s{2}/, ''));
          i++;
        }
        result[key] = parts.join('\n');
        continue;
      }

      result[key] = value;
    }
    i++;
  }

  return result;
}

export function parseSections(body: string): SkillSection[] {
  const sections: SkillSection[] = [];
  const headingRegex = /^(#{2,6})\s+(.+)$/gm;
  const matches: { level: number; heading: string; index: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(body)) !== null) {
    matches.push({
      level: match[1].length,
      heading: match[2].trim(),
      index: match.index + match[0].length,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index - matches[i + 1].heading.length - matches[i + 1].level - 2 : body.length;
    sections.push({
      heading: matches[i].heading,
      level: matches[i].level,
      content: body.slice(start, end).trim(),
    });
  }

  return sections;
}

export function parseSkillFile(filePath: string): ParsedSkill {
  const absPath = resolve(filePath);
  const raw = readFileSync(absPath, 'utf-8');
  const folderName = basename(dirname(absPath));

  // Extract frontmatter between --- delimiters
  let frontmatterRaw = '';
  let body = raw;

  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    frontmatterRaw = fmMatch[1];
    body = raw.slice(fmMatch[0].length).trim();
  }

  const frontmatter = parseFrontmatter(frontmatterRaw);
  const sections = parseSections(body);
  const wordCount = body.split(/\s+/).filter(w => w.length > 0).length;

  return { filePath: absPath, folderName, frontmatter, frontmatterRaw, body, sections, wordCount };
}

// ─── Audit Checks ───

const ACTION_VERBS = [
  'analyze', 'build', 'create', 'debug', 'fix', 'generate', 'guard', 'manage',
  'migrate', 'review', 'test', 'validate', 'catch', 'enforce', 'prevent',
  'process', 'handle', 'run', 'set up', 'deploy', 'monitor', 'optimize',
  'check', 'detect', 'verify', 'audit', 'convert', 'plan', 'explore',
];

const TRIGGER_PHRASES = ['use when', 'use for', 'when you', 'use this', 'triggered by'];
const NEGATIVE_PHRASES = ['do not use', "don't use", 'not for', 'not intended'];

function checkFrontmatterDelimiters(parsed: ParsedSkill): AuditCheck {
  const passed = parsed.frontmatterRaw.length > 0;
  return {
    id: 'frontmatter-delimiters',
    name: 'YAML frontmatter delimiters',
    severity: 'critical',
    passed,
    message: passed ? 'YAML --- delimiters present' : 'Missing YAML --- delimiters',
    fixable: false,
  };
}

function checkNameExistsKebab(parsed: ParsedSkill): AuditCheck {
  const name = parsed.frontmatter.name || '';
  const isKebab = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
  const passed = name.length > 0 && isKebab;
  return {
    id: 'name-exists-kebab',
    name: 'name field in kebab-case',
    severity: 'critical',
    passed,
    message: passed
      ? `name: kebab-case "${name}"`
      : name.length === 0 ? 'Missing name field in frontmatter' : `name "${name}" is not valid kebab-case`,
    fixable: false,
  };
}

function checkNameMatchesFolder(parsed: ParsedSkill): AuditCheck {
  const name = parsed.frontmatter.name || '';
  const passed = name === parsed.folderName;
  return {
    id: 'name-matches-folder',
    name: 'name matches parent folder',
    severity: 'critical',
    passed,
    message: passed
      ? `name matches folder (${name})`
      : `name "${name}" does not match folder "${parsed.folderName}"`,
    fixable: false,
  };
}

function checkDescriptionExists(parsed: ParsedSkill): AuditCheck {
  const desc = parsed.frontmatter.description || '';
  const passed = desc.trim().length > 0;
  return {
    id: 'description-exists',
    name: 'description field present',
    severity: 'critical',
    passed,
    message: passed ? 'description field present' : 'Missing description field in frontmatter',
    fixable: false,
  };
}

function checkDescriptionLength(parsed: ParsedSkill): AuditCheck {
  const desc = parsed.frontmatter.description || '';
  const passed = desc.length <= 1024;
  return {
    id: 'description-length',
    name: 'description under 1024 chars',
    severity: 'critical',
    passed,
    message: passed
      ? `description: ${desc.length} chars (under 1024)`
      : `description: ${desc.length} chars (exceeds 1024 limit)`,
    suggestion: passed ? undefined : 'Shorten description to under 1024 characters.',
    fixable: true,
  };
}

function checkNoXmlFrontmatter(parsed: ParsedSkill): AuditCheck {
  // Strip quoted strings before checking for XML tags to avoid false positives
  // e.g., argument-hint: "<path-to-report.html>" should not trigger
  const stripped = parsed.frontmatterRaw.replace(/"[^"]*"|'[^']*'/g, '""');
  const hasXml = /<\/?[a-zA-Z][a-zA-Z0-9_-]*(\s[^>]*)?>/.test(stripped);
  return {
    id: 'no-xml-frontmatter',
    name: 'no XML tags in frontmatter',
    severity: 'critical',
    passed: !hasXml,
    message: hasXml ? 'XML-like tags found in frontmatter' : 'no XML tags in frontmatter',
    fixable: false,
  };
}

function checkNoReservedName(parsed: ParsedSkill): AuditCheck {
  const name = (parsed.frontmatter.name || '').toLowerCase();
  const hasReserved = name.includes('claude') || name.includes('anthropic');
  return {
    id: 'no-reserved-name',
    name: 'no reserved words in name',
    severity: 'critical',
    passed: !hasReserved,
    message: hasReserved
      ? `name contains reserved word ("claude" or "anthropic")`
      : 'no reserved words in name',
    fixable: false,
  };
}

function checkDescriptionWhat(parsed: ParsedSkill): AuditCheck {
  const desc = (parsed.frontmatter.description || '').toLowerCase();
  const hasVerb = ACTION_VERBS.some(v => desc.includes(v));
  return {
    id: 'description-what',
    name: 'description has action verb',
    severity: 'high',
    passed: hasVerb,
    message: hasVerb
      ? 'description includes action verb (WHAT)'
      : 'description missing action verb (WHAT it does)',
    suggestion: hasVerb ? undefined : 'Start description with an action verb like: Migrate, Review, Generate, Debug, Validate.',
    fixable: true,
  };
}

function checkDescriptionWhen(parsed: ParsedSkill): AuditCheck {
  const desc = (parsed.frontmatter.description || '').toLowerCase();
  const hasTrigger = TRIGGER_PHRASES.some(p => desc.includes(p));
  return {
    id: 'description-when',
    name: 'description has trigger phrases',
    severity: 'high',
    passed: hasTrigger,
    message: hasTrigger
      ? 'description includes trigger phrases (WHEN)'
      : 'description missing trigger phrases (WHEN to use)',
    suggestion: hasTrigger ? undefined : 'Add trigger phrases like: "Use when (1) ..., (2) ...".',
    fixable: true,
  };
}

function checkDescriptionNegative(parsed: ParsedSkill): AuditCheck {
  const desc = (parsed.frontmatter.description || '').toLowerCase();
  const hasNegative = NEGATIVE_PHRASES.some(p => desc.includes(p));
  return {
    id: 'description-negative',
    name: 'description has negative triggers',
    severity: 'high',
    passed: hasNegative,
    message: hasNegative
      ? 'description includes negative triggers'
      : 'description missing negative triggers ("Do NOT use for...")',
    suggestion: hasNegative ? undefined : 'Add negative triggers like: "Do NOT use for writing new tests from scratch."',
    fixable: true,
  };
}

function checkAllowedTools(parsed: ParsedSkill): AuditCheck {
  const hasField = 'allowed-tools' in parsed.frontmatter;
  return {
    id: 'allowed-tools',
    name: 'allowed-tools field specified',
    severity: 'high',
    passed: hasField,
    message: hasField
      ? 'allowed-tools field present'
      : 'missing allowed-tools field',
    suggestion: hasField ? undefined : 'Add allowed-tools to frontmatter:\n   allowed-tools: ["Read", "Glob", "Grep", "Bash"]',
    fixable: true,
  };
}

function checkHasSteps(parsed: ParsedSkill): AuditCheck {
  const hasNumberedSteps = /^\s*\d+[.)]/m.test(parsed.body);
  const hasStepSection = parsed.sections.some(s => /step/i.test(s.heading));
  const passed = hasNumberedSteps || hasStepSection;
  return {
    id: 'has-steps',
    name: 'body has numbered steps',
    severity: 'high',
    passed,
    message: passed
      ? 'body includes numbered steps or step sections'
      : 'body missing numbered steps or step sections',
    fixable: false,
  };
}

function checkHasExamples(parsed: ParsedSkill): AuditCheck {
  const hasExampleSection = parsed.sections.some(s => /example/i.test(s.heading));
  const hasCodeBlocks = /```/.test(parsed.body);
  const passed = hasExampleSection || hasCodeBlocks;
  return {
    id: 'has-examples',
    name: 'body has examples',
    severity: 'high',
    passed,
    message: passed
      ? 'body includes examples or code blocks'
      : 'body missing examples or code blocks',
    fixable: false,
  };
}

function checkHasMetadata(parsed: ParsedSkill): AuditCheck {
  const hasField = 'metadata' in parsed.frontmatter;
  return {
    id: 'has-metadata',
    name: 'metadata field present',
    severity: 'medium',
    passed: hasField,
    message: hasField
      ? 'metadata field present'
      : 'missing metadata field (author, version)',
    suggestion: hasField ? undefined : 'Add metadata to frontmatter:\n   metadata:\n     author: your-team\n     version: 1.0.0',
    fixable: true,
  };
}

function checkHasTroubleshooting(parsed: ParsedSkill): AuditCheck {
  const hasSection = parsed.sections.some(s =>
    /troubleshoot/i.test(s.heading) || /error\s*handling/i.test(s.heading),
  );
  const passed = hasSection;
  return {
    id: 'has-troubleshooting',
    name: 'troubleshooting section',
    severity: 'medium',
    passed,
    message: passed
      ? 'troubleshooting or error handling section present'
      : 'missing troubleshooting section',
    suggestion: passed ? undefined : 'Add a ## Troubleshooting section documenting common errors and fixes.',
    fixable: true,
  };
}

function checkWordCount(parsed: ParsedSkill): AuditCheck {
  const passed = parsed.wordCount <= 5000;
  return {
    id: 'word-count',
    name: 'body under 5000 words',
    severity: 'medium',
    passed,
    message: passed
      ? `body: ${parsed.wordCount} words (under 5000)`
      : `body: ${parsed.wordCount} words (exceeds 5000 limit)`,
    fixable: false,
  };
}

function checkReferencesLinked(parsed: ParsedSkill): AuditCheck {
  const hasRefs = /references\/|scripts\/|assets\/|\[.*?\]\(.*?\)/.test(parsed.body);
  return {
    id: 'references-linked',
    name: 'references to other files',
    severity: 'medium',
    passed: hasRefs,
    message: hasRefs
      ? 'body references external files or links'
      : 'body has no references to supporting files',
    fixable: false,
  };
}

export function runChecks(parsed: ParsedSkill): AuditCheck[] {
  return [
    // Critical
    checkFrontmatterDelimiters(parsed),
    checkNameExistsKebab(parsed),
    checkNameMatchesFolder(parsed),
    checkDescriptionExists(parsed),
    checkDescriptionLength(parsed),
    checkNoXmlFrontmatter(parsed),
    checkNoReservedName(parsed),
    // High
    checkDescriptionWhat(parsed),
    checkDescriptionWhen(parsed),
    checkDescriptionNegative(parsed),
    checkAllowedTools(parsed),
    checkHasSteps(parsed),
    checkHasExamples(parsed),
    // Medium
    checkHasMetadata(parsed),
    checkHasTroubleshooting(parsed),
    checkWordCount(parsed),
    checkReferencesLinked(parsed),
  ];
}

export function auditSkill(parsed: ParsedSkill): AuditResult {
  const checks = runChecks(parsed);

  const hasCriticalFail = checks.some(c => c.severity === 'critical' && !c.passed);
  let score: number;

  if (hasCriticalFail) {
    score = 0;
  } else {
    score = 100;
    for (const c of checks) {
      if (c.passed) continue;
      if (c.severity === 'high') score -= 10;
      if (c.severity === 'medium') score -= 5;
    }
    score = Math.max(0, score);
  }

  const fixableCount = checks.filter(c => !c.passed && c.fixable).length;

  return { skill: parsed, checks, score, fixableCount };
}

// ─── Report Formatting ───

export function formatAuditReport(result: AuditResult): string {
  const name = result.skill.frontmatter.name || basename(result.skill.filePath);
  let out = `\nSkill Audit: ${name}\n`;
  out += `Score: ${result.score}/100\n`;
  out += '──────────────────────────────────────\n\n';

  // Group by severity
  const groups: [string, AuditCheck[]][] = [
    ['Critical', result.checks.filter(c => c.severity === 'critical')],
    ['High', result.checks.filter(c => c.severity === 'high')],
    ['Medium', result.checks.filter(c => c.severity === 'medium')],
  ];

  for (const [, checks] of groups) {
    for (const check of checks) {
      const label = check.passed ? '  PASS' : '  MISS';
      out += `${label}  ${check.message}\n`;
    }
  }

  // Suggestions for fixable issues
  const fixable = result.checks.filter(c => !c.passed && c.fixable && c.suggestion);
  if (fixable.length > 0) {
    out += `\n── Suggestions (${fixable.length} fixable) ──────────\n`;
    fixable.forEach((c, i) => {
      out += `${i + 1}. ${c.suggestion}\n`;
    });
  }

  return out;
}

// ─── Fix Application ───

export function applyFixes(parsed: ParsedSkill, checks: AuditCheck[]): FixResult {
  const raw = readFileSync(parsed.filePath, 'utf-8');
  const failedFixable = checks.filter(c => !c.passed && c.fixable);
  const changes: string[] = [];

  if (failedFixable.length === 0) return { content: raw, changes };

  let content = raw;
  // Frontmatter MUST start at position 0 with ---\n — never match --- inside table borders
  const hasFrontmatter = /^---\r?\n/.test(content);

  // Collect frontmatter insertions (before closing ---)
  const fmInsertions: string[] = [];
  // Collect description amendments
  const descAmendments: string[] = [];
  const descChangeLabels: string[] = [];
  // Collect body appendages
  const bodyAppendages: string[] = [];

  for (const check of failedFixable) {
    switch (check.id) {
      case 'allowed-tools':
        fmInsertions.push('allowed-tools: ["Read", "Glob", "Grep", "Bash"]');
        changes.push('Added allowed-tools: ["Read", "Glob", "Grep", "Bash"]');
        break;
      case 'has-metadata':
        fmInsertions.push('metadata:\n  author: your-team\n  version: 1.0.0');
        changes.push('Added metadata block (author, version)');
        break;
      case 'description-negative':
        descAmendments.push('Do NOT use for tasks outside this skill\'s scope.');
        descChangeLabels.push('negative triggers');
        break;
      case 'description-when':
        descAmendments.push('Use when you need to apply this skill\'s workflow.');
        descChangeLabels.push('trigger phrases');
        break;
      case 'description-what':
        // Only if description truly has no verb — prepend a verb phrase
        descAmendments.push('Process and validate');
        descChangeLabels.push('action verb');
        break;
      case 'has-troubleshooting':
        bodyAppendages.push('\n## Troubleshooting\n\n_TODO: Document common errors and fixes._\n');
        changes.push('Added ## Troubleshooting section');
        break;
      case 'description-length':
        // Cannot auto-fix shortening — leave as suggestion only
        break;
    }
  }

  if (hasFrontmatter) {
    // ── Existing frontmatter: amend in place ──

    // Apply description amendments (append to description value in frontmatter)
    if (descAmendments.length > 0) {
      const descLine = descAmendments.join(' ');
      // Handle multi-line (block scalar |) description
      const blockMatch = content.match(/(description:\s*\|[\r\n])([\s\S]*?)(\r?\n\w)/);
      if (blockMatch) {
        // Append to the last indented line of block scalar
        const blockContent = blockMatch[2];
        const lastIndentedLine = blockContent.trimEnd();
        const newBlock = lastIndentedLine + ' ' + descLine;
        content = content.replace(blockContent, newBlock + '\n');
        changes.push(`Appended to description: ${descChangeLabels.join(', ')}`);
      } else {
        // Inline description: append
        const inlineMatch = content.match(/(description:\s*)(.+)/);
        if (inlineMatch) {
          const currentDesc = inlineMatch[2].trim();
          const newDesc = currentDesc.endsWith('.') ? `${currentDesc} ${descLine}` : `${currentDesc}. ${descLine}`;
          content = content.replace(inlineMatch[0], `${inlineMatch[1]}${newDesc}`);
          changes.push(`Appended to description: ${descChangeLabels.join(', ')}`);
        }
      }
    }

    // Apply frontmatter insertions (before closing ---)
    if (fmInsertions.length > 0) {
      // Find the closing --- after the opening --- (skip past the first line)
      const firstNewline = content.indexOf('\n');
      const closingIdx = content.indexOf('---', firstNewline + 1);
      if (closingIdx > 0) {
        const insertion = fmInsertions.join('\n') + '\n';
        content = content.slice(0, closingIdx) + insertion + content.slice(closingIdx);
      }
    }
  } else {
    // ── No frontmatter: create from scratch ──
    const fmLines: string[] = [];

    // Auto-derive name from parent folder (kebab-case)
    const kebabName = parsed.folderName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (kebabName) {
      fmLines.push(`name: ${kebabName}`);
    }

    // Build description from first H1 heading + amendments
    const h1Match = parsed.body.match(/^#\s+(.+)/m);
    let desc = h1Match ? h1Match[1].trim() : parsed.folderName;
    if (descAmendments.length > 0) {
      desc += '. ' + descAmendments.join(' ');
    }
    fmLines.push(`description: ${desc}`);

    // Add fixable frontmatter fields
    fmLines.push(...fmInsertions);

    const newFrontmatter = '---\n' + fmLines.join('\n') + '\n---\n\n';
    content = newFrontmatter + content;

    // Single summary change for the entire frontmatter creation
    const parts = [`name: ${kebabName}`, 'description derived from heading'];
    if (descChangeLabels.length > 0) parts.push(descChangeLabels.join(', '));
    changes.unshift(`Created YAML frontmatter (${parts.join(', ')})`);
  }

  // Apply body appendages
  if (bodyAppendages.length > 0) {
    content = content.trimEnd() + '\n' + bodyAppendages.join('\n') + '\n';
  }

  return { content, changes };
}

// ─── Discovery ───

export function discoverSkills(dir?: string): string[] {
  const target = dir ? resolve(dir) : resolve(process.cwd(), '.claude', 'skills');

  if (!existsSync(target)) return [];

  const stat = statSync(target);

  // Direct path to any .md file
  if (stat.isFile() && target.endsWith('.md')) {
    return [target];
  }

  // Directory — look for .md files
  if (stat.isDirectory()) {
    // First check for SKILL.md directly (legacy convention)
    const directSkill = join(target, 'SKILL.md');
    if (existsSync(directSkill)) {
      return [directSkill];
    }

    // Check for any single .md file in this directory
    try {
      const entries = readdirSync(target, { withFileTypes: true });
      const mdFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md'));
      if (mdFiles.length > 0) {
        return mdFiles.map(e => join(target, e.name)).sort();
      }
    } catch {
      // Permission errors — continue
    }

    // Scan subdirectories for .md files
    const results: string[] = [];
    try {
      const entries = readdirSync(target, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Prefer SKILL.md if it exists
          const skillPath = join(target, entry.name, 'SKILL.md');
          if (existsSync(skillPath)) {
            results.push(skillPath);
            continue;
          }
          // Otherwise find .md files in the subdirectory
          try {
            const subEntries = readdirSync(join(target, entry.name), { withFileTypes: true });
            const subMdFiles = subEntries.filter(e => e.isFile() && e.name.endsWith('.md'));
            for (const md of subMdFiles) {
              results.push(join(target, entry.name, md.name));
            }
          } catch {
            // Permission errors — skip
          }
        }
      }
    } catch {
      // Permission errors etc — return what we have
    }

    return results.sort();
  }

  return [];
}

// ─── Interactive Mode ───

export async function runInteractiveAudit(
  results: AuditResult[],
): Promise<{ modified: number; copied: number; skipped: number }> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let modified = 0;
  let copied = 0;
  let skipped = 0;

  const fixableResults = results.filter(r => r.fixableCount > 0);

  if (fixableResults.length === 0) {
    console.log('\nNo fixable issues found.');
    rl.close();
    return { modified, copied, skipped };
  }

  console.log(`\n${fixableResults.length} skill(s) have fixable issues.\n`);

  for (const result of fixableResults) {
    console.log(formatAuditReport(result));

    const name = result.skill.frontmatter.name || basename(dirname(result.skill.filePath));
    const answer = await rl.question(`\n  "${name}": [M]odify existing / [C]reate improved copy / [S]kip: `);
    const choice = answer.trim().toLowerCase();

    if (choice === 'm' || choice === 'modify') {
      const { content: fixed, changes } = applyFixes(result.skill, result.checks);
      writeFileSync(result.skill.filePath, fixed);
      modified++;
      for (const change of changes) {
        console.log(`    • ${change}`);
      }
      console.log(`    -> Modified: ${result.skill.filePath}\n`);
    } else if (choice === 'c' || choice === 'copy') {
      const { content: fixed, changes } = applyFixes(result.skill, result.checks);
      const improvedDir = join(dirname(dirname(result.skill.filePath)), `${name}-improved`);
      mkdirSync(improvedDir, { recursive: true });
      const improvedPath = join(improvedDir, 'SKILL.md');
      writeFileSync(improvedPath, fixed);
      copied++;
      for (const change of changes) {
        console.log(`    • ${change}`);
      }
      console.log(`    -> Created improved copy: ${improvedPath}\n`);
    } else {
      skipped++;
      console.log('    -> Skipped\n');
    }
  }

  rl.close();
  return { modified, copied, skipped };
}
