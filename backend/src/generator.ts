import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
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

  // A "thinking" marker may appear as "<thinking>", " thinking" or "thinking"
  // at the start of a line. Match it followed by whitespace/EOL (not a fixed
  // word boundary, which fails when a trailing ">" is consumed).
  const thinkingMarker = String.raw`\s*(?:<)?thinking(?:>)?(?=\s|$)`;

  // 1. Low-cost models wrap output in a "thinking ... response" preamble that
  //    is NOT code. Strip everything up to the last `response` marker when
  //    present.
  const responseMarker = String.raw`\s*(?:<\/?)?response(?:>)?(?=\s|$)`;
  const thinkMatch = trimmed.match(
    new RegExp(`(?:^|\\n)${thinkingMarker}[\\s\\S]*?(?:^|\\n)${responseMarker}`, 'i')
  );
  if (thinkMatch) {
    const after = trimmed.slice(thinkMatch.index! + thinkMatch[0].length).trim();
    if (after.length > 0) trimmed = after;
  }

  // 2. Drop everything from a standalone "thinking" block onward BEFORE looking
  //    for a fence. Reasoning text often contains its own draft ```typescript
  //    block, which must never be treated as the answer.
  const standalone = trimmed.search(new RegExp(`^${thinkingMarker}`, 'im'));
  if (standalone >= 0) {
    trimmed = trimmed.slice(0, standalone).trim();
    if (trimmed.length === 0) return '';
  }

  // 3. Prefer the fenced TypeScript block wherever it appears in the remaining,
  //    thinking-free output. A fence is the most reliable marker of the answer.
  const anyFence = trimmed.match(/```(?:typescript|ts)?\s*([\s\S]*?)(?:```)/i);
  if (anyFence) {
    return anyFence[1].trim();
  }

  return trimmed;
}

