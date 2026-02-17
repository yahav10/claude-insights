import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { parseReport } from './parser.js';
import { analyze } from './analyzer.js';
import { generate } from './generator.js';
import { applyToProject } from './applier.js';
import type { PipelineOptions, PipelineResult } from './types.js';

/**
 * Run the full parse -> analyze -> generate/apply pipeline.
 * Reusable by the analyze command, watch mode, and team command.
 */
export function runPipeline(filePath: string, options: PipelineOptions = {}): PipelineResult {
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  // 1. Parse
  const data = parseReport(resolvedPath);

  // 2. Analyze
  const output = analyze(data);

  // 3. Generate or Apply
  let files: string[] = [];

  if (options.apply && options.outputDir) {
    // Apply mode: merge directly into the project directory
    applyToProject(output, options.outputDir);
    // In apply mode, files array is empty since we merge in-place
    files = [];
  } else if (options.outputDir) {
    // Generate mode: write output files to the output directory
    files = generate(output, options.outputDir);
  }

  return { data, output, files };
}
