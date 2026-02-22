import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { significantWords } from './analyzer.js';
import type {
  FrictionAnnotation,
  AnnotationStore,
  AnnotationStatus,
  FrictionCategory,
} from './types.js';

const STORE_VERSION = 1;

export function getAnnotationsPath(overridePath?: string): string {
  return overridePath ?? join(homedir(), '.claude-insights', 'annotations.json');
}

export function loadAnnotations(annotationsPath?: string): FrictionAnnotation[] {
  const filePath = getAnnotationsPath(annotationsPath);
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const store: AnnotationStore = JSON.parse(raw);
    if (store.version !== STORE_VERSION) return [];
    return store.annotations ?? [];
  } catch {
    return [];
  }
}

export function saveAnnotations(annotations: FrictionAnnotation[], annotationsPath?: string): void {
  const filePath = getAnnotationsPath(annotationsPath);
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const store: AnnotationStore = { version: STORE_VERSION, annotations };
  writeFileSync(filePath, JSON.stringify(store, null, 2));
}

/** Check if two friction titles match using significantWords overlap (80% bidirectional) */
export function isFrictionMatch(annotationTitle: string, frictionTitle: string): boolean {
  const wordsA = significantWords(annotationTitle);
  const wordsB = significantWords(frictionTitle);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const overlap = wordsA.filter(w => wordsB.includes(w)).length;
  const ratioA = overlap / wordsA.length;
  const ratioB = overlap / wordsB.length;

  return ratioA >= 0.8 || ratioB >= 0.8;
}

/** Upsert an annotation: fuzzy-matches existing entry, replaces or appends */
export function setAnnotation(
  title: string,
  status: AnnotationStatus,
  note?: string,
  annotationsPath?: string,
): FrictionAnnotation {
  const annotations = loadAnnotations(annotationsPath);
  const existingIdx = annotations.findIndex(a => isFrictionMatch(a.frictionTitle, title));

  const annotation: FrictionAnnotation = {
    frictionTitle: title,
    status,
    annotatedAt: new Date().toISOString(),
    note,
  };

  if (existingIdx >= 0) {
    annotations[existingIdx] = annotation;
  } else {
    annotations.push(annotation);
  }

  saveAnnotations(annotations, annotationsPath);
  return annotation;
}

/** Clear one annotation (by fuzzy title match) or all. Returns count cleared. */
export function clearAnnotation(title?: string, annotationsPath?: string): number {
  if (title === undefined) {
    const annotations = loadAnnotations(annotationsPath);
    const count = annotations.length;
    saveAnnotations([], annotationsPath);
    return count;
  }

  const annotations = loadAnnotations(annotationsPath);
  const before = annotations.length;
  const filtered = annotations.filter(a => !isFrictionMatch(a.frictionTitle, title));
  saveAnnotations(filtered, annotationsPath);
  return before - filtered.length;
}

/** Find an annotation by fuzzy title match */
export function findAnnotation(
  frictionTitle: string,
  annotationsPath?: string,
): FrictionAnnotation | undefined {
  const annotations = loadAnnotations(annotationsPath);
  return annotations.find(a => isFrictionMatch(a.frictionTitle, frictionTitle));
}

export interface FilterResult {
  filteredFrictions: FrictionCategory[];
  skippedCount: number;
  skippedTitles: string[];
}

/** Filter out frictions marked as false-positive. Returns filtered array + skip metadata. */
export function filterAnnotatedFrictions(
  frictions: FrictionCategory[],
  annotationsPath?: string,
): FilterResult {
  const annotations = loadAnnotations(annotationsPath);
  const falsePositives = annotations.filter(a => a.status === 'false-positive');

  if (falsePositives.length === 0) {
    return { filteredFrictions: frictions, skippedCount: 0, skippedTitles: [] };
  }

  const skippedTitles: string[] = [];
  const filteredFrictions = frictions.filter(friction => {
    const isFP = falsePositives.some(fp => isFrictionMatch(fp.frictionTitle, friction.title));
    if (isFP) skippedTitles.push(friction.title);
    return !isFP;
  });

  return { filteredFrictions, skippedCount: skippedTitles.length, skippedTitles };
}

/** Interactive annotation walkthrough using readline */
export async function runInteractiveAnnotation(
  frictions: FrictionCategory[],
  annotationsPath?: string,
): Promise<{ annotated: number; skipped: number }> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let annotated = 0;
  let skipped = 0;

  console.log(`\nAnnotating ${frictions.length} friction(s)...`);
  console.log('For each friction, choose: [u]seful, [f]alse-positive, [s]kip\n');

  for (const friction of frictions) {
    const existing = findAnnotation(friction.title, annotationsPath);
    const statusHint = existing ? ` (currently: ${existing.status})` : '';

    console.log(`  "${friction.title}"${statusHint}`);
    console.log(`    ${friction.description.slice(0, 120)}`);

    const answer = await rl.question('  > [u]seful / [f]alse-positive / [s]kip: ');
    const choice = answer.trim().toLowerCase();

    if (choice === 'u' || choice === 'useful') {
      setAnnotation(friction.title, 'useful', undefined, annotationsPath);
      annotated++;
      console.log('    -> Marked as useful\n');
    } else if (choice === 'f' || choice === 'false-positive') {
      setAnnotation(friction.title, 'false-positive', undefined, annotationsPath);
      annotated++;
      console.log('    -> Marked as false-positive (will be skipped in future runs)\n');
    } else {
      skipped++;
      console.log('    -> Skipped\n');
    }
  }

  rl.close();
  return { annotated, skipped };
}

/** Format current annotations as a readable table */
export function formatAnnotationList(annotationsPath?: string): string {
  const annotations = loadAnnotations(annotationsPath);

  if (annotations.length === 0) {
    return 'No annotations found.';
  }

  let output = '\nFriction Annotations\n';
  output += '────────────────────\n';

  for (const a of annotations) {
    const date = a.annotatedAt.split('T')[0];
    const icon = a.status === 'false-positive' ? '✗' : '✓';
    output += `  ${icon} [${a.status}] ${a.frictionTitle} (${date})`;
    if (a.note) output += ` — ${a.note}`;
    output += '\n';
  }

  return output;
}
