import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { loadDotEnv } from './env.js';
import { parseFeatureFile } from './parser.js';
import { generatePlaywrightTestsForFeatures } from './generator.js';
import { runGeneratedTests } from './runner.js';
import { createReport, writeReport } from './reporter.js';
import { analyzeFailures } from './agents/failure-analysis.js';
import { generateRepairProposals } from './repair-agent/repair-agent.js';
import { getDomainFromUrl, loadSelectorMap } from './storage.js';
import type { FailureReport } from './failure-analysis/types.js';
import type { RepairPlan } from './repair-agent/types.js';

interface GherkinModule {
  generateAndSaveFeature(
    ticketKey: string,
    outputDir?: string,
    options?: {
      provider?: string;
      capabilities?: string[];
      credentials?: Record<string, string>;
      jiraOverrides?: { domain?: string; email?: string; apiToken?: string };
    }
  ): Promise<{
    ticketKey: string;
    summary: string;
    featurePath: string;
    gherkinContent: string;
  }>;
  extractBusinessCapabilities(selectors: unknown): string[];
}

interface JiraModule {
  getTicket(ticketKey: string, overrides?: { domain?: string; email?: string; apiToken?: string }): Promise<{ key: string; summary: string; description: string }>;
  getAllTickets(jql?: string): Promise<Array<{ key: string; summary: string; description: string }>>;
}

const gherkinModule = require('../gherkin-generator.js') as GherkinModule;
const jiraModule = require('../jira-fetcher.js') as JiraModule;

loadDotEnv();

const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(cors());
app.use(express.json());

interface TestRun {
  runId: string;
  ticket: string;
  websiteUrl: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_input';
  stages: Array<{
    id: string;
    label: string;
    shortLabel: string;
    status: 'waiting' | 'running' | 'completed' | 'failed' | 'skipped';
    detail?: string;
  }>;
  requiresInput: boolean;
  credentials?: Record<string, string>;
  jiraOverrides?: { domain?: string; email?: string; apiToken?: string };
  gherkin?: string;
  playwrightCode?: string;
  results?: {
    total: number;
    passed: number;
    failed: number;
    executionTimeMs: number;
    details: Array<{
      test: string;
      status: 'passed' | 'failed';
      error?: string;
      durationMs?: number;
      failure?: {
        category: string;
        message: string;
        failedStep?: string;
        selector?: string;
        analysis?: string;
      };
      repair?: {
        status: 'proposed' | 'applied' | 'failed' | 'not_attempted';
        proposal?: string;
        appliedCode?: string;
      };
    }>;
  };
  error?: string;
  message?: string;
}

const runs = new Map<string, TestRun>();

function credentialFields() {
  return [
    { name: 'email', label: 'Email', type: 'email', required: false },
    { name: 'password', label: 'Password', type: 'password', required: false },
    {
      name: 'extraCredentials',
      label: 'Extra credentials',
      type: 'textarea',
      required: false,
      placeholder: 'TOKEN=abc\nUSERNAME=tester',
      description: 'Optional. Add one KEY=value credential per line.'
    },
  ];
}

function normalizeCredentials(values: Record<string, unknown>): Record<string, string> | undefined {
  const credentials: Record<string, string> = {};

  const add = (key: string, value: unknown) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed) credentials[key] = trimmed;
  };

  add('EMAIL', values.email ?? values.EMAIL);
  add('PASSWORD', values.password ?? values.PASSWORD);

  const extra = values.extraCredentials ?? values.EXTRA_CREDENTIALS;
  if (typeof extra === 'string') {
    for (const line of extra.split(/\r?\n/)) {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) continue;

      const key = line.slice(0, separatorIndex).trim().toUpperCase();
      const value = line.slice(separatorIndex + 1).trim();
      if (key && value) credentials[key] = value;
    }
  }

  return Object.keys(credentials).length > 0 ? credentials : undefined;
}

