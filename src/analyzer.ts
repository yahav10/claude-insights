import type { ReportData, AnalyzerOutput, TodoItem, SkillFile, FrictionCategory, ClaudeMdItem, PatternCard, HookConfig, HookEvent, McpRecommendation } from './types.js';

export type FrictionDomain =
  | 'css-styling' | 'testing' | 'debugging'
  | 'data-sql' | 'imports-dependencies'
  | 'architecture-scope' | 'general';

const DOMAIN_KEYWORDS: [FrictionDomain, string[]][] = [
  ['css-styling', ['css', 'styling', 'scoped', 'shadow dom', 'layout', 'visual', 'selector', 'pseudo']],
  ['testing', ['test', 'mock', 'playwright', 'vitest', 'unit test', 'e2e', 'fixture', 'assertion']],
  ['debugging', ['debug', 'root cause', 'reproduce', 'diagnostic', 'production', 'logging']],
  ['data-sql', ['sql', 'query', 'database', 'table', 'data', 'migration', 'vertica', 'warehouse']],
  ['imports-dependencies', ['import', 'build', 'compile', 'bundle', 'dependency', 'module resolution']],
  ['architecture-scope', ['scope', 'boundary', 'architecture', 'module boundary', 'layer']],
];

/** Check if any keyword matches as a whole word (not as a substring of another word) */
function matchesKeyword(text: string, keyword: string): boolean {
  // Multi-word keywords (e.g. "shadow dom") use plain includes — they're specific enough
  if (keyword.includes(' ')) return text.includes(keyword);
  // Single-word keywords must match at word boundaries
  const re = new RegExp(`\\b${keyword}\\b`);
  return re.test(text);
}

/** Classify a friction into a domain based on title + description keywords.
 *  Title matches are checked first (stronger signal) before falling back to description. */
export function classifyFrictionDomain(friction: FrictionCategory): FrictionDomain {
  const title = friction.title.toLowerCase();
  const desc = friction.description.toLowerCase();

  // Pass 1: title-only — strongest signal
  for (const [domain, keywords] of DOMAIN_KEYWORDS) {
    if (keywords.some(kw => matchesKeyword(title, kw))) {
      return domain;
    }
  }
  // Pass 2: description — weaker signal, only if title didn't match
  for (const [domain, keywords] of DOMAIN_KEYWORDS) {
    if (keywords.some(kw => matchesKeyword(desc, kw))) {
      return domain;
    }
  }
  return 'general';
}

export function analyze(data: ReportData): AnalyzerOutput {
  const skills = buildSkills(data);
  const todos = buildTodos(data, skills);
  const claudeMdAdditions = buildClaudeMdAdditions(data);
  const settingsJson = buildSettings(data);
  const mcpRecommendations = buildMcpRecommendations(data);
  const readmeContent = buildReadme(skills, mcpRecommendations);
  return { todos, claudeMdAdditions, settingsJson, skills, readmeContent, mcpRecommendations };
}

/** Derive a short kebab-case skill name, stripping filler adjectives */
export function toSkillName(title: string): string {
  const fillerWords = new Set([
    'repeated', 'incorrect', 'missing', 'wrong', 'premature', 'frequent', 'common',
    'excessive', 'unnecessary', 'various', 'multiple',
    'and', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'without',
  ]);
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0 && !fillerWords.has(w))
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function buildTodos(data: ReportData, skills: SkillFile[]): TodoItem[] {
  const todos: TodoItem[] = [];

  // Friction-derived tasks (High priority) — one per friction, linked to its generated skill
  for (let i = 0; i < data.frictions.length; i++) {
    const friction = data.frictions[i];
    const skill = skills[i];
    const skillCmd = skill ? `/${toSkillName(friction.title)}` : '';
    todos.push({
      task: `Address friction: "${friction.title}"`,
      steps: skill
        ? `1. Copy relevant rules from CLAUDE.md-additions.md to your CLAUDE.md\n2. Copy ${skill.dirName}/${skill.filename} to .claude/skills/${skill.dirName}/\n3. Test: run ${skillCmd} on your next relevant task`
        : `1. Review the friction description\n2. Add guardrail rules to your CLAUDE.md`,
      priority: 'High',
      estTime: '5 min',
      expectedWin: `Reduces "${friction.title}" friction pattern`,
      source: 'friction',
    });
  }

  // CLAUDE.md item tasks (High priority)
  for (const item of data.claudeMdItems) {
    const shortCode = item.code.length > 80 ? item.code.slice(0, 80) + '...' : item.code;
    todos.push({
      task: `Add CLAUDE.md rule: "${shortCode}"`,
      steps: '1. Open your project CLAUDE.md\n2. Paste the rule under the appropriate section\n3. Save',
      priority: 'High',
      estTime: '2 min',
      expectedWin: 'Prevents repeated friction pattern',
      source: 'claude-md',
    });
  }

  // Feature tasks (Medium priority)
  for (const feature of data.features) {
    todos.push({
      task: `Set up ${feature.title}`,
      steps: feature.examples.length > 0
        ? `1. Review the example in the generated files\n2. Copy configuration to your project\n3. Test it works`
        : `1. Read the feature description\n2. Configure in your project\n3. Test`,
      priority: 'Medium',
      estTime: '10 min',
      expectedWin: feature.oneliner,
      source: 'feature',
    });
  }

  // Pattern tasks (Medium/Low priority)
  for (const pattern of data.patterns) {
    todos.push({
      task: `Try workflow: ${pattern.title}`,
      steps: '1. Copy the suggested prompt from insights-README.md\n2. Paste it at the start of your next relevant session\n3. Evaluate if it reduces friction',
      priority: 'Medium',
      estTime: '5 min',
      expectedWin: pattern.summary,
      source: 'pattern',
    });
  }

  return todos;
}

