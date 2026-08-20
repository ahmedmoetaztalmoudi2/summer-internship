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
  let trimmed = content.trim();

  trimmed = trimmed.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
  trimmed = trimmed.replace(/<think>[\s\S]*$/gi, '').trim();

  const fencedMatch = trimmed.match(/^```(?:typescript|ts)?\s*([\s\S]*?)\s*```$/i);

  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  return trimmed;
}

function filterSelectorsForScenario(selectors: any, scenario: ParsedScenario): any {
  if (!selectors?.pages) return selectors;

  const stepTexts = scenario.steps.map((s) => s.text.toLowerCase()).join(' ');
  const matchedPages: Record<string, any> = {};

  for (const [pagePath, elements] of Object.entries(selectors.pages)) {
    const pathKeywords = pagePath.toLowerCase().split('/').filter(Boolean);
    if (pathKeywords.some((kw) => stepTexts.includes(kw))) {
      matchedPages[pagePath] = elements;
    }
  }

  const result: any = { ...selectors };
  if (Object.keys(matchedPages).length > 0) {
    result.pages = matchedPages;
  }
  if (selectors.login) {
    const loginKeywords = ['login', 'connexion', 'email', 'password', 'mot de passe', 'identifiants'];
    if (loginKeywords.some((kw) => stepTexts.includes(kw))) {
      result.login = selectors.login;
    } else {
      delete result.login;
    }
  }
  return result;
}

function buildScenarioPrompt(
  feature: ParsedFeature,
  scenario: ParsedScenario,
  options: GeneratorOptions = {}
): GeminiContent[] {
  loadDotEnv();
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  const filteredSelectors = filterSelectorsForScenario(options.selectors ?? {}, scenario);

  const featureContext = JSON.stringify(
    {
      featureName: feature.featureName ?? null,
      scenario: {
        name: scenario.name,
        steps: scenario.steps
      },
      baseUrl,
      providedCredentials: options.credentials ?? {},
      knownSelectors: filteredSelectors
    },
    null,
    2
  );

  const systemInstruction = [
    'You are a senior QA automation engineer generating clean Playwright Test TypeScript.',
    'CRITICAL: Use test.describe() and test() (NOT describe/it). Always await expect().',
    'Return only executable TypeScript. Import: import { test, expect } from "@playwright/test";',
    'Map Given to navigation, When to actions, Then to assertions.',
    'If a step cannot be mapped, emit a single "// TODO:" comment on its own line.',
    `Navigate to "${baseUrl}" as the starting page. Do NOT append extra path segments unless the Gherkin step specifies a known page path from knownSelectors.pages.`,
    'Use providedCredentials only when the step asks for user credentials without a concrete value. Use exact Gherkin data otherwise.',
    'Embed verified selectors from knownSelectors directly in locator calls (e.g. page.locator(selector)). Do NOT define a knownSelectors constant.',
    'For unknown selectors use getByRole/getByLabel/getByPlaceholder/locator() with a best-effort CSS selector and a "// TODO:" comment.',
    'Only call expect(page) for URL checks. Use expect(page.locator(...)) for text/visibility.',
    'NEVER invent error/success message text — assert generic alert region: page.locator(".alert, .error, [role=\\"alert\\"], .flash, .message").first()',
    'Each test asserts ONE outcome: either URL OR visibility, never both.',
    'NEVER emit toHaveURL with a catch-all pattern. For redirects without a specified URL, assert the page left the login path.',
    'Always prefix expect() with await.',
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

  const provider = (process.env.TEST_LLM_PROVIDER ?? 'groq').toLowerCase();

  let apiKey: string;
  let baseUrl: string;
  let model: string;

  apiKey = process.env.GROQ_API_KEY2?.trim() ?? '';
  baseUrl = (process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  model = process.env.GROQ_TEST_MODEL ?? process.env.GROQ_MODEL ?? 'openai/gpt-oss-20b';

  if (!apiKey) {
    throw new Error(`Missing GROQ_API_KEY for Playwright test generation.`);
  }

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
        `LLM API request failed with status ${response.status}`,
        `provider=${provider}`,
        `model=${model}`,
        `message=${payload.error?.message ?? 'unknown error'}`
      ].join(' | ');

      throw new Error(details);
    }

    const suggestedDelay = parseRetryDelay(payload.error?.message);
    const delayMs = suggestedDelay ?? Math.min(5000 * 2 ** (attempt - 1), 60000);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const content = payload.choices?.[0]?.message?.content;

  if (!content || typeof content !== 'string') {
    throw new Error('LLM API returned an empty completion payload.');
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

function fixPlaywrightConventions(content: string): string {
  let fixed = content;

  // Fix bare describe() → test.describe()
  fixed = fixed.replace(/^(\s*)describe\s*\(/gm, '$1test.describe(');

  // Fix bare it() → test()
  fixed = fixed.replace(/^(\s*)it\s*\(/gm, '$1test(');

  // Fix expect() without import (already handled by wrapTestFile)
  return fixed;
}

function wrapTestFile(feature: ParsedFeature, scenario: ParsedScenario, body: string): string {
  let normalizedBody = sanitizeContradictoryAssertions(body.trim());
  normalizedBody = fixPlaywrightConventions(normalizedBody);
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

        await new Promise((r) => setTimeout(r, 15000));
      }
    }
  }

  return generatedFiles;
}
