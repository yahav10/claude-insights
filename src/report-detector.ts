import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Returns the default path where Claude Code saves /insight reports.
 */
export function getDefaultReportPath(): string {
  return join(homedir(), '.claude', 'usage-data', 'report.html');
}