export function buildClaudeMdAdditions(data: ReportData): string {
  // Categorize CLAUDE.md items by detecting keywords in their code
  const sections: Record<string, { code: string; why: string }[]> = {
    'General Rules': [],
    'CSS & Styling': [],
    'Testing': [],
    'Debugging': [],
  };

  for (const item of data.claudeMdItems) {
    const lower = item.code.toLowerCase();
    if (lower.includes('css') || lower.includes('shadow dom') || lower.includes('styling') || lower.includes('scoped')) {
      sections['CSS & Styling'].push(item);
    } else if (lower.includes('test') || lower.includes('playwright') || lower.includes('vitest') || lower.includes('mock')) {
      sections['Testing'].push(item);
    } else if (lower.includes('debug') || lower.includes('root cause') || lower.includes('reproduce') || lower.includes('diagnostic')) {
      sections['Debugging'].push(item);
    } else {
      sections['General Rules'].push(item);
    }
  }

  let md = '# CLAUDE.md Additions\n\n';
  md += '> Generated by claude-insights. Copy the relevant sections into your project\'s CLAUDE.md.\n\n';

  for (const [section, items] of Object.entries(sections)) {
    if (items.length === 0) continue;
    md += `## ${section}\n\n`;
    for (const item of items) {
      md += `${item.code}\n\n`;
      if (item.why) {
        md += `> _Why: ${item.why}_\n\n`;
      }
    }
  }

  return md;
}

interface FrictionHookMapping {
  keywords: string[];
  hooks: Omit<HookConfig, 'description'>[];
}

const FRICTION_HOOK_MAPPINGS: FrictionHookMapping[] = [
  {
    keywords: ['css', 'styling', 'scoped', 'shadow dom', 'layout', 'visual'],
    hooks: [{
      event: 'PreToolUse',
      handlerType: 'prompt',
      prompt: 'Before editing CSS or style files: 1) List all existing selectors in the target file, 2) Identify which components could be affected, 3) Note any Shadow DOM or scoping boundaries',
    }],
  },
  {
    keywords: ['test', 'mock', 'playwright', 'vitest', 'unit test', 'e2e'],
    hooks: [{
      event: 'PostToolUse',
      handlerType: 'command',
      command: 'npm test 2>&1 | tail -20',
    }],
  },
  {
    keywords: ['debug', 'root cause', 'reproduce', 'diagnostic', 'production'],
    hooks: [{
      event: 'Stop',
      handlerType: 'prompt',
      prompt: 'Before completing: verify the root cause was confirmed with evidence, not just hypothesized. Check that diagnostic steps were followed.',
    }],
  },
  {
    keywords: ['import', 'build', 'compile', 'bundle', 'dependency'],
    hooks: [{
      event: 'PreToolUse',
      handlerType: 'prompt',
      prompt: 'Before modifying imports or build configuration: verify the change against existing import conventions in sibling files.',
    }],
  },
  {
    keywords: ['scope', 'boundary', 'frontend', 'backend'],
    hooks: [{
      event: 'PreToolUse',
      handlerType: 'prompt',
      prompt: 'Before making changes: confirm the scope boundaries. Do not modify files outside the stated scope without explicit permission.',
    }],
  },
];

const DEFAULT_HOOK: Omit<HookConfig, 'description'> = {
  event: 'PreToolUse',
  handlerType: 'prompt',
  prompt: 'Before proposing changes: verify your approach against existing codebase patterns. Read similar implementations first.',
};

export function mapFrictionToHooks(friction: FrictionCategory): HookConfig[] {
  const titleLower = friction.title.toLowerCase();
  const descLower = friction.description.toLowerCase();
  const combined = `${titleLower} ${descLower}`;

  const matchedHooks: HookConfig[] = [];

  for (const mapping of FRICTION_HOOK_MAPPINGS) {
    if (mapping.keywords.some(kw => combined.includes(kw))) {
      for (const hook of mapping.hooks) {
        matchedHooks.push({
          ...hook,
          description: `Addresses friction: "${friction.title}"`,
        });
      }
    }
  }

  // Fallback: if no specific mapping matched, use the default
  if (matchedHooks.length === 0) {
    matchedHooks.push({
      ...DEFAULT_HOOK,
      description: `Addresses friction: "${friction.title}"`,
    });
  }

  return matchedHooks;
}

