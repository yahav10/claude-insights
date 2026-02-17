import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseFacets, enrichAnalysis } from '../facet-parser.js';
import type { AnalyzerOutput, FacetData } from '../types.js';

let tempDir: string;
afterEach(() => {
  if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
});

function makeFacetFile(dir: string, filename: string, data: Record<string, unknown>): void {
  writeFileSync(join(dir, filename), JSON.stringify(data));
}

function makeAnalyzerOutput(overrides?: Partial<AnalyzerOutput>): AnalyzerOutput {
  return {
    todos: [],
    claudeMdAdditions: '# CLAUDE.md Additions\n',
    settingsJson: {},
    skills: [],
    readmeContent: '# README\n',
    mcpRecommendations: [],
    ...overrides,
  };
}

describe('parseFacets', () => {
  it('reads and aggregates tool usage from facet JSONs', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'facets-'));
    makeFacetFile(tempDir, 'session1.json', {
      sessionId: 'abc',
      duration_ms: 60000,
      tools: { Read: 10, Write: 5 },
    });

    const result = parseFacets(tempDir);
    expect(result.toolUsage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: 'Read', count: 10 }),
        expect.objectContaining({ toolName: 'Write', count: 5 }),
      ]),
    );
    expect(result.sessionCount).toBe(1);
  });

  it('calculates average session duration', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'facets-'));
    makeFacetFile(tempDir, 'session1.json', {
      sessionId: 'a',
      duration_ms: 60000,
      tools: { Read: 1 },
    });
    makeFacetFile(tempDir, 'session2.json', {
      sessionId: 'b',
      duration_ms: 120000,
      tools: { Read: 2 },
    });

    const result = parseFacets(tempDir);
    expect(result.averageSessionDurationMs).toBe(90000);
    expect(result.sessionCount).toBe(2);
  });

  it('returns empty FacetData for empty directory', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'facets-'));

    const result = parseFacets(tempDir);
    expect(result.toolUsage).toEqual([]);
    expect(result.averageSessionDurationMs).toBe(0);
    expect(result.sessionCount).toBe(0);
  });

  it('returns empty FacetData for missing directory', () => {
    const result = parseFacets('/nonexistent/path/to/facets');
    expect(result.toolUsage).toEqual([]);
    expect(result.averageSessionDurationMs).toBe(0);
    expect(result.sessionCount).toBe(0);
  });

  it('skips malformed JSON files', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'facets-'));
    writeFileSync(join(tempDir, 'bad.json'), 'this is not json{{{');
    makeFacetFile(tempDir, 'good.json', {
      sessionId: 'x',
      duration_ms: 30000,
      tools: { Bash: 7 },
    });

    const result = parseFacets(tempDir);
    expect(result.sessionCount).toBe(1);
    expect(result.toolUsage).toEqual(
      expect.arrayContaining([expect.objectContaining({ toolName: 'Bash', count: 7 })]),
    );
  });

  it('aggregates across multiple files', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'facets-'));
    makeFacetFile(tempDir, 'session1.json', {
      sessionId: 'a',
      duration_ms: 40000,
      tools: { Read: 10, Grep: 3 },
    });
    makeFacetFile(tempDir, 'session2.json', {
      sessionId: 'b',
      duration_ms: 80000,
      tools: { Read: 5, Bash: 12 },
    });

    const result = parseFacets(tempDir);
    expect(result.sessionCount).toBe(2);
    expect(result.averageSessionDurationMs).toBe(60000);

    const readUsage = result.toolUsage.find(t => t.toolName === 'Read');
    expect(readUsage?.count).toBe(15);
    const grepUsage = result.toolUsage.find(t => t.toolName === 'Grep');
    expect(grepUsage?.count).toBe(3);
    const bashUsage = result.toolUsage.find(t => t.toolName === 'Bash');
    expect(bashUsage?.count).toBe(12);
  });

  it('handles files without tools field gracefully', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'facets-'));
    makeFacetFile(tempDir, 'session1.json', {
      sessionId: 'a',
      duration_ms: 50000,
    });

    const result = parseFacets(tempDir);
    expect(result.sessionCount).toBe(1);
    expect(result.toolUsage).toEqual([]);
    expect(result.averageSessionDurationMs).toBe(50000);
  });

  it('handles files without duration_ms field gracefully', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'facets-'));
    makeFacetFile(tempDir, 'session1.json', {
      sessionId: 'a',
      tools: { Read: 3 },
    });

    const result = parseFacets(tempDir);
    expect(result.sessionCount).toBe(1);
    expect(result.toolUsage).toEqual([expect.objectContaining({ toolName: 'Read', count: 3 })]);
    expect(result.averageSessionDurationMs).toBe(0);
  });

  it('ignores non-json files in the directory', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'facets-'));
    writeFileSync(join(tempDir, 'readme.txt'), 'not a facet');
    makeFacetFile(tempDir, 'session1.json', {
      sessionId: 'a',
      duration_ms: 10000,
      tools: { Write: 2 },
    });

    const result = parseFacets(tempDir);
    expect(result.sessionCount).toBe(1);
  });

  it('sorts toolUsage by count descending', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'facets-'));
    makeFacetFile(tempDir, 'session1.json', {
      sessionId: 'a',
      duration_ms: 10000,
      tools: { Write: 2, Read: 50, Bash: 10 },
    });

    const result = parseFacets(tempDir);
    expect(result.toolUsage[0].toolName).toBe('Read');
    expect(result.toolUsage[1].toolName).toBe('Bash');
    expect(result.toolUsage[2].toolName).toBe('Write');
  });
});

