import { Command } from 'commander';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { parseReport } from './parser.js';
import { analyze } from './analyzer.js';
import { generate } from './generator.js';
import { applyToProject, formatApplySummary } from './applier.js';
import { saveHistoryEntry, getLatestEntry, loadHistoryEntries, loadEntry, toHistoryEntry, buildTrendReport, formatTrendReport, formatHistoryTable } from './history.js';
import { parseFacets, enrichAnalysis } from './facet-parser.js';
import { watchReport } from './watcher.js';
import { aggregateReports, generateTeamOutput } from './team.js';
import type { ReportData } from './types.js';

const program = new Command();

program
  .name('claude-insights')
  .description('Analyze Claude Code /insight reports and generate actionable files')
  .version('1.1.0');

program
  .command('analyze')
  .description('Parse an insight report HTML file and generate output files')
  .argument('<file>', 'Path to the report.html file')
  .option('-o, --output-dir <path>', 'Output directory (skips interactive prompt)')
  .option('--apply', 'Merge output directly into the project (appends to CLAUDE.md, merges settings.json, places skills)')
  .option('--facets [dir]', 'Enrich analysis with facet data from ~/.claude/usage-data/facets/ (or specify a directory)')
  .action(async (file: string, opts: { outputDir?: string; apply?: boolean; facets?: string | boolean }) => {
    try {
      // 1. Parse
      const filePath = resolve(file);
      if (!existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }

      console.log('\nParsing report...');
      const data = parseReport(filePath);

      const messagesStat = data.stats.find(s => s.label.toLowerCase() === 'messages');
      console.log(`\n✓ Parsed report: ${messagesStat?.value ?? '?'} messages, ${data.subtitle}`);
      console.log(`  ${data.frictions.length} friction areas, ${data.wins.length} strengths, ${data.claudeMdItems.length} CLAUDE.md suggestions`);

      if (data.frictions.length === 0 && data.claudeMdItems.length === 0) {
        console.warn('\nWarning: No frictions or CLAUDE.md suggestions found in the report.');
        console.warn('The generated output will be minimal. The report format may have changed.\n');
      }

      // 2. Analyze
      let output = analyze(data);

      // 2b. Enrich with facet data if --facets is set
      if (opts.facets !== undefined) {
        const facetsDir = typeof opts.facets === 'string' ? resolve(opts.facets) : undefined;
        const facetData = parseFacets(facetsDir);
        if (facetData.sessionCount > 0) {
          output = enrichAnalysis(output, facetData);
          console.log(`✓ Enriched with facet data: ${facetData.sessionCount} sessions, ${facetData.toolUsage.length} tools tracked`);
        } else {
          console.log('✓ No facet data found (directory empty or missing)');
        }
      }

      console.log(`✓ Analyzed: ${output.todos.length} tasks, ${output.skills.length} skills generated`);

      if (opts.apply) {
        // --apply mode: merge directly into the project
        const projectDir = opts.outputDir ? resolve(opts.outputDir) : resolve('.');
        console.log(`\nApplying to project: ${projectDir}`);

        const result = applyToProject(output, projectDir);
        console.log(formatApplySummary(result));

        // Save history and show trend
        const historyEntry = toHistoryEntry(data, output, filePath);
        const previousEntry = getLatestEntry();
        saveHistoryEntry(historyEntry);
        const trend = buildTrendReport(historyEntry, previousEntry);
        console.log(formatTrendReport(trend));
      } else {
        // Standard generate mode
        let outputDir: string;
        if (opts.outputDir) {
          outputDir = resolve(opts.outputDir);
        } else {
          outputDir = await promptForOutputDir(data);
        }

        // 4. Generate
        const files = generate(output, outputDir);
        console.log(`\n✓ Generated ${files.length} files in ${outputDir}/:`);
        for (const f of files) {
          const relative = f.replace(outputDir + '/', '');
          console.log(`  - ${relative}`);
        }

        // Save history and show trend
        const historyEntry = toHistoryEntry(data, output, filePath);
        const previousEntry = getLatestEntry();  // Get BEFORE saving
        saveHistoryEntry(historyEntry);           // Then save
        const trend = buildTrendReport(historyEntry, previousEntry);
        console.log(formatTrendReport(trend));

        console.log('Next steps:');
        console.log('  1. Read insights-README.md for placement instructions');
        console.log('  2. Copy CLAUDE.md-additions.md rules into your CLAUDE.md');
        if (Object.keys(output.settingsJson).length > 0) {
          console.log('  3. Merge settings-insights.json into .claude/settings.json');
        }
        if (output.skills.length > 0) {
          const firstSkill = output.skills[0].filename.replace('.SKILL.md', '');
          console.log(`  ${Object.keys(output.settingsJson).length > 0 ? '4' : '3'}. Copy skills to .claude/skills/ and test with /${firstSkill}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  });

async function promptForOutputDir(data: ReportData): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const question = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

  console.log('\nDetected project areas from your report:');
  data.projects.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name} (${p.count})`);
  });

  console.log('\nWhere should I generate the output files?');
  console.log('  [1] Current directory (./insights/)  ← default');
  console.log('  [2] Enter a project path');

  const choice = await question('\n> ');
  let dir: string;

  if (choice.trim() === '2') {
    const customPath = await question('Project path: ');
    dir = resolve(customPath.trim().replace(/^~/, process.env.HOME || '~'));
  } else {
    dir = resolve('./insights');
  }

  rl.close();
  return dir;
}

program
  .command('history')
  .description('List past analysis runs')
  .action(() => {
    const entries = loadHistoryEntries();
    console.log(formatHistoryTable(entries));
  });

program
  .command('diff')
  .description('Compare two analysis runs')
  .argument('<date1>', 'First date (YYYY-MM-DD)')
  .argument('<date2>', 'Second date (YYYY-MM-DD)')
  .action((date1: string, date2: string) => {
    const entry1 = loadEntry(date1);
    const entry2 = loadEntry(date2);
    if (!entry1) { console.error(`No history found for ${date1}`); process.exit(1); }
    if (!entry2) { console.error(`No history found for ${date2}`); process.exit(1); }
    const trend = buildTrendReport(entry2, entry1);
    console.log(formatTrendReport(trend));
  });

program
  .command('watch')
  .description('Watch a report file and re-run the pipeline on changes')
  .argument('<file>', 'Path to the report.html file')
  .requiredOption('-o, --output-dir <path>', 'Output directory for generated files')
  .option('--apply', 'Merge output directly into the project on each change')
  .option('--facets [dir]', 'Enrich analysis with facet data')
  .action((file: string, opts: { outputDir: string; apply?: boolean; facets?: string | boolean }) => {
    const filePath = resolve(file);
    if (!existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    const outputDir = resolve(opts.outputDir);
    const facets = typeof opts.facets === 'string' ? opts.facets : undefined;

    const handle = watchReport(filePath, {
      outputDir,
      apply: opts.apply,
      facets,
    });

    // Keep process alive until Ctrl+C
    process.on('SIGINT', () => {
      console.log('\nStopping watcher...');
      handle.stop();
      process.exit(0);
    });
  });

program
  .command('team')
  .description('Merge multiple insight reports into shared team insights')
  .argument('<files...>', 'Paths to report.html files')
  .requiredOption('-o, --output-dir <path>', 'Output directory for generated files')
  .action((files: string[], opts: { outputDir: string }) => {
    try {
      if (files.length < 2) {
        console.error('Error: At least 2 report files are required for team aggregation.');
        process.exit(1);
      }

      // 1. Validate all files exist
      const filePaths = files.map(f => resolve(f));
      for (const fp of filePaths) {
        if (!existsSync(fp)) {
          console.error(`Error: File not found: ${fp}`);
          process.exit(1);
        }
      }

      // 2. Parse all reports
      console.log(`\nParsing ${filePaths.length} reports...`);
      const reports = filePaths.map((fp, i) => {
        const data = parseReport(fp);
        const messagesStat = data.stats.find(s => s.label.toLowerCase() === 'messages');
        console.log(`  Report ${i + 1}: ${messagesStat?.value ?? '?'} messages, ${data.frictions.length} frictions`);
        return data;
      });

      // 3. Aggregate
      const teamReport = aggregateReports(reports);
      console.log(`\n✓ Aggregated: ${teamReport.memberCount} members, ${teamReport.totalMessages} total messages, ${teamReport.totalSessions} total sessions`);
      console.log(`  ${teamReport.frictions.length} unique frictions, ${teamReport.rules.length} unique rules`);

      // 4. Generate team output
      const output = generateTeamOutput(teamReport);
      console.log(`✓ Analyzed: ${output.todos.length} tasks, ${output.skills.length} skills generated`);

      // 5. Write files
      const outputDir = resolve(opts.outputDir);
      const generatedFiles = generate(output, outputDir);
      console.log(`\n✓ Generated ${generatedFiles.length} files in ${outputDir}/:`);
      for (const f of generatedFiles) {
        const relative = f.replace(outputDir + '/', '');
        console.log(`  - ${relative}`);
      }

      console.log('\nNext steps:');
      console.log('  1. Read insights-README.md for placement instructions');
      console.log('  2. Share CLAUDE.md-additions.md with your team');
      console.log('  3. Copy skills to .claude/skills/ in your shared project');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  });

program.parse();
