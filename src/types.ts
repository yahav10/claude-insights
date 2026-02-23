export interface StatItem {
  value: string;
  label: string;
}

export interface GlanceItem {
  label: string;
  text: string;
}

export interface ProjectArea {
  name: string;
  count: string;
  description: string;
}

export interface BarItem {
  label: string;
  value: number;
  width: number;
}

export interface ChartData {
  title: string;
  bars: BarItem[];
}

export interface Narrative {
  paragraphs: string[];
  keyInsight: string;
}

export interface BigWin {
  title: string;
  description: string;
}

export interface FrictionCategory {
  title: string;
  description: string;
  examples: string[];
}

export interface ClaudeMdItem {
  code: string;
  why: string;
}

export interface FeatureCard {
  title: string;
  oneliner: string;
  why: string;
  examples: string[];
}

export interface PatternCard {
  title: string;
  summary: string;
  detail: string;
  prompt: string;
}

export interface HorizonCard {
  title: string;
  possible: string;
  tip: string;
  prompt: string;
}

export interface FunEnding {
  headline: string;
  detail: string;
}

export interface ReportData {
  title: string;
  subtitle: string;
  stats: StatItem[];
  glance: GlanceItem[];
  projects: ProjectArea[];
  charts: ChartData[];
  narrative: Narrative;
  wins: BigWin[];
  frictions: FrictionCategory[];
  claudeMdItems: ClaudeMdItem[];
  features: FeatureCard[];
  patterns: PatternCard[];
  horizon: HorizonCard[];
  funEnding: FunEnding;
}

export interface TodoItem {
  task: string;
  steps: string;
  priority: 'High' | 'Medium' | 'Low';
  estTime: string;
  expectedWin: string;
  source: 'friction' | 'claude-md' | 'feature' | 'pattern';
}

export interface SkillFile {
  skillName: string;
  dirName: string;
  filename: string;
  content: string;
}

export type HookEvent = 'PreToolUse' | 'PostToolUse' | 'Notification' | 'Stop' | 'SubagentStop';

export type HookHandlerType = 'command' | 'prompt';

export interface HookConfig {
  event: HookEvent;
  handlerType: HookHandlerType;
  command?: string;
  prompt?: string;
  description: string;
}

export interface McpRecommendation {
  serverName: string;
  description: string;
  installCommand: string;
  configBlock: Record<string, unknown>;
  matchedFrictions: string[];
}

export interface FacetToolUsage {
  toolName: string;
  count: number;
}

export interface FacetData {
  toolUsage: FacetToolUsage[];
  averageSessionDurationMs: number;
  sessionCount: number;
}

export interface AnalyzerOutput {
  todos: TodoItem[];
  claudeMdAdditions: string;
  settingsJson: Record<string, unknown>;
  skills: SkillFile[];
  readmeContent: string;
  mcpRecommendations: McpRecommendation[];
  facetSummary?: FacetData;
}

export interface HistoryEntry {
  date: string;
  reportFile: string;
  frictionCount: number;
  frictionTitles: string[];
  skillCount: number;
  todoCount: number;
  claudeMdItemCount: number;
}

export interface TrendReport {
  current: HistoryEntry;
  previous: HistoryEntry | null;
  newFrictions: string[];
  resolvedFrictions: string[];
  frictionCountDelta: number;
  summary: string;
}

export interface ApplyResult {
  claudeMdStatus: 'created' | 'updated' | 'unchanged';
  settingsStatus: 'created' | 'updated' | 'unchanged';
  skillsPlaced: number;
  rulesAdded: number;
  rulesSkipped: number;
}

export interface PipelineOptions {
  outputDir?: string;
  apply?: boolean;
  facets?: boolean;
  skipAnnotationFilter?: boolean;
  annotationsPath?: string;
}

export interface PipelineResult {
  data: ReportData;
  output: AnalyzerOutput;
  files: string[];
}

export interface WatchOptions {
  outputDir: string;
  apply?: boolean;
  facets?: string;
}

export interface WatchHandle {
  stop: () => void;
}

export type AnnotationStatus = 'useful' | 'false-positive';

export interface FrictionAnnotation {
  frictionTitle: string;
  status: AnnotationStatus;
  annotatedAt: string;
  note?: string;
}

export interface AnnotationStore {
  version: 1;
  annotations: FrictionAnnotation[];
}

export interface TeamFriction {
  title: string;
  description: string;
  examples: string[];
  memberCount: number;
  members: string[];
}

export interface TeamRule {
  code: string;
  why: string;
  memberCount: number;
  priority: 'High' | 'Medium' | 'Low';
}

export interface TeamReport {
  memberCount: number;
  totalMessages: number;
  totalSessions: number;
  frictions: TeamFriction[];
  rules: TeamRule[];
  allReports: ReportData[];
}

// ─── Skill Audit Types ───

export type AuditSeverity = 'critical' | 'high' | 'medium';

export interface AuditCheck {
  id: string;
  name: string;
  severity: AuditSeverity;
  passed: boolean;
  message: string;
  suggestion?: string;
  fixable?: boolean;
}

export interface ParsedSkill {
  filePath: string;
  folderName: string;
  frontmatter: Record<string, string>;
  frontmatterRaw: string;
  body: string;
  sections: SkillSection[];
  wordCount: number;
}

export interface SkillSection {
  heading: string;
  content: string;
  level: number;
}

export interface AuditResult {
  skill: ParsedSkill;
  checks: AuditCheck[];
  score: number;
  fixableCount: number;
}

export interface FixResult {
  content: string;
  changes: string[];
}
