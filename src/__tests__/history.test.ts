import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  saveHistoryEntry,
  loadHistoryEntries,
  getLatestEntry,
  loadEntry,
  toHistoryEntry,
  buildTrendReport,
  formatTrendReport,
  formatHistoryTable,
} from '../history.js';
import { makeReportData, makeFriction, makeClaudeMdItem } from './helpers.js';
import { analyze } from '../analyzer.js';
import type { HistoryEntry } from '../types.js';

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    date: '2026-02-15',
    reportFile: '/tmp/report.html',
    frictionCount: 3,
    frictionTitles: ['CSS Scoping', 'Test Failures', 'Build Errors'],
    skillCount: 3,
    todoCount: 10,
    claudeMdItemCount: 5,
    ...overrides,
  };
}

describe('history store', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('saveHistoryEntry creates JSON file with correct name', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'hist-'));
    const entry = makeEntry({ date: '2026-02-15' });
    saveHistoryEntry(entry, tempDir);
    expect(existsSync(join(tempDir, '2026-02-15.json'))).toBe(true);
  });

  it('saveHistoryEntry writes valid JSON content', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'hist-'));
    const entry = makeEntry();
    saveHistoryEntry(entry, tempDir);
    const content = JSON.parse(readFileSync(join(tempDir, '2026-02-15.json'), 'utf-8'));
    expect(content.frictionCount).toBe(3);
    expect(content.frictionTitles).toHaveLength(3);
  });

  it('loadHistoryEntries returns entries sorted by date', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'hist-'));
    saveHistoryEntry(makeEntry({ date: '2026-02-15' }), tempDir);
    saveHistoryEntry(makeEntry({ date: '2026-01-10' }), tempDir);
    saveHistoryEntry(makeEntry({ date: '2026-02-01' }), tempDir);
    const entries = loadHistoryEntries(tempDir);
    expect(entries).toHaveLength(3);
    expect(entries[0].date).toBe('2026-01-10');
    expect(entries[2].date).toBe('2026-02-15');
  });

  it('loadHistoryEntries returns empty array for missing directory', () => {
    const entries = loadHistoryEntries('/tmp/nonexistent-dir-12345');
    expect(entries).toHaveLength(0);
  });

  it('getLatestEntry returns most recent entry', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'hist-'));
    saveHistoryEntry(makeEntry({ date: '2026-01-10', frictionCount: 5 }), tempDir);
    saveHistoryEntry(makeEntry({ date: '2026-02-15', frictionCount: 3 }), tempDir);
    const latest = getLatestEntry(tempDir);
    expect(latest).not.toBeNull();
    expect(latest!.date).toBe('2026-02-15');
    expect(latest!.frictionCount).toBe(3);
  });

  it('getLatestEntry returns null when no history', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'hist-'));
    const latest = getLatestEntry(tempDir);
    expect(latest).toBeNull();
  });

  it('loadEntry returns entry for specific date', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'hist-'));
    saveHistoryEntry(makeEntry({ date: '2026-02-15' }), tempDir);
    const entry = loadEntry('2026-02-15', tempDir);
    expect(entry).not.toBeNull();
    expect(entry!.frictionCount).toBe(3);
  });

  it('loadEntry returns null for non-existent date', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'hist-'));
    const entry = loadEntry('2099-01-01', tempDir);
    expect(entry).toBeNull();
  });

  it('skips corrupt JSON files', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'hist-'));
    saveHistoryEntry(makeEntry({ date: '2026-02-15' }), tempDir);
    // Write a corrupt file
    writeFileSync(join(tempDir, '2026-01-01.json'), 'not json{{{');
    const entries = loadHistoryEntries(tempDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBe('2026-02-15');
  });
});