export function buildSettings(data: ReportData): Record<string, unknown> {
  // 1. Generate hooks from friction categories
  const allHooks: HookConfig[] = [];
  for (const friction of data.frictions) {
    allHooks.push(...mapFrictionToHooks(friction));
  }

  // 2. Try to extract hooks from feature card JSON (existing logic)
  let featureHooksObj: Record<string, unknown[]> = {};
  const hooksFeature = data.features.find(f => f.title.toLowerCase().includes('hook'));
  if (hooksFeature && hooksFeature.examples.length > 0) {
    const example = hooksFeature.examples[0];
    const jsonMatch = example.match(/\{[\s\S]*"hooks"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const cleaned = jsonMatch[0].replace(/\/\/.*$/gm, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.hooks && typeof parsed.hooks === 'object') {
          featureHooksObj = parsed.hooks as Record<string, unknown[]>;
        }
      } catch {
        // Invalid JSON — skip feature hooks
      }
    }
  }

  // 3. If no friction hooks and no feature hooks, return empty
  if (allHooks.length === 0 && Object.keys(featureHooksObj).length === 0) {
    return {};
  }

  // 4. Build the hooks object from friction-derived hooks, deduplicating by event+content
  const hooksMap: Record<string, Array<Record<string, string>>> = {};
  const seen = new Set<string>();

  for (const hook of allHooks) {
    const contentKey = hook.command ?? hook.prompt ?? '';
    const dedupKey = `${hook.event}:${contentKey}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const eventKey: HookEvent = hook.event;
    if (!hooksMap[eventKey]) {
      hooksMap[eventKey] = [];
    }

    const entry: Record<string, string> = {
      type: hook.handlerType,
      description: hook.description,
    };
    if (hook.command) entry.command = hook.command;
    if (hook.prompt) entry.prompt = hook.prompt;

    hooksMap[eventKey].push(entry);
  }

  // 5. Merge feature card hooks (they take precedence / are additive)
  for (const [eventKey, entries] of Object.entries(featureHooksObj)) {
    if (!hooksMap[eventKey]) {
      hooksMap[eventKey] = [];
    }
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        const entryObj = entry as Record<string, string>;
        const contentKey = entryObj.command ?? entryObj.prompt ?? '';
        const dedupKey = `${eventKey}:${contentKey}`;
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          hooksMap[eventKey].push(entryObj);
        }
      }
    }
  }

  return { hooks: hooksMap };
}

export function buildSkills(data: ReportData): SkillFile[] {
  const skills: SkillFile[] = [];

  for (const friction of data.frictions) {
    const skillName = toSkillName(friction.title);
    const dirName = skillName;
    const filename = 'SKILL.md';

    const matchingPattern = findBestMatch(friction.title, data.patterns.map(p => ({ text: p.title, item: p })));
    const matchingRule = findBestMatch(friction.title, data.claudeMdItems.map(c => ({ text: c.code, item: c })));

    const description = buildTriggerDescription(friction);
    const steps = buildSkillSteps(friction, matchingPattern);
    const rules = buildSkillRules(matchingRule, friction);
    const whenToUse = buildWhenToUse(friction);
    const positiveExamples = buildPositiveExamples(friction);
    const examples = buildSkillExamples(friction.examples);
    const checklist = buildVerificationChecklist(friction);
    const argHint = buildArgumentHint(friction);

    // Format description: use YAML block scalar for multi-line, inline for single-line
    const descYaml = description.includes('\n')
      ? `|\n  ${description.replace(/\n/g, '\n  ')}`
      : description;

    skills.push({
      skillName,
      dirName,
      filename,
      content: `---
name: ${skillName}
description: ${descYaml}
allowed-tools: ["Read", "Glob", "Grep", "Bash"]
context: fork
argument-hint: "${argHint}"
---

## When to Use This Skill

${whenToUse}

${positiveExamples}

## Steps

${steps}

## Rules

${rules}

${examples}## Verification Checklist

${checklist}

## Why This Skill Exists

${friction.description}
`,
    });
  }

  return skills;
}

/** Condense a friction description into a short action-verb opener */
function buildDescriptionOpener(friction: FrictionCategory): string {
  const domain = classifyFrictionDomain(friction);
  const verb = domain === 'debugging' ? 'Guards against'
    : domain === 'testing' ? 'Catches'
    : 'Prevents';

  // Use friction title as the primary topic — it's more concise than the description
  const titlePhrase = friction.title.toLowerCase();

  // Try to extract a short qualifier from the description (first ~80 chars of first sentence)
  const desc = friction.description.trim();
  const firstSentence = desc.split(/\.\s/)[0].replace(/\.$/, '');
  // Only use description as qualifier if it's short and doesn't start with narrative filler
  const isNarrative = /^(a |the |your |claude |this |during )/i.test(firstSentence);
  if (!isNarrative && firstSentence.length <= 100) {
    const body = firstSentence.charAt(0).toLowerCase() + firstSentence.slice(1);
    return `${verb} ${body}`;
  }

  // Fallback: use the title directly
  return `${verb} ${titlePhrase}`;
}

/** Build a three-part description: [What it does] + [When to use it] + [Do NOT use for] */
export function buildTriggerDescription(friction: FrictionCategory): string {
  // Part 1: What it does
  const opener = buildDescriptionOpener(friction);

  // Part 2: When to use it
  let trigger = `Use when encountering ${friction.title.toLowerCase()}`;
  const scenarios = friction.examples
    .map(extractScenarioPhrase)
    .filter((s): s is string => s !== null)
    .slice(0, 3);

  if (scenarios.length > 0) {
    trigger += `, especially ${scenarios.join(', ')}`;
  } else {
    const titleWords = significantWords(friction.title);
    const triggerWords = extractTriggerTerms(friction)
      .filter(w => !titleWords.includes(w));
    const uniqueTerms = [...new Set(triggerWords)].slice(0, 5);
    if (uniqueTerms.length > 0) {
      trigger += `, involving ${uniqueTerms.join(', ')}`;
    }
  }
  trigger += '.';

  // Part 3: Negative triggers
  const negatives = buildNegativeTriggers(friction);
  const negLine = `Do NOT use for ${negatives[0]}.`;

  const desc = `${opener}.\n${trigger}\n${negLine}`;
  // Enforce 1024 char limit from the guide
  return desc.length > 1024 ? desc.slice(0, 1021) + '...' : desc;
}

const NEGATIVE_TRIGGER_MAP: Record<FrictionDomain, string[]> = {
  'css-styling': ['simple color, font, or spacing tweaks with no scoping concerns'],
  'testing': ['writing new feature code or non-test implementation'],
  'debugging': ['known issues with obvious fixes that need no investigation'],
  'data-sql': ['simple read-only queries or basic data lookups'],
  'imports-dependencies': ['adding a single well-known dependency to one file'],
  'architecture-scope': ['changes isolated to a single file with no cross-module impact'],
  'general': ['tasks unrelated to the specific friction pattern described above'],
};

/** Generate negative trigger phrases to prevent skill over-triggering */
export function buildNegativeTriggers(friction: FrictionCategory): string[] {
  const domain = classifyFrictionDomain(friction);
  return NEGATIVE_TRIGGER_MAP[domain];
}

/** Extract a short scenario phrase from a friction example */
export function extractScenarioPhrase(example: string): string | null {
  // Match "When [doing X], Claude..." or "When [doing X], the..."
  const whenMatch = example.match(/^When\s+(.{10,100}?)(?:,\s+Claude|,\s+the\s|,\s+CSS|,\s+pseudo)/i);
  if (whenMatch) return whenMatch[1].trim().toLowerCase();

  // Match up to the first comma NOT inside parentheses
  // (?:[^,(]|\([^)]*\)) matches a non-comma/non-paren char OR a complete (...) group
  const commaMatch = example.match(/^((?:[^,(]|\([^)]*\)){10,100}?)(?:,)/);
  if (commaMatch) return commaMatch[1].trim().toLowerCase();

  return null;
}

/** Extract technical/domain-specific trigger terms, filtering generic verbs */
export function extractTriggerTerms(friction: FrictionCategory): string[] {
  const genericVerbs = new Set([
    'when', 'why', 'how', 'what', 'where', 'which',
    'fixing', 'fixed', 'fix', 'implementing', 'implemented', 'implement',
    'using', 'used', 'use', 'making', 'made', 'make',
    'working', 'worked', 'work', 'adding', 'added', 'add',
    'getting', 'got', 'get', 'trying', 'tried', 'try',
    'running', 'ran', 'run', 'setting', 'set', 'first',
    'still', 'then', 'just', 'only', 'also', 'many',
    'multiple', 'several', 'various', 'caused', 'causing',
    'required', 'requiring', 'needed', 'left', 'spent',
    'claude', 'claudes', 'session', 'sessions', 'approach',
    'issue', 'issues', 'problem', 'problems', 'initially',
  ]);
  const allText = [...friction.examples, friction.description].join(' ');
  return allText
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !genericVerbs.has(w) && !stopWordsSet.has(w));
}

const stopWordsSet = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'not', 'no', 'without', 'before', 'after', 'about', 'that', 'this', 'it']);

export type SkillPattern = 'sequential-workflow' | 'iterative-refinement' | 'domain-specific-intelligence';

const DOMAIN_PATTERN_MAP: Record<FrictionDomain, SkillPattern> = {
  'css-styling': 'iterative-refinement',
  'testing': 'sequential-workflow',
  'debugging': 'domain-specific-intelligence',
  'data-sql': 'sequential-workflow',
  'imports-dependencies': 'sequential-workflow',
  'architecture-scope': 'domain-specific-intelligence',
  'general': 'sequential-workflow',
};

/** Map a friction domain to the appropriate skill pattern from the guide */
export function mapDomainToPattern(domain: FrictionDomain): SkillPattern {
  return DOMAIN_PATTERN_MAP[domain];
}

const DOMAIN_STEPS: Record<FrictionDomain, string[]> = {
  'css-styling': [
    '**Audit selectors**: Read the target file and list all CSS selectors, noting scoping boundaries (Shadow DOM, `:host`, scoped attributes).',
    '**Map affected components**: Identify which sibling and parent components share styles or could be affected by selector changes.',
    '**Apply scoped fix**: Make the narrowest possible CSS change. Prefer scoped selectors over global ones.',
    '**Visual check**: Verify the fix renders correctly and no other components changed visually. Check against "What Goes Wrong" examples below.',
    '**Refine if needed**: If the fix has side effects, narrow the selector further or add specificity constraints. Re-verify.',
  ],
  'testing': [
    '**Read sibling tests**: Find and read existing test files in the same directory to match setup, teardown, and mock patterns.',
    '**Run baseline**: Execute the current test suite to establish a passing baseline before making changes.',
    '**Implement**: Write or modify tests following the patterns found in step 1. Match existing naming, structure, and assertion style.',
    '**Run and verify**: Execute tests and confirm all pass, including the new or modified ones.',
    '**Check coverage**: Verify the change covers the intended behavior and no tests were accidentally broken.',
  ],
  'debugging': [
    '**Reproduce first**: Attempt to reproduce the issue locally with minimal setup before forming any hypothesis.',
    '**Gather evidence**: Add targeted diagnostic logging or breakpoints to narrow down the root cause. Do not guess.',
    '**Confirm root cause**: Document the confirmed root cause with evidence (logs, stack traces, test output). Do NOT hypothesize without proof.',
    '**Apply targeted fix**: Fix only the confirmed root cause with the minimal change required.',
    '**Verify fix and regression**: Confirm the fix resolves the issue AND run related tests to ensure no regressions.',
  ],
  'data-sql': [
    '**Inspect schema**: Read the relevant table schemas and understand column types, relationships, and constraints.',
    '**Validate query logic**: Review the SQL query for correctness — check joins, filters, group-by clauses, and aggregation logic.',
    '**Test with sample data**: Run the query against a small dataset or use EXPLAIN to verify the execution plan.',
    '**Implement fix**: Apply the corrected query with proper validation guards.',
    '**Verify results**: Confirm the query returns expected results and does not introduce performance regressions.',
  ],
  'imports-dependencies': [
    '**Check sibling conventions**: Read import statements in 3-5 sibling files to identify the project\'s import conventions.',
    '**Verify module resolution**: Confirm the target module exists and its export signatures match the intended usage.',
    '**Apply import change**: Modify imports following the conventions found in step 1.',
    '**Build check**: Run the build process to verify no compilation or bundling errors.',
    '**Verify runtime**: Confirm the imported functionality works correctly at runtime.',
  ],
  'architecture-scope': [
    '**Map boundaries**: Identify the module boundaries, ownership, and dependency direction relevant to the change.',
    '**Check scope constraints**: List explicitly what is in-scope and what must NOT change. Get confirmation before proceeding.',
    '**Assess cross-cutting impact**: Determine if the change affects other modules, APIs, or contracts.',
    '**Implement within bounds**: Apply the change strictly within the defined scope boundaries.',
    '**Verify boundaries held**: Confirm no out-of-scope files were modified and no contracts were broken.',
  ],
  'general': [
    '**Diagnose**: Read the relevant files and map existing patterns. Identify boundaries, ownership, and current behavior before changing anything.',
    '**Identify constraints**: List what must NOT change and which components are affected. Get confirmation before proceeding.',
    '**Propose approach**: Describe your planned fix and explain why it avoids the known failure patterns listed in "What Goes Wrong" below.',
    '**Implement**: Apply the most minimal, narrowly-scoped change possible.',
    '**Verify**: Confirm the fix works AND doesn\'t regress related components. Check against each example in "What Goes Wrong". Run relevant tests.',
  ],
};

/** Build domain-specific steps based on friction classification and skill pattern */
export function buildSkillSteps(friction: FrictionCategory, pattern: PatternCard | undefined): string {
  const domain = classifyFrictionDomain(friction);
  const steps = DOMAIN_STEPS[domain];

  let output = steps.map((s, i) => `${i + 1}. ${s}`).join('\n');

  if (pattern) {
    output += `\n\n### Suggested Starting Prompt\n\n> ${pattern.prompt}`;
  }

  return output;
}

