import { existsSync, watch } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * Returns the default path where Claude Code saves /insight reports.
 */
export function getDefaultReportPath(): string {
  return join(homedir(), '.claude', 'usage-data', 'report.html');
}

export interface DetectResult {
  path: string;
  source: 'argument' | 'auto-detected';
}

/**
 * Detects the insight report file to analyze.
 *
 * If `fileArg` is provided, resolves and validates it.
 * Otherwise, checks the default report path.
 * Throws with actionable guidance when no report is found.
 */
export function detectReport(fileArg?: string): DetectResult {
  if (fileArg !== undefined) {
    const resolved = resolve(fileArg);
    if (!existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`);
    }
    return { path: resolved, source: 'argument' };
  }

  const defaultPath = getDefaultReportPath();
  if (existsSync(defaultPath)) {
    return { path: defaultPath, source: 'auto-detected' };
  }

  throw new Error(
    [
      'No insight report found.',
      `Expected location: ${defaultPath}`,
      '',
      'To generate a report:',
      '  1. Open Claude Code',
      '  2. Run /insight',
      '',
      'Then re-run:',
      '  claude-insights analyze',
      '  claude-insights analyze --wait',
    ].join('\n'),
  );
}

const POLL_INTERVAL_MS = 1000;

/**
 * Wait for a report file to appear at the given path.
 * Uses fs.watch on the parent directory with a polling fallback.
 * Resolves with the file path when found, rejects on timeout.
 */
export function waitForReport(targetPath: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // If file already exists, resolve immediately
    if (existsSync(targetPath)) {
      resolve(targetPath);
      return;
    }

    let resolved = false;

    const cleanup = () => {
      resolved = true;
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      try { watcher?.close(); } catch { /* ignore */ }
    };

    const onFound = () => {
      if (resolved) return;
      cleanup();
      resolve(targetPath);
    };

    const onTimeout = () => {
      if (resolved) return;
      cleanup();
      reject(new Error(`Waiting for report timed out after ${Math.round(timeoutMs / 1000)}s: ${targetPath}`));
    };

    // Poll as fallback (fs.watch can be unreliable across platforms)
    const pollTimer = setInterval(() => {
      if (existsSync(targetPath)) {
        onFound();
      }
    }, POLL_INTERVAL_MS);

    // Also try fs.watch on the parent directory
    const parentDir = dirname(targetPath);
    let watcher: ReturnType<typeof watch> | null = null;
    try {
      if (existsSync(parentDir)) {
        watcher = watch(parentDir, (_, filename) => {
          if (filename && targetPath.endsWith(filename) && existsSync(targetPath)) {
            onFound();
          }
        });
      }
    } catch {
      // fs.watch not available for this path — polling alone is fine
    }

    const timeoutTimer = setTimeout(onTimeout, timeoutMs);
  });
}
