import { getDomainFromUrl, loadSelectorMap } from '../storage.js';
import type { SelectorMap } from '../selector-types.js';
import { RULES, type RuleContext } from './rules.js';
import type { FailureAnalysisInput, FailureReport, RootCause } from './types.js';
import { FAILURE_CATEGORIES, ROOT_CAUSES } from './types.js';

/** Removes ANSI escape sequences from Playwright's colored error output. */
function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/** Compacts whitespace so selector strings can be compared reliably. */
function normalizeSelector(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const LOCATOR_LINE_PATTERNS: RegExp[] = [
  /waiting for locator\([^\n]*\)/gi,
  /Locator:\s*locator\([^\n]*\)/gi,
  /locator\('[^\n]*'\)/gi,
  /getByText\([^\n]*\)/gi,
  /getByRole\([^\n]*\)/gi,
  /getByLabel\([^\n]*\)/gi,
  /getByPlaceholder\([^\n]*\)/gi,
  /getByTestId\([^\n]*\)/gi
];

/** Isolates the most specific locator from a "waiting for locator(...)" line. */
function extractFailingLocator(locatorLines: string[], errorText: string): string | undefined {
  const lines = locatorLines.length > 0 ? locatorLines : [];

  const explicit = errorText.match(/Locator:\s*locator\('([^']+)'\)/i);
  if (explicit) {
    return explicit[1];
  }

  for (const line of lines) {
    const match = line.match(/waiting for locator\('([^']+)'\)/i);
    if (match && match[1]) {
      return match[1];
    }
  }

  const lastLocator = lines[lines.length - 1] ?? undefined;
  return lastLocator ? lastLocator.replace(/^\s*-\s*/, '').trim() : undefined;
}

/** HTML element names that can legitimately appear inside error text (e.g. "is not a <select>"). */
const HTML_TAG_NAMES = new Set([
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
  'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
  'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label',
  'legend', 'li', 'link', 'main', 'map', 'mark', 'menu', 'meta', 'meter', 'nav', 'noscript',
  'object', 'ol', 'optgroup', 'option', 'output', 'p', 'param', 'picture', 'pre', 'progress',
  'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script', 'search', 'section', 'select', 'slot', 'small',
  'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template',
  'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr'
]);

/**
 * Extracts every literal scenario-outline placeholder (e.g. "<salle>") that
 * survived into the error text, ignoring HTML tag names. A placeholder in a
 * locator/string is strong evidence the Examples data was never substituted
 * -> data_issue.
 */
function extractPlaceholders(errorText: string): string[] {
  const tokens = new Set<string>();
  const pattern = /<([a-zA-Z][a-zA-Z0-9_-]*)>/g;
  for (const match of errorText.matchAll(pattern)) {
    const token = match[1];
    if (!HTML_TAG_NAMES.has(token.toLowerCase())) {
      tokens.add(token);
    }
  }
  return [...tokens];
}

/**
 * Flattens every selector string in the knowledge base into key -> selector.
 */
export function collectSelectorStrings(map: SelectorMap | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!map) {
    return out;
  }

  const add = (key: string, value: unknown): void => {
    if (typeof value === 'string') {
      out.set(key, value);
    } else if (value && typeof value === 'object') {
      const selector = (value as { selector?: unknown }).selector;
      if (typeof selector === 'string') {
        out.set(key, selector);
      }
    }
  };

  for (const [key, value] of Object.entries(map.login ?? {})) {
    add(`login.${key}`, value);
  }
  for (const [formKey, fields] of Object.entries(map.forms ?? {})) {
    for (const [key, value] of Object.entries(fields)) {
      add(`forms.${formKey}.${key}`, value);
    }
  }
  for (const [path, page] of Object.entries(map.pages ?? {})) {
    for (const [key, value] of Object.entries(page)) {
      add(`pages.${path}.${key}`, value);
    }
  }
  return out;
}

