import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { FacetData, FacetToolUsage, AnalyzerOutput, TodoItem } from './types.js';

const DEFAULT_FACETS_DIR = join(homedir(), '.claude', 'usage-data', 'facets');

/**
 * Parse facet JSON files from the given directory and aggregate tool usage,
 * session durations, and session counts.
 */
export function parseFacets(facetsDir: string = DEFAULT_FACETS_DIR): FacetData {
  const empty: FacetData = { toolUsage: [], averageSessionDurationMs: 0, sessionCount: 0 };

  if (!existsSync(facetsDir)) {
    return empty;
  }

  let entries: string[];
  try {
    entries = readdirSync(facetsDir).filter(f => f.endsWith('.json'));
  } catch {
    return empty;
  }

  if (entries.length === 0) {
    return empty;
  }

  const toolCounts = new Map<string, number>();
  let totalDurationMs = 0;
  let sessionCount = 0;
  let sessionsWithDuration = 0;

  for (const filename of entries) {
    const filePath = join(facetsDir, filename);
    let parsed: Record<string, unknown>;
    try {
      const raw = readFileSync(filePath, 'utf-8');
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Skip malformed JSON files
      continue;
    }

    sessionCount++;

    // Aggregate tool usage
    if (parsed.tools && typeof parsed.tools === 'object' && !Array.isArray(parsed.tools)) {
      const tools = parsed.tools as Record<string, unknown>;
      for (const [toolName, count] of Object.entries(tools)) {
        if (typeof count === 'number') {
          toolCounts.set(toolName, (toolCounts.get(toolName) ?? 0) + count);
        }
      }
    }

    // Aggregate session duration
    if (typeof parsed.duration_ms === 'number') {
      totalDurationMs += parsed.duration_ms;
      sessionsWithDuration++;
    }
  }

  // Build sorted tool usage array (descending by count)
  const toolUsage: FacetToolUsage[] = Array.from(toolCounts.entries())
    .map(([toolName, count]) => ({ toolName, count }))
    .sort((a, b) => b.count - a.count);

  const averageSessionDurationMs = sessionsWithDuration > 0
    ? Math.round(totalDurationMs / sessionsWithDuration)
    : 0;

  return { toolUsage, averageSessionDurationMs, sessionCount };
}

/**
 * Enrich an existing AnalyzerOutput with facet data.
 * Re-prioritizes friction-source todos based on tool usage frequency:
 * tools used more frequently boost related friction todos to High priority.
 * Returns a new AnalyzerOutput object (does not mutate the input).
 */
export function enrichAnalysis(output: AnalyzerOutput, facets: FacetData): AnalyzerOutput {
  // Build a set of top tool names (those with significant usage)
  const topToolNames = new Set(
    facets.toolUsage
      .filter(t => t.count > 0)
      .map(t => t.toolName.toLowerCase()),
  );

  // Re-prioritize friction todos that mention a highly-used tool
  const todos: TodoItem[] = output.todos.map(todo => {
    if (todo.source !== 'friction' || topToolNames.size === 0) {
      return { ...todo };
    }

    const taskLower = todo.task.toLowerCase();
    const matchesTool = facets.toolUsage.some(t => taskLower.includes(t.toolName.toLowerCase()));

    if (matchesTool) {
      return { ...todo, priority: 'High' as const };
    }

    return { ...todo };
  });

  return {
    ...output,
    todos,
    facetSummary: facets,
  };
}
