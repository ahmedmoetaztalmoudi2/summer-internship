import path from 'node:path';
import { loadDotEnv } from './env.js';
import { parseFeatureFile } from './parser.js';
import type { ParsedFeature } from './parser.js';
import { generatePlaywrightTestsForFeatures } from './generator.js';
import { runGeneratedTests } from './runner.js';
import { createReport, writeReport } from './reporter.js';
import { analyzeFailures, formatFailureParagraph } from './agents/failure-analysis.js';
import { autoRepairAndRetry } from './agents/auto-repair.js';
import { generateRepairProposals } from './repair-agent/repair-agent.js';
import { askForCredentials, parseCredentialsArg } from './prompts.js';
import { getDomainFromUrl, loadSelectorMap } from './storage.js';
import { ensureSelectorMap } from './selector-onboarding.js';
import type { SelectorMap } from './selector-types.js';

interface Ticket {
  key: string;
  summary: string;
  description: string;
}

interface FeatureResult {
  ticketKey: string;
  summary: string;
  featurePath: string;
  gherkinContent: string;
}

interface GherkinModule {
  generateAndSaveFeature(
    ticketKey: string,
    outputDir?: string,
    options?: {
      provider?: string;
      capabilities?: string[];
      credentials?: Record<string, string>;
    }
  ): Promise<FeatureResult>;
  extractBusinessCapabilities(selectors: unknown): string[];
}

interface JiraModule {
  getTicket(ticketKey: string): Promise<Ticket>;
  getAllTickets(jql?: string): Promise<Ticket[]>;
}

const gherkinModule = require('../gherkin-generator.js') as GherkinModule;
const jiraModule = require('../jira-fetcher.js') as JiraModule;

function parseProvider(args: string[]): string | undefined {
  if (args.includes('--mock')) return 'mock';
  if (args.includes('--groq') || args.includes('--qwen')) return 'groq';

  const providerArg = args.find((arg) => arg.startsWith('--provider='));
  return providerArg?.split('=')[1];
}