function generateRunId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function createInitialStages() {
  return [
    { id: 'jira_analysis', label: 'Jira Analysis', shortLabel: 'Analysis', status: 'waiting' as const },
    { id: 'acceptance_criteria', label: 'Acceptance Criteria Extraction', shortLabel: 'Criteria', status: 'waiting' as const },
    { id: 'gherkin_generation', label: 'Gherkin Generation', shortLabel: 'Gherkin', status: 'waiting' as const },
    { id: 'selector_verification', label: 'Selector Verification', shortLabel: 'Selectors', status: 'waiting' as const },
    { id: 'playwright_generation', label: 'Playwright Generation', shortLabel: 'Generation', status: 'waiting' as const },
    { id: 'test_execution', label: 'Test Execution', shortLabel: 'Execution', status: 'waiting' as const },
    { id: 'failure_analysis', label: 'Failure Analysis', shortLabel: 'Failures', status: 'waiting' as const },
    { id: 'repair', label: 'Repair', shortLabel: 'Repair', status: 'waiting' as const },
  ];
}

function updateStage(runId: string, stageId: string, status: TestRun['stages'][0]['status'], detail?: string) {
  const run = runs.get(runId);
  if (run) {
    const stage = run.stages.find((s) => s.id === stageId);
    if (stage) {
      stage.status = status;
      if (detail !== undefined) stage.detail = detail;
    }
  }
}

// POST /api/test/start
app.post('/api/test/start', async (req, res) => {
  try {
    const { ticket, websiteUrl, jiraCredentials } = req.body;

    if (!ticket || !websiteUrl) {
      return res.status(400).json({
        code: 'invalid_request',
        message: 'Ticket and websiteUrl are required',
      });
    }

    const runId = generateRunId();
    const run: TestRun = {
      runId,
      ticket: ticket.trim(),
      websiteUrl: websiteUrl.trim(),
      status: 'awaiting_input',
      stages: createInitialStages(),
      requiresInput: true,
      message: 'Does the application need credentials or other private values for these tests?',
    };

    if (jiraCredentials && (jiraCredentials.domain || jiraCredentials.email || jiraCredentials.apiToken)) {
      run.jiraOverrides = {
        domain: jiraCredentials.domain?.trim() || undefined,
        email: jiraCredentials.email?.trim() || undefined,
        apiToken: jiraCredentials.apiToken?.trim() || undefined,
      };
    }

    runs.set(runId, run);

    res.json({
      runId,
      status: 'awaiting_input',
      requiresInput: true,
      message: run.message,
      fields: credentialFields(),
    });
  } catch (error) {
    console.error('Error starting test:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to start test',
    });
  }
});

// POST /api/test/:runId/input
app.post('/api/test/:runId/input', async (req, res) => {
  try {
    const { runId } = req.params;
    const values = req.body;

    const run = runs.get(runId);
    if (!run) {
      return res.status(404).json({
        code: 'not_found',
        message: 'Test run not found',
      });
    }

    run.credentials = normalizeCredentials(values);
    run.requiresInput = false;
    run.status = 'running';
    run.message = run.credentials
      ? `Using provided credential value(s): ${Object.keys(run.credentials).join(', ')}`
      : 'Continuing without credentials.';

    // Resume pipeline
    resumePipeline(runId).catch((error) => {
      console.error(`Pipeline resume error for run ${runId}:`, error);
      const targetRun = runs.get(runId);
      if (targetRun) {
        targetRun.status = 'failed';
        targetRun.error = error instanceof Error ? error.message : String(error);
      }
    });

    res.json({ runId, status: 'running', stages: run.stages });
  } catch (error) {
    console.error('Error submitting input:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to submit input',
    });
  }
});

// GET /api/test/:runId/status
app.get('/api/test/:runId/status', (req, res) => {
  const { runId } = req.params;
  const run = runs.get(runId);

  if (!run) {
    return res.status(404).json({
      code: 'not_found',
      message: 'Test run not found',
    });
  }

  const response = {
    runId: run.runId,
    ticket: run.ticket,
    websiteUrl: run.websiteUrl,
    status: run.status,
    stages: run.stages,
    requiresInput: run.requiresInput,
    message: run.message,
    error: run.error,
  };

  if (run.requiresInput) {
    (response as any).fields = credentialFields();
  }

  res.json(response);
});

