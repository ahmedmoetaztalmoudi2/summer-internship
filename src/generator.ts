import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ParsedFeature, ParsedScenario } from './parser.js';
import { loadDotEnv } from './env.js';
import { getDomainFromUrl, loadSelectorMap } from './storage.js';
import type { SelectorMap } from './selector-types.js';

export interface GeneratedTestFile {
  scenarioName: string;
  filePath: string;
}

export interface GeneratorOptions {
  credentials?: Record<string, string>;
  selectors?: SelectorMap;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{
    text: string;
  }>;
}

interface GeminiRequest {
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    code: number;
    message: string;
  };
}

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

function toFileName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function expandScenarioExamples(scenario: ParsedScenario): ParsedScenario[] {
  const rows = scenario.examples ?? [];
  if (rows.length < 2) {
    return [scenario];
  }

  const [header, ...dataRows] = rows;

  return dataRows.map((row) => {
    const replacements = new Map<string, string>();
    header.forEach((column, index) => {
      replacements.set(column.trim(), row[index]?.trim() ?? '');
    });

    return {
      name: scenario.name,
      steps: scenario.steps.map((step) => ({
        type: step.type,
        text: step.text.replace(/<([^>]+)>/g, (match, token) => replacements.get(token.trim()) ?? match)
      }))
    };
  });
}

function toLiteral(value: string): string {
  return JSON.stringify(value);
}

function stripCodeFences(content: string): string {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/^```(?:typescript|ts)?\s*([\s\S]*?)\s*```$/i);

  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  return trimmed;
}

function buildScenarioPrompt(
  feature: ParsedFeature,
  scenario: ParsedScenario,
  options: GeneratorOptions = {}
): GeminiContent[] {
  loadDotEnv();
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  const featureContext = JSON.stringify(
    {
      featureName: feature.featureName ?? null,
      scenario: {
        name: scenario.name,
        steps: scenario.steps
      },
      baseUrl,
      providedCredentials: options.credentials ?? {},
      knownSelectors: options.selectors ?? {}
    },
    null,
    2
  );

  const systemInstruction = [
    'You are a senior QA automation engineer generating clean Playwright Test TypeScript.',
    'Return only executable TypeScript code.',
    'Use: import { test, expect } from "@playwright/test";',
    'Use flexible selectors: try getByRole, getByLabel, getByPlaceholder, getByTestId, or locator() with CSS selectors.',
    'If a selector is uncertain, still emit a best-effort locator (getByRole, getByLabel, getByPlaceholder or a locator with a plausible CSS selector) and add a "// TODO:" comment on its own line. NEVER use the literal text "TODO..." as a selector value inside a locator() or getBy*() call — that produces invalid code.',
    'Map Given steps to navigation, When steps to actions, Then steps to assertions.',
    'If a step cannot be mapped precisely, emit a SINGLE "// TODO:" comment on its own line. A TODO comment must NEVER be followed by any assertion or locator for that step — emit the TODO instead of the assertion.',
    `Always navigate directly to the full application URL "${baseUrl}" as the starting page for the scenario. Use the exact URL as provided. Do NOT append or guess extra path segments (e.g. "/login" or "/connexion"). If the starting page for the scenario differs from the provided URL, add a TODO comment and do not invent a path.`,
    'Use the providedCredentials values (e.g. EMAIL, PASSWORD, TOKEN) ONLY when a step explicitly asks for the user account credentials without providing a concrete value. When the Gherkin provides a concrete value, or a Scenario Outline provides an Examples table, use that data EXACTLY (e.g. "<email>" placeholder means the value from the Examples row, such as "wrong@test.com") and do NOT substitute providedCredentials. Do NOT invent or guess credentials; if a required value is missing, leave a TODO comment stating which credential is needed.',
    'Use the verified selector strings from knownSelectors (e.g. knownSelectors.login.email) by embedding them directly in locator calls, for example: page.locator("input[name=\\"email\\"]"). Do NOT define a knownSelectors constant in the test file and do NOT reference a knownSelectors variable. Only use flexible/guessed selectors for elements that are NOT present in knownSelectors.',
    'Assertions: only call expect(page) for URL/status checks (e.g. expect(page).toHaveURL(...)). For text or visibility assertions use expect(page.locator(...)) or expect(page.getByText(...)). NEVER call toContainText, toBeVisible or toHaveText on the page object itself.',
    'NEVER invent the exact text of error, success or info messages. If the Gherkin step does not quote the exact message text, assert the generic alert region instead: await expect(page.locator(".alert, .error, [role=\\"alert\\"], .flash, .message").first()).toBeVisible(). NEVER use locator("text=...") or getByText("...") with a fabricated message string.',
    'When a Then step contains "or"/"ou" alternatives about a FAILED operation, assert ONLY the error-message outcome: await expect(page.locator(".alert, .error, [role=\\"alert\\"], .flash, .message").first()).toBeVisible() and emit NO toHaveURL assertion at all. Do not include both an error-message assertion and a URL assertion in the same test.',
    'NEVER emit a toHaveURL assertion with a placeholder that matches everything (e.g. /.*$/ or an empty string). If the Gherkin specifies the destination URL, use it exactly. If it does not specify a destination, do NOT assert the final URL; for a redirect expectation assert the page left the login path instead: await expect(page).not.toHaveURL(/\\/login/); preceded by a "// TODO: confirm expected redirect URL" comment.',
    'Never combine a toHaveURL assertion with an alert/visibility assertion in the same test. Each test must assert ONE outcome kind only: either a URL assertion OR a visibility assertion, never both. If you would write both, delete the toHaveURL assertion and keep the alert assertion.',
    'Always prefix expect() calls with await, e.g. await expect(page).toHaveURL("https://..."). An unawaited expect() assertion is invalid.'
  ].join(' ');

  const userPrompt = [
    'Convert this parsed Gherkin scenario into a single Playwright test file named after the scenario.',
    'Use the feature name as test.describe when available.',
    'Input JSON:',
    featureContext
  ].join('\n');

  return [
    {
      role: 'user',
      parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }]
    }
  ];
}