function collectLocatorLines(errorText: string): string[] {
  const lines: string[] = [];
  for (const pattern of LOCATOR_LINE_PATTERNS) {
    for (const match of errorText.matchAll(pattern)) {
      const line = normalizeSelector(match[0]);
      if (line && !lines.includes(line)) {
        lines.push(line);
      }
    }
  }
  return lines;
}

/**
 * Finds which knowledge-base selectors appear inside the failing locator(s).
 * This lets the agent confirm a selector was verified (vs guessed) and detect
 * widget-specific recipes (Choices wrappers) for a precise recommendation.
 */
function findKnownSelectorKeys(locatorLines: string[], selectorStrings: Map<string, string>): string[] {
  const joined = normalizeSelector(locatorLines.join(' '));
  if (!joined) {
    return [];
  }

  const keys: string[] = [];
  for (const [key, selector] of selectorStrings) {
    const normalized = normalizeSelector(selector);
    if (normalized && normalized.length >= 2 && joined.includes(normalized)) {
      keys.push(key);
    }
  }
  return keys;
}

function extractCallLog(errorText: string, messageLines: string[]): string | undefined {
  const index = messageLines.findIndex((line) => /call log:/i.test(line));
  if (index < 0) {
    return undefined;
  }
  return messageLines
    .slice(index + 1)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' | ');
}

/** Options (labels) of every element that carries a verified option list. */
function collectWidgetOptions(map: SelectorMap | null): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!map) {
    return out;
  }

  for (const [path, page] of Object.entries(map.pages ?? {})) {
    for (const [key, value] of Object.entries(page)) {
      if (value && typeof value === 'object') {
        const options = (value as { options?: { label?: string }[] }).options;
        if (Array.isArray(options)) {
          const labels = options
            .map((option) => option.label)
            .filter((label): label is string => Boolean(label));
          if (labels.length > 0) {
            out.set(`pages.${path}.${key}`, labels);
          }
        }
      }
    }
  }
  return out;
}

/**
 * Extracts the option text(s) requested through getByText(...) in the failing
 * locator and cross-references them against every widget option set in the
 * knowledge base. An option is only reported as unknown when it appears in NO
 * widget of the KB — because a salle option legitimately differs from a date
 * option, per-widget matching would produce false positives. Options that do
 * not exist anywhere are a test-data defect, not a wait issue.
 */
function findUnknownOptionTexts(
  locatorLines: string[],
  widgetOptions: Map<string, string[]>
): string[] {
  const requested: string[] = [];
  for (const line of locatorLines) {
    for (const match of line.matchAll(/getByText\('([^']+)'/gi)) {
      const text = match[1].trim();
      if (text && !requested.includes(text)) {
        requested.push(text);
      }
    }
  }
  if (requested.length === 0 || widgetOptions.size === 0) {
    return [];
  }

  const allLabels = new Set<string>();
  for (const labels of widgetOptions.values()) {
    for (const label of labels) {
      allLabels.add(label.toLowerCase());
    }
  }

  const unknown: string[] = [];
  for (const text of requested) {
    const normalized = text.toLowerCase();
    if (!allLabels.has(normalized) && !unknown.includes(text)) {
      unknown.push(text);
    }
  }
  return unknown;
}

function buildContext(input: FailureAnalysisInput, selectorMap: SelectorMap | null): RuleContext {
  const errorText = stripAnsi(input.error ?? '').trim();
  const messageLines = errorText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const locatorLines = collectLocatorLines(errorText);
  const hasResolved = /resolved to <[^>]*>/i.test(errorText) || /resolved to \d+ elements/i.test(errorText);
  const hasZeroResolved = /resolved to 0 elements/i.test(errorText);
  const selectorStrings = collectSelectorStrings(selectorMap);
  const knownSelectorKeys = findKnownSelectorKeys(locatorLines, selectorStrings);

  return {
    input,
    errorText,
    messageLines,
    callLog: extractCallLog(errorText, messageLines),
    locatorLines,
    failingLocator: extractFailingLocator(locatorLines, errorText),
    placeholders: extractPlaceholders(errorText),
    hasResolved,
    hasZeroResolved,
    knownSelectorKeys,
    unknownOptionTexts: findUnknownOptionTexts(locatorLines, collectWidgetOptions(selectorMap))
  };
}

