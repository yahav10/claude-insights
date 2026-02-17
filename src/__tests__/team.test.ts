import { describe, it, expect } from 'vitest';
import { mergeFrictions, mergeRules, aggregateReports, generateTeamOutput } from '../team.js';
import { makeReportData, makeFriction, makeClaudeMdItem } from './helpers.js';
import type { FrictionCategory, ClaudeMdItem } from '../types.js';

describe('mergeFrictions', () => {
  it('deduplicates similar frictions across members', () => {
    // significantWords strips stop words but not 'incorrect'/'wrong'
    // "Incorrect CSS scoping component styles" => ['incorrect', 'css', 'scoping', 'component', 'styles'] (5)
    // "Wrong CSS scoping component styles"     => ['wrong', 'css', 'scoping', 'component', 'styles'] (5)
    // overlap = 4/5 = 0.8 >= 0.8 threshold
    const member1: FrictionCategory[] = [
      makeFriction({ title: 'Incorrect CSS scoping component styles', description: 'Styles leak' }),
    ];
    const member2: FrictionCategory[] = [
      makeFriction({ title: 'Wrong CSS scoping component styles', description: 'Styles bleed' }),
    ];

    const result = mergeFrictions([member1, member2]);
    expect(result.length).toBe(1);
    expect(result[0].memberCount).toBe(2);
  });

  it('counts members per merged friction', () => {
    // 'test runner setup configuration' => ['test', 'runner', 'setup', 'configuration'] (4)
    // 'test runner setup configuration issues' => ['test', 'runner', 'setup', 'configuration', 'issues'] (5)
    // overlap(A,B) = 4 => ratioA = 4/4 = 1.0 >= 0.8 => merge
    const member1: FrictionCategory[] = [
      makeFriction({ title: 'test runner setup configuration' }),
    ];
    const member2: FrictionCategory[] = [
      makeFriction({ title: 'test runner setup configuration issues' }),
    ];
    const member3: FrictionCategory[] = [
      makeFriction({ title: 'test runner setup configuration errors' }),
    ];

    const result = mergeFrictions([member1, member2, member3]);
    expect(result.length).toBe(1);
    expect(result[0].memberCount).toBe(3);
    expect(result[0].members).toEqual(['Report 1', 'Report 2', 'Report 3']);
  });

  it('keeps all examples from merged frictions', () => {
    const member1: FrictionCategory[] = [
      makeFriction({
        title: 'Incorrect CSS scoping component styles',
        examples: ['When editing global styles, scoped components break'],
      }),
    ];
    const member2: FrictionCategory[] = [
      makeFriction({
        title: 'Wrong CSS scoping component styles',
        examples: ['Shadow DOM styles leak into parent'],
      }),
    ];

    const result = mergeFrictions([member1, member2]);
    expect(result.length).toBe(1);
    expect(result[0].examples).toContain('When editing global styles, scoped components break');
    expect(result[0].examples).toContain('Shadow DOM styles leak into parent');
  });

  it('treats dissimilar frictions as separate', () => {
    const member1: FrictionCategory[] = [
      makeFriction({ title: 'CSS scoping issues' }),
    ];
    const member2: FrictionCategory[] = [
      makeFriction({ title: 'Database migration failures' }),
    ];

    const result = mergeFrictions([member1, member2]);
    expect(result.length).toBe(2);
    expect(result[0].memberCount).toBe(1);
    expect(result[1].memberCount).toBe(1);
  });
});

describe('mergeRules', () => {
  it('deduplicates similar rules', () => {
    // 'Always run unit tests before committing changes' => ['always', 'run', 'unit', 'tests', 'committing', 'changes'] (6)
    // 'Always run unit tests before committing code'    => ['always', 'run', 'unit', 'tests', 'committing', 'code'] (6)
    // overlap = 5/6 = 0.833 >= 0.8
    const member1: ClaudeMdItem[] = [
      makeClaudeMdItem({ code: 'Always run unit tests before committing changes', why: 'Prevents regressions' }),
    ];
    const member2: ClaudeMdItem[] = [
      makeClaudeMdItem({ code: 'Always run unit tests before committing code', why: 'Stops broken code' }),
    ];

    const result = mergeRules([member1, member2]);
    expect(result.length).toBe(1);
  });

  it('assigns High priority to rules from 2+ members', () => {
    const member1: ClaudeMdItem[] = [
      makeClaudeMdItem({ code: 'Always run unit tests before committing changes' }),
    ];
    const member2: ClaudeMdItem[] = [
      makeClaudeMdItem({ code: 'Always run unit tests before committing code' }),
    ];

    const result = mergeRules([member1, member2]);
    expect(result[0].priority).toBe('High');
    expect(result[0].memberCount).toBe(2);
  });

  it('assigns Medium priority to rules from 1 member', () => {
    const member1: ClaudeMdItem[] = [
      makeClaudeMdItem({ code: 'Check database schema before migrations' }),
    ];

    const result = mergeRules([member1]);
    expect(result[0].priority).toBe('Medium');
    expect(result[0].memberCount).toBe(1);
  });

  it('counts members per rule', () => {
    // 'Verify CSS scoping boundaries components' => ['verify', 'css', 'scoping', 'boundaries', 'components'] (5)
    // 'Verify CSS scoping boundaries elements'   => ['verify', 'css', 'scoping', 'boundaries', 'elements'] (5)
    // overlap = 4/5 = 0.8 >= 0.8
    const member1: ClaudeMdItem[] = [
      makeClaudeMdItem({ code: 'Verify CSS scoping boundaries components' }),
    ];
    const member2: ClaudeMdItem[] = [
      makeClaudeMdItem({ code: 'Verify CSS scoping boundaries elements' }),
    ];
    const member3: ClaudeMdItem[] = [
      makeClaudeMdItem({ code: 'Verify CSS scoping boundaries styles' }),
    ];

    const result = mergeRules([member1, member2, member3]);
    expect(result.length).toBe(1);
    expect(result[0].memberCount).toBe(3);
  });
});

