import path from 'node:path';
import { loadDotEnv } from './env.js';
import { parseFeatureFile } from './parser.js';
import type { ParsedFeature } from './parser.js';
import { generatePlaywrightTestsForFeatures } from './generator.js';
import { runGeneratedTests } from './runner.js';
import { createReport, writeReport } from './reporter.js';
import { askForCredentials, parseCredentialsArg } from './prompts.js';
import { getDomainFromUrl, loadSelectorMap } from './storage.js';
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
      selectors?: { login?: SelectorMap['login']; forms?: SelectorMap['forms'] };
      credentials?: Record<string, string>;
    }
  ): Promise<FeatureResult>;
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

async function main(): Promise<void> {
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

  // Load the verified selector knowledge base once and reuse it for both the
  // Gherkin step (to ground scenarios in the real page) and the test step.
  const baseUrlForSelectors = process.env.BASE_URL ?? '';
  const selectorMap = baseUrlForSelectors ? loadSelectorMap(getDomainFromUrl(baseUrlForSelectors)) : null;
  const selectorsContext = selectorMap ? { login: selectorMap.login, forms: selectorMap.forms } : undefined;

  console.log('========================================================');
  console.log('   FULL PIPELINE: Jira -> Gherkin -> Playwright -> Run');
  console.log('========================================================\n');
  console.log(`Gherkin provider: ${provider ?? 'groq'}`);
  console.log(`Test generation provider: ${process.env.TEST_LLM_PROVIDER ?? 'groq'}`);
  console.log(`Application URL: ${process.env.BASE_URL ?? 'http://localhost:3000'}`);
  if (selectorMap?.login) {
    console.log(`[Agent] Using verified selectors from selectors/${getDomainFromUrl(baseUrlForSelectors)}.json`);
  }

  const cliCredentials = parseCredentialsArg(args);

  // Step 1-3: Jira -> ADF -> Gherkin
  const featureResults: FeatureResult[] = [];

  if (ticketKey) {
    console.log(`\n[Step 1-3] Processing single ticket: ${ticketKey}`);
    featureResults.push(
      await gherkinModule.generateAndSaveFeature(ticketKey, featuresDir, {
        provider,
        selectors: selectorsContext,
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
            selectors: selectorsContext,
            credentials: cliCredentials
          })
        );
      } catch (error) {
        console.error(`[Step 1-3] Failed for ${ticket.key}: ${errorMessage(error)}`);
      }
    }
  }

  // Step 4: Gherkin -> Playwright tests
  console.log('\n[Step 4] Parsing generated Gherkin feature files...');
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
  console.log('\n========================================================');
  console.log('   FULL PIPELINE COMPLETE');
  console.log('========================================================\n');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('Fatal error in full pipeline:', error);
  process.exitCode = 1;
});