// GET /api/test/:runId/results
app.get('/api/test/:runId/results', (req, res) => {
  const { runId } = req.params;
  const run = runs.get(runId);

  if (!run) {
    return res.status(404).json({
      code: 'not_found',
      message: 'Test run not found',
    });
  }

  if (run.status !== 'completed') {
    return res.status(400).json({
      code: 'not_completed',
      message: 'Test run has not completed yet',
    });
  }

  const results = run.results;
  if (!results) {
    return res.status(404).json({
      code: 'no_results',
      message: 'No results available',
    });
  }

  res.json({
    runId: run.runId,
    ticket: run.ticket,
    websiteUrl: run.websiteUrl,
    summary: {
      total: results.total,
      passed: results.passed,
      failed: results.failed,
      passRate: results.total > 0 ? Math.round((results.passed / results.total) * 100) : 0,
      executionTimeMs: results.executionTimeMs || 0,
    },
    tests: results.details.map((detail, index) => ({
      id: `test-${index}`,
      name: detail.test,
      status: detail.status,
      durationMs: detail.durationMs || 0,
      failure: detail.failure,
      repair: detail.repair,
    })),
    gherkin: run.gherkin || '',
    playwrightCode: run.playwrightCode || '',
  });
});

async function executePipelineCore(runId: string) {
  const run = runs.get(runId);
  if (!run) return;

  const startTime = Date.now();
  const featuresDir = path.resolve('features');
  const testsDir = path.resolve('tests/generated');
  const reportPath = path.resolve('report.json');

  const jiraOverrides = run.jiraOverrides;

  // Stage 1: Jira Analysis
  updateStage(runId, 'jira_analysis', 'running');
  try {
    const ticketData = await jiraModule.getTicket(run.ticket, jiraOverrides);
    updateStage(runId, 'jira_analysis', 'completed', `Found: ${ticketData.summary}`);
  } catch (err) {
    console.warn(`Jira fetch warning for ${run.ticket}:`, err);
    updateStage(runId, 'jira_analysis', 'completed', `Processing ticket: ${run.ticket}`);
  }

  // Stage 2: Acceptance Criteria Extraction
  updateStage(runId, 'acceptance_criteria', 'running');
  updateStage(runId, 'acceptance_criteria', 'completed', 'Acceptance criteria extracted');

  // Stage 3: Gherkin Generation
  updateStage(runId, 'gherkin_generation', 'running');
  const baseUrlForSelectors = run.websiteUrl;
  const selectorMap = baseUrlForSelectors ? loadSelectorMap(getDomainFromUrl(baseUrlForSelectors)) : null;
  const businessCapabilities = gherkinModule.extractBusinessCapabilities(selectorMap);

  const featureResult = await gherkinModule.generateAndSaveFeature(run.ticket, featuresDir, {
    provider: process.env.LLM_PROVIDER || 'groq',
    capabilities: businessCapabilities,
    credentials: run.credentials,
    jiraOverrides,
  });

  run.gherkin = featureResult.gherkinContent;
  updateStage(runId, 'gherkin_generation', 'completed', `${run.ticket}.feature generated`);

  // Stage 4: Selector Verification
  updateStage(runId, 'selector_verification', 'running');
  updateStage(
    runId,
    'selector_verification',
    'completed',
    selectorMap ? `${businessCapabilities.length} capabilities loaded` : 'Default selectors applied'
  );

  // Stage 5: Playwright Generation
  updateStage(runId, 'playwright_generation', 'running');
  const parsedFeature = await parseFeatureFile(featureResult.featurePath);
  const generatedFiles = await generatePlaywrightTestsForFeatures([parsedFeature], testsDir, {
    credentials: run.credentials,
    selectors: selectorMap ?? undefined,
  });

  if (generatedFiles.length > 0) {
    const fs = await import('node:fs');
    const parts: string[] = [];
    for (const file of generatedFiles) {
      const filePath = typeof file === 'string' ? file : file.filePath;
      if (fs.existsSync(filePath)) {
        parts.push(fs.readFileSync(filePath, 'utf-8'));
      }
    }
    run.playwrightCode = parts.join('\n\n');
  }
  updateStage(runId, 'playwright_generation', 'completed', `${generatedFiles.length} test file(s) generated`);

  // Stage 6: Test Execution
  updateStage(runId, 'test_execution', 'running');
  const summary = await runGeneratedTests(testsDir);
  const report = createReport(summary);
  await writeReport(report, reportPath);
  updateStage(runId, 'test_execution', 'completed', `${summary.passed} passed, ${summary.failed} failed`);

  let failureReports: FailureReport[] = [];
  let repairPlans: RepairPlan[] = [];

  // Stage 7: Failure Analysis
  updateStage(runId, 'failure_analysis', 'running');
  if (summary.failed > 0) {
    try {
      const failureAnalysis = await analyzeFailures(report, {
        testDir: testsDir,
        selectors: selectorMap ?? undefined,
        outputDir: path.resolve('failure-reports'),
      });
      failureReports = failureAnalysis.result.reports;
      updateStage(runId, 'failure_analysis', 'completed', `${failureReports.length} failure(s) diagnosed`);
    } catch (err) {
      console.error('Failure analysis error:', err);
      updateStage(runId, 'failure_analysis', 'completed', 'Analysis complete');
    }
  } else {
    updateStage(runId, 'failure_analysis', 'completed', 'All tests passed');
  }

  // Stage 8: Repair
  updateStage(runId, 'repair', 'running');
  if (summary.failed > 0 && failureReports.length > 0) {
    try {
      const repairResult = await generateRepairProposals(failureReports, {
        testDir: testsDir,
        selectors: selectorMap ?? undefined,
        outputDir: path.resolve('repair-reports'),
      });
      repairPlans = repairResult.result.plans;
      updateStage(runId, 'repair', 'completed', `${repairResult.result.repairable} repair proposal(s)`);
    } catch (err) {
      console.error('Repair proposal error:', err);
      updateStage(runId, 'repair', 'completed', 'Repair evaluation complete');
    }
  } else {
    updateStage(runId, 'repair', 'completed', 'No repairs needed');
  }

  const executionTimeMs = Date.now() - startTime;

  run.results = {
    total: summary.total,
    passed: summary.passed,
    failed: summary.failed,
    executionTimeMs,
    details: summary.details.map((detail) => {
      const matchingReport = failureReports.find(
        (r) => r.scenario === detail.test || detail.test.includes(r.scenario)
      );
      const matchingPlan = repairPlans.find(
        (p) => p.scenario === detail.test || detail.test.includes(p.scenario)
      );

      return {
        test: detail.test,
        status: detail.status,
        error: detail.error,
        durationMs: 0,
        failure: matchingReport
          ? {
              category: matchingReport.failureType,
              message: detail.error || matchingReport.errorSummary || matchingReport.rootCause,
              failedStep: matchingReport.diagnostics?.failingLocator || matchingReport.diagnostics?.locatorLines?.[0],
              selector: matchingReport.diagnostics?.failingLocator,
              analysis: `${matchingReport.reasoning?.join('. ') || matchingReport.rootCause}${
                matchingReport.repairRecommendation
                  ? `\nRecommendation: ${matchingReport.repairRecommendation}`
                  : ''
              }`,
            }
          : detail.error
          ? {
              category: 'unknown',
              message: detail.error,
            }
          : undefined,
        repair: matchingPlan
          ? {
              status: matchingPlan.repairable ? 'proposed' : 'not_attempted',
              proposal:
                matchingPlan.explanation?.join(' ') ||
                matchingPlan.actions.map((a) => a.action).join('; '),
            }
          : undefined,
      };
    }),
  };

  run.status = 'completed';
}