describe('aggregateReports', () => {
  it('calculates totals across reports', () => {
    const report1 = makeReportData({
      stats: [
        { value: '100', label: 'Messages' },
        { value: '10', label: 'Sessions' },
      ],
    });
    const report2 = makeReportData({
      stats: [
        { value: '200', label: 'Messages' },
        { value: '20', label: 'Sessions' },
      ],
    });

    const result = aggregateReports([report1, report2]);
    expect(result.totalMessages).toBe(300);
    expect(result.totalSessions).toBe(30);
    expect(result.memberCount).toBe(2);
  });

  it('merges frictions and rules', () => {
    const report1 = makeReportData({
      frictions: [makeFriction({ title: 'Incorrect CSS scoping component styles' })],
      claudeMdItems: [makeClaudeMdItem({ code: 'Always run unit tests before committing changes' })],
    });
    const report2 = makeReportData({
      frictions: [makeFriction({ title: 'Wrong CSS scoping component styles' })],
      claudeMdItems: [makeClaudeMdItem({ code: 'Always run unit tests before committing code' })],
    });

    const result = aggregateReports([report1, report2]);
    expect(result.frictions.length).toBe(1);
    expect(result.frictions[0].memberCount).toBe(2);
    expect(result.rules.length).toBe(1);
    expect(result.rules[0].memberCount).toBe(2);
  });

  it('tracks member count', () => {
    const reports = [makeReportData(), makeReportData(), makeReportData()];
    const result = aggregateReports(reports);
    expect(result.memberCount).toBe(3);
  });
});

describe('generateTeamOutput', () => {
  it('generates AnalyzerOutput from TeamReport', () => {
    const report1 = makeReportData({
      frictions: [makeFriction({ title: 'CSS scoping issues' })],
      claudeMdItems: [makeClaudeMdItem({ code: 'Always run tests before committing' })],
    });
    const teamReport = aggregateReports([report1]);
    const output = generateTeamOutput(teamReport);

    expect(output).toBeDefined();
    expect(output.todos).toBeDefined();
    expect(output.claudeMdAdditions).toBeDefined();
    expect(output.skills).toBeDefined();
    expect(output.readmeContent).toBeDefined();
    expect(output.settingsJson).toBeDefined();
    expect(output.mcpRecommendations).toBeDefined();
  });

  it('creates skills from team frictions', () => {
    const report1 = makeReportData({
      frictions: [makeFriction({ title: 'Incorrect CSS scoping component styles', description: 'Styles leak across components' })],
    });
    const report2 = makeReportData({
      frictions: [makeFriction({ title: 'Wrong CSS scoping component styles', description: 'Scoped CSS breaks' })],
    });
    const teamReport = aggregateReports([report1, report2]);
    const output = generateTeamOutput(teamReport);

    expect(output.skills.length).toBeGreaterThan(0);
  });

  it('includes team context in todos', () => {
    const report1 = makeReportData({
      frictions: [makeFriction({ title: 'Incorrect CSS scoping component styles' })],
    });
    const report2 = makeReportData({
      frictions: [makeFriction({ title: 'Wrong CSS scoping component styles' })],
    });
    const teamReport = aggregateReports([report1, report2]);
    const output = generateTeamOutput(teamReport);

    // Todos should reference that this is a team-wide friction
    const frictionTodo = output.todos.find(t => t.source === 'friction');
    expect(frictionTodo).toBeDefined();
    expect(frictionTodo!.task).toContain('2 members');
  });
});
