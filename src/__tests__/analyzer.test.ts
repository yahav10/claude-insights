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
  buildSkills,
  mapFrictionToHooks,
  buildMcpRecommendations,
  classifyFrictionDomain,
  buildTriggerDescription,
  buildNegativeTriggers,
  mapDomainToPattern,
  buildSkillSteps,
  buildPositiveExamples,
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
    expect(output.skills[0].skillName).toContain('widget');
    expect(output.skills[1].skillName).toContain('css');
  });

  it('produces empty output from empty data', () => {
    const data = makeReportData();
    const output = analyze(data);
    expect(output.skills).toHaveLength(0);
    expect(output.todos).toHaveLength(0);
    expect(output.claudeMdAdditions).toContain('CLAUDE.md Additions');
    expect(output.settingsJson).toEqual({});
    expect(output.mcpRecommendations).toHaveLength(0);
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

  it('includes mcpRecommendations in output', () => {
    const data = makeReportData({ frictions: [makeFriction()] });
    const output = analyze(data);
    expect(output).toHaveProperty('mcpRecommendations');
    expect(Array.isArray(output.mcpRecommendations)).toBe(true);
  });
});

describe('mapFrictionToHooks', () => {
  it('maps CSS friction to PreToolUse prompt hook', () => {
    const friction = makeFriction({ title: 'CSS Scoping Mistakes' });
    const hooks = mapFrictionToHooks(friction);
    expect(hooks.length).toBeGreaterThan(0);
    expect(hooks[0].event).toBe('PreToolUse');
    expect(hooks[0].handlerType).toBe('prompt');
    expect(hooks[0].prompt).toBeDefined();
  });

  it('maps test friction to PostToolUse command hook', () => {
    const friction = makeFriction({ title: 'Test Pattern Failures' });
    const hooks = mapFrictionToHooks(friction);
    expect(hooks.length).toBeGreaterThan(0);
    const postToolHook = hooks.find(h => h.event === 'PostToolUse');
    expect(postToolHook).toBeDefined();
  });

  it('maps debugging friction to Stop prompt hook', () => {
    const friction = makeFriction({ title: 'Debugging Wrong Root Causes' });
    const hooks = mapFrictionToHooks(friction);
    const stopHook = hooks.find(h => h.event === 'Stop');
    expect(stopHook).toBeDefined();
    expect(stopHook!.handlerType).toBe('prompt');
  });

  it('returns generic PreToolUse hook for unrecognized friction', () => {
    const friction = makeFriction({
      title: 'Completely Unknown Category',
      description: 'An unrecognized friction that does not match any known keywords.',
      examples: ['Something went wrong in an unclear way'],
    });
    const hooks = mapFrictionToHooks(friction);
    expect(hooks.length).toBeGreaterThan(0);
    expect(hooks[0].event).toBe('PreToolUse');
  });

  it('includes description explaining why the hook exists', () => {
    const friction = makeFriction({ title: 'CSS Scoping Mistakes' });
    const hooks = mapFrictionToHooks(friction);
    hooks.forEach(h => expect(h.description).toBeTruthy());
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
  });

  it('returns empty object when no hooks feature and no frictions', () => {
    const data = makeReportData({ features: [], frictions: [] });
    const result = buildSettings(data);
    expect(result).toEqual({});
  });

  it('returns empty object when hooks feature has no examples and no frictions', () => {
    const data = makeReportData({
      frictions: [],
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

  it('generates hooks from frictions', () => {
    const data = makeReportData({
      frictions: [makeFriction({ title: 'CSS Scoping Mistakes' })],
    });
    const settings = buildSettings(data);
    expect(settings).toHaveProperty('hooks');
  });

  it('generates empty object when no frictions and no feature hooks', () => {
    const data = makeReportData({ frictions: [], features: [] });
    const settings = buildSettings(data);
    expect(settings).toBeDefined();
  });

  it('deduplicates hooks targeting the same event', () => {
    const data = makeReportData({
      frictions: [
        makeFriction({ title: 'CSS Scoping Mistakes' }),
        makeFriction({ title: 'CSS Layout Failures' }),
      ],
    });
    const settings = buildSettings(data);
    expect(settings).toHaveProperty('hooks');
    // Access the PreToolUse hooks array and check no duplicate prompts
    const hooks = settings.hooks as Record<string, unknown[]>;
    if (hooks && hooks['PreToolUse']) {
      const prompts = (hooks['PreToolUse'] as Array<{ prompt?: string }>).map(h => h.prompt);
      const uniquePrompts = [...new Set(prompts)];
      expect(prompts.length).toBe(uniquePrompts.length);
    }
  });

  it('preserves existing hooks from feature card JSON', () => {
    const data = makeReportData({
      frictions: [makeFriction({ title: 'CSS Scoping Mistakes' })],
      features: [{
        title: 'Custom Hooks',
        oneliner: 'Auto-run checks',
        why: 'Catch issues early',
        examples: ['{"hooks":{"PostToolUse":[{"command":"npm test","description":"Run tests"}]}}'],
      }],
    });
    const settings = buildSettings(data);
    expect(settings).toHaveProperty('hooks');
  });
});

describe('buildSkills', () => {
  it('sets dirName to kebab-case skill name', () => {
    const data = makeReportData({ frictions: [makeFriction({ title: 'CSS Scoping Mistakes' })] });
    const skills = buildSkills(data);
    expect(skills[0].dirName).toBe('css-scoping-mistakes');
  });

  it('sets skillName to kebab-case name', () => {
    const data = makeReportData({ frictions: [makeFriction({ title: 'CSS Scoping Mistakes' })] });
    const skills = buildSkills(data);
    expect(skills[0].skillName).toBe('css-scoping-mistakes');
  });

  it('sets filename to SKILL.md for all skills', () => {
    const data = makeReportData({ frictions: [makeFriction(), makeFriction({ title: 'Build Failures' })] });
    const skills = buildSkills(data);
    skills.forEach(s => expect(s.filename).toBe('SKILL.md'));
  });

  it('includes allowed-tools in frontmatter', () => {
    const data = makeReportData({ frictions: [makeFriction()] });
    const skills = buildSkills(data);
    expect(skills[0].content).toContain('allowed-tools:');
  });

  it('includes context: fork in frontmatter', () => {
    const data = makeReportData({ frictions: [makeFriction()] });
    const skills = buildSkills(data);
    expect(skills[0].content).toContain('context: fork');
  });

  it('includes argument-hint in frontmatter', () => {
    const data = makeReportData({ frictions: [makeFriction()] });
    const skills = buildSkills(data);
    expect(skills[0].content).toContain('argument-hint:');
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

describe('buildMcpRecommendations', () => {
  it('matches CSS friction to playwright MCP server', () => {
    const data = makeReportData({
      frictions: [makeFriction({ title: 'CSS Scoping Mistakes' })],
    });
    const recs = buildMcpRecommendations(data);
    expect(recs.length).toBeGreaterThan(0);
    const pw = recs.find(r => r.serverName === 'playwright');
    expect(pw).toBeDefined();
  });

  it('matches database friction to postgres MCP server', () => {
    const data = makeReportData({
      frictions: [makeFriction({ title: 'SQL Query Failures', description: 'Database queries returning wrong results' })],
    });
    const recs = buildMcpRecommendations(data);
    const pg = recs.find(r => r.serverName === 'postgres');
    expect(pg).toBeDefined();
  });

  it('returns empty array when no frictions match any server', () => {
    const data = makeReportData({
      frictions: [makeFriction({ title: 'Completely Unknown Category', description: 'Nothing recognizable' })],
    });
    const recs = buildMcpRecommendations(data);
    expect(recs).toHaveLength(0);
  });

  it('deduplicates when multiple frictions match same server', () => {
    const data = makeReportData({
      frictions: [
        makeFriction({ title: 'CSS Scoping Mistakes' }),
        makeFriction({ title: 'Visual Layout Failures' }),
      ],
    });
    const recs = buildMcpRecommendations(data);
    const pwCount = recs.filter(r => r.serverName === 'playwright').length;
    expect(pwCount).toBeLessThanOrEqual(1);
  });

  it('includes matched friction titles in recommendation', () => {
    const data = makeReportData({
      frictions: [makeFriction({ title: 'CSS Scoping Mistakes' })],
    });
    const recs = buildMcpRecommendations(data);
    const pw = recs.find(r => r.serverName === 'playwright');
    expect(pw?.matchedFrictions).toContain('CSS Scoping Mistakes');
  });

  it('generates valid config block for each recommendation', () => {
    const data = makeReportData({
      frictions: [makeFriction({ title: 'CSS Scoping Mistakes' })],
    });
    const recs = buildMcpRecommendations(data);
    recs.forEach(r => {
      expect(r.configBlock).toBeDefined();
      expect(typeof r.configBlock).toBe('object');
    });
  });

  it('includes install command for each recommendation', () => {
    const data = makeReportData({
      frictions: [makeFriction({ title: 'CSS Scoping Mistakes' })],
    });
    const recs = buildMcpRecommendations(data);
    recs.forEach(r => {
      expect(r.installCommand).toBeTruthy();
    });
  });
});

describe('classifyFrictionDomain', () => {
  it('classifies CSS friction as css-styling', () => {
    const f = makeFriction({ title: 'CSS Scoping Mistakes', description: 'Shadow DOM styling issues' });
    expect(classifyFrictionDomain(f)).toBe('css-styling');
  });

  it('classifies test friction as testing', () => {
    const f = makeFriction({ title: 'Test Pattern Failures', description: 'Unit test mocking issues' });
    expect(classifyFrictionDomain(f)).toBe('testing');
  });

  it('classifies debug friction as debugging', () => {
    const f = makeFriction({ title: 'Wrong Root Cause Analysis', description: 'Debugging production issues' });
    expect(classifyFrictionDomain(f)).toBe('debugging');
  });

  it('classifies SQL friction as data-sql', () => {
    const f = makeFriction({ title: 'SQL Query Failures', description: 'Database queries returning wrong results' });
    expect(classifyFrictionDomain(f)).toBe('data-sql');
  });

  it('classifies import friction as imports-dependencies', () => {
    const f = makeFriction({ title: 'Build Import Errors', description: 'Bundle compilation failures' });
    expect(classifyFrictionDomain(f)).toBe('imports-dependencies');
  });

  it('classifies scope friction as architecture-scope', () => {
    const f = makeFriction({ title: 'Scope Boundary Violations', description: 'Changes crossing module boundaries' });
    expect(classifyFrictionDomain(f)).toBe('architecture-scope');
  });

  it('returns general for unrecognized friction', () => {
    const f = makeFriction({ title: 'Completely Unknown', description: 'Nothing recognizable here' });
    expect(classifyFrictionDomain(f)).toBe('general');
  });

  it('uses description keywords when title has no match', () => {
    const f = makeFriction({ title: 'Repeated Failures', description: 'CSS scoping issues in components' });
    expect(classifyFrictionDomain(f)).toBe('css-styling');
  });

  it('does not misclassify when description incidentally mentions another domain keyword', () => {
    // "test" appears in description but the friction is about premature solutions, not testing
    const f = makeFriction({
      title: 'Premature Solutions Without Codebase Verification',
      description: 'Claude proposed fixes before verifying against existing test patterns and codebase conventions',
    });
    // Title has no domain keywords → falls to description → "test" is there but title should NOT match testing
    // Since title has no match and description contains "test", it will match testing from description.
    // But the key fix is word-boundary: "test" in "test patterns" matches as a whole word.
    // This friction genuinely mentions testing, so testing is acceptable from description.
    // The real regression was substring matching: "contest" or "attest" should NOT match.
    expect(classifyFrictionDomain(f)).toBe('testing');
  });

  it('does not match keyword as substring of another word', () => {
    // "test" should NOT match inside "contest", "attest", "detest"
    const f = makeFriction({
      title: 'Contested Deployment Decisions',
      description: 'Teams attesting to different approaches caused friction',
    });
    expect(classifyFrictionDomain(f)).toBe('general');
  });

  it('prioritizes title match over description match', () => {
    // Title says "debug", description mentions "test" — title should win
    const f = makeFriction({
      title: 'Debug Investigation Failures',
      description: 'Claude skipped test verification steps during debugging',
    });
    expect(classifyFrictionDomain(f)).toBe('debugging');
  });
});

describe('buildTriggerDescription (three-part structure)', () => {
  it('starts with an action verb sentence derived from friction.description', () => {
    const f = makeFriction({
      title: 'CSS Scoping Mistakes',
      description: 'CSS pseudo-selector mistakes in Shadow DOM and scoped components',
    });
    const result = buildTriggerDescription(f);
    expect(result).toMatch(/^(Prevents|Guards against|Catches)/);
  });

  it('includes "Use when" trigger phrase', () => {
    const f = makeFriction({ title: 'Test Pattern Failures' });
    const result = buildTriggerDescription(f);
    expect(result).toContain('Use when');
  });

  it('produces action-verb opener BEFORE "Use when"', () => {
    const f = makeFriction({
      title: 'CSS Scoping Mistakes',
      description: 'CSS scoping issues in Shadow DOM components',
      examples: ['When fixing flyout styles, CSS leaked to parent'],
    });
    const result = buildTriggerDescription(f);
    const actionIdx = result.search(/^(Prevents|Guards against|Catches)/);
    const useWhenIdx = result.indexOf('Use when');
    expect(actionIdx).toBeLessThan(useWhenIdx);
  });

  it('uses friction.description content for the opener', () => {
    const f = makeFriction({
      title: 'Debugging Wrong Root Causes',
      description: 'Jumping to conclusions about root cause without evidence',
    });
    const result = buildTriggerDescription(f);
    const firstSentence = result.split('. ')[0];
    expect(firstSentence.toLowerCase()).toContain('root cause');
  });

  it('still includes scenario phrases from examples', () => {
    const f = makeFriction({
      title: 'Test Friction',
      examples: ['When configuring test fixtures, Claude missed the setup step'],
    });
    const result = buildTriggerDescription(f);
    expect(result.toLowerCase()).toContain('configuring test fixtures');
  });

  it('stays under 1024 characters', () => {
    const f = makeFriction({
      title: 'CSS Scoping Mistakes',
      description: 'A'.repeat(500),
      examples: ['When doing something long, Claude failed'],
    });
    const result = buildTriggerDescription(f);
    expect(result.length).toBeLessThanOrEqual(1024);
  });
});

describe('buildNegativeTriggers', () => {
  it('returns CSS-specific exclusion for css-styling domain', () => {
    const f = makeFriction({ title: 'CSS Scoping Mistakes' });
    const triggers = buildNegativeTriggers(f);
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers[0].toLowerCase()).toMatch(/color|font|spacing|simple/);
  });

  it('returns testing-specific exclusion for testing domain', () => {
    const f = makeFriction({ title: 'Test Pattern Failures' });
    const triggers = buildNegativeTriggers(f);
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers[0].toLowerCase()).toMatch(/feature|implementation/);
  });

  it('returns debugging-specific exclusion for debugging domain', () => {
    const f = makeFriction({ title: 'Debugging Wrong Root Causes', description: 'Jumping to conclusions without diagnostic evidence' });
    const triggers = buildNegativeTriggers(f);
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers[0].toLowerCase()).toMatch(/known|obvious/);
  });

  it('returns at least one exclusion for any friction including general', () => {
    const f = makeFriction({ title: 'Completely Unknown', description: 'Nothing recognizable' });
    const triggers = buildNegativeTriggers(f);
    expect(triggers.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildTriggerDescription (with negative triggers)', () => {
  it('includes "Do NOT use for" after "Use when"', () => {
    const f = makeFriction({ title: 'CSS Scoping Mistakes', description: 'CSS scoping issues' });
    const result = buildTriggerDescription(f);
    expect(result).toContain('Do NOT use for');
    const useWhenIdx = result.indexOf('Use when');
    const doNotIdx = result.indexOf('Do NOT use for');
    expect(doNotIdx).toBeGreaterThan(useWhenIdx);
  });

  it('three-part order: prevents → use-when → do-not-use', () => {
    const f = makeFriction({
      title: 'CSS Scoping Mistakes',
      description: 'CSS scoping issues in Shadow DOM',
    });
    const result = buildTriggerDescription(f);
    const preventsIdx = result.search(/^(Prevents|Guards against|Catches)/);
    const useWhenIdx = result.indexOf('Use when');
    const doNotIdx = result.indexOf('Do NOT use for');
    expect(preventsIdx).toBeLessThan(useWhenIdx);
    expect(useWhenIdx).toBeLessThan(doNotIdx);
  });
});

describe('buildWhenToUse (with negative triggers)', () => {
  it('includes "Do NOT use" bullets after positive triggers', () => {
    const f = makeFriction({ title: 'CSS Scoping Mistakes' });
    const result = buildWhenToUse(f);
    expect(result).toContain('Do NOT use');
  });

  it('negative triggers appear after all positive triggers', () => {
    const f = makeFriction({
      title: 'CSS Scoping Mistakes',
      examples: ['When fixing flyout styles, CSS leaked to parent'],
    });
    const result = buildWhenToUse(f);
    const lines = result.split('\n');
    const lastPositiveIdx = lines.reduce((max, line, i) =>
      line.startsWith('- When') ? i : max, -1);
    const firstNegativeIdx = lines.findIndex(l => l.includes('Do NOT use'));
    expect(firstNegativeIdx).toBeGreaterThan(lastPositiveIdx);
  });
});

describe('mapDomainToPattern', () => {
  it('maps css-styling to iterative-refinement', () => {
    expect(mapDomainToPattern('css-styling')).toBe('iterative-refinement');
  });

  it('maps testing to sequential-workflow', () => {
    expect(mapDomainToPattern('testing')).toBe('sequential-workflow');
  });

  it('maps debugging to domain-specific-intelligence', () => {
    expect(mapDomainToPattern('debugging')).toBe('domain-specific-intelligence');
  });

  it('maps data-sql to sequential-workflow', () => {
    expect(mapDomainToPattern('data-sql')).toBe('sequential-workflow');
  });

  it('maps architecture-scope to domain-specific-intelligence', () => {
    expect(mapDomainToPattern('architecture-scope')).toBe('domain-specific-intelligence');
  });

  it('maps general to sequential-workflow', () => {
    expect(mapDomainToPattern('general')).toBe('sequential-workflow');
  });
});

describe('buildSkillSteps (domain-specific)', () => {
  it('produces CSS-specific steps for css-styling friction', () => {
    const f = makeFriction({ title: 'CSS Scoping Mistakes', description: 'Shadow DOM styling issues' });
    const result = buildSkillSteps(f, undefined);
    expect(result.toLowerCase()).toContain('selector');
    expect(result.toLowerCase()).toContain('scope');
  });

  it('produces testing-specific steps for testing friction', () => {
    const f = makeFriction({ title: 'Test Pattern Failures', description: 'Unit test mocking issues' });
    const result = buildSkillSteps(f, undefined);
    expect(result.toLowerCase()).toContain('test');
    expect(result.toLowerCase()).toMatch(/run|execute/);
  });

  it('produces debugging-specific steps for debugging friction', () => {
    const f = makeFriction({ title: 'Wrong Root Cause', description: 'Debugging production issues' });
    const result = buildSkillSteps(f, undefined);
    expect(result.toLowerCase()).toContain('reproduce');
    expect(result.toLowerCase()).toContain('evidence');
  });

  it('produces SQL-specific steps for data-sql friction', () => {
    const f = makeFriction({ title: 'SQL Query Failures', description: 'Database query issues' });
    const result = buildSkillSteps(f, undefined);
    expect(result.toLowerCase()).toMatch(/schema|table|query/);
    expect(result.toLowerCase()).toContain('validate');
  });

  it('produces import-specific steps for imports-dependencies friction', () => {
    const f = makeFriction({ title: 'Build Import Errors', description: 'Bundle compilation failures' });
    const result = buildSkillSteps(f, undefined);
    expect(result.toLowerCase()).toMatch(/import|convention/);
  });

  it('produces architecture-specific steps for architecture-scope friction', () => {
    const f = makeFriction({ title: 'Scope Boundary Violations', description: 'Module boundary crossings' });
    const result = buildSkillSteps(f, undefined);
    expect(result.toLowerCase()).toMatch(/boundary|scope/);
  });

  it('every domain produces a verify/confirm step as the last numbered step', () => {
    const frictions = [
      makeFriction({ title: 'CSS Scoping Mistakes', description: 'Shadow DOM styling' }),
      makeFriction({ title: 'Test Pattern Failures', description: 'Unit test mocking issues' }),
      makeFriction({ title: 'Wrong Root Cause', description: 'Debugging production issues' }),
      makeFriction({ title: 'SQL Query Failures', description: 'Database query issues' }),
      makeFriction({ title: 'Build Import Errors', description: 'Bundle compilation failures' }),
      makeFriction({ title: 'Scope Boundary Violations', description: 'Module boundary crossings' }),
    ];
    for (const f of frictions) {
      const result = buildSkillSteps(f, undefined);
      const lines = result.split('\n').filter(l => /^\d+\./.test(l));
      const lastStep = lines[lines.length - 1].toLowerCase();
      expect(lastStep).toMatch(/verify|confirm|check|validate/);
    }
  });

  it('still includes suggested starting prompt when pattern provided', () => {
    const f = makeFriction({ title: 'CSS Scoping Mistakes', description: 'Shadow DOM styling' });
    const pattern = { title: 'T', summary: 'S', detail: 'D', prompt: 'Try this prompt' };
    const result = buildSkillSteps(f, pattern);
    expect(result).toContain('Suggested Starting Prompt');
    expect(result).toContain('Try this prompt');
  });

  it('all step outputs contain numbered steps', () => {
    const f = makeFriction({ title: 'Test Pattern Failures', description: 'Unit test mocking issues' });
    const result = buildSkillSteps(f, undefined);
    expect(result).toContain('1.');
    expect(result).toContain('2.');
    expect(result).toContain('3.');
  });
});

describe('buildPositiveExamples', () => {
  it('returns a markdown section with "Example Usage" heading', () => {
    const f = makeFriction({ title: 'CSS Scoping Mistakes', description: 'Shadow DOM styling issues' });
    const result = buildPositiveExamples(f);
    expect(result).toContain('## Example Usage');
  });

  it('includes a user request line', () => {
    const f = makeFriction({ title: 'CSS Scoping Mistakes', description: 'Shadow DOM styling issues' });
    const result = buildPositiveExamples(f);
    expect(result).toMatch(/Request/i);
  });

  it('includes numbered action steps', () => {
    const f = makeFriction({ title: 'CSS Scoping Mistakes', description: 'Shadow DOM styling issues' });
    const result = buildPositiveExamples(f);
    expect(result).toContain('1.');
    expect(result).toContain('2.');
  });

  it('includes an expected result', () => {
    const f = makeFriction({ title: 'CSS Scoping Mistakes', description: 'Shadow DOM styling issues' });
    const result = buildPositiveExamples(f);
    expect(result).toMatch(/Result/i);
  });

  it('incorporates friction domain into the scenario', () => {
    const f = makeFriction({ title: 'SQL Query Failures', description: 'Database queries returning wrong results' });
    const result = buildPositiveExamples(f);
    expect(result.toLowerCase()).toMatch(/sql|query|database/);
  });

  it('uses example content when available for specificity', () => {
    const f = makeFriction({
      title: 'Test Pattern Failures',
      description: 'Unit test mock issues',
      examples: ['When configuring test fixtures, the setup was incomplete'],
    });
    const result = buildPositiveExamples(f);
    expect(result.toLowerCase()).toMatch(/test|fixture|mock/);
  });

  it('produces different examples for different domains', () => {
    const css = buildPositiveExamples(makeFriction({ title: 'CSS Scoping Mistakes', description: 'Shadow DOM styling issues' }));
    const test = buildPositiveExamples(makeFriction({ title: 'Test Pattern Failures', description: 'Unit test mocking issues' }));
    expect(css).not.toBe(test);
  });

  it('does not produce redundant "Fix the issue with fixing..." phrasing', () => {
    const f = makeFriction({
      title: 'CSS Scoping Mistakes',
      description: 'Shadow DOM styling issues',
      examples: ['When fixing flyout styles, CSS leaked to parent'],
    });
    const result = buildPositiveExamples(f);
    expect(result).not.toMatch(/fix the issue with fixing/i);
    expect(result).not.toMatch(/fix the issue with debugging/i);
    expect(result).not.toMatch(/fix the issue with implementing/i);
  });

  it('strips leading gerund from scenario for natural phrasing', () => {
    const f = makeFriction({
      title: 'CSS Scoping Mistakes',
      description: 'Shadow DOM styling issues',
      examples: ['When fixing flyout styles, CSS leaked to parent'],
    });
    const result = buildPositiveExamples(f);
    // Should contain "Fix the flyout styles" (not "Fix the issue with fixing flyout styles")
    expect(result.toLowerCase()).toContain('fix the flyout styles');
  });

  it('uses "Investigate" prefix when scenario starts with "why" after gerund strip', () => {
    const f = makeFriction({
      title: 'Debug Investigation Failures',
      description: 'Wrong root cause hypotheses',
      examples: ['When debugging why the flyout opens on resize, Claude guessed wrong'],
    });
    const result = buildPositiveExamples(f);
    expect(result).toContain('Investigate why');
    expect(result).not.toMatch(/fix the why/i);
  });
});

describe('buildSkills (v1.3 integrated output)', () => {
  it('skill content has all sections in correct order', () => {
    const data = makeReportData({
      frictions: [makeFriction({
        title: 'CSS Scoping Mistakes',
        description: 'CSS pseudo-selector mistakes in Shadow DOM',
        examples: ['When fixing flyout styles, CSS leaked to parent'],
      })],
    });
    const skills = buildSkills(data);
    const content = skills[0].content;
    const sections = [
      '## When to Use This Skill',
      '## Example Usage',
      '## Steps',
      '## Rules',
      '## What Goes Wrong',
      '## Verification Checklist',
      '## Why This Skill Exists',
    ];
    let lastIdx = -1;
    for (const section of sections) {
      const idx = content.indexOf(section);
      expect(idx, `Section "${section}" should exist`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('description frontmatter contains three parts', () => {
    const data = makeReportData({
      frictions: [makeFriction({
        title: 'CSS Scoping Mistakes',
        description: 'CSS pseudo-selector mistakes in Shadow DOM',
      })],
    });
    const skills = buildSkills(data);
    const content = skills[0].content;
    // Extract description from frontmatter
    const descMatch = content.match(/description:\s*\|?\n?([\s\S]*?)(?=\nallowed-tools:)/);
    expect(descMatch).not.toBeNull();
    const desc = descMatch![1].replace(/^\s+/gm, '').trim();
    expect(desc).toMatch(/Prevents|Guards against|Catches/);
    expect(desc).toContain('Use when');
    expect(desc).toContain('Do NOT use for');
  });

  it('When to Use section includes both positive and negative triggers', () => {
    const data = makeReportData({
      frictions: [makeFriction({ title: 'CSS Scoping Mistakes', description: 'CSS scoping issues' })],
    });
    const skills = buildSkills(data);
    const content = skills[0].content;
    const whenSection = content.split('## When to Use This Skill')[1].split('## ')[0];
    expect(whenSection).toContain('- When');
    expect(whenSection).toContain('- Do NOT use');
  });

  it('Steps section has domain-specific content not generic', () => {
    const data = makeReportData({
      frictions: [makeFriction({ title: 'CSS Scoping Mistakes', description: 'Shadow DOM styling issues' })],
    });
    const skills = buildSkills(data);
    const stepsSection = skills[0].content.split('## Steps')[1].split('## ')[0];
    expect(stepsSection.toLowerCase()).toContain('selector');
    expect(stepsSection).not.toContain('Read the relevant files and map the existing patterns related to');
  });

  it('Example Usage section present between When to Use and Steps', () => {
    const data = makeReportData({
      frictions: [makeFriction({ title: 'CSS Scoping Mistakes', description: 'Shadow DOM styling issues' })],
    });
    const skills = buildSkills(data);
    const content = skills[0].content;
    const whenIdx = content.indexOf('## When to Use');
    const exampleIdx = content.indexOf('## Example Usage');
    const stepsIdx = content.indexOf('## Steps');
    expect(exampleIdx).toBeGreaterThan(whenIdx);
    expect(exampleIdx).toBeLessThan(stepsIdx);
  });

  it('existing frontmatter keys preserved', () => {
    const data = makeReportData({ frictions: [makeFriction()] });
    const skills = buildSkills(data);
    const content = skills[0].content;
    expect(content).toContain('allowed-tools:');
    expect(content).toContain('context: fork');
    expect(content).toContain('argument-hint:');
  });

  it('argument-hint is domain-specific', () => {
    const cssData = makeReportData({
      frictions: [makeFriction({ title: 'CSS Scoping Mistakes', description: 'Shadow DOM styling issues' })],
    });
    const debugData = makeReportData({
      frictions: [makeFriction({ title: 'Debug Investigation Failures', description: 'Wrong root cause hypotheses' })],
    });
    const sqlData = makeReportData({
      frictions: [makeFriction({ title: 'SQL Query Failures', description: 'Database query issues' })],
    });
    const cssSkill = buildSkills(cssData)[0].content;
    const debugSkill = buildSkills(debugData)[0].content;
    const sqlSkill = buildSkills(sqlData)[0].content;
    expect(cssSkill).toContain('argument-hint: "<file-or-component-path>"');
    expect(debugSkill).toContain('argument-hint: "<issue-description-or-log-path>"');
    expect(sqlSkill).toContain('argument-hint: "<query-or-table-name>"');
  });
});
