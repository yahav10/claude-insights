import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { significantWords } from './analyzer.js';
import type { AnalyzerOutput, SkillFile, ApplyResult } from './types.js';

function safeWrite(filePath: string, content: string): void {
  try {
    writeFileSync(filePath, content);
  } catch (err) {
    throw new Error(`Failed to write ${filePath}: ${(err as Error).message}`, { cause: err });
  }
}

/**
 * Extract rule paragraphs from the claudeMdAdditions string.
 * Rules are non-empty paragraphs that are not headers and not "Why" blockquotes.
 */
function extractRules(claudeMdAdditions: string): string[] {
  const paragraphs = claudeMdAdditions.split(/\n\n+/);
  return paragraphs
    .map(p => p.trim())
    .filter(p =>
      p.length > 0 &&
      !p.startsWith('#') &&
      !p.startsWith('>') &&
      !p.startsWith('> _Why')
    );
}

/**
 * Check if a rule already exists in existing content using significantWords overlap.
 * Returns true if 80% or more of the new rule's significant words overlap with
 * any paragraph in the existing content.
 */
function ruleExistsInContent(rule: string, existingParagraphs: string[]): boolean {
  const ruleWords = significantWords(rule);
  if (ruleWords.length === 0) return true; // empty rule = skip

  for (const paragraph of existingParagraphs) {
    const paragraphWords = significantWords(paragraph);
    const overlap = ruleWords.filter(w => paragraphWords.includes(w)).length;
    const overlapRatio = overlap / ruleWords.length;
    if (overlapRatio >= 0.8) {
      return true;
    }
  }

  return false;
}

/**
 * Merge new CLAUDE.md additions into the project's CLAUDE.md file.
 * Uses significantWords overlap for deduplication.
 */
export function mergeClaudeMd(output: AnalyzerOutput, projectDir: string): { status: 'created' | 'updated' | 'unchanged'; rulesAdded: number; rulesSkipped: number } {
  const claudeMdPath = join(projectDir, 'CLAUDE.md');
  const newRules = extractRules(output.claudeMdAdditions);

  if (newRules.length === 0) {
    return { status: 'unchanged', rulesAdded: 0, rulesSkipped: 0 };
  }

  const fileExists = existsSync(claudeMdPath);
  const existingContent = fileExists ? readFileSync(claudeMdPath, 'utf-8') : '';
  const existingParagraphs = existingContent.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);

  let rulesAdded = 0;
  let rulesSkipped = 0;
  const rulesToAdd: string[] = [];

  for (const rule of newRules) {
    if (ruleExistsInContent(rule, existingParagraphs)) {
      rulesSkipped++;
    } else {
      rulesToAdd.push(rule);
      rulesAdded++;
    }
  }

  if (rulesToAdd.length === 0) {
    return { status: 'unchanged', rulesAdded: 0, rulesSkipped };
  }

  const SECTION_HEADER = '## Claude Insights Additions';
  let newContent: string;
  if (fileExists) {
    // Check if the section already exists to avoid duplicate headers
    if (existingContent.includes(SECTION_HEADER)) {
      // Append rules under the existing section
      newContent = existingContent.trimEnd() + '\n\n' + rulesToAdd.join('\n\n') + '\n';
    } else {
      const additionsSection = '\n\n' + SECTION_HEADER + '\n\n' + rulesToAdd.join('\n\n') + '\n';
      newContent = existingContent.trimEnd() + additionsSection;
    }
  } else {
    // Create new file with just the additions
    newContent = SECTION_HEADER + '\n\n' + rulesToAdd.join('\n\n') + '\n';
  }

  safeWrite(claudeMdPath, newContent);

  return {
    status: fileExists ? 'updated' : 'created',
    rulesAdded,
    rulesSkipped,
  };
}

/**
 * Deep merge settings.json: hooks by event key, mcpServers by server name.
 * Returns the merge status.
 */