function parseAppUrl(args: string[]): string | undefined {
  const explicit = args.find((arg) => arg.startsWith('--url='));
  if (explicit) {
    return explicit.split('=')[1];
  }

  return args.find((arg) => /^https?:\/\//i.test(arg));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Gentle pause between site-hitting phases so teskerti.tn stops throttling the
// automated traffic. Throttled pages load very slowly (which looks like flaky
// timeouts), so settling lets each phase run fast and reliably.
function settle(ms: number = 3000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('');
  console.log('   ____                                 _       _ ');
  console.log('  / ___|__ _ _ __   __ _  ___ _ __ ___ (_)_ __ (_)');
  console.log(' | |   / _` | \'_ \\ / _` |/ _ \\ \'_ ` _ \\| | \'_ \\| |');
  console.log(' | |__| (_| | |_) | (_| |  __/ | | | | | | | | | |');
  console.log('  \\____\\__,_| .__/ \\__, |\\___|_| |_| |_|_|_| |_|_|');
  console.log('            |_|    |___/                          ');
  console.log('  _____             _                      _             ');
  console.log(' | ____|_ __   __ _(_)_ __   ___  ___ _ __(_)_ __   __ _ ');
  console.log(' |  _| | \'_ \\ / _` | | \'_ \\ / _ \\/ _ \\ \'__| | \'_ \\ / _` |');
  console.log(' | |___| | | | (_| | | | | |  __/  __/ |  | | | | | (_| |');
  console.log(' |_____|_| |_|\\__, |_|_| |_|\\___|\\___|_|  |_|_| |_|\\__, |');
  console.log('              |___/                                |___/ ');
  console.log('');
  console.log('   ~~Adding value. Scaling impact.~~');
  console.log('');

  loadDotEnv();

  const args = process.argv.slice(2);
  const provider = parseProvider(args);
  const appUrl = parseAppUrl(args);
  const ticketKey = args.find((arg) => !arg.startsWith('--') && !/^https?:\/\//i.test(arg));

  if (appUrl) {
    process.env.BASE_URL = appUrl;
  }

  if (provider === 'groq' || provider === 'gemini') {
    process.env.TEST_LLM_PROVIDER = provider;
  }

  const featuresDir = path.resolve('features');
  const testsDir = path.resolve('tests/generated');
  const reportPath = path.resolve('report.json');

  // Load the verified selector knowledge base.
  // Selectors are ONLY used for: Playwright generation, failure analysis, repair.
  // Gherkin generation receives business-level capabilities extracted from selectors.
  const baseUrlForSelectors = process.env.BASE_URL ?? '';
  const selectorMap = baseUrlForSelectors ? await ensureSelectorMap(baseUrlForSelectors) : null;
  const businessCapabilities = gherkinModule.extractBusinessCapabilities(selectorMap);

  console.log(`Gherkin provider: ${provider ?? 'groq'}`);
  console.log(`Test generation provider: ${process.env.TEST_LLM_PROVIDER ?? 'groq'}`);
  console.log(`Application URL: ${process.env.BASE_URL ?? 'http://localhost:3000'}`);
  if (selectorMap?.login) {
    console.log(`[Agent] Loaded selector KB from selectors/${getDomainFromUrl(baseUrlForSelectors)}.json`);
    console.log(`[Agent] Extracted ${businessCapabilities.length} business capabilities for Gherkin grounding`);
  }

  const cliCredentials = parseCredentialsArg(args);

  // Step 1-3: Jira -> ADF -> Gherkin
  const featureResults: FeatureResult[] = [];

  if (ticketKey) {
    console.log(`\n[Step 1-3] Processing single ticket: ${ticketKey}`);
    featureResults.push(
      await gherkinModule.generateAndSaveFeature(ticketKey, featuresDir, {
        provider,
        capabilities: businessCapabilities,
        credentials: cliCredentials
      })
    );
  } else {
    console.log('\n[Step 1] Fetching all project tickets from Jira...');
    const tickets = await jiraModule.getAllTickets();
    console.log(`[Step 1] Found ${tickets.length} tickets.\n`);

    for (const ticket of tickets) {
      try {
        console.log(`[Step 1-3] Processing ticket: ${ticket.key} - ${ticket.summary}`);
        featureResults.push(
          await gherkinModule.generateAndSaveFeature(ticket.key, featuresDir, {
            provider,
            capabilities: businessCapabilities,
            credentials: cliCredentials
          })
        );
      } catch (error) {
        console.error(`[Step 1-3] Failed for ${ticket.key}: ${errorMessage(error)}`);
      }
    }
  }

  // Step 4: Gherkin -> Playwright tests
  console.log('\n[Step 4] Settling briefly before generation...');
  await settle(3000);
  console.log('[Step 4] Parsing generated Gherkin feature files...');
  const parsedFeatures: ParsedFeature[] = [];
  for (const result of featureResults) {
    try {
      parsedFeatures.push(await parseFeatureFile(result.featurePath));
      console.log(`[Step 4] Parsed: ${result.featurePath}`);
    } catch (error) {
      console.error(`[Step 4] Failed to parse ${result.featurePath}: ${errorMessage(error)}`);
    }
  }

  console.log(`[Step 4] Generating Playwright tests from ${parsedFeatures.length} feature file(s)...`);
  const credentials = cliCredentials ?? (await askForCredentials());
  if (credentials) {
    const keys = Object.keys(credentials);
    console.log(`[Agent] Using ${keys.length} provided credential(s): ${keys.join(', ')}`);
  }

  const generatedFiles = await generatePlaywrightTestsForFeatures(parsedFeatures, testsDir, {
    credentials,
    selectors: selectorMap ?? undefined
  });
  console.log(`[Step 4] Generated ${generatedFiles.length} Playwright test file(s).`);

  // Step 5: Execute
  console.log('\n[Step 5] Executing generated tests...');
  const summary = await runGeneratedTests(testsDir);
  const report = createReport(summary);
  await writeReport(report, reportPath);

  console.log(`\n[Step 5] Report saved to: ${reportPath}`);

  // Step 6: Failure Analysis (diagnosis only — no repair yet)
  console.log('\n[Step 6] Settling before failure analysis (avoid site throttling)...');
  await settle();
  console.log('\n[Step 6] Analyzing failures...');
  const failureAnalysis = await analyzeFailures(report, {
    testDir: testsDir,
    selectors: selectorMap ?? undefined,
    outputDir: path.resolve('failure-reports')
  });
  console.log(`[Step 6] ${failureAnalysis.result.reports.length} failed scenario(s) analyzed.`);
  console.log(`[Step 6] Structured failure report saved to: ${failureAnalysis.files.summaryFile}`);

  // Enrich report.json with a human-readable paragraph per failure and re-save,
  // so the final report explains each problem in plain language (not just stack
  // traces). Falls back gracefully if analysis produced no reports.
  const failureParagraphs = failureAnalysis.result.reports.map(formatFailureParagraph);
  (report as any).failureSummary = failureParagraphs;
  await writeReport(report, reportPath);
  if (failureParagraphs.length > 0) {
    console.log('\n========================================================');
    console.log('   FAILURE SUMMARY (what went wrong & how to fix)');
    console.log('========================================================');
    for (const paragraph of failureParagraphs) {
      console.log(`\n${paragraph}`);
    }
    console.log('\n========================================================');
  }

  // Step 7: Repair Planning (proposal mode only — no file changes)
  console.log('\n[Step 7] Settling before repair planning...');
  await settle();
  console.log('\n[Step 7] Generating repair proposals (no file changes)...');
  const repairResult = await generateRepairProposals(failureAnalysis.result.reports, {
    testDir: testsDir,
    selectors: selectorMap ?? undefined,
    outputDir: path.resolve('repair-reports')
  });
  console.log(
    `[Step 7] ${repairResult.result.repairable} repairable / ${repairResult.result.manual} manual repair plan(s).`
  );
  console.log(`[Step 7] Repair plans saved to: ${repairResult.files.summaryFile}`);

  // Step 8: Auto-Repair & Retry (apply safe repairs, re-run, save fixes or escalate)
  console.log('\n[Step 8] Settling before auto-repair & retry...');
  await settle();
  console.log('\n[Step 8] Auto-repairing safe failures and re-running affected scenarios...');
  const autoRepair = await autoRepairAndRetry(failureAnalysis.result.reports, {
    testDir: testsDir,
    selectors: selectorMap ?? undefined,
    outputDir: path.resolve('repair-reports')
  });
  console.log(
    `[Step 8] ${autoRepair.result.fixed} fixed, ${autoRepair.result.escalated} escalated, ${autoRepair.result.skipped} skipped.`
  );
  console.log(`[Step 8] Auto-repair summary saved to: ${autoRepair.files.summaryFile}`);

  console.log('\n========================================================');
  console.log('   FULL PIPELINE COMPLETE');
  console.log('========================================================\n');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('Fatal error in full pipeline:', error);
  process.exitCode = 1;
});