describe('toHistoryEntry', () => {
  it('extracts correct friction count and titles', () => {
    const data = makeReportData({
      frictions: [
        makeFriction({ title: 'CSS Issues' }),
        makeFriction({ title: 'Test Failures' }),
      ],
    });
    const output = analyze(data);
    const entry = toHistoryEntry(data, output, '/tmp/report.html');
    expect(entry.frictionCount).toBe(2);
    expect(entry.frictionTitles).toEqual(['CSS Issues', 'Test Failures']);
  });

  it('extracts correct skill and todo counts', () => {
    const data = makeReportData({
      frictions: [makeFriction()],
      claudeMdItems: [makeClaudeMdItem()],
    });
    const output = analyze(data);
    const entry = toHistoryEntry(data, output, '/tmp/report.html');
    expect(entry.skillCount).toBe(output.skills.length);
    expect(entry.todoCount).toBe(output.todos.length);
  });

  it('stores the report file path', () => {
    const data = makeReportData();
    const output = analyze(data);
    const entry = toHistoryEntry(data, output, '/home/user/report.html');
    expect(entry.reportFile).toBe('/home/user/report.html');
  });

  it('uses ISO date format', () => {
    const data = makeReportData();
    const output = analyze(data);
    const entry = toHistoryEntry(data, output, '/tmp/report.html');
    expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('buildTrendReport', () => {
  it('identifies new frictions', () => {
    const previous = makeEntry({ frictionTitles: ['CSS Issues'], frictionCount: 1 });
    const current = makeEntry({ frictionTitles: ['CSS Issues', 'Test Failures'], frictionCount: 2 });
    const trend = buildTrendReport(current, previous);
    expect(trend.newFrictions).toEqual(['Test Failures']);
  });

  it('identifies resolved frictions', () => {
    const previous = makeEntry({ frictionTitles: ['CSS Issues', 'Build Errors'], frictionCount: 2 });
    const current = makeEntry({ frictionTitles: ['CSS Issues'], frictionCount: 1 });
    const trend = buildTrendReport(current, previous);
    expect(trend.resolvedFrictions).toEqual(['Build Errors']);
  });

  it('calculates correct friction count delta', () => {
    const previous = makeEntry({ frictionCount: 5, frictionTitles: ['A', 'B', 'C', 'D', 'E'] });
    const current = makeEntry({ frictionCount: 3, frictionTitles: ['A', 'B', 'C'] });
    const trend = buildTrendReport(current, previous);
    expect(trend.frictionCountDelta).toBe(-2);
  });

  it('returns null previous when no history', () => {
    const current = makeEntry();
    const trend = buildTrendReport(current, null);
    expect(trend.previous).toBeNull();
    expect(trend.summary).toContain('First analysis run');
  });

  it('generates positive summary when friction decreases', () => {
    const previous = makeEntry({ frictionCount: 5, frictionTitles: ['A', 'B', 'C', 'D', 'E'] });
    const current = makeEntry({ frictionCount: 3, frictionTitles: ['A', 'B', 'C'] });
    const trend = buildTrendReport(current, previous);
    expect(trend.summary).toContain('reduced');
  });

  it('generates warning when friction increases', () => {
    const previous = makeEntry({ frictionCount: 2, frictionTitles: ['A', 'B'] });
    const current = makeEntry({ frictionCount: 4, frictionTitles: ['A', 'B', 'C', 'D'] });
    const trend = buildTrendReport(current, previous);
    expect(trend.summary).toContain('new friction');
  });
});

describe('formatTrendReport', () => {
  it('shows First run message when no previous', () => {
    const trend = buildTrendReport(makeEntry(), null);
    const output = formatTrendReport(trend);
    expect(output).toContain('First analysis run');
  });

  it('shows friction delta with direction indicator', () => {
    const previous = makeEntry({ frictionCount: 5, frictionTitles: ['A', 'B', 'C', 'D', 'E'] });
    const current = makeEntry({ frictionCount: 3, frictionTitles: ['A', 'B', 'C'] });
    const trend = buildTrendReport(current, previous);
    const output = formatTrendReport(trend);
    expect(output).toContain('5');
    expect(output).toContain('3');
  });

  it('shows resolved frictions', () => {
    const previous = makeEntry({ frictionCount: 2, frictionTitles: ['CSS Issues', 'Build Errors'] });
    const current = makeEntry({ frictionCount: 1, frictionTitles: ['CSS Issues'] });
    const trend = buildTrendReport(current, previous);
    const output = formatTrendReport(trend);
    expect(output).toContain('Build Errors');
  });
});

describe('formatHistoryTable', () => {
  it('shows table with entries', () => {
    const entries = [makeEntry({ date: '2026-01-15' }), makeEntry({ date: '2026-02-15' })];
    const output = formatHistoryTable(entries);
    expect(output).toContain('2026-01-15');
    expect(output).toContain('2026-02-15');
  });

  it('shows message when no entries', () => {
    const output = formatHistoryTable([]);
    expect(output).toContain('No history');
  });
});
