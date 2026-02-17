import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { watchReport } from '../watcher.js';
import type { PipelineResult } from '../types.js';

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('watchReport', () => {
  let tempDir: string;
  let outputDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ci-watch-'));
    outputDir = mkdtempSync(join(tmpdir(), 'ci-watch-out-'));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    if (outputDir && existsSync(outputDir)) {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('calls pipeline callback when file changes', async () => {
    const filePath = join(tempDir, 'report.html');
    copyFileSync(fixturePath('minimal-report.html'), filePath);

    const pipelineFn = vi.fn<(file: string, opts: Record<string, unknown>) => PipelineResult>(
      () => ({ data: {} as PipelineResult['data'], output: {} as PipelineResult['output'], files: [] }),
    );

    const handle = watchReport(filePath, { outputDir }, pipelineFn);

    try {
      // Wait for watcher to be ready
      await sleep(100);

      // Trigger a file change
      writeFileSync(filePath, '<html><body>changed</body></html>');

      // Wait for debounce (300ms) plus processing time
      await sleep(600);

      expect(pipelineFn).toHaveBeenCalled();
      expect(pipelineFn.mock.calls[0][0]).toBe(filePath);
    } finally {
      handle.stop();
    }
  });

  it('debounces rapid consecutive changes (300ms)', async () => {
    const filePath = join(tempDir, 'report.html');
    copyFileSync(fixturePath('minimal-report.html'), filePath);

    const pipelineFn = vi.fn<(file: string, opts: Record<string, unknown>) => PipelineResult>(
      () => ({ data: {} as PipelineResult['data'], output: {} as PipelineResult['output'], files: [] }),
    );

    const handle = watchReport(filePath, { outputDir }, pipelineFn);

    try {
      await sleep(100);

      // Trigger multiple rapid changes
      writeFileSync(filePath, '<html><body>change1</body></html>');
      await sleep(50);
      writeFileSync(filePath, '<html><body>change2</body></html>');
      await sleep(50);
      writeFileSync(filePath, '<html><body>change3</body></html>');

      // Wait for debounce to settle
      await sleep(600);

      // Should only run once due to debouncing
      expect(pipelineFn).toHaveBeenCalledTimes(1);
    } finally {
      handle.stop();
    }
  });

  it('reports errors without crashing', async () => {
    const filePath = join(tempDir, 'report.html');
    copyFileSync(fixturePath('minimal-report.html'), filePath);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const pipelineFn = vi.fn<(file: string, opts: Record<string, unknown>) => PipelineResult>(() => {
      throw new Error('pipeline failed');
    });

    const handle = watchReport(filePath, { outputDir }, pipelineFn);

    try {
      await sleep(100);

      // Trigger a file change that causes a pipeline error
      writeFileSync(filePath, '<html><body>trigger error</body></html>');

      await sleep(600);

      // Pipeline was called but threw
      expect(pipelineFn).toHaveBeenCalled();

      // Error was logged, not thrown
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('pipeline failed'),
      );
    } finally {
      handle.stop();
      consoleErrorSpy.mockRestore();
    }
  });

  it('stops watching when stop() is called', async () => {
    const filePath = join(tempDir, 'report.html');
    copyFileSync(fixturePath('minimal-report.html'), filePath);

    const pipelineFn = vi.fn<(file: string, opts: Record<string, unknown>) => PipelineResult>(
      () => ({ data: {} as PipelineResult['data'], output: {} as PipelineResult['output'], files: [] }),
    );

    const handle = watchReport(filePath, { outputDir }, pipelineFn);

    // Stop immediately
    await sleep(100);
    handle.stop();

    // Now modify the file
    await sleep(100);
    writeFileSync(filePath, '<html><body>after stop</body></html>');

    // Wait well beyond debounce
    await sleep(600);

    // Pipeline should NOT have been called (watcher was stopped)
    expect(pipelineFn).not.toHaveBeenCalled();
  });
});