interface PositiveExampleTemplate {
  request: string;
  steps: string[];
  result: string;
}

const POSITIVE_EXAMPLE_TEMPLATES: Record<FrictionDomain, PositiveExampleTemplate> = {
  'css-styling': {
    request: 'Fix the component styles — the dropdown is not visible',
    steps: [
      'Read the component file and list all CSS selectors and scoping boundaries',
      'Identify which sibling components share styles that could be affected',
      'Apply a scoped selector fix targeting only the dropdown',
      'Verify the dropdown renders correctly and no other components changed',
    ],
    result: 'Dropdown is visible with scoped fix, no sibling components affected',
  },
  'testing': {
    request: 'Fix the failing test suite for the authentication module',
    steps: [
      'Read sibling test files to understand existing mock and setup patterns',
      'Run the current test suite to identify which tests fail and why',
      'Update the test setup to match the patterns found in sibling files',
      'Run all tests and confirm they pass including the fixed ones',
    ],
    result: 'All tests pass with consistent mock patterns, no regressions in related suites',
  },
  'debugging': {
    request: 'The form submission silently fails in production — investigate',
    steps: [
      'Reproduce the issue locally with minimal setup',
      'Add diagnostic logging to the form handler to narrow the root cause',
      'Confirm the root cause with evidence from logs before proposing a fix',
      'Apply a targeted fix addressing only the confirmed root cause',
    ],
    result: 'Root cause identified and fixed with evidence, form submission works correctly',
  },
  'data-sql': {
    request: 'The report query returns incorrect totals for grouped data',
    steps: [
      'Inspect the relevant table schemas and column types',
      'Review the SQL query for join, filter, and aggregation correctness',
      'Test the corrected query against sample data to validate results',
      'Apply the fix with proper validation guards',
    ],
    result: 'Query returns correct totals, execution plan verified for performance',
  },
  'imports-dependencies': {
    request: 'The build fails after adding a new component import',
    steps: [
      'Check import conventions in 3-5 sibling files in the same directory',
      'Verify the target module exists and its export signatures match',
      'Fix the import to follow the project conventions found in step 1',
      'Run the build to confirm no compilation errors',
    ],
    result: 'Build passes with correct import, following project conventions',
  },
  'architecture-scope': {
    request: 'Refactor the payment module without affecting the checkout flow',
    steps: [
      'Map the module boundaries and identify which APIs are consumed by checkout',
      'List explicitly what is in-scope and what must not change',
      'Apply changes strictly within the payment module boundaries',
      'Verify no out-of-scope files were modified and the checkout contract is intact',
    ],
    result: 'Payment module refactored, checkout flow unchanged, all contracts preserved',
  },
  'general': {
    request: 'Fix the issue following the existing codebase patterns',
    steps: [
      'Read the relevant files and map existing patterns before making changes',
      'Identify constraints — what must not change and which components are affected',
      'Apply the most minimal, narrowly-scoped change possible',
      'Verify the fix works and does not regress related components',
    ],
    result: 'Issue resolved with minimal change, existing patterns preserved',
  },
};

