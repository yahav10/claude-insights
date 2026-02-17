import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { HistoryEntry, TrendReport, ReportData, AnalyzerOutput } from './types.js';

export function getHistoryDir(): string {
  return join(homedir(), '.claude-insights', 'history');
}

export function saveHistoryEntry(entry: HistoryEntry, historyDir?: string): void {
  const dir = historyDir ?? getHistoryDir();
  mkdirSync(dir, { recursive: true });
  const filename = `${entry.date}.json`;
  writeFileSync(join(dir, filename), JSON.stringify(entry, null, 2));
}

export function loadHistoryEntries(historyDir?: string): HistoryEntry[] {
  const dir = historyDir ?? getHistoryDir();
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const entries: HistoryEntry[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(dir, file), 'utf-8');
      entries.push(JSON.parse(content));
    } catch {
      // Skip corrupt files
    }
  }

  return entries;
}

export function getLatestEntry(historyDir?: string): HistoryEntry | null {
  const entries = loadHistoryEntries(historyDir);
  return entries.length > 0 ? entries[entries.length - 1] : null;
}

export function loadEntry(date: string, historyDir?: string): HistoryEntry | null {
  const dir = historyDir ?? getHistoryDir();
  const filePath = join(dir, `${date}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export function toHistoryEntry(data: ReportData, output: AnalyzerOutput, reportFile: string): HistoryEntry {
  return {
    date: new Date().toISOString().split('T')[0],
    reportFile,
    frictionCount: data.frictions.length,
    frictionTitles: data.frictions.map(f => f.title),
    skillCount: output.skills.length,
    todoCount: output.todos.length,
    claudeMdItemCount: data.claudeMdItems.length,
  };
}

export function buildTrendReport(current: HistoryEntry, previous: HistoryEntry | null): TrendReport {
  if (!previous) {
    return {
      current,
      previous: null,
      newFrictions: current.frictionTitles,
      resolvedFrictions: [],
      frictionCountDelta: 0,
      summary: `First analysis run. Found ${current.frictionCount} friction pattern${current.frictionCount !== 1 ? 's' : ''}.`,
    };
  }

  const newFrictions = current.frictionTitles.filter(t => !previous.frictionTitles.includes(t));
  const resolvedFrictions = previous.frictionTitles.filter(t => !current.frictionTitles.includes(t));
  const delta = current.frictionCount - previous.frictionCount;

  let summary: string;
  if (delta < 0) {
    summary = `Friction reduced! ${Math.abs(delta)} pattern${Math.abs(delta) !== 1 ? 's' : ''} resolved since ${previous.date}.`;
  } else if (delta > 0) {
    summary = `${delta} new friction pattern${delta !== 1 ? 's' : ''} detected since ${previous.date}.`;
  } else {
    summary = `Friction count unchanged since ${previous.date} (${current.frictionCount} patterns).`;
  }

  if (resolvedFrictions.length > 0) {
    summary += ` Resolved: ${resolvedFrictions.join(', ')}.`;
  }
  if (newFrictions.length > 0) {
    summary += ` New: ${newFrictions.join(', ')}.`;
  }

  return { current, previous, newFrictions, resolvedFrictions, frictionCountDelta: delta, summary };
}

export function formatTrendReport(trend: TrendReport): string {
  let output = '\n📊 Trend Report\n';
  output += '───────────────\n';
  output += trend.summary + '\n';

  if (trend.previous) {
    const arrow = trend.frictionCountDelta < 0 ? '↓' : trend.frictionCountDelta > 0 ? '↑' : '→';
    output += `  Frictions: ${trend.previous.frictionCount} → ${trend.current.frictionCount} (${arrow}${Math.abs(trend.frictionCountDelta)})\n`;

    if (trend.resolvedFrictions.length > 0) {
      output += `  ✅ Resolved: ${trend.resolvedFrictions.join(', ')}\n`;
    }
    if (trend.newFrictions.length > 0) {
      output += `  ⚠️  New: ${trend.newFrictions.join(', ')}\n`;
    }
  }

  return output;
}

export function formatHistoryTable(entries: HistoryEntry[]): string {
  if (entries.length === 0) return 'No history entries found.\n';

  let output = '\nAnalysis History\n';
  output += '────────────────\n';
  output += '| Date       | Frictions | Skills | Todos | Report |\n';
  output += '|------------|-----------|--------|-------|--------|\n';

  for (const entry of entries) {
    const reportShort = entry.reportFile.length > 30
      ? '...' + entry.reportFile.slice(-27)
      : entry.reportFile;
    output += `| ${entry.date} | ${entry.frictionCount}         | ${entry.skillCount}      | ${entry.todoCount}     | ${reportShort} |\n`;
  }

  return output;
}
