import { describe, it, expect } from 'vitest';
import {
  toSkillName,
  extractScenarioPhrase,
  boldTechTerms,
  buildSkillRules,
  buildVerificationChecklist,
  buildWhenToUse,
  parseRuleIntoBullets,
  analyze,
  buildSettings,
  buildClaudeMdAdditions,
} from '../analyzer.js';
import { makeReportData, makeFriction, makeClaudeMdItem } from './helpers.js';

describe('toSkillName', () => {
  it('removes filler words and creates kebab-case', () => {
    expect(toSkillName('Repeated Widget Configuration Errors')).toBe('widget-configuration-errors');
  });

  it('removes special characters', () => {
    expect(toSkillName('CSS (Scoping) & Layout!')).toBe('css-scoping-layout');
  });

  it('truncates to 40 characters', () => {
    const long = 'extremely long title that goes on and on with many words beyond the limit';
    const result = toSkillName(long);
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it('returns empty string for empty input', () => {
    expect(toSkillName('')).toBe('');
  });

  it('handles title with only filler words', () => {
    expect(toSkillName('the and in on')).toBe('');
  });

  it('collapses multiple hyphens', () => {
    expect(toSkillName('widget  --  errors')).toBe('widget-errors');
  });
});

describe('extractScenarioPhrase', () => {
  it('extracts "When X, Claude..." pattern', () => {
    const result = extractScenarioPhrase('When configuring dropdown widgets, Claude used inline styles');
    expect(result).toBe('configuring dropdown widgets');
  });

  it('extracts comma-separated phrase before first comma', () => {
    const result = extractScenarioPhrase('Building the modal component with hooks, the tests broke');
    expect(result).toBe('building the modal component with hooks');
  });

  it('handles comma inside parentheses without splitting', () => {
    const result = extractScenarioPhrase('When building modal (dialog, popup) components, Claude forgot focus trap');
    expect(result).toBe('building modal (dialog, popup) components');
  });

  it('returns null for short strings', () => {
    const result = extractScenarioPhrase('Too short');
    expect(result).toBeNull();
  });

  it('returns null for strings without comma pattern', () => {
    const result = extractScenarioPhrase('No commas here at all in this text');
    expect(result).toBeNull();
  });
});

describe('boldTechTerms', () => {
  it('bolds CSS pseudo-selectors', () => {
    const result = boldTechTerms('Used :host() to scope styles');
    expect(result).toContain('**:host()**');
  });

  it('bolds pseudo-selectors with arguments', () => {
    const result = boldTechTerms('Applied :has(.active) selector');
    expect(result).toContain('**:has(.active)**');
  });

  it('bolds dimensions like 0x0', () => {
    const result = boldTechTerms('The element rendered at 0x0 pixels');
    expect(result).toContain('**0x0**');
  });

  it('bolds multi-word uppercase sequences', () => {
    // Trailing lookahead requires [\s,.):]  after the match, so put phrases mid-sentence
    const result = boldTechTerms('Used LEFT JOIN instead of INNER JOIN in the query');
    expect(result).toContain('**LEFT JOIN**');
    expect(result).toContain('**INNER JOIN**');
  });

  it('bolds standalone acronyms', () => {
    const result = boldTechTerms('The DOM was updated via API calls');
    expect(result).toContain('**DOM**');
    expect(result).toContain('**API**');
  });

  it('does not double-bold already bolded text', () => {
    const result = boldTechTerms('Used LEFT JOIN for the query');
    // LEFT JOIN should be bolded once as a phrase, not individually
    expect(result).not.toContain('****');
  });
});

describe('buildSkillRules', () => {
  it('parses a matched rule into bullets', () => {
    const rule = makeClaudeMdItem({ code: '1) Check imports, 2) Verify exports, 3) Run tests' });
    const friction = makeFriction();
    const result = buildSkillRules(rule, friction);
    expect(result).toContain('- Check imports');
    expect(result).toContain('- Verify exports');
    expect(result).toContain('- Run tests');
  });

  it('uses fallback rules when no rule is provided', () => {
    const friction = makeFriction({ title: 'Widget Configuration Errors' });
    const result = buildSkillRules(undefined, friction);
    expect(result).toContain('inspect and reference existing');
    expect(result).toContain('narrowest possible scope');
  });

  it('appends dedup guardrails only when not already present', () => {
    const rule = makeClaudeMdItem({ code: 'Always verify the fix does not regress related components' });
    const friction = makeFriction();
    const result = buildSkillRules(rule, friction);
    // Should not duplicate the regression check
    const regressionCount = (result.match(/regress/g) || []).length;
    expect(regressionCount).toBe(1);
  });

  it('adds confirmation guardrail when not already present', () => {
    const rule = makeClaudeMdItem({ code: 'Run the test suite after changes' });
    const friction = makeFriction();
    const result = buildSkillRules(rule, friction);
    expect(result).toContain('get confirmation');
  });
});

describe('buildVerificationChecklist', () => {
  it('includes base checks', () => {
    const friction = makeFriction({ examples: [] });
    const result = buildVerificationChecklist(friction);
    expect(result).toContain('Fix addresses the specific issue');
    expect(result).toContain('existing codebase patterns');
    expect(result).toContain('narrowly scoped');
    expect(result).toContain('no regressions');
    expect(result).toContain('confirmed before implementation');
  });

  it('adds example-specific checks', () => {
    const friction = makeFriction({
      examples: ['Example one failure pattern', 'Example two failure pattern'],
    });
    const result = buildVerificationChecklist(friction);
    expect(result).toContain('Verified against: "Example one failure pattern"');
    expect(result).toContain('Verified against: "Example two failure pattern"');
  });

  it('limits to 3 examples', () => {
    const friction = makeFriction({
      examples: ['Ex1 long enough text', 'Ex2 long enough text', 'Ex3 long enough text', 'Ex4 long enough text'],
    });
    const result = buildVerificationChecklist(friction);
    const verifiedLines = result.split('\n').filter(l => l.includes('Verified against'));
    expect(verifiedLines).toHaveLength(3);
  });

  it('truncates long examples to ~100 chars', () => {
    const longExample = 'A'.repeat(150);
    const friction = makeFriction({ examples: [longExample] });
    const result = buildVerificationChecklist(friction);
    expect(result).toContain('...');
  });
});

describe('buildWhenToUse', () => {
  it('includes primary trigger from title', () => {
    const friction = makeFriction({ title: 'Widget Configuration Errors' });
    const result = buildWhenToUse(friction);
    expect(result).toContain('widget configuration errors');
  });

  it('includes scenario triggers from examples', () => {
    const friction = makeFriction({
      title: 'Test Friction',
      examples: [
        'When configuring test fixtures, Claude missed the setup step',
      ],
    });
    const result = buildWhenToUse(friction);
    expect(result).toContain('configuring test fixtures');
  });

  it('uses description fallback when no scenario phrases found', () => {
    const friction = makeFriction({
      title: 'Short Title',
      examples: ['Too short'],
      description: 'Components repeatedly failed validation checks due to stale data',
    });
    const result = buildWhenToUse(friction);
    expect(result).toContain('previous attempts involved');
  });
});

describe('parseRuleIntoBullets', () => {
  it('splits numbered items with parentheses', () => {
    const result = parseRuleIntoBullets('1) Check imports, 2) Verify exports, 3) Run tests');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('Check imports');
    expect(result[1]).toBe('Verify exports');
    expect(result[2]).toBe('Run tests');
  });

  it('splits by sentences', () => {
    const result = parseRuleIntoBullets('Always check the imports first. Then verify the exports are correct. Finally run the test suite.');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('Always check the imports first');
  });

  it('returns single rule as-is for simple text', () => {
    const result = parseRuleIntoBullets('Always use CSS custom properties');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Always use CSS custom properties');
  });
});

describe('analyze (integration)', () => {
  it('produces 2 skills from 2 frictions', () => {
    const data = makeReportData({
      frictions: [
        makeFriction({ title: 'Widget Config Errors' }),
        makeFriction({ title: 'CSS Scoping Issues' }),
      ],
    });
    const output = analyze(data);
    expect(output.skills).toHaveLength(2);
    expect(output.skills[0].filename).toContain('widget');
    expect(output.skills[1].filename).toContain('css');
  });

  it('produces empty output from empty data', () => {
    const data = makeReportData();
    const output = analyze(data);
    expect(output.skills).toHaveLength(0);
    expect(output.todos).toHaveLength(0);
    expect(output.claudeMdAdditions).toContain('CLAUDE.md Additions');
    expect(output.settingsJson).toEqual({});
  });

  it('generates todos for frictions, claude-md items, features, and patterns', () => {
    const data = makeReportData({
      frictions: [makeFriction()],
      claudeMdItems: [makeClaudeMdItem()],
      features: [{ title: 'Hooks', oneliner: 'Test hooks', why: 'Testing', examples: [] }],
      patterns: [{ title: 'Pattern', summary: 'Summary', detail: 'Detail', prompt: 'Prompt' }],
    });
    const output = analyze(data);
    const sources = output.todos.map(t => t.source);
    expect(sources).toContain('friction');
    expect(sources).toContain('claude-md');
    expect(sources).toContain('feature');
    expect(sources).toContain('pattern');
  });
});

describe('buildSettings', () => {
  it('parses hooks from feature card example', () => {
    const data = makeReportData({
      features: [{
        title: 'Pre-commit Hooks',
        oneliner: 'Catch errors early',
        why: 'Reduces review cycles',
        examples: ['{ "hooks": { "pre-commit": "npm run lint" } }'],
      }],
    });
    const result = buildSettings(data);
    expect(result).toHaveProperty('hooks');
    expect((result as { hooks: { 'pre-commit': string } }).hooks['pre-commit']).toBe('npm run lint');
  });

  it('returns empty object when no hooks feature exists', () => {
    const data = makeReportData({ features: [] });
    const result = buildSettings(data);
    expect(result).toEqual({});
  });

  it('returns empty object when hooks feature has no examples', () => {
    const data = makeReportData({
      features: [{
        title: 'Pre-commit Hooks',
        oneliner: 'Test',
        why: 'Test',
        examples: [],
      }],
    });
    const result = buildSettings(data);
    expect(result).toEqual({});
  });
});

describe('buildClaudeMdAdditions', () => {
  it('categorizes CSS items under CSS & Styling section', () => {
    const data = makeReportData({
      claudeMdItems: [
        makeClaudeMdItem({ code: 'Always use CSS custom properties for theming', why: 'Consistency' }),
      ],
    });
    const result = buildClaudeMdAdditions(data);
    expect(result).toContain('## CSS & Styling');
    expect(result).toContain('CSS custom properties');
  });

  it('categorizes debug items under Debugging section', () => {
    const data = makeReportData({
      claudeMdItems: [
        makeClaudeMdItem({ code: 'Before debugging, reproduce the issue first', why: 'Saves time' }),
      ],
    });
    const result = buildClaudeMdAdditions(data);
    expect(result).toContain('## Debugging');
  });

  it('categorizes test items under Testing section', () => {
    const data = makeReportData({
      claudeMdItems: [
        makeClaudeMdItem({ code: 'Run vitest before committing', why: 'Catch regressions' }),
      ],
    });
    const result = buildClaudeMdAdditions(data);
    expect(result).toContain('## Testing');
  });

  it('puts uncategorized items in General Rules', () => {
    const data = makeReportData({
      claudeMdItems: [
        makeClaudeMdItem({ code: 'Always verify import paths', why: 'Prevents broken builds' }),
      ],
    });
    const result = buildClaudeMdAdditions(data);
    expect(result).toContain('## General Rules');
  });

  it('includes the why annotation', () => {
    const data = makeReportData({
      claudeMdItems: [
        makeClaudeMdItem({ code: 'Some rule', why: 'Important reason' }),
      ],
    });
    const result = buildClaudeMdAdditions(data);
    expect(result).toContain('_Why: Important reason_');
  });

  it('produces header-only output for empty items', () => {
    const data = makeReportData({ claudeMdItems: [] });
    const result = buildClaudeMdAdditions(data);
    expect(result).toContain('# CLAUDE.md Additions');
    expect(result).not.toContain('## General Rules');
    expect(result).not.toContain('## CSS & Styling');
  });
});