async function callGeminiForTestCode(
  feature: ParsedFeature,
  scenario: ParsedScenario,
  options: GeneratorOptions = {}
): Promise<string> {
  loadDotEnv();

  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';

  const debugAuth = process.env.GEMINI_DEBUG_AUTH === '1';
  if (debugAuth) {
    const maskedKey =
      apiKey.length >= 10
        ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`
        : apiKey.length > 0
          ? `${apiKey.slice(0, 2)}...${apiKey.slice(-1)}`
          : '<missing>';
    console.log(`[gemini-auth] keyExists=${apiKey.length > 0} keyLength=${apiKey.length} keyPreview=${maskedKey}`);
  }

  if (!apiKey) {
    throw new Error('Missing API key: set GEMINI_API_KEY.');
  }

  const model = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';
  const apiVersion = process.env.GEMINI_API_VERSION ?? 'v1beta';
  const baseUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;

  if (debugAuth) {
    console.log(`[gemini-request] endpoint=${baseUrl} model=${model}`);
  }
  const parsedTemperature = Number(process.env.GEMINI_TEMPERATURE ?? '0.2');
  const temperature = Number.isFinite(parsedTemperature) ? parsedTemperature : 0.2;
  const contents = buildScenarioPrompt(feature, scenario, options);

  const requestBody: GeminiRequest = {
    contents,
    generationConfig: {
      temperature
    }
  };

  const maxAttempts = 5;
  let payload: GeminiResponse = {};

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    payload = (await response.json().catch(() => ({}))) as GeminiResponse;

    if (response.ok) {
      break;
    }

    const retryable = response.status === 429 || response.status === 500 || response.status === 502 || response.status === 503;

    if (!retryable || attempt === maxAttempts) {
      const errorMessage = payload.error?.message ?? `Gemini API request failed with status ${response.status}`;
      const errorCode = payload.error?.code;
      const details = [
        `Gemini API request failed with status ${response.status}`,
        errorCode ? `code=${errorCode}` : undefined,
        `message=${errorMessage}`
      ]
        .filter(Boolean)
        .join(' | ');

      throw new Error(details);
    }

    const suggestedDelay = parseRetryDelay(payload.error?.message);
    const delayMs = suggestedDelay ?? Math.min(1000 * 2 ** (attempt - 1), 8000);
    console.log(`[gemini-request] Attempt ${attempt} failed with status ${response.status}, retrying in ${delayMs}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content || typeof content !== 'string') {
    throw new Error('Gemini API returned an empty completion payload.');
  }

  return stripCodeFences(content);
}

function parseRetryDelay(message: string | undefined): number | undefined {
  if (!message) {
    return undefined;
  }

  const match = message.match(/retry\s+in\s+([\d.]+)\s*(?:s|seconds?|ms)?/i);
  if (!match) {
    return undefined;
  }

  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }

  return Math.min(seconds * 1000, 120000);
}

function toGroqMessages(contents: GeminiContent[]): GroqMessage[] {
  return contents.map((item) => ({
    role: item.role === 'model' ? 'assistant' : 'user',
    content: item.parts.map((part) => part.text).join('\n\n')
  }));
}