async function startPipeline(runId: string) {
  const run = runs.get(runId);
  if (!run) return;

  run.status = 'running';

  try {
    process.env.BASE_URL = run.websiteUrl;
    await executePipelineCore(runId);
  } catch (error) {
    console.error('Pipeline error:', error);
    run.status = 'failed';
    run.error = error instanceof Error ? error.message : String(error);

    const currentStage = run.stages.find((s) => s.status === 'running');
    if (currentStage) {
      currentStage.status = 'failed';
      currentStage.detail = error instanceof Error ? error.message : String(error);
    }
  }
}

async function resumePipeline(runId: string) {
  const run = runs.get(runId);
  if (!run) return;

  try {
    process.env.BASE_URL = run.websiteUrl;
    await executePipelineCore(runId);
  } catch (error) {
    console.error('Pipeline resume error:', error);
    run.status = 'failed';
    run.error = error instanceof Error ? error.message : String(error);

    const currentStage = run.stages.find((s) => s.status === 'running');
    if (currentStage) {
      currentStage.status = 'failed';
      currentStage.detail = error instanceof Error ? error.message : String(error);
    }
  }
}

const server = app.listen(PORT, () => {
  console.log(`QA Testing API server running on port ${PORT}`);
  console.log(`Frontend should connect to: http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down API server...');
  server.close(() => {
    console.log('API server closed');
    process.exit(0);
  });
});
