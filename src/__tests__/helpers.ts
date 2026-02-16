import type { ReportData, FrictionCategory, ClaudeMdItem } from '../types.js';

export function makeReportData(overrides?: Partial<ReportData>): ReportData {
  return {
    title: 'Test Report',
    subtitle: 'Test subtitle',
    stats: [],
    glance: [],
    projects: [],
    charts: [],
    narrative: { paragraphs: [], keyInsight: '' },
    wins: [],
    frictions: [],
    claudeMdItems: [],
    features: [],
    patterns: [],
    horizon: [],
    funEnding: { headline: '', detail: '' },
    ...overrides,
  };
}

export function makeFriction(overrides?: Partial<FrictionCategory>): FrictionCategory {
  return {
    title: 'Test Friction',
    description: 'A test friction category for unit testing.',
    examples: [
      'When configuring test fixtures, the setup was incomplete',
      'When running parallel tests, state leaked between suites',
    ],
    ...overrides,
  };
}

export function makeClaudeMdItem(overrides?: Partial<ClaudeMdItem>): ClaudeMdItem {
  return {
    code: 'Always run tests before committing changes',
    why: 'Prevents broken builds from reaching the main branch',
    ...overrides,
  };
}
