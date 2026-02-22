import { describe, it, expect, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPipeline } from '../pipeline.js';
import { setAnnotation } from '../annotations.js';

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

describe('runPipeline', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('parses, analyzes, and generates output for a valid report', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-pipe-'));
    const result = runPipeline(fixturePath('full-report.html'), { outputDir: tempDir });

    expect(result.data.frictions).toHaveLength(2);
    expect(result.output.skills).toHaveLength(2);
    expect(result.files.length).toBeGreaterThan(0);

    // Verify files were actually created
    for (const file of result.files) {
      expect(existsSync(file)).toBe(true);
    }
  });

  it('returns correct PipelineResult structure', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-pipe-'));
    const result = runPipeline(fixturePath('minimal-report.html'), { outputDir: tempDir });

    // Verify data structure
    expect(result.data).toHaveProperty('frictions');
    expect(result.data).toHaveProperty('claudeMdItems');
    expect(result.data).toHaveProperty('stats');

    // Verify output structure
    expect(result.output).toHaveProperty('todos');
    expect(result.output).toHaveProperty('claudeMdAdditions');
    expect(result.output).toHaveProperty('settingsJson');
    expect(result.output).toHaveProperty('skills');
    expect(result.output).toHaveProperty('readmeContent');
    expect(result.output).toHaveProperty('mcpRecommendations');

    // Verify files is an array of strings
    expect(Array.isArray(result.files)).toBe(true);
    expect(result.files.every(f => typeof f === 'string')).toBe(true);
  });

  it('supports apply mode by returning apply result data', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-pipe-'));
    const result = runPipeline(fixturePath('full-report.html'), { outputDir: tempDir, apply: true });

    // In apply mode, files should be empty (apply writes to project root, not output dir)
    // but data and output should still be populated
    expect(result.data.frictions).toHaveLength(2);
    expect(result.output.skills).toHaveLength(2);
  });

  it('handles empty report gracefully', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-pipe-'));
    const result = runPipeline(fixturePath('empty-report.html'), { outputDir: tempDir });

    expect(result.data.frictions).toHaveLength(0);
    expect(result.output.skills).toHaveLength(0);
    expect(result.files.length).toBeGreaterThan(0); // Still creates base files
  });
});

describe('runPipeline with annotations', () => {
  let tempDir: string;
  let annotationsPath: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('filters false-positive frictions before analyze', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-pipe-ann-'));
    annotationsPath = join(tempDir, 'annotations.json');

    // The full-report fixture has 2 frictions — mark the first as false-positive
    const baseResult = runPipeline(fixturePath('full-report.html'), {
      outputDir: join(tempDir, 'base'),
      skipAnnotationFilter: true,
    });
    const firstFrictionTitle = baseResult.data.frictions[0].title;

    setAnnotation(firstFrictionTitle, 'false-positive', undefined, annotationsPath);

    const filteredResult = runPipeline(fixturePath('full-report.html'), {
      outputDir: join(tempDir, 'filtered'),
      annotationsPath,
    });

    expect(filteredResult.data.frictions).toHaveLength(1);
    expect(filteredResult.output.skills).toHaveLength(1);
  });

  it('does not filter when skipAnnotationFilter is true', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-pipe-ann-'));
    annotationsPath = join(tempDir, 'annotations.json');

    // Mark a friction as false-positive
    const baseResult = runPipeline(fixturePath('full-report.html'), {
      outputDir: join(tempDir, 'base'),
      skipAnnotationFilter: true,
    });
    setAnnotation(baseResult.data.frictions[0].title, 'false-positive', undefined, annotationsPath);

    // Run with skipAnnotationFilter — should NOT filter
    const result = runPipeline(fixturePath('full-report.html'), {
      outputDir: join(tempDir, 'skip'),
      annotationsPath,
      skipAnnotationFilter: true,
    });

    expect(result.data.frictions).toHaveLength(2);
    expect(result.output.skills).toHaveLength(2);
  });

  it('passes through all frictions when no annotations exist', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-pipe-ann-'));
    annotationsPath = join(tempDir, 'nonexistent-annotations.json');

    const result = runPipeline(fixturePath('full-report.html'), {
      outputDir: join(tempDir, 'out'),
      annotationsPath,
    });

    expect(result.data.frictions).toHaveLength(2);
    expect(result.output.skills).toHaveLength(2);
  });
});