async function callGroqForTestCode(
  feature: ParsedFeature,
  scenario: ParsedScenario,
  options: GeneratorOptions = {}
): Promise<string> {
  loadDotEnv();

  const apiKey = process.env.GROQ_API_KEY?.trim() ?? '';
  if (!apiKey) {
    throw new Error('Missing GROQ_API_KEY for Playwright test generation.');
  }

  const baseUrl = (process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  const model = process.env.GROQ_TEST_MODEL ?? process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
  const messages = toGroqMessages(buildScenarioPrompt(feature, scenario, options));

  const maxAttempts = 5;
  let payload: GroqResponse = {};

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2
      })
    });

    payload = (await response.json().catch(() => ({}))) as GroqResponse;

    if (response.ok) {
      break;
    }

    const retryable = response.status === 429 || response.status === 500 || response.status === 502 || response.status === 503;

    if (!retryable || attempt === maxAttempts) {
      const details = [
        `Groq API request failed with status ${response.status}`,
        `model=${model}`,
        `message=${payload.error?.message ?? 'unknown error'}`
      ].join(' | ');

      throw new Error(details);
    }

    const suggestedDelay = parseRetryDelay(payload.error?.message);
    const delayMs = suggestedDelay ?? Math.min(1000 * 2 ** (attempt - 1), 8000);
    console.log(`[groq-request] Attempt ${attempt} failed with status ${response.status}, retrying in ${delayMs}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const content = payload.choices?.[0]?.message?.content;

  if (!content || typeof content !== 'string') {
    throw new Error('Groq API returned an empty completion payload.');
  }

  return stripCodeFences(content);
}

async function callTestLlm(
  feature: ParsedFeature,
  scenario: ParsedScenario,
  options: GeneratorOptions = {}
): Promise<string> {
  loadDotEnv();
  const provider = (process.env.TEST_LLM_PROVIDER ?? 'groq').toLowerCase();

  if (provider === 'gemini') {
    return callGeminiForTestCode(feature, scenario, options);
  }

  return callGroqForTestCode(feature, scenario, options);
}

function sanitizeContradictoryAssertions(content: string): string {
  const hasAlertAssertion = /\.first\(\)\)\.toBeVisible\(\)/.test(content);
  const hasNotToHaveUrl = /not\.toHaveURL/.test(content);
  if (!hasAlertAssertion || !hasNotToHaveUrl) {
    return content;
  }

  return content
    .split(/\r?\n/)
    .filter((line) => !/not\.toHaveURL/.test(line) && !/TODO:\s*confirm expected redirect URL/i.test(line))
    .join('\n');
}

function wrapTestFile(feature: ParsedFeature, scenario: ParsedScenario, body: string): string {
  const normalizedBody = sanitizeContradictoryAssertions(body.trim());
  const hasImport = /^\s*import\s/m.test(normalizedBody);
  const hasTopLevelTest = /^\s*test\.describe\s*\(/m.test(normalizedBody) || /^\s*test\s*\(/m.test(normalizedBody);

  if (hasImport && hasTopLevelTest) {
    return `${normalizedBody}\n`;
  }

  const bodyWithoutImport = normalizedBody.replace(/^\s*import\s+.*$/m, '').trim();

  const lines: string[] = [];
  lines.push("import { test, expect } from '@playwright/test';");
  lines.push('');

  if (feature.featureName) {
    lines.push(`test.describe(${toLiteral(feature.featureName)}, () => {`);
    lines.push(`  test(${toLiteral(scenario.name)}, async ({ page }) => {`);
    for (const line of bodyWithoutImport.split(/\r?\n/)) {
      lines.push(`    ${line}`);
    }
    lines.push('  });');
    lines.push('});');
  } else {
    lines.push(`test(${toLiteral(scenario.name)}, async ({ page }) => {`);
    for (const line of bodyWithoutImport.split(/\r?\n/)) {
      lines.push(`  ${line}`);
    }
    lines.push('});');
  }

  lines.push('');
  return lines.join('\n');
}

async function cleanGeneratedDirectory(outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const entries = await readdir(outputDir);
  await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.spec.ts'))
      .map((entry) => unlink(path.join(outputDir, entry)))
  );
}

export async function generatePlaywrightTests(feature: ParsedFeature, outputDir: string): Promise<GeneratedTestFile[]> {
  return generatePlaywrightTestsForFeatures([feature], outputDir);
}

export async function generatePlaywrightTestsForFeatures(
  features: ParsedFeature[],
  outputDir: string,
  options: GeneratorOptions = {}
): Promise<GeneratedTestFile[]> {
  await cleanGeneratedDirectory(outputDir);

  // Auto-load the verified selector knowledge base for the current app URL
  // when the caller did not pass one explicitly.
  let generationOptions = options;
  if (!generationOptions.selectors) {
    loadDotEnv();
    const baseUrl = process.env.BASE_URL ?? '';
    if (baseUrl) {
      const loaded = loadSelectorMap(getDomainFromUrl(baseUrl));
      if (loaded) {
        generationOptions = { ...generationOptions, selectors: loaded };
      }
    }
  }

  const generatedFiles: GeneratedTestFile[] = [];
  const usedNames = new Set<string>();

  for (const feature of features) {
    for (const scenario of feature.scenarios) {
      const expanded = expandScenarioExamples(scenario);

      for (const scenarioToGenerate of expanded) {
        let baseName = `${toFileName(scenarioToGenerate.name) || 'generated-scenario'}.spec.ts`;
        let fileName = baseName;
        let suffix = 2;
        while (usedNames.has(fileName)) {
          fileName = `${baseName.replace(/\.spec\.ts$/, '')}-${suffix++}.spec.ts`;
        }
        usedNames.add(fileName);

        const filePath = path.join(outputDir, fileName);
        const generatedContent = await callTestLlm(feature, scenarioToGenerate, generationOptions);
        const content = wrapTestFile(feature, scenarioToGenerate, generatedContent);

        await writeFile(filePath, content, 'utf8');
        generatedFiles.push({
          scenarioName: scenarioToGenerate.name,
          filePath
        });
      }
    }
  }

  return generatedFiles;
}
