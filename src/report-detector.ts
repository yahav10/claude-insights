import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Returns the default path where Claude Code saves /insight reports.
 */
export function getDefaultReportPath(): string {
  return join(homedir(), '.claude', 'usage-data', 'report.html');
}

export interface DetectResult {
  path: string;
  source: 'argument' | 'auto-detected';
}

/**
 * Detects the insight report file to analyze.
 *
 * If `fileArg` is provided, resolves and validates it.
 * Otherwise, checks the default report path.
 * Throws with actionable guidance when no report is found.
 */
export function detectReport(fileArg?: string): DetectResult {
  if (fileArg !== undefined) {
    const resolved = resolve(fileArg);
    if (!existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`);
    }
    return { path: resolved, source: 'argument' };
  }

  const defaultPath = getDefaultReportPath();
  if (existsSync(defaultPath)) {
    return { path: defaultPath, source: 'auto-detected' };
  }

  throw new Error(
    [
      'No insight report found.',
      `Expected location: ${defaultPath}`,
      '',
      'To generate a report:',
      '  1. Open Claude Code',
      '  2. Run /insight',
      '',
      'Then re-run:',
      '  claude-insights analyze',
      '  claude-insights analyze --wait',
    ].join('\n'),
  );
}
