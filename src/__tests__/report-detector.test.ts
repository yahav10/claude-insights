import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getDefaultReportPath } from '../report-detector.js';

describe('getDefaultReportPath', () => {
  it('returns path under home directory ending with .claude/usage-data/report.html', () => {
    const result = getDefaultReportPath();
    const expected = join(homedir(), '.claude', 'usage-data', 'report.html');
    expect(result).toBe(expected);
  });
});
