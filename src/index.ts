import { Command } from 'commander';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { parseReport } from './parser.js';
import { analyze } from './analyzer.js';
import { generate } from './generator.js';
import type { ReportData } from './types.js';

const program = new Command();

program
  .name('claude-insights')
  .description('Analyze Claude Code /insight reports and generate actionable files')
  .version('1.0.0');

program
  .command('analyze')
  .description('Parse an insight report HTML file and generate output files')
  .argument('<file>', 'Path to the report.html file')
  .option('-o, --output-dir <path>', 'Output directory (skips interactive prompt)')
  .action(async (file: string, opts: { outputDir?: string }) => {
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

    // 2. Analyze
    const output = analyze(data);
    console.log(`✓ Analyzed: ${output.todos.length} tasks, ${output.skills.length} skills generated`);

    // 3. Determine output dir
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

    console.log('\nNext steps:');
    console.log('  1. Read insights-README.md for placement instructions');
    console.log('  2. Copy CLAUDE.md-additions.md rules into your CLAUDE.md');
    if (Object.keys(output.settingsJson).length > 0) {
      console.log('  3. Merge settings-insights.json into .claude/settings.json');
    }
    if (output.skills.length > 0) {
      const firstSkill = output.skills[0].filename.replace('.SKILL.md', '');
      console.log(`  ${Object.keys(output.settingsJson).length > 0 ? '4' : '3'}. Copy skills to .claude/skills/ and test with /${firstSkill}`);
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

program.parse();