/** Strip leading gerund verbs to avoid "Fix the issue with fixing..." redundancy */
function stripLeadingGerund(phrase: string): string {
  return phrase.replace(/^(fixing|debugging|implementing|configuring|diagnosing|adding|removing|updating|setting up|working on)\s+/i, '');
}

/** Build a positive workflow example showing how the skill is used successfully */
export function buildPositiveExamples(friction: FrictionCategory): string {
  const domain = classifyFrictionDomain(friction);
  const template = POSITIVE_EXAMPLE_TEMPLATES[domain];

  // Try to make the request more specific using friction examples
  const scenario = extractScenarioPhrase(friction.examples[0] ?? '');
  let request: string;
  if (scenario) {
    // Strip leading gerund to avoid "Fix the issue with fixing..." redundancy
    const cleaned = stripLeadingGerund(scenario);
    // Pick appropriate prefix based on what remains after stripping
    if (/^why\b/i.test(cleaned)) {
      request = `Investigate ${cleaned}`;
    } else {
      request = `Fix the ${cleaned}`;
    }
  } else {
    request = template.request;
  }

  let md = '## Example Usage\n\n';
  md += `> **Request**: "${request}"\n>\n`;
  md += '> **Steps taken**:\n';
  for (let i = 0; i < template.steps.length; i++) {
    md += `> ${i + 1}. ${template.steps[i]}\n`;
  }
  md += '>\n';
  md += `> **Result**: ${template.result}`;

  return md;
}