describe('enrichAnalysis', () => {
  it('attaches facetSummary to output', () => {
    const output = makeAnalyzerOutput();
    const facets: FacetData = {
      toolUsage: [{ toolName: 'Read', count: 10 }],
      averageSessionDurationMs: 60000,
      sessionCount: 1,
    };

    const enriched = enrichAnalysis(output, facets);
    expect(enriched.facetSummary).toEqual(facets);
  });

  it('preserves all existing output fields', () => {
    const output = makeAnalyzerOutput({
      todos: [
        {
          task: 'Test task',
          steps: 'step 1',
          priority: 'Medium',
          estTime: '5 min',
          expectedWin: 'win',
          source: 'friction',
        },
      ],
      claudeMdAdditions: '# Custom additions',
      settingsJson: { hooks: {} },
      skills: [{ skillName: 'test', dirName: 'test', filename: 'SKILL.md', content: '---' }],
      readmeContent: '# Custom README',
      mcpRecommendations: [
        {
          serverName: 'playwright',
          description: 'test',
          installCommand: 'npx test',
          configBlock: {},
          matchedFrictions: ['CSS'],
        },
      ],
    });
    const facets: FacetData = {
      toolUsage: [],
      averageSessionDurationMs: 0,
      sessionCount: 0,
    };

    const enriched = enrichAnalysis(output, facets);
    expect(enriched.todos).toEqual(output.todos);
    expect(enriched.claudeMdAdditions).toBe(output.claudeMdAdditions);
    expect(enriched.settingsJson).toEqual(output.settingsJson);
    expect(enriched.skills).toEqual(output.skills);
    expect(enriched.readmeContent).toBe(output.readmeContent);
    expect(enriched.mcpRecommendations).toEqual(output.mcpRecommendations);
  });

  it('re-prioritizes todos by tool usage frequency', () => {
    const output = makeAnalyzerOutput({
      todos: [
        {
          task: 'Address friction: "CSS Scoping Mistakes"',
          steps: 'step 1',
          priority: 'Medium',
          estTime: '5 min',
          expectedWin: 'win',
          source: 'friction',
        },
        {
          task: 'Address friction: "Read file errors"',
          steps: 'step 2',
          priority: 'Low',
          estTime: '5 min',
          expectedWin: 'win',
          source: 'friction',
        },
        {
          task: 'Address friction: "Bash command failures"',
          steps: 'step 3',
          priority: 'Low',
          estTime: '5 min',
          expectedWin: 'win',
          source: 'friction',
        },
      ],
    });
    const facets: FacetData = {
      toolUsage: [
        { toolName: 'Read', count: 100 },
        { toolName: 'Bash', count: 50 },
        { toolName: 'Write', count: 5 },
      ],
      averageSessionDurationMs: 60000,
      sessionCount: 5,
    };

    const enriched = enrichAnalysis(output, facets);

    // The todo mentioning "Read" should be boosted to High
    const readTodo = enriched.todos.find(t => t.task.includes('Read'));
    expect(readTodo?.priority).toBe('High');

    // The todo mentioning "Bash" should be boosted to High
    const bashTodo = enriched.todos.find(t => t.task.includes('Bash'));
    expect(bashTodo?.priority).toBe('High');
  });

  it('handles empty FacetData gracefully', () => {
    const output = makeAnalyzerOutput({
      todos: [
        {
          task: 'Some task',
          steps: 'step 1',
          priority: 'Medium',
          estTime: '5 min',
          expectedWin: 'win',
          source: 'friction',
        },
      ],
    });
    const facets: FacetData = {
      toolUsage: [],
      averageSessionDurationMs: 0,
      sessionCount: 0,
    };

    const enriched = enrichAnalysis(output, facets);
    expect(enriched.todos).toEqual(output.todos);
    expect(enriched.facetSummary).toEqual(facets);
  });

  it('does not mutate the input output object', () => {
    const output = makeAnalyzerOutput({
      todos: [
        {
          task: 'Test task',
          steps: 'step',
          priority: 'Low',
          estTime: '5 min',
          expectedWin: 'win',
          source: 'friction',
        },
      ],
    });
    const facets: FacetData = {
      toolUsage: [{ toolName: 'Read', count: 100 }],
      averageSessionDurationMs: 60000,
      sessionCount: 1,
    };

    const enriched = enrichAnalysis(output, facets);
    expect(enriched).not.toBe(output);
    expect(output.facetSummary).toBeUndefined();
  });

  it('only boosts friction-source todos, not other sources', () => {
    const output = makeAnalyzerOutput({
      todos: [
        {
          task: 'Add CLAUDE.md rule: "Read before writing"',
          steps: 'step',
          priority: 'Medium',
          estTime: '2 min',
          expectedWin: 'win',
          source: 'claude-md',
        },
        {
          task: 'Set up Read optimizations',
          steps: 'step',
          priority: 'Medium',
          estTime: '10 min',
          expectedWin: 'win',
          source: 'feature',
        },
      ],
    });
    const facets: FacetData = {
      toolUsage: [{ toolName: 'Read', count: 200 }],
      averageSessionDurationMs: 60000,
      sessionCount: 1,
    };

    const enriched = enrichAnalysis(output, facets);
    // Non-friction todos should keep their original priority
    expect(enriched.todos[0].priority).toBe('Medium');
    expect(enriched.todos[1].priority).toBe('Medium');
  });
});