const ROOT_CAUSE_EXPLANATIONS: Record<RootCause, string> = {
  bad_selector: 'the test targeted the wrong element, a guessed/stale selector, or a non-actionable element.',
  bad_test_data: 'the scenario data (Examples table / placeholder values / selected options) is invalid for this flow.',
  application_behavior: 'the application did not produce the expected result after a successful interaction.',
  environment_issue: 'the network, application availability or execution environment caused the failure.',
  timing_issue: 'the element or application state appears later than the wait strategy allows.',
  assertion_logic: 'the assertion (or its expected value) is incorrect or too strict for the real behavior.',
  unknown: 'not enough evidence was available to determine the cause.'
};

function confidenceFor(rule: (typeof RULES)[number], ctx: RuleContext): number {
  let confidence = rule.baseConfidence;

  if (ctx.messageLines.length > 1) {
    confidence += 0.02;
  }
  if (ctx.callLog) {
    confidence += 0.03;
  }

  const selectorRelated = ['strict_mode_violation', 'visibility_issue', 'selector_not_found', 'unsupported_interaction'].includes(rule.category);
  if (selectorRelated && ctx.knownSelectorKeys.length > 0) {
    confidence += 0.04;
  }
  if (rule.category === 'data_issue' && ctx.placeholders.length > 0) {
    confidence += 0.02;
  }
  if (rule.category === 'data_issue' && ctx.unknownOptionTexts.length > 0) {
    confidence += 0.02;
  }
  if (rule.category === 'unknown') {
    confidence = 0.2;
  }

  return Math.min(0.99, Math.max(0.1, confidence));
}

function errorSummary(errorText: string): string | undefined {
  const firstLine = errorText.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0);
  if (!firstLine) {
    return undefined;
  }
  return firstLine.length > 200 ? `${firstLine.slice(0, 197)}...` : firstLine;
}

function buildReasoning(ctx: RuleContext, rule: (typeof RULES)[number], confidence: number): string[] {
  const reasoning: string[] = [];

  reasoning.push(`Failure classified as "${rule.category}" with confidence ${confidence.toFixed(2)}.`);
  reasoning.push(`Root cause dimension: ${rule.rootCause} — ${ROOT_CAUSE_EXPLANATIONS[rule.rootCause]}`);

  const matchedPattern = rule.patterns.find((pattern) => pattern.test(ctx.errorText));
  if (matchedPattern) {
    reasoning.push(`Matched error signature: /${matchedPattern.source}/i.`);
  }

  if (ctx.failingLocator) {
    reasoning.push(`Failing locator: ${ctx.failingLocator}`);
  }
  if (ctx.placeholders.length > 0) {
    reasoning.push(
      `Literal placeholder token(s) ${ctx.placeholders.map((p) => `"<${p}>"`).join(', ')} still present in the test code — scenario-outline data was never substituted.`
    );
  }
  if (ctx.unknownOptionTexts.length > 0) {
    reasoning.push(
      `Requested dropdown option text${ctx.unknownOptionTexts.length > 1 ? 's' : ''} ${ctx.unknownOptionTexts
        .map((text) => `"${text}"`)
        .join(', ')} ${ctx.unknownOptionTexts.length > 1 ? 'are' : 'is'} NOT among the verified options of the matched widget in the knowledge base — the scenario data does not exist in the application.`
    );
  }
  if (ctx.hasResolved) {
    reasoning.push('The failing locator resolved to an element in the DOM (so it is not a missing-element/selector issue).');
  }
  if (ctx.hasZeroResolved) {
    reasoning.push('The failing locator resolved to 0 elements (the element does not exist in the DOM).');
  }
  if (ctx.knownSelectorKeys.length > 0) {
    reasoning.push(
      `Cross-referenced with the knowledge base: verified selector(s) [${ctx.knownSelectorKeys.join(', ')}] appear in the failing locator.`
    );
  } else if (ctx.locatorLines.length > 0) {
    reasoning.push('Cross-referenced with the knowledge base: no verified selector appears in the failing locator — it may have been guessed by test generation.');
  }
  if (ctx.callLog) {
    reasoning.push(`Playwright call log: ${ctx.callLog}`);
  }

  reasoning.push(`Recommended action: ${rule.recommendation(ctx)}`);

  return reasoning;
}