/** Parse a CLAUDE.md rule into bullet points, with fallback rules from friction context */
export function buildSkillRules(rule: ClaudeMdItem | undefined, friction: FrictionCategory): string {
  const bullets: string[] = [];

  if (rule) {
    bullets.push(...parseRuleIntoBullets(rule.code));
  }

  // Add fallback domain-specific rules when no CLAUDE.md rule matched
  if (bullets.length === 0) {
    const domainWords = significantWords(friction.title).slice(0, 3);
    const domainHint = domainWords.length > 0 ? domainWords.join(', ') : 'existing';
    bullets.push(`Always inspect and reference existing ${domainHint} patterns before proposing a solution`);
    bullets.push('Do NOT apply broad or global changes — use the narrowest possible scope');
  }

  // Only append universal guardrails if not already covered by parsed rules
  const existingText = bullets.join(' ').toLowerCase();
  if (!existingText.includes('regress') && !existingText.includes('don\'t break') && !existingText.includes('doesn\'t affect')) {
    bullets.push('After implementing, verify the fix doesn\'t regress related components or sibling functionality');
  }
  if (!existingText.includes('confirm') && !existingText.includes('approval') && !existingText.includes('before applying')) {
    bullets.push('Before applying changes, list affected components and get confirmation');
  }

  return bullets.map(b => `- ${b}`).join('\n');
}

/** Split a rule string into individual bullet-point items */
export function parseRuleIntoBullets(code: string): string[] {
  // Try numbered items: "1) item, 2) item" or "1. item"
  const numberedItems = code.match(/\d+[).]\s*[^,;)]+/g);
  if (numberedItems && numberedItems.length >= 2) {
    return numberedItems.map(item =>
      item.replace(/^\d+[).]\s*/, '').replace(/,\s*$/, '').trim()
    ).filter(s => s.length > 5);
  }

  // Try splitting by sentences
  const sentences = code.split(/\.\s+/).filter(s => s.trim().length > 10);
  if (sentences.length >= 2) {
    return sentences.map(s => s.trim().replace(/\.$/, ''));
  }

  // Single rule as-is
  return [code.trim()];
}

