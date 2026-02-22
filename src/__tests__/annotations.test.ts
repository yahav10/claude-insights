import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadAnnotations,
  saveAnnotations,
  setAnnotation,
  clearAnnotation,
  findAnnotation,
  isFrictionMatch,
  filterAnnotatedFrictions,
  formatAnnotationList,
} from '../annotations.js';
import { makeFriction } from './helpers.js';
import type { AnnotationStore } from '../types.js';

function tempAnnotationsPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ci-ann-'));
  return join(dir, 'annotations.json');
}

describe('loadAnnotations', () => {
  it('returns empty array when file does not exist', () => {
    const path = join(tmpdir(), 'nonexistent-ci-ann', 'annotations.json');
    expect(loadAnnotations(path)).toEqual([]);
  });

  it('returns empty array for corrupt JSON', () => {
    const path = tempAnnotationsPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'not valid json{{{');
    expect(loadAnnotations(path)).toEqual([]);
  });

  it('returns empty array for wrong version', () => {
    const path = tempAnnotationsPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 99, annotations: [{ frictionTitle: 'X', status: 'useful', annotatedAt: '2026-01-01' }] }));
    expect(loadAnnotations(path)).toEqual([]);
  });

  it('loads valid annotations from file', () => {
    const path = tempAnnotationsPath();
    const store: AnnotationStore = {
      version: 1,
      annotations: [{ frictionTitle: 'CSS Scoping', status: 'useful', annotatedAt: '2026-01-01T00:00:00.000Z' }],
    };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(store));
    const result = loadAnnotations(path);
    expect(result).toHaveLength(1);
    expect(result[0].frictionTitle).toBe('CSS Scoping');
  });
});

describe('saveAnnotations', () => {
  it('creates directory and file if they do not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ci-ann-'));
    const path = join(dir, 'nested', 'deep', 'annotations.json');
    saveAnnotations([], path);
    expect(existsSync(path)).toBe(true);
  });

  it('overwrites existing annotations', () => {
    const path = tempAnnotationsPath();
    saveAnnotations([{ frictionTitle: 'A', status: 'useful', annotatedAt: '2026-01-01' }], path);
    saveAnnotations([{ frictionTitle: 'B', status: 'false-positive', annotatedAt: '2026-01-02' }], path);
    const result = loadAnnotations(path);
    expect(result).toHaveLength(1);
    expect(result[0].frictionTitle).toBe('B');
  });

  it('writes valid JSON with version field', () => {
    const path = tempAnnotationsPath();
    saveAnnotations([{ frictionTitle: 'X', status: 'useful', annotatedAt: '2026-01-01' }], path);
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    expect(raw.version).toBe(1);
    expect(raw.annotations).toHaveLength(1);
  });
});

describe('isFrictionMatch', () => {
  it('matches identical titles', () => {
    expect(isFrictionMatch('CSS Scoping Issues', 'CSS Scoping Issues')).toBe(true);
  });

  it('matches titles with minor word changes', () => {
    // "CSS Scoping Issues" → significant words: ["css", "scoping", "issues"]
    // "CSS Scoping Mistakes" → significant words: ["css", "scoping", "mistakes"]
    // Overlap: 2/3 = 67% in both directions — below 80%
    // But "Debugging Wrong Root Causes" vs "Debugging Root Causes" should match
    expect(isFrictionMatch('Debugging Root Causes', 'Debugging Wrong Root Causes')).toBe(true);
  });

  it('does not match completely different titles', () => {
    expect(isFrictionMatch('CSS Scoping Issues', 'SQL Query Failures')).toBe(false);
  });

  it('returns false for empty titles', () => {
    expect(isFrictionMatch('', 'CSS Scoping')).toBe(false);
    expect(isFrictionMatch('CSS Scoping', '')).toBe(false);
  });

  it('handles bidirectional matching', () => {
    // Short title matches against longer one if overlap ratio is high enough
    expect(isFrictionMatch('CSS Styling', 'CSS Styling Failures Scoping')).toBe(true);
  });
});

