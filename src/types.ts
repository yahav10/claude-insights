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

export interface AnalyzerOutput {
  todos: TodoItem[];
  claudeMdAdditions: string;
  settingsJson: Record<string, unknown>;
  skills: SkillFile[];
  readmeContent: string;
  mcpRecommendations: McpRecommendation[];
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
