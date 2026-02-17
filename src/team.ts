import type {
  ReportData,
  FrictionCategory,
  ClaudeMdItem,
  TeamFriction,
  TeamRule,
  TeamReport,
  AnalyzerOutput,
} from './types.js';
import { significantWords, analyze } from './analyzer.js';

/**
 * Check whether two texts are "similar" based on significantWords overlap.
 * Uses the same 80% threshold as applier.ts for consistency.
 */
function isSimilar(textA: string, textB: string): boolean {
  const wordsA = significantWords(textA);
  const wordsB = significantWords(textB);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const overlap = wordsA.filter(w => wordsB.includes(w)).length;
  const ratioA = overlap / wordsA.length;
  const ratioB = overlap / wordsB.length;

  // Consider similar if either direction meets the 80% threshold
  return ratioA >= 0.8 || ratioB >= 0.8;
}

/**
 * Merge frictions from multiple reports, deduplicating similar ones.
 * Groups by significantWords overlap on titles.
 */
export function mergeFrictions(allFrictions: FrictionCategory[][]): TeamFriction[] {
  const merged: TeamFriction[] = [];

  for (let memberIdx = 0; memberIdx < allFrictions.length; memberIdx++) {
    const memberFrictions = allFrictions[memberIdx];
    const memberLabel = `Report ${memberIdx + 1}`;

    for (const friction of memberFrictions) {
      // Find an existing merged friction that matches
      const existing = merged.find(m => isSimilar(m.title, friction.title));

      if (existing) {
        // Merge into existing: add examples, track member
        for (const example of friction.examples) {
          if (!existing.examples.includes(example)) {
            existing.examples.push(example);
          }
        }
        if (!existing.members.includes(memberLabel)) {
          existing.members.push(memberLabel);
          existing.memberCount = existing.members.length;
        }
      } else {
        // New unique friction
        merged.push({
          title: friction.title,
          description: friction.description,
          examples: [...friction.examples],
          memberCount: 1,
          members: [memberLabel],
        });
      }
    }
  }

  return merged;
}

/**
 * Merge CLAUDE.md rules from multiple reports, deduplicating similar ones.
 * Rules in 2+ reports get High priority, 1 report gets Medium.
 */
export function mergeRules(allRules: ClaudeMdItem[][]): TeamRule[] {
  const merged: TeamRule[] = [];

  for (let memberIdx = 0; memberIdx < allRules.length; memberIdx++) {
    const memberRules = allRules[memberIdx];

    for (const rule of memberRules) {
      const existing = merged.find(m => isSimilar(m.code, rule.code));

      if (existing) {
        existing.memberCount += 1;
        existing.priority = existing.memberCount >= 2 ? 'High' : 'Medium';
      } else {
        merged.push({
          code: rule.code,
          why: rule.why,
          memberCount: 1,
          priority: 'Medium',
        });
      }
    }
  }

  return merged;
}

/**
 * Aggregate multiple parsed reports into a single TeamReport.
 */
export function aggregateReports(reports: ReportData[]): TeamReport {
  let totalMessages = 0;
  let totalSessions = 0;

  for (const report of reports) {
    for (const stat of report.stats) {
      const label = stat.label.toLowerCase();
      const value = parseInt(stat.value.replace(/,/g, ''), 10) || 0;
      if (label === 'messages') {
        totalMessages += value;
      } else if (label === 'sessions') {
        totalSessions += value;
      }
    }
  }

  const allFrictions = reports.map(r => r.frictions);
  const allRules = reports.map(r => r.claudeMdItems);

  return {
    memberCount: reports.length,
    totalMessages,
    totalSessions,
    frictions: mergeFrictions(allFrictions),
    rules: mergeRules(allRules),
    allReports: reports,
  };
}

/**
 * Convert a TeamReport into an AnalyzerOutput.
 * Builds a synthetic ReportData from the merged team data,
 * then uses the existing analyze() pipeline.
 */
export function generateTeamOutput(team: TeamReport): AnalyzerOutput {
  // Build synthetic frictions from team frictions
  const syntheticFrictions: FrictionCategory[] = team.frictions.map(tf => ({
    title: tf.title,
    description: tf.description,
    examples: tf.examples,
  }));

  // Build synthetic ClaudeMdItems from team rules
  const syntheticRules: ClaudeMdItem[] = team.rules.map(tr => ({
    code: tr.code,
    why: tr.why,
  }));

  // Build a synthetic ReportData to feed into the existing analyze pipeline
  const syntheticReport: ReportData = {
    title: `Team Insights (${team.memberCount} members)`,
    subtitle: `${team.totalMessages} messages across ${team.totalSessions} sessions`,
    stats: [
      { value: String(team.totalMessages), label: 'Messages' },
      { value: String(team.totalSessions), label: 'Sessions' },
      { value: String(team.memberCount), label: 'Members' },
    ],
    glance: [],
    projects: [],
    charts: [],
    narrative: { paragraphs: [], keyInsight: '' },
    wins: [],
    frictions: syntheticFrictions,
    claudeMdItems: syntheticRules,
    features: [],
    patterns: [],
    horizon: [],
    funEnding: { headline: '', detail: '' },
  };

  // Use the existing analyze pipeline
  const output = analyze(syntheticReport);

  // Enhance todos with team context (member count per friction)
  const enhancedTodos = output.todos.map(todo => {
    if (todo.source === 'friction') {
      // Find matching team friction to get member count
      const matchingFriction = team.frictions.find(tf =>
        todo.task.includes(tf.title)
      );
      if (matchingFriction && matchingFriction.memberCount > 1) {
        return {
          ...todo,
          task: `${todo.task} (${matchingFriction.memberCount} members)`,
        };
      }
    }
    return todo;
  });

  return { ...output, todos: enhancedTodos };
}
