import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadDotEnv } from '../env.js';
import { loadSelectorsFromEnv } from '../failure-analysis/analyzer.js';
import type { FailureReport, FailureAnalysisResult } from '../failure-analysis/types.js';
import type { SelectorMap } from '../selector-types.js';
import { writeRepairReports } from './report.js';
import { buildRepairPlan, type RepairContext } from './strategies.js';
import type { RepairPlan, RepairProposalResult } from './types.js';

export interface RepairAgentOptions {
  selectors?: SelectorMap | null;
  testDir?: string;
  outputDir?: string;
  baseUrl?: string;
}

export interface RepairProposalRun {
  result: RepairProposalResult;
  files: { summaryFile: string; planFiles: string[] };
}

async function loadContextForReport(report: FailureReport, selectors: SelectorMap | null): Promise<RepairContext> {
  const ctx: RepairContext = {
    report,
    selectors,
    testSource: undefined,
    failingLine: undefined
  };

  const file = report.location?.file;
  if (!file || typeof file !== 'string') {
    return ctx;
  }

  try {
    const testSource = await readFile(file, 'utf8');
    ctx.testSource = testSource;
    const line = report.location?.line;
    if (typeof line === 'number') {
      ctx.failingLine = testSource.split(/\r?\n/)[line - 1] ?? undefined;
    }
  } catch {
    // The test source may not exist (offline analysis of a stale report).
  }

  return ctx;
}

/**
 * Repair Agent (Proposal Mode) entry point.
 *
 * Consumes FailureReports, applies deterministic, category-driven strategies
 * against the knowledge base and the generated test source, and produces
 * structured RepairPlan proposals. It NEVER modifies files.
 */
export async function generateRepairProposals(
  failureReports: FailureReport[],
  options: RepairAgentOptions = {}
): Promise<RepairProposalRun> {
  loadDotEnv();

  const selectors = options.selectors ?? loadSelectorsFromEnv(options.baseUrl);

  const plans: RepairPlan[] = [];
  for (const report of failureReports) {
    const ctx = await loadContextForReport(report, selectors);
    plans.push(buildRepairPlan(report, ctx));
  }

  const repairable = plans.filter((plan) => plan.repairable).length;

  const result: RepairProposalResult = {
    analyzedAt: new Date().toISOString(),
    total: plans.length,
    repairable,
    manual: plans.length - repairable,
    plans,
    summaryFile: path.join(options.outputDir ?? 'repair-reports', 'repair-report.json')
  };

  const files = await writeRepairReports(result, options.outputDir);

  return { result, files };
}

function formatPlan(plan: RepairPlan): string {
  const flag = plan.repairable ? (plan.requiresHumanReview ? 'repairable (human review)' : 'repairable') : 'manual / no auto-repair';
  return `${plan.scenario}\n  repairType: ${plan.repairType} (confidence: ${(plan.confidence * 100).toFixed(0)}%) [${flag}]\n  target: ${plan.target}\n  currentValue: ${plan.currentValue ?? '-'}\n  replacementValue: ${plan.replacementValue ?? '-'}\n  actions:\n    ${plan.actions.map((action) => `- ${action.action}`).join('\n    ')}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reportArg = args.find((arg) => arg.startsWith('--report='));
  const reportPath = reportArg
    ? reportArg.split('=')[1]
    : path.join(path.resolve('failure-reports'), 'failure-report.json');

  const parsed = JSON.parse(await readFile(reportPath, 'utf8')) as FailureAnalysisResult;
  const { result, files } = await generateRepairProposals(parsed.reports, {
    testDir: path.resolve('tests/generated'),
    outputDir: path.resolve('repair-reports')
  });

  console.log('========================================================');
  console.log('   REPAIR AGENT (PROPOSAL MODE)');
  console.log('========================================================\n');
  console.log(`Generated ${result.total} repair plan(s): ${result.repairable} repairable, ${result.manual} manual.`);
  console.log(`Plans written to: ${files.summaryFile}`);
  console.log('  (no files were modified — proposal mode only)\n');
  console.log('--------------------------------------------------------');
  for (const plan of result.plans) {
    console.log(`\n${formatPlan(plan)}`);
  }
  console.log('\n========================================================');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error('[repair-agent] Fatal error:', message);
    process.exitCode = 1;
  });
}