export function mergeSettings(output: AnalyzerOutput, projectDir: string): 'created' | 'updated' | 'unchanged' {
  const settingsDir = join(projectDir, '.claude');
  const settingsPath = join(settingsDir, 'settings.json');

  // Build the new settings to merge (hooks + MCP servers)
  const newSettings: Record<string, unknown> = { ...output.settingsJson };
  if (output.mcpRecommendations.length > 0) {
    const mcpServers: Record<string, unknown> = {};
    for (const rec of output.mcpRecommendations) {
      mcpServers[rec.serverName] = rec.configBlock;
    }
    newSettings.mcpServers = mcpServers;
  }

  // If nothing to merge, return unchanged
  if (Object.keys(newSettings).length === 0) {
    return 'unchanged';
  }

  const fileExists = existsSync(settingsPath);
  let existing: Record<string, unknown> = {};
  if (fileExists) {
    try {
      existing = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch {
      // If settings.json is corrupt, treat as empty
      existing = {};
    }
  }

  let changed = false;

  // Deep merge hooks by event key
  const newHooks = newSettings.hooks as Record<string, unknown[]> | undefined;
  if (newHooks && Object.keys(newHooks).length > 0) {
    const existingHooks = (existing.hooks ?? {}) as Record<string, unknown[]>;

    for (const [eventKey, newEntries] of Object.entries(newHooks)) {
      if (!Array.isArray(newEntries)) continue;

      const existingEntries = existingHooks[eventKey] ?? [];
      if (!Array.isArray(existingEntries)) {
        existingHooks[eventKey] = newEntries;
        changed = true;
        continue;
      }

      for (const newEntry of newEntries) {
        const entryObj = newEntry as Record<string, string>;
        const contentKey = entryObj.command ?? entryObj.prompt ?? '';
        const isDuplicate = existingEntries.some(e => {
          const existing = e as Record<string, string>;
          const existingKey = existing.command ?? existing.prompt ?? '';
          return existingKey === contentKey;
        });

        if (!isDuplicate) {
          existingEntries.push(newEntry);
          changed = true;
        }
      }

      existingHooks[eventKey] = existingEntries;
    }

    existing.hooks = existingHooks;
  }

  // Deep merge mcpServers by server name
  const newMcpServers = newSettings.mcpServers as Record<string, unknown> | undefined;
  if (newMcpServers && Object.keys(newMcpServers).length > 0) {
    const existingMcp = (existing.mcpServers ?? {}) as Record<string, unknown>;

    for (const [serverName, config] of Object.entries(newMcpServers)) {
      if (!(serverName in existingMcp)) {
        existingMcp[serverName] = config;
        changed = true;
      }
    }

    existing.mcpServers = existingMcp;
  }

  if (!changed && fileExists) {
    return 'unchanged';
  }

  mkdirSync(settingsDir, { recursive: true });
  safeWrite(settingsPath, JSON.stringify(existing, null, 2));
  return fileExists ? 'updated' : 'created';
}

/**
 * Place skill files under .claude/skills/ in the project directory.
 * Overwrites existing skill files on update.
 */
export function placeSkills(skills: SkillFile[], projectDir: string): number {
  if (skills.length === 0) return 0;

  for (const skill of skills) {
    const skillDir = join(projectDir, '.claude', 'skills', skill.dirName);
    mkdirSync(skillDir, { recursive: true });
    safeWrite(join(skillDir, skill.filename), skill.content);
  }

  return skills.length;
}

/**
 * Apply all generated output directly to the project.
 * Merges CLAUDE.md, settings.json, and places skills.
 */
export function applyToProject(output: AnalyzerOutput, projectDir: string): ApplyResult {
  const claudeMdResult = mergeClaudeMd(output, projectDir);
  const settingsStatus = mergeSettings(output, projectDir);
  const skillsPlaced = placeSkills(output.skills, projectDir);

  return {
    claudeMdStatus: claudeMdResult.status,
    settingsStatus,
    skillsPlaced,
    rulesAdded: claudeMdResult.rulesAdded,
    rulesSkipped: claudeMdResult.rulesSkipped,
  };
}

/**
 * Format a human-readable summary of the apply result.
 */
export function formatApplySummary(result: ApplyResult): string {
  let summary = '\nApply Summary\n';
  summary += '─────────────\n';
  summary += `  CLAUDE.md:      ${result.claudeMdStatus} (${result.rulesAdded} rules added, ${result.rulesSkipped} skipped)\n`;
  summary += `  settings.json:  ${result.settingsStatus}\n`;
  summary += `  Skills placed:  ${result.skillsPlaced}\n`;

  return summary;
}