/** Format friction examples with bolded technical terms */
export function buildSkillExamples(examples: string[]): string {
  if (examples.length === 0) return '';

  let md = '## What Goes Wrong\n\n';
  md += 'Review these failure patterns before implementing. Your fix must not repeat them:\n\n';
  for (const example of examples) {
    md += `- ${boldTechTerms(example)}\n`;
  }
  md += '\n';
  return md;
}

const DOMAIN_ARGUMENT_HINTS: Record<FrictionDomain, string> = {
  'css-styling': '<file-or-component-path>',
  'testing': '<test-file-or-module-path>',
  'debugging': '<issue-description-or-log-path>',
  'data-sql': '<query-or-table-name>',
  'imports-dependencies': '<module-or-package-path>',
  'architecture-scope': '<module-or-boundary-path>',
  'general': '<file-or-component-path>',
};

/** Return a domain-specific argument hint for the skill frontmatter */
function buildArgumentHint(friction: FrictionCategory): string {
  const domain = classifyFrictionDomain(friction);
  return DOMAIN_ARGUMENT_HINTS[domain];
}

/** Bold key technical terms in example text for scanability */
export function boldTechTerms(text: string): string {
  return text
    // Bold CSS pseudo-selectors like :has(), ::before
    .replace(/(::?[a-z-]+\([^)]*\))/g, '**$1**')
    // Bold dimensions like 0×0
    .replace(/\b(\d+[×x]\d+)\b/g, '**$1**')
    // Bold multi-word uppercase sequences as phrases (e.g., "LEFT JOIN", "INNER JOIN", "Shadow DOM")
    .replace(/(?<=[\s,(])([A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)+)(?=[\s,.):])/g, '**$1**')
    // Bold remaining standalone acronyms (2+ uppercase) not already inside **
    .replace(/(?<!\*\*)(?<=[\s,(])([A-Z]{2,})(?=[\s,.):])/g, '**$1**');
}

/** Build a verification checklist from friction examples */
export function buildVerificationChecklist(friction: FrictionCategory): string {
  const checks: string[] = [];

  checks.push('- [ ] Fix addresses the specific issue the user reported');
  checks.push('- [ ] Change follows existing codebase patterns found during diagnosis');
  checks.push('- [ ] Change is narrowly scoped — minimal blast radius');
  checks.push('- [ ] Related/sibling components verified — no regressions');

  for (const example of friction.examples.slice(0, 3)) {
    const short = example.length > 100
      ? example.slice(0, 100).replace(/\s+\S*$/, '') + '...'
      : example;
    checks.push(`- [ ] Verified against: "${short}"`);
  }

  checks.push('- [ ] Approach was proposed and confirmed before implementation');

  return checks.join('\n');
}

/** Auto-generate "When to Use" triggers from friction title + examples */
export function buildWhenToUse(friction: FrictionCategory): string {
  const triggers: string[] = [];

  // Primary trigger from title
  triggers.push(`When a task involves ${friction.title.toLowerCase()}.`);

  // Scenario-based triggers from examples
  for (const example of friction.examples.slice(0, 3)) {
    const phrase = extractScenarioPhrase(example);
    if (phrase) {
      triggers.push(`When ${phrase}.`);
    }
  }

  // Fallback: description-based trigger
  if (triggers.length === 1) {
    const descWords = significantWords(friction.description).slice(0, 4);
    if (descWords.length > 0) {
      triggers.push(`When previous attempts involved ${descWords.join(', ')} issues.`);
    }
  }

  // Negative triggers to prevent over-triggering
  const negatives = buildNegativeTriggers(friction);
  for (const neg of negatives) {
    triggers.push(`Do NOT use for ${neg}.`);
  }

  return triggers.map(t => `- ${t}`).join('\n');
}

/** Find the best matching item by checking for shared significant words */
export function findBestMatch<T>(title: string, candidates: { text: string; item: T }[]): T | undefined {
  const titleWords = significantWords(title);
  let bestMatch: T | undefined;
  let bestScore = 0;

  for (const candidate of candidates) {
    const candidateWords = significantWords(candidate.text);
    const overlap = titleWords.filter(w => candidateWords.includes(w)).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatch = candidate.item;
    }
  }

  return bestScore >= 1 ? bestMatch : undefined;
}

/** Extract significant words (skip common stop words) */
export function significantWords(text: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'not', 'no', 'without', 'before', 'after', 'about', 'that', 'this', 'it']);
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
}

interface McpServerEntry {
  serverName: string;
  keywords: string[];
  description: string;
  installCommand: string;
  configBlock: Record<string, unknown>;
}