describe('setAnnotation', () => {
  it('creates new annotation', () => {
    const path = tempAnnotationsPath();
    setAnnotation('CSS Scoping Issues', 'useful', undefined, path);
    const result = loadAnnotations(path);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('useful');
  });

  it('updates existing annotation by fuzzy match', () => {
    const path = tempAnnotationsPath();
    setAnnotation('Debugging Root Causes', 'useful', undefined, path);
    setAnnotation('Debugging Wrong Root Causes', 'false-positive', undefined, path);
    const result = loadAnnotations(path);
    // Should upsert, not create a second entry
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('false-positive');
  });

  it('stores ISO date', () => {
    const path = tempAnnotationsPath();
    setAnnotation('Test', 'useful', undefined, path);
    const result = loadAnnotations(path);
    expect(result[0].annotatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('stores optional note', () => {
    const path = tempAnnotationsPath();
    setAnnotation('Test', 'false-positive', 'One-time issue', path);
    const result = loadAnnotations(path);
    expect(result[0].note).toBe('One-time issue');
  });
});

describe('clearAnnotation', () => {
  it('clears specific annotation by title', () => {
    const path = tempAnnotationsPath();
    setAnnotation('CSS Issues', 'useful', undefined, path);
    setAnnotation('SQL Problems', 'false-positive', undefined, path);
    const cleared = clearAnnotation('CSS Issues', path);
    expect(cleared).toBe(1);
    const remaining = loadAnnotations(path);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].frictionTitle).toBe('SQL Problems');
  });

  it('clears all annotations when no title given', () => {
    const path = tempAnnotationsPath();
    setAnnotation('A', 'useful', undefined, path);
    setAnnotation('B', 'false-positive', undefined, path);
    const cleared = clearAnnotation(undefined, path);
    expect(cleared).toBe(2);
    expect(loadAnnotations(path)).toHaveLength(0);
  });

  it('returns 0 when clearing non-matching title', () => {
    const path = tempAnnotationsPath();
    setAnnotation('CSS Issues', 'useful', undefined, path);
    const cleared = clearAnnotation('Completely Unrelated', path);
    expect(cleared).toBe(0);
    expect(loadAnnotations(path)).toHaveLength(1);
  });

  it('uses fuzzy matching to clear', () => {
    const path = tempAnnotationsPath();
    setAnnotation('Debugging Root Causes', 'useful', undefined, path);
    const cleared = clearAnnotation('Debugging Wrong Root Causes', path);
    expect(cleared).toBe(1);
    expect(loadAnnotations(path)).toHaveLength(0);
  });
});

describe('findAnnotation', () => {
  it('finds existing annotation by exact title', () => {
    const path = tempAnnotationsPath();
    setAnnotation('CSS Scoping Issues', 'useful', undefined, path);
    const found = findAnnotation('CSS Scoping Issues', path);
    expect(found).toBeDefined();
    expect(found!.status).toBe('useful');
  });

  it('finds annotation by fuzzy title match', () => {
    const path = tempAnnotationsPath();
    setAnnotation('Debugging Root Causes', 'false-positive', undefined, path);
    const found = findAnnotation('Debugging Wrong Root Causes', path);
    expect(found).toBeDefined();
    expect(found!.status).toBe('false-positive');
  });

  it('returns undefined when no match', () => {
    const path = tempAnnotationsPath();
    setAnnotation('CSS Scoping Issues', 'useful', undefined, path);
    expect(findAnnotation('SQL Query Failures', path)).toBeUndefined();
  });
});

describe('filterAnnotatedFrictions', () => {
  it('returns all frictions when no annotations exist', () => {
    const path = tempAnnotationsPath();
    const frictions = [
      makeFriction({ title: 'CSS Scoping Issues' }),
      makeFriction({ title: 'SQL Query Failures' }),
    ];
    const result = filterAnnotatedFrictions(frictions, path);
    expect(result.filteredFrictions).toHaveLength(2);
    expect(result.skippedCount).toBe(0);
  });

  it('filters out false-positive frictions', () => {
    const path = tempAnnotationsPath();
    setAnnotation('CSS Scoping Issues', 'false-positive', undefined, path);
    const frictions = [
      makeFriction({ title: 'CSS Scoping Issues' }),
      makeFriction({ title: 'SQL Query Failures' }),
    ];
    const result = filterAnnotatedFrictions(frictions, path);
    expect(result.filteredFrictions).toHaveLength(1);
    expect(result.filteredFrictions[0].title).toBe('SQL Query Failures');
  });

  it('does not filter useful frictions', () => {
    const path = tempAnnotationsPath();
    setAnnotation('CSS Scoping Issues', 'useful', undefined, path);
    const frictions = [makeFriction({ title: 'CSS Scoping Issues' })];
    const result = filterAnnotatedFrictions(frictions, path);
    expect(result.filteredFrictions).toHaveLength(1);
    expect(result.skippedCount).toBe(0);
  });

  it('returns correct skipped count and titles', () => {
    const path = tempAnnotationsPath();
    setAnnotation('CSS Scoping Issues', 'false-positive', undefined, path);
    setAnnotation('SQL Query Failures', 'false-positive', undefined, path);
    const frictions = [
      makeFriction({ title: 'CSS Scoping Issues' }),
      makeFriction({ title: 'SQL Query Failures' }),
      makeFriction({ title: 'Debug Problems' }),
    ];
    const result = filterAnnotatedFrictions(frictions, path);
    expect(result.skippedCount).toBe(2);
    expect(result.skippedTitles).toContain('CSS Scoping Issues');
    expect(result.skippedTitles).toContain('SQL Query Failures');
    expect(result.filteredFrictions).toHaveLength(1);
  });

  it('uses fuzzy matching to filter', () => {
    const path = tempAnnotationsPath();
    setAnnotation('Debugging Root Causes', 'false-positive', undefined, path);
    const frictions = [makeFriction({ title: 'Debugging Wrong Root Causes' })];
    const result = filterAnnotatedFrictions(frictions, path);
    expect(result.filteredFrictions).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it('handles mixed useful and false-positive annotations', () => {
    const path = tempAnnotationsPath();
    setAnnotation('CSS Issues', 'useful', undefined, path);
    setAnnotation('SQL Problems', 'false-positive', undefined, path);
    const frictions = [
      makeFriction({ title: 'CSS Issues' }),
      makeFriction({ title: 'SQL Problems' }),
    ];
    const result = filterAnnotatedFrictions(frictions, path);
    expect(result.filteredFrictions).toHaveLength(1);
    expect(result.filteredFrictions[0].title).toBe('CSS Issues');
  });
});

describe('formatAnnotationList', () => {
  it('shows message when no annotations exist', () => {
    const path = tempAnnotationsPath();
    const output = formatAnnotationList(path);
    expect(output).toContain('No annotations found');
  });

  it('formats list with annotations', () => {
    const path = tempAnnotationsPath();
    setAnnotation('CSS Scoping Issues', 'useful', undefined, path);
    setAnnotation('SQL Problems', 'false-positive', undefined, path);
    const output = formatAnnotationList(path);
    expect(output).toContain('CSS Scoping Issues');
    expect(output).toContain('SQL Problems');
    expect(output).toContain('useful');
    expect(output).toContain('false-positive');
  });

  it('includes note when present', () => {
    const path = tempAnnotationsPath();
    setAnnotation('Test Friction', 'false-positive', 'One-time issue', path);
    const output = formatAnnotationList(path);
    expect(output).toContain('One-time issue');
  });
});
