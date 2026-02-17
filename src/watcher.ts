import { watch } from 'node:fs';
import { runPipeline } from './pipeline.js';
import type { WatchOptions, WatchHandle, PipelineOptions, PipelineResult } from './types.js';

type PipelineFn = (filePath: string, options: PipelineOptions) => PipelineResult;

const DEBOUNCE_MS = 300;

/**
 * Watch a report file for changes and re-run the pipeline on each change.
 * Accepts an optional pipelineFn for dependency injection (defaults to runPipeline).
 * Returns a WatchHandle with a stop() method to close the watcher.
 */
export function watchReport(
  filePath: string,
  options: WatchOptions,
  pipelineFn: PipelineFn = runPipeline,
): WatchHandle {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const pipelineOptions: PipelineOptions = {
    outputDir: options.outputDir,
    apply: options.apply,
    facets: options.facets !== undefined ? true : undefined,
  };

  console.log(`Watching ${filePath} for changes...`);

  const watcher = watch(filePath, () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      console.log(`File changed, running pipeline...`);
      try {
        pipelineFn(filePath, pipelineOptions);
        console.log('Pipeline completed.');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Watch pipeline error: ${message}`);
      }
    }, DEBOUNCE_MS);
  });

  return {
    stop() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      watcher.close();
    },
  };
}
