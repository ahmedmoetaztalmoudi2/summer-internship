import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ParsedFeature, ParsedScenario } from './parser.js';
import { loadDotEnv } from './env.js';

export interface GeneratedTestFile {
  scenarioName: string;
  filePath: string;
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

function toFileName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

function buildScenarioPrompt(feature: ParsedFeature, scenario: ParsedScenario): GeminiContent[] {
  loadDotEnv();
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  const featureContext = JSON.stringify(
    {
      featureName: feature.featureName ?? null,
      scenario: {
        name: scenario.name,
        steps: scenario.steps
      },
      baseUrl
    },
    null,
    2
  );

  const systemInstruction = [
    'You are a senior QA automation engineer generating clean Playwright Test TypeScript.',
    'Return only executable TypeScript code.',
    'Use: import { test, expect } from "@playwright/test";',
    'Use flexible selectors: try getByRole, getByLabel, getByPlaceholder, getByTestId, or locator() with CSS selectors.',
    'If a selector is uncertain, add a TODO comment indicating the user should verify the actual selector.',
    'Map Given steps to navigation, When steps to actions, Then steps to assertions.',
    'If a step cannot be mapped precisely, keep a concise TODO comment in the test file instead of inventing unsupported behavior.',
    `Always use the full base URL "${baseUrl}" for navigation. Do not use relative paths like "/login". Instead use "${baseUrl}/login".`
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

async function callGeminiForTestCode(feature: ParsedFeature, scenario: ParsedScenario): Promise<string> {
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
  const contents = buildScenarioPrompt(feature, scenario);

  const requestBody: GeminiRequest = {
    contents,
    generationConfig: {
      temperature
    }
  };

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const payload = (await response.json().catch(() => ({}))) as GeminiResponse;

  if (!response.ok) {
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

  const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content || typeof content !== 'string') {
    throw new Error('Gemini API returned an empty completion payload.');
  }

  return stripCodeFences(content);
}

function wrapTestFile(feature: ParsedFeature, scenario: ParsedScenario, body: string): string {
  const normalizedBody = body.trim();
  const hasImport = /^import\s+\{\s*test\s*,\s*expect\s*\}\s+from\s+['"]@playwright\/test['"]/m.test(normalizedBody);
  const hasScenarioTest = normalizedBody.includes(`test(${toLiteral(scenario.name)}`);

  if (hasImport && hasScenarioTest) {
    return `${normalizedBody}\n`;
  }

  const lines: string[] = [];
  lines.push("import { test, expect } from '@playwright/test';");
  lines.push('');

  if (feature.featureName) {
    lines.push(`test.describe(${toLiteral(feature.featureName)}, () => {`);
    lines.push(`  test(${toLiteral(scenario.name)}, async ({ page }) => {`);
    for (const line of normalizedBody.split(/\r?\n/)) {
      lines.push(`    ${line}`);
    }
    lines.push('  });');
    lines.push('});');
  } else {
    lines.push(`test(${toLiteral(scenario.name)}, async ({ page }) => {`);
    for (const line of normalizedBody.split(/\r?\n/)) {
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
  await cleanGeneratedDirectory(outputDir);

  const generatedFiles: GeneratedTestFile[] = [];

  for (const scenario of feature.scenarios) {
    const fileName = `${toFileName(scenario.name) || 'generated-scenario'}.spec.ts`;
    const filePath = path.join(outputDir, fileName);
    const generatedContent = await callGeminiForTestCode(feature, scenario);
    const content = wrapTestFile(feature, scenario, generatedContent);

    await writeFile(filePath, content, 'utf8');
    generatedFiles.push({
      scenarioName: scenario.name,
      filePath
    });
  }

  return generatedFiles;
}