function buildEvidence(ctx: RuleContext): { source: string; content: string }[] {
  const evidence: { source: string; content: string }[] = [];

  if (ctx.errorText) {
    evidence.push({
      source: 'playwright_error',
      content: ctx.errorText.slice(0, 2500)
    });
  }
  if (ctx.input.testSource) {
    const line = ctx.input.location?.line;
    const lines = ctx.input.testSource.split(/\r?\n/);
    const contextLines =
      typeof line === 'number'
        ? lines.slice(Math.max(0, line - 3), Math.min(lines.length, line + 2)).join('\n')
        : lines.slice(0, 15).join('\n');
    if (contextLines.trim()) {
      evidence.push({ source: 'test_source', content: contextLines });
    }
  }
  for (const attachment of ctx.input.attachments ?? []) {
    evidence.push({ source: 'attachment', content: attachment });
  }

  return evidence;
}

/**
 * Core of the Failure Analysis Agent: classify a single failed scenario and
 * produce a structured diagnostic report. This is a pure function so it can be
 * unit-tested and reused, and later be replaced/combined with an LLM pass
 * without changing the pipeline contract.
 */
export function analyzeFailure(input: FailureAnalysisInput): FailureReport {
  const ctx = buildContext(input, input.selectors ?? null);

  const matched =
    RULES.find((rule) => {
      const patternHit = rule.patterns.length === 0 || rule.patterns.some((pattern) => pattern.test(ctx.errorText));
      const conditionHit = rule.matches ? rule.matches(ctx) : true;
      return patternHit && conditionHit;
    }) ?? RULES[RULES.length - 1];

  const confidence = confidenceFor(matched, ctx);

  return {
    scenario: input.scenario,
    status: input.status,
    failureType: matched.category,
    confidence: Math.round(confidence * 100) / 100,
    rootCause: matched.rootCause,
    repairRecommendation: matched.recommendation(ctx),
    reasoning: buildReasoning(ctx, matched, confidence),
    evidence: buildEvidence(ctx),
    errorSummary: errorSummary(ctx.errorText),
    location: input.location,
    diagnostics: {
      failingLocator: ctx.failingLocator,
      locatorLines: ctx.locatorLines,
      placeholders: ctx.placeholders,
      knownSelectorKeys: ctx.knownSelectorKeys,
      unknownOptionTexts: ctx.unknownOptionTexts
    },
    analyzedAt: new Date().toISOString()
  };
}

/** Validates a report against the allowed category/root-cause vocabularies. */
export function isValidFailureReport(report: FailureReport): boolean {
  return (
    FAILURE_CATEGORIES.includes(report.failureType) &&
    ROOT_CAUSES.includes(report.rootCause) &&
    typeof report.confidence === 'number' &&
    report.confidence >= 0 &&
    report.confidence <= 1 &&
    report.status === 'failed'
  );
}

/** Loads the knowledge-base selectors for the current app URL, if configured. */
export function loadSelectorsFromEnv(baseUrl?: string): SelectorMap | null {
  const url = baseUrl ?? process.env.BASE_URL ?? '';
  if (!url) {
    return null;
  }
  return loadSelectorMap(getDomainFromUrl(url));
}