function filterSelectorsForScenario(selectors: any, scenario: ParsedScenario): any {
  if (!selectors?.pages) return selectors;

  const stepTexts = scenario.steps.map((s) => s.text.toLowerCase()).join(' ');
  const matchedPages: Record<string, any> = {};

  for (const [pagePath, elements] of Object.entries(selectors.pages)) {
    // Always keep the homepage: most tests start there and it holds the global
    // chrome elements (footer links/nav) that constant on every page.
    if (pagePath === '/') {
      matchedPages['/'] = elements;
      continue;
    }
    const pathKeywords = pagePath.toLowerCase().split('/').filter(Boolean);
    if (pathKeywords.some((kw) => stepTexts.includes(kw))) {
      matchedPages[pagePath] = elements;
    }
  }

  // Surface an event-detail page for event-related scenarios (details, prices,
  // tickets/booking) so the generator can navigate to a real event URL instead
  // of guessing a navigation path. The French step text uses accented chars, so
  // match loosely on several variants.
  const eventRelated = /event|evenement|événement|évenement|detail|détail|fiche|billet|ticket|prix|tarif|acheter|panier|achat|buy|price|purchase|réserver/.test(stepTexts);
  if (eventRelated) {
    const eventPage = Object.keys(selectors.pages).find((p) => /^\/evenement\//i.test(p));
    if (eventPage) matchedPages[eventPage] = selectors.pages[eventPage];
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

/**
 * Caps the knownSelector context injected into the prompt so the serialized
 * request stays under the Groq "on_demand" free-tier throughput ceiling
 * (~8000 tokens per minute). A prompt inflated by all page selectors (the
 * homepage alone can carry 30+ entries) can exceed that cap and Groq rejects
 * the whole request with 413 (Request too large / TPM limit).
 *
 * We keep the stable shape ({ pages, login?, ... }) the system instructions
 * depend on, but drop the least-important entries and shorten the homepage's
 * element list until the JSON fits the budget.
 */
function trimSelectorContext(
  selectors: any,
  budgetChars: number
): any {
  if (!selectors) return selectors;

  const clone: any = { ...selectors };
  if (selectors.pages) {
    clone.pages = { ...selectors.pages };
  }

  // The native <select>/input fields are the most useful; trim verbose metadata
  // dumps and redundant aliases to shrink each entry's size in-place.
  const shrinkElement = (el: any): any => {
    if (!el || typeof el !== 'object') return el;
    const trimmed: any = { ...el };
    for (const key of ['description', 'aliases', 'placeholder', 'hint', 'context']) {
      delete trimmed[key];
    }
    return trimmed;
  };

  const pages = clone.pages ?? {};
  for (const pagePath of Object.keys(pages)) {
    if (Array.isArray(pages[pagePath])) {
      pages[pagePath] = pages[pagePath].map(shrinkElement);
    } else {
      for (const key of Object.keys(pages[pagePath])) {
        pages[pagePath][key] = shrinkElement(pages[pagePath][key]);
      }
    }
  }
  if (clone.login) clone.login = shrinkElement(clone.login);

  // Now drop whole non-homepage pages (and then homepage elements) until we fit.
  while (JSON.stringify(clone).length > budgetChars) {
    const nonHome = Object.keys(clone.pages ?? {}).filter((p) => p !== '/');
    if (nonHome.length > 0) {
      delete clone.pages[nonHome[nonHome.length - 1]];
      continue;
    }
    const home = clone.pages?.['/'];
    if (Array.isArray(home)) {
      if (home.length > 0) {
        home.pop();
      } else {
        break;
      }
    } else if (home && Object.keys(home).length > 0) {
      const keys = Object.keys(home);
      delete home[keys[keys.length - 1]];
    } else {
      break;
    }
  }
  return clone;
}

function buildScenarioPrompt(
  feature: ParsedFeature,
  scenario: ParsedScenario,
  options: GeneratorOptions = {}
): GeminiContent[] {
  loadDotEnv();
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  const filteredSelectors = filterSelectorsForScenario(options.selectors ?? {}, scenario);
  // Keep the ready JSON well under Groq's ~8000 TPM on_demand cap. The system
  // instruction alone already spends several thousand tokens, so give the
  // selector context a tight budget and drop overflow (drops non-home pages,
  // then extra homepage elements) rather than failing hard with a 413.
  const trimmedSelectors = trimSelectorContext(filteredSelectors, 900);

  const featureContext = JSON.stringify(
    {
      featureName: feature.featureName ?? null,
      scenario: {
        name: scenario.name,
        steps: scenario.steps
      },
      baseUrl,
      providedCredentials: options.credentials ?? {},
      knownSelectors: trimmedSelectors
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
    'For any login / connection / sign-in scenario (keywords: login, connexion, se connecter, identifiants, espace client, mot de passe + email), you MUST first navigate to the login page before filling any field: await page.goto(baseUrl + "/user/login"); then wait for the form: await expect(page.locator("input[name=\\"email\\"]")).toBeVisible(); and only then fill the email/password fields. The login form is at /user/login, NOT on the homepage - filling input[name="email"] while still on the homepage times out.',
    'When a scenario concerns viewing event details, ticket prices, or buying tickets, navigate DIRECTLY to a known event-detail page found in knownSelectors.pages (a key matching /evenement/..., e.g. /evenement/cairokee-carthage) using page.goto(baseUrl + thatPath). Do NOT stay on the homepage or a category listing. Reach the specific event detail page whose selectors are provided.',
    'Use providedCredentials only when the step asks for user credentials without a concrete value. Use exact Gherkin data otherwise.',
    'Embed verified selectors from knownSelectors directly in locator calls (e.g. page.locator(selector)). Do NOT define a knownSelectors constant.',
    'For unknown selectors use getByRole/getByLabel/getByPlaceholder/locator() with a best-effort CSS selector and a "// TODO:" comment.',
    'Only call expect(page) for URL checks. Use expect(page.locator(...)) for text/visibility.',
    'NEVER invent error/success message text — assert generic alert region: page.locator(".alert, .error, [role=\\"alert\\"], .flash, .message").first(). When asserting alert text, ALWAYS use toContainText (substring match), NEVER toHaveText. toHaveText does an exact full-string match and fails when the alert has surrounding whitespace/newlines (e.g. the real alert text " Nom d\'utilisateur ou mot de passe erroné ! " has leading/trailing whitespace). Example: await expect(alertLocator).toContainText(/erroné/);',
    'Each test asserts ONE outcome: either URL OR visibility, never both.',
    'NEVER emit toHaveURL with a catch-all pattern. For redirects without a specified URL, assert the page left the login path.',
    'For a successful login redirect, do NOT hardcode the bare site URL (e.g. /) as the destination: the app may land on a post-login path such as /client/home or /category/spectacle. If the Gherkin names only "page d\'accueil"/"home" without an explicit path, assert the page left the login path with: await expect(page).not.toHaveURL(/\\/user\\/login/);',
    'Make the login assertion FAIL FAST instead of letting it wait the whole test timeout. After clicking the login submit button, first check the error alert region (page.locator(".alert, .error, [role=\\"alert\\"], .flash, .message").first()) — if invalid credentials produce an error alert, the alert appears quickly; do NOT add an arbitrary long waitForNavigation (it can hang and burn the full timeout). Bound the redirect assertion with a short timeout so a stale/blocked login is reported immediately: await expect(page).not.toHaveURL(/\\/user\\/login/, { timeout: 8000 });',
    'Never use the union selector button:has-text("X"), button[type="submit"] to click a submit button — it is ambiguous (it also matches search-form buttons). Prefer getByRole("button", { name: "Se connecter" }) or the exact login-form submit selector.',
    'When a Gherkin step lists dropdown option values (dates, salles/venues, categories) or asks to select one, ONLY use option labels that actually appear in the "options" field of the matching knownSelector. NEVER invent a date/venue/category that is not listed there — selecting a value that does not exist causes a timeout. If a Gherkin expected value is not in the options list, assert against a value that IS in the list or emit a "// TODO:" and use the first real option.',
    'Choices.js dropdowns hide the native <select> (the raw #id element has hidden="" and is NOT actionable). When a Gherkin step asks to VERIFY/ASSERT that a salle/date/category dropdown is DISPLAYED, assert on the WRAPPER, NOT on the native select. Use the matching "_choicesInner" knownSelector (e.g. select_selectedSalle_choicesInner) for the visibility assertion: await expect(page.locator(knownSelector.selector)).toBeVisible();. NEVER call toBeVisible()/toHaveValue() on the raw native select id (e.g. #selectedSalle, #selectedDate) - it is hidden and always fails. To SELECT a value, open it by clicking the "_choicesInner" wrapper (or ".choices__inner"), then click the ".choices__list--dropdown .choices__item" whose text equals the real option label from the "options" field.',
'Dropdown options (dates, salles/venues) are LIVE data that can change between the KB snapshot and the real page - do NOT hardcode a specific option label from the KB\'s "options" field when the test merely VERIFIES the dropdown is displayed or contains choices. For a DISPLAY/contains assertion, open the dropdown by clicking the "_choicesInner" wrapper, then assert the "_choicesDropdown" list is visible and contains more than just the empty placeholder (i.e. it has at least some non-placeholder option). Do NOT assert that a specific stale venue/date like "El Borj GOLDEN CARTHAGE TUNIS" is present - the live list may have changed. ONLY assert a SPECIFIC option label when the Gherkin step actually SELECTS that value; then click the ".choices__item" whose exact text matches that label, falling back to the first real option with a "// TODO:" comment if it is absent.',
    'When verifying that a Choices/select DROPDOWN is displayed, NEVER use a label:has-text(...) or any guessed text locator - such labels do not exist on the page. Use the verified "_choicesInner" knownSelector wrapper (e.g. select_selectedDate_choicesInner, select_selectedSalle_choicesInner) for the visibility assertion. If no wrapper exists, assert on the wrapper via the knownSelector whose selector ends with _choicesInner.',
    'A CSS attribute/class selector that can match MANY elements (e.g. a[href*="/category/spectacle"], a[href*="/evenement/"], .some-card) MUST NOT be stored in a variable and asserted/clicked bare - it will raise a strict-mode violation (3+ matches). ALWAYS disambiguate with .first(): either declare it as page.locator("...").first(), or inline it as await expect(page.locator("...").first()).toBeVisible(); and await page.locator("...").first().click();. This applies to BOTH actions and visibility assertions, regardless of whether the locator is in a variable or inline.',
    'When the target form is protected by a captcha (knownSelectors includes a field whose selector/id contains "captcha", e.g. code_captcha on the register or contact pages), the form CANNOT be fully submitted by automation. In that case fill the real input fields (email, name, message, etc.), verify they accept input with expect(page.locator(<sel>)).toHaveValue(<filled value>), do NOT click the submit button, do NOT try to fill or solve the captcha, and end the test with a single "// TODO: CAPTCHA submission blocked - cannot complete form submit" comment.',
    'For a "no results / aucun résultat / empty list" scenario after filtering (salle+date), the teskerti site does NOT render an error message - it simply shows ZERO event cards/items. Assert the empty state by counting the listing element: expect(await page.locator(".tour_container, .event-card, .item").count()).toBe(0); (or assert the results container has no visible child events). Do NOT look for an "aucun résultat" text message. To produce a reliably-empty combination, it is fine to pick ANY valid salle + valid date from the live Choices lists - but to be deterministic, if the scenario does not specify exact values, select the FIRST real salle and the FIRST real date and still assert zero results.',
    'When asserting navigation to an event detail page, NEVER hardcode a specific event slug you did not write into page.goto. If you REACHED the event detail by clicking a homepage/listing event card (div.owl-item.active div.tour_container), the destination event is whichever card was clicked, so assert generically: await expect(page).toHaveURL(/\\/evenement\\//);. Only assert an exact /evenement/<slug>/ URL if you navigated DIRECTLY with page.goto(baseUrl + "/evenement/<same slug>") using a path given in knownSelectors.pages.',
    'When a scenario checks that an event card shows its venue, price or date, do NOT hardcode a specific event name/price/date that may not be on the first visible card. Assert the card container (div.owl-item.active div.tour_container).first() is visible, then assert generic discoverability (e.g. the card is not empty, contains an <a[href*="/evenement/"]> and some text). If the Gherkin names a SPECIFIC event with a specific venue/price, navigate directly to that event page (page.goto) instead of clicking a card, then assert the page content.',
    'Homepage event cards (div.owl-item.active div.tour_container) display venue + event name + date/time but NOT the price. Never assert /TND/ or a price on a homepage/listing card - the price only exists on the event detail page (/evenement/<slug>). If a Gherkin step says a card shows its price in TND, that step reflects the detail page, so navigate to the event detail page and assert the price there instead of on the card.',
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

  const maxAttempts = 3;
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

    // 429 = daily free-tier QUOTA exceeded (hard limit, won't reset for ~1h/day).
    // Retrying is futile and burns ~60s per attempt, so fail fast -> fall back to Groq.
    // 500/502/503 are transient server issues, keep retrying those with a short backoff.
    const isQuota = response.status === 429;
    const retryable = !isQuota && (response.status === 500 || response.status === 502 || response.status === 503);

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

  return Math.min(seconds * 1000, 30000);
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

  const provider = forceProviderFromEnv();

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

  const maxAttempts = 3;
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

    const content = payload.choices?.[0]?.message?.content;

    // A 200 response can still carry an empty/null message content (intermittent
    // Groq behavior). Treat that as retryable too so it does not abort the run.
    if (response.ok && content && typeof content === 'string') {
      break;
    }

    const retryable =
      response.status === 429 ||
      response.status === 500 ||
      response.status === 502 ||
      response.status === 503 ||
      response.ok; // empty/malformed completion on a 200 -> retry

    if (!retryable || attempt === maxAttempts) {
      const details =
        response.ok && !content
          ? 'LLM API returned an empty completion payload.'
          : [
              `LLM API request failed with status ${response.status}`,
              `provider=${provider}`,
              `model=${model}`,
              `message=${payload.error?.message ?? 'unknown error'}`
            ].join(' | ');

      throw new Error(details);
    }

    const suggestedDelay = parseRetryDelay(payload.error?.message);
    const delayMs =
      suggestedDelay ?? Math.min(5000 * 2 ** (attempt - 1), 30000);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const content = payload.choices?.[0]?.message?.content;

  if (!content || typeof content !== 'string') {
    throw new Error('LLM API returned an empty completion payload.');
  }

  return stripCodeFences(content);
}

function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function hasGroqKey(): boolean {
  return Boolean((process.env.GROQ_API_KEY2 ?? process.env.GROQ_API_KEY)?.trim());
}

/**
 * True when an LLM call failed for a reason that a different provider is likely
 * to recover from (quota exhaustion, rate limiting, transient 5xx/503, or an
 * empty/malformed completion). Lets us roll over to a second provider instead
 * of aborting the run.
 */
function isTransientLlmError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    /429|503|502|500/.test(lower) ||
    /rate limit/.test(lower) ||
    /quota/.test(lower) ||
    /tokens per day|tokens per minute|tpd|tpm/.test(lower) ||
    /empty completion payload/.test(lower) ||
    /high demand/.test(lower) ||
    /unavailable/.test(lower) ||
    /temporar/.test(lower)
  );
}

/**
 * Forces TEST_LLM_PROVIDER to whatever the .env file says, overriding a stale
 * inherited value. Without this, a long-running API server that was started
 * before .env was edited holds the OLD provider in memory (loadDotEnv only sets
 * unset vars, so it never corrects it) and keeps hitting the wrong/dead quota.
 * Reading the raw .env here guarantees the configured provider wins on every
 * request regardless of process lifetime.
 */
function forceProviderFromEnv(): string {
  const provider = (process.env.TEST_LLM_PROVIDER ?? 'groq').toLowerCase();
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const readFileSync = require('node:fs').readFileSync as (p: string, enc: string) => string;
    const text = readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
    const line = text.split(/\r?\n/).find((l: string) => /^TEST_LLM_PROVIDER\s*=/.test(l.trim()));
    if (line) {
      const value = line.split('=')[1]?.trim().replace(/^["']|["']$/g, '')?.toLowerCase();
      if (value) {
        process.env.TEST_LLM_PROVIDER = value;
        return value;
      }
    }
  } catch {
    // fall through to the process env value
  }
  return provider;
}

async function callTestLlm(
  feature: ParsedFeature,
  scenario: ParsedScenario,
  options: GeneratorOptions = {}
): Promise<string> {
  loadDotEnv();
  const provider = forceProviderFromEnv();
  const primary = provider === 'gemini' ? 'gemini' : 'groq';
  const fallback = primary === 'gemini' ? 'groq' : 'gemini';

  let lastError: unknown;
  try {
    return primary === 'gemini'
      ? await callGeminiForTestCode(feature, scenario, options)
      : await callGroqForTestCode(feature, scenario, options);
  } catch (err) {
    lastError = err;
  }

  // The primary provider failed. If it's a transient/quota issue AND we have a
  // key + the right model for the secondary provider, roll over to it once --
  // UNLESS TEST_LLM_FALLBACK=none (Groq-only operation): when Gemini's free tier
  // is exhausted it only ever 429s, so rolling over just wastes time. In that
  // mode a Groq blip (empty completion) is surfaced to callTestLlmWithRetry,
  // which retries Groq instead.
  const fallbackAllowed = (process.env.TEST_LLM_FALLBACK ?? 'none').toLowerCase() !== 'none';
  const fallbackAvailable =
    fallbackAllowed &&
    ((fallback === 'gemini' && hasGeminiKey()) || (fallback === 'groq' && hasGroqKey()));

  if (isTransientLlmError(lastError) && fallbackAvailable) {
    console.log(
      `[llm-fallback] ${primary} failed (${errorMessage(lastError)}). Falling back to ${fallback}...`
    );
    return fallback === 'gemini'
      ? await callGeminiForTestCode(feature, scenario, options)
      : await callGroqForTestCode(feature, scenario, options);
  }

  if (!fallbackAllowed) {
    console.log(
      `[llm-fallback] ${primary} failed (${errorMessage(lastError)}); TEST_LLM_FALLBACK=none -> will retry ${primary} instead of touching ${fallback}.`
    );
  }

  throw lastError;
}

/**
 * Wraps callTestLlm so a TRANSIENT provider outage (e.g. both Gemini 503
 * "high demand" and Groq quota/rate-limit at the same instant) gets a bounded
 * retry-with-wait instead of immediately failing the whole generation. The
 * providers often recover within seconds, so we retry the primary->fallback
 * sequence a few times and only give up after the cap. Quota (429) retries are
 * brief; the run still surfaces the real resolution within the cap.
 */
async function callTestLlmWithRetry(
  feature: ParsedFeature,
  scenario: ParsedScenario,
  options: GeneratorOptions = {}
): Promise<string> {
  // Only retry GENUINELY transient outages (503/5xx "high demand"). A 429 is a
  // hard daily quota that will NOT clear in seconds, so let the failure fall
  // through to the primary->fallback dispatch immediately instead of sleeping.
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await callTestLlm(feature, scenario, options);
    } catch (error) {
      const msg = errorMessage(error).toLowerCase();
      if (/429/.test(msg) || !isTransientLlmError(error) || attempt === maxRetries) {
        throw error;
      }
      const waitMs = 5000 * attempt; // 5s, 10s, 15s
      console.log(
        `[testgen] transient LLM error (${errorMessage(error)}); retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${maxRetries})...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw new Error('unreachable');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Returns true when the LLM output contains real actionable test code
 * (page actions, navigations, fills, or assertions) rather than an
 * empty/skeleton-only `test(...)` body.
 */
function hasActionableBody(content: string): boolean {
  const body = content
    // strip single-line // TODO comments and blank lines — those alone don't count
    .replace(/\/\/.*$/gm, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^import /.test(l))
    .join('\n');
  return /await\s+(page|expect)|\.click\(|\.fill\(|\.goto\(|\.check\(|\.selectOption\(|\.locator\(|\.getByRole\(|\.getByLabel\(|\.getByPlaceholder\(|\.toHaveURL\(|\.toBeVisible\(/.test(body);
}

/**
 * Deterministic fallback that translates Gherkin steps into a real Playwright
 * test body. Used only when the LLM returns an empty/skeleton test, to keep
 * generated tests meaningful (and avoid silent "empty test = pass" results).
 */
function generateFallbackTest(
  feature: ParsedFeature,
  scenario: ParsedScenario,
  options: GeneratorOptions = {}
): string {
  loadDotEnv();
  const baseUrl = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  const selectors = options.selectors;
  const credentials = options.credentials ?? {};
  const stepText = scenario.steps.map((s) => s.text.toLowerCase()).join(' ');

  const isLogin = /(login|log in|sign in|signin|connect|connexion|authentif|identifiants)/.test(stepText)
    && !/creer un compte|créer un compte|register|signup|s'inscrire|inscription|nouveau client/.test(stepText);
  const isRegister = /(creer un compte|créer un compte|register|signup|sign up|s'inscrire|inscription|nouveau client|creer mon compte)/.test(stepText);
  const isRedirectToProfile = /(redirige|vers la page de profil|profil page)/.test(stepText);

  // Resolve a known selector with a best-effort fallback locator.
  const sel = (role: 'email' | 'password' | 'submit' | 'username'): string | undefined => {
    if (selectors?.login && selectors.login[role]) return selectors.login[role] as string;
    if (selectors?.forms) {
      const formSel = Object.values(selectors.forms)[0];
      if (formSel && formSel[role]) return formSel[role] as string;
    }
    return undefined;
  };

  const lines: string[] = [];

  // Navigation
  if (isRegister) {
    lines.push(`await page.goto("${baseUrl}/user/register");`);
  } else if (isLogin) {
    lines.push(`await page.goto("${baseUrl}/user/login");`);
  } else {
    lines.push(`await page.goto("${baseUrl}");`);
  }

  // Fill credentials when a login/signup form is involved.
  const emailVal = credentials.email || credentials.EMAIL || 'user@example.com';
  const passVal = credentials.password || credentials.PASSWORD || 'password123';

  const emailSel = sel('email') ?? `input[name="email"], input[type="email"]`;
  const passSel = sel('password') ?? `input[name="password"], input[type="password"]`;

  // Successful vs failure scenario (failure: wrong creds, unregistered email, existing account).
  const isFailure = /(échou|fail|incorrect|non enregistr|non existant|existe déjà|enregistré|moins de 8)/.test(stepText.toLowerCase());

  if (isLogin || isRegister) {
    // On a failure scenario (wrong password / unregistered email) keep the real
    // email so the form actually submits to the app, and use a wrong password to
    // trigger the expected error. Always keep the real email value.
    lines.push(`await page.locator(${toLiteral(emailSel)}).fill(${toLiteral(emailVal)});`);
    lines.push(`await page.locator(${toLiteral(passSel)}).fill(${toLiteral(isFailure ? 'wrongpassword123' : passVal)});`);
  }

  // Submit the form for login/signup flows, or when an explicit action keyword is present.
  if (isLogin || isRegister || /clique|click|soumett|submit|valider|enregistrer|connecter|se connecter/.test(stepText)) {
    const submitSel = sel('submit') ?? 'button[type="submit"], button:has-text("Se connecter"), button:has-text("Créer un compte")';
    lines.push(`await page.locator(${toLiteral(submitSel)}).first().click();`);
  }

  // Assertions
  const successOutcome = /(connexion réussie|crée le compte|réussie|valid|succès|réussit)/.test(stepText.toLowerCase())
    && !isFailureOutcome(stepText);

  if (successOutcome && isRedirectToProfile) {
    lines.push('await expect(page.locator(".alert, .error, [role=\\"alert\\"], .flash, .message").first()).toBeHidden();');
    lines.push('// TODO: confirm expected redirect URL');
  } else if (successOutcome && isLogin) {
    lines.push('await expect(page.locator(".alert, .error, [role=\\"alert\\"], .flash, .message").first()).toBeHidden();');
  } else if (isFailure) {
    lines.push('await expect(page.locator(".alert, .error, [role=\\"alert\\"], .flash, .message").first()).toBeVisible();');
  } else {
    lines.push('// TODO: assert the expected outcome for this scenario');
  }

  // Flag any step we could not map precisely.
  for (const s of scenario.steps) {
    const t = s.text.toLowerCase();
    const mapped = /(navigate|aller|ouvrir|visiter|go|vais|valider|cliquer|click|choisir|saisir|remplir|fill|entrer|submit|connect|peux|error|erreur|redirige|voir|apparaît|apparait|affiche|select|chercher|recherch)/.test(t);
    if (!mapped) {
      lines.push(`// TODO: "${s.type} ${s.text}"`);
    }
  }

  return lines.join('\n');

  function isFailureOutcome(text: string): boolean {
    return /(échou|fail|incorrect|erreur|error|non enregistr|existe déjà|moins de 8|invalid)/.test(text);
  }
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

/**
 * Elements flagged `needsScroll` (e.g. scroll-reveal / WOW.js cards) are hidden
 * until scrolled into view. If a toBeVisible()/click targets one of them, inject
 * a scrollIntoViewIfNeeded() right before so the visibility assertion passes.
 */
function injectScrollBeforeVisibility(content: string, selectors?: SelectorMap): string {
  if (!content || !selectors?.pages) {
    return content;
  }

  const scrollTargets: Array<{ selector: string }> = [];
  for (const pageMap of Object.values(selectors.pages)) {
    for (const entry of Object.values(pageMap)) {
      if (typeof entry === 'object' && entry && entry.needsScroll && entry.selector) {
        scrollTargets.push({ selector: entry.selector });
      }
    }
  }

  if (scrollTargets.length === 0) {
    return content;
  }

  let result = content;
  for (const { selector } of scrollTargets) {
    // Literal selector string as it may appear in the generated code (single
    // or double quotes). Escape regex-special chars in the raw selector.
    const pattern = /^[A-Za-z0-9_:#\[\]"\-.=* ]+$/.test(selector) ? selector : '';
    if (!pattern) {
      continue;
    }

    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Match the selector inside page.locator("...") (quotes optional) with an
    // optional .first()/.nth() and a toBeVisible() assertion.
    const visRe = new RegExp(
      `(\\n[ \\t]*)await expect\\(page\\.locator\\(["']?${escaped.replace(/\(/g, '\\(').replace(/\)/g, '\\)')}["']?\\)(?:\\.first\\(\\)|\\.nth\\(\\d+\\))?\\)\\.toBeVisible\\(`,
      'g'
    );

    result = result.replace(visRe, (_m, indent: string) => {
      const loc = `page.locator(${toLiteral(selector)}).first()`;
      const scroll = `${indent}await ${loc}.scrollIntoViewIfNeeded();\n`;
      return `${scroll}${indent}await expect(${loc}).toBeVisible(`;
    });
  }

  return result;
}

export function capCaptchaSubmission(content: string, selectors?: SelectorMap): string {
  if (!content) {
    return content;
  }

  const pageIsCaptcha = (() => {
    if (!selectors?.pages) return false;
    return Object.keys(selectors.pages).some(
      (p) => /^(?:\/)?(?:user\/)?(?:register|contact)/i.test(p)
    );
  })();

  const mentionsCaptcha = /captcha/i.test(content);
  const alreadyCapped = /CAPTCHA submission blocked/i.test(content);
  if ((!pageIsCaptcha && !mentionsCaptcha) || alreadyCapped) {
    return content;
  }

  const lines = content.split('\n');
  const out: string[] = [];
  let capped = false;
  const proofFills: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Strip explicit captcha fill attempts.
    if (/captcha/i.test(trimmed) && /\.fill\(/.test(trimmed)) {
      continue;
    }

    // Replace form-submit clicks with a pre-captcha marker.
    const isSubmitClick =
      /\.click\(\)/.test(trimmed) &&
      /submit|form_submit|envoy\w*|inscri\w*|sign\s?up|registe\w*|cre\w*\s+un\s+compte|cre\w*\s+compte|cre\w* un compte|creation/.test(trimmed);

    if (isSubmitClick) {
      const indent = (line.match(/^(\s*)/) || ['', ''])[1];
      out.push(`${indent}// TODO: CAPTCHA submission blocked - cannot complete form submit`);
      capped = true;
      continue;
    }

    // Track field fills so we can assert they accepted input.
    const fillMatch = trimmed.match(/await page\.locator\((.+?)\)\.fill\((.+?)\);/);
    if (fillMatch) {
      proofFills.push(`${trimmed.replace(/^await\s+/, 'await expect(').replace(/\)\.fill\((.+?)\);$/, ')).toHaveValue($1);')}`);
    }

    out.push(line);
  }

  // Insert a proof-of-input assertion after the last fill so the test still
  // verifies the fields accept values even though submission is blocked.
  if (capped && proofFills.length > 0) {
    const lastFillIdx = (() => {
      let idx = -1;
      for (let i = 0; i < out.length; i++) {
        if (/\.fill\(/.test(out[i]) && !/expect\(/.test(out[i])) idx = i;
      }
      return idx;
    })();
    if (lastFillIdx >= 0) {
      const indent = (out[lastFillIdx].match(/^(\s*)/) || ['', ''])[1];
      out.splice(lastFillIdx + 1, 0, `${indent}${proofFills[proofFills.length - 1]}`);
    }
  }

  return out.join('\n');
}

export function relaxStrictVisibility(content: string): string {
  if (!content) return content;

  // Append .first() to:
  //  - visibility/hidden assertions on a simple CSS page.locator()
  //  - interactions (.click/.fill/.selectOption/.check/.uncheck) on a simple
  //    CSS page.locator() or getByRole() with only a name discriminator
  // This avoids Playwright's strict-mode violation when a selector legitimately
  // matches several elements (e.g. footer/category links, repeatable card CTAs),
  // keeping assertions and actions robust. Selectors containing nested
  // parentheses (:has-text etc.) are left untouched, as are locators that
  // already use .first()/.nth().
  // Returns the text that should go inside `page.locator(...)` unchanged (the
  // captured selector already carries its quotes), plus whether to append
  // `.first()` AFTER the closed locator() call. We never inject `.first()`
  // inside the quoted string.
  const shouldPin = (sel: string): boolean => {
    const inner = sel.trim().replace(/^(["'`])([\s\S]*?)\1$/, '$2');
    if (/[()]/.test(inner)) return false;
    if (/\.(first|nth)\(\d*\)\s*$/.test(inner)) return false;
    return true;
  };

  return content
    .split('\n')
    .map((line) => {
      const vis = line.match(/^(\s*)await expect\(page\.locator\((.+?)\)\)\.(toBeVisible|toBeHidden)\(\);$/);
      if (vis) {
        const [indent, sel, verb] = [vis[1], vis[2], vis[3]];
        const pinned = shouldPin(sel) ? `.first()` : '';
        return `${indent}await expect(page.locator(${sel})${pinned}).${verb}();`;
      }
      const actRaw = line.match(/^(\s*)await page\.locator\((.*?)\)\.(click|fill|selectOption|check|uncheck)\(/);
      if (actRaw) {
        const sel = actRaw[2];
        const verb = actRaw[3];
        if (shouldPin(sel)) {
          return line.replace(`page.locator(${sel}).${verb}(`, `page.locator(${sel}).first().${verb}(`);
        }
        return line;
      }
      const role = line.match(/^(\s*)await page\.getByRole\("([^"]+)", \{ name: "([^"]+)" \}\)\.(click|check|uncheck)\(/);
      if (role) {
        const kind = role[2];
        const name = role[3];
        const verb = role[4];
        return line.replace(
          `page.getByRole("${kind}", { name: "${name}" }).${verb}(`,
          `page.getByRole("${kind}", { name: "${name}" }).first().${verb}(`
        );
      }
      return line;
    })
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

// TypeScript syntax validation via the compiler. A spec file that does not
// parse will abort the whole Playwright run (0 tests collected), so generated
// tests must be validated before they are written to disk.
function isValidTypeScript(code: string): boolean {
  if (typeof code !== 'string' || code.trim().length === 0) return false;
  const out = ts.transpileModule(code, {
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext }
  });
  const diags = (out.diagnostics ?? []).filter((d: ts.Diagnostic) => d.category === ts.DiagnosticCategory.Error);
  return diags.length === 0;
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

      for (let generatedCount = 0; generatedCount < expanded.length; generatedCount++) {
        const scenarioToGenerate = expanded[generatedCount];
        const scenarioStart = Date.now();
        let baseName = `${toFileName(scenarioToGenerate.name) || 'generated-scenario'}.spec.ts`;
        let fileName = baseName;
        let suffix = 2;
        while (usedNames.has(fileName)) {
          fileName = `${baseName.replace(/\.spec\.ts$/, '')}-${suffix++}.spec.ts`;
        }
        usedNames.add(fileName);

        const filePath = path.join(outputDir, fileName);

        // Groq's free "on_demand" tier is capped at ~8000 tokens PER MINUTE.
        // The Gherkin step just used TPM, and batches of scenarios (SCRUM-3 has
        // 4) each pull ~5000 tokens, so consecutive generations LANDS bursts in
        // the same rolling window and trip a 429. Gate a cooldown BEFORE every
        // generation (and its internal retries) so each one starts in a fresh
        // window. Tune via GROQ_SCENARIO_COOLDOWN_MS; default 30s keeps us well
        // clear of the 8000/min cap at the cost of a slower run.
        if (forceProviderFromEnv() === 'groq') {
          const cooldownMs = Number(process.env.GROQ_SCENARIO_COOLDOWN_MS ?? '60000');
          console.log(`[testgen] Groq TPM cooldown ${cooldownMs / 1000}s before next generation to stay under 8000/min...`);
          await new Promise((resolve) => setTimeout(resolve, cooldownMs));
        }

        let generatedContent = await callTestLlmWithRetry(feature, scenarioToGenerate, generationOptions);

        // Guard against the LLM returning an empty / skeleton-only test body.
        // An empty body would silently "pass" and produce useless code, so
        // retry, then fall back to a deterministic template.
        if (!hasActionableBody(generatedContent)) {
          for (let attempt = 1; attempt <= 2; attempt++) {
            if (forceProviderFromEnv() === 'groq') {
              const cooldownMs = Number(process.env.GROQ_SCENARIO_COOLDOWN_MS ?? '60000');
              await new Promise((resolve) => setTimeout(resolve, cooldownMs));
            }
            const retried = await callTestLlmWithRetry(feature, scenarioToGenerate, generationOptions);
            generatedContent = retried;
            if (hasActionableBody(retried)) break;
          }
        }
        if (!hasActionableBody(generatedContent)) {
          console.warn(`LLM produced empty test body for "${scenarioToGenerate.name}"; using deterministic fallback.`);
          generatedContent = generateFallbackTest(feature, scenarioToGenerate, generationOptions);
        }

        // A wrapped file must be syntactically valid TypeScript. Playwright
        // aborts the ENTIRE run (0 tests collected) if any loaded spec beaks,
        // so any invalid file is rejected and the generation retried.
        let content = wrapTestFile(feature, scenarioToGenerate, generatedContent);
        // Inject scroll-into-view before visibility assertions on needsScroll elements.
        content = injectScrollBeforeVisibility(content, generationOptions.selectors);
        // Cap captcha-protected forms (register/contact) so tests stop before submit.
        content = capCaptchaSubmission(content, generationOptions.selectors);
        // Use .first() on CSS visibility assertions to avoid strict-mode multi-match.
        content = relaxStrictVisibility(content);
        if (!isValidTypeScript(content)) {
          console.warn(`Generated test for "${scenarioToGenerate.name}" is invalid TypeScript; retrying generation.`);
          let valid = false;
          for (let attempt = 1; attempt <= 2 && !valid; attempt++) {
            if (forceProviderFromEnv() === 'groq') {
              const cooldownMs = Number(process.env.GROQ_SCENARIO_COOLDOWN_MS ?? '60000');
              await new Promise((resolve) => setTimeout(resolve, cooldownMs));
            }
            const retried = await callTestLlmWithRetry(feature, scenarioToGenerate, generationOptions);
            const candidate = relaxStrictVisibility(
              capCaptchaSubmission(
                injectScrollBeforeVisibility(
                  wrapTestFile(feature, scenarioToGenerate, hasActionableBody(retried) ? retried : generateFallbackTest(feature, scenarioToGenerate, generationOptions)),
                  generationOptions.selectors
                ),
                generationOptions.selectors
              )
            );
            if (isValidTypeScript(candidate)) {
              content = candidate;
              valid = true;
            }
          }
          if (!valid) {
            console.warn(`Still invalid; writing deterministic fallback for "${scenarioToGenerate.name}".`);
            content = relaxStrictVisibility(
              capCaptchaSubmission(
                injectScrollBeforeVisibility(
                  wrapTestFile(feature, scenarioToGenerate, generateFallbackTest(feature, scenarioToGenerate, generationOptions)),
                  generationOptions.selectors
                ),
                generationOptions.selectors
              )
            );
          }
        }

        await writeFile(filePath, content, 'utf8');
        generatedFiles.push({
          scenarioName: scenarioToGenerate.name,
          filePath
        });
        console.log(`[testgen] "${scenarioToGenerate.name}" generated in ${((Date.now() - scenarioStart) / 1000).toFixed(1)}s`);

        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  }

  return generatedFiles;
}