const MCP_SERVER_REGISTRY: McpServerEntry[] = [
  {
    serverName: 'playwright',
    keywords: ['css', 'styling', 'visual', 'layout', 'screenshot', 'browser', 'dom'],
    description: 'Visual testing, screenshot verification, and browser automation',
    installCommand: 'npx @anthropic-ai/mcp-server-playwright',
    configBlock: {
      command: 'npx',
      args: ['@anthropic-ai/mcp-server-playwright'],
    },
  },
  {
    serverName: 'postgres',
    keywords: ['database', 'sql', 'query', 'table', 'migration', 'schema'],
    description: 'Direct database access for query validation and schema inspection',
    installCommand: 'npx @anthropic-ai/mcp-server-postgres',
    configBlock: {
      command: 'npx',
      args: ['@anthropic-ai/mcp-server-postgres', 'postgresql://localhost/mydb'],
    },
  },
  {
    serverName: 'fetch',
    keywords: ['api', 'http', 'endpoint', 'request', 'response', 'rest'],
    description: 'HTTP request testing and API response verification',
    installCommand: 'npx @anthropic-ai/mcp-server-fetch',
    configBlock: {
      command: 'npx',
      args: ['@anthropic-ai/mcp-server-fetch'],
    },
  },
  {
    serverName: 'filesystem',
    keywords: ['file', 'directory', 'path', 'search', 'find'],
    description: 'Enhanced file search and manipulation beyond built-in tools',
    installCommand: 'npx @anthropic-ai/mcp-server-filesystem',
    configBlock: {
      command: 'npx',
      args: ['@anthropic-ai/mcp-server-filesystem', '/path/to/project'],
    },
  },
  {
    serverName: 'git',
    keywords: ['git', 'branch', 'merge', 'commit', 'version', 'rebase'],
    description: 'Advanced git operations and repository management',
    installCommand: 'npx @anthropic-ai/mcp-server-git',
    configBlock: {
      command: 'npx',
      args: ['@anthropic-ai/mcp-server-git'],
    },
  },
];

export function buildMcpRecommendations(data: ReportData): McpRecommendation[] {
  const recommendations = new Map<string, McpRecommendation>();

  for (const friction of data.frictions) {
    const combined = `${friction.title} ${friction.description}`.toLowerCase();

    for (const entry of MCP_SERVER_REGISTRY) {
      if (entry.keywords.some(kw => combined.includes(kw))) {
        const existing = recommendations.get(entry.serverName);
        if (existing) {
          if (!existing.matchedFrictions.includes(friction.title)) {
            existing.matchedFrictions.push(friction.title);
          }
        } else {
          recommendations.set(entry.serverName, {
            serverName: entry.serverName,
            description: entry.description,
            installCommand: entry.installCommand,
            configBlock: entry.configBlock,
            matchedFrictions: [friction.title],
          });
        }
      }
    }
  }

  return Array.from(recommendations.values());
}

function buildMcpSection(mcpRecommendations: McpRecommendation[]): string {
  if (mcpRecommendations.length === 0) return '';

  let section = '\n## Recommended MCP Servers\n\n';
  section += 'Based on your friction patterns, these MCP servers could help:\n\n';

  for (const rec of mcpRecommendations) {
    section += `### ${rec.serverName}\n\n`;
    section += `${rec.description}\n\n`;
    section += `**Install**: \`${rec.installCommand}\`\n\n`;
    section += `**Matched frictions**: ${rec.matchedFrictions.join(', ')}\n\n`;
    section += '**Config block** (add to `.claude/settings.json` under `mcpServers`):\n\n';
    section += '```json\n';
    section += `"${rec.serverName}": ${JSON.stringify(rec.configBlock, null, 2)}\n`;
    section += '```\n\n';
  }

  return section;
}

export function buildReadme(skills: SkillFile[], mcpRecommendations: McpRecommendation[] = []): string {
  const skillRows = skills.map(s => {
    return `| \`.claude/skills/${s.dirName}/SKILL.md\` | \`/${s.skillName}\` skill | Copy to your project's \`.claude/skills/\` |`;
  }).join('\n');

  const skillTests = skills.map(s => {
    // Extract first line of description from frontmatter (handles both inline and multi-line |)
    const lines = s.content.split('\n');
    const descIdx = lines.findIndex(l => l.startsWith('description:'));
    let desc = s.skillName;
    if (descIdx !== -1) {
      const descLine = lines[descIdx];
      if (descLine.includes('|')) {
        // Multi-line YAML: first content line is next non-empty indented line
        desc = (lines[descIdx + 1] || '').trim();
      } else {
        desc = descLine.replace('description:', '').trim();
      }
    }
    return `- \`/${s.skillName}\` — ${desc}`;
  }).join('\n');

  const firstSkillName = skills.length > 0 ? skills[0].skillName : 'insights-review';

  return `# Insights Output — Placement Guide

## Generated Files

| File | What It Is | Where To Put It |
|------|-----------|-----------------|
| \`CLAUDE.md-additions.md\` | Rules for Claude based on your friction patterns | Copy contents into your project's root \`CLAUDE.md\` |
| \`insights-todo.md\` | Prioritized task list with steps | Keep as reference, work through tasks |
| \`.claude/settings-insights.json\` | Hook configurations | Merge into your \`.claude/settings.json\` |
${skillRows}

## Quick Start

1. **CLAUDE.md**: Open \`CLAUDE.md-additions.md\`, copy the rules you want into your project's \`CLAUDE.md\`
2. **Settings**: Open \`.claude/settings-insights.json\`, merge the hooks config into your existing \`.claude/settings.json\`
3. **Skills**: Copy the \`.claude/skills/\` directories into your project's \`.claude/skills/\` directory
4. **Test**: Start a new Claude Code session and try \`/${firstSkillName}\` on your next task

## Testing Skills

${skillTests}
${buildMcpSection(mcpRecommendations)}`;
}
