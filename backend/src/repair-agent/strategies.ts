import type { FailureReport, FailureDiagnostics } from '../failure-analysis/types.js';
import type { PageElementRecord, SelectorMap } from '../selector-types.js';
import type { RepairPlan, RepairType } from './types.js';

/**
 * Everything a strategy needs to build a repair plan for one failure report.
 */
export interface RepairContext {
  report: FailureReport;
  selectors: SelectorMap | null;
  testSource?: string;
  failingLine?: string;
}

/** A candidate knowledge-base entry matched against a failing locator. */
interface KbCandidate {
  key: string;
  selector: string;
  record?: PageElementRecord;
}

function diagnosticsOf(report: FailureReport): FailureDiagnostics {
  return (
    report.diagnostics ?? {
      failingLocator: undefined,
      locatorLines: [],
      placeholders: [],
      knownSelectorKeys: [],
      unknownOptionTexts: []
    }
  );
}

/** Reconstructs the canonical key (`pages.<path>.<key>`) while walking the KB. */
function keyFor(path: string, key: string): string {
  return `pages.${path}.${key}`;
}

function kbRecordByKey(selectors: SelectorMap | null, key: string): PageElementRecord | undefined {
  if (!selectors) {
    return undefined;
  }
  for (const [path, page] of Object.entries(selectors.pages ?? {})) {
    for (const [entryKey, value] of Object.entries(page)) {
      if (keyFor(path, entryKey) === key && value && typeof value === 'object') {
        return value;
      }
    }
  }
  return undefined;
}

function kbSelectorByKey(selectors: SelectorMap | null, key: string): string | undefined {
  const record = kbRecordByKey(selectors, key);
  if (record) {
    return record.selector;
  }
  if (!selectors) {
    return undefined;
  }
  for (const [path, page] of Object.entries(selectors.pages ?? {})) {
    for (const [entryKey, value] of Object.entries(page)) {
      if (keyFor(path, entryKey) === key && typeof value === 'string') {
        return value;
      }
    }
  }
  return undefined;
}

/**
 * Resolves the Choices.js wrapper/dropdown selectors for a widget:
 *  - if a known key is already a wrapper (`*_choicesInner`), use it directly;
 *  - if a known key is a `choices` widget, find the sibling `*_choicesInner` /
 *    `*_choicesDropdown` entries in the same page of the knowledge base.
 */
function resolveChoicesWrapper(
  selectors: SelectorMap | null,
  knownSelectorKeys: string[]
): { wrapperKey: string; wrapperSelector: string; dropdownSelector?: string } | undefined {
  if (!selectors) {
    return undefined;
  }

  for (const key of knownSelectorKeys) {
    if (/_choicesInner$/.test(key)) {
      const selector = kbSelectorByKey(selectors, key);
      if (selector) {
        return { wrapperKey: key, wrapperSelector: selector };
      }
    }
  }

  for (const key of knownSelectorKeys) {
    const record = kbRecordByKey(selectors, key);
    if (record?.widgetType !== 'choices') {
      continue;
    }
    for (const [path, page] of Object.entries(selectors.pages ?? {})) {
      for (const [entryKey, value] of Object.entries(page)) {
        if (keyFor(path, entryKey) !== key) {
          continue;
        }
        const inner = page[`${entryKey}_choicesInner`];
        const dropdown = page[`${entryKey}_choicesDropdown`];
        if (inner && typeof inner === 'object' && inner.selector) {
          return {
            wrapperKey: keyFor(path, `${entryKey}_choicesInner`),
            wrapperSelector: inner.selector,
            dropdownSelector: dropdown && typeof dropdown === 'object' ? dropdown.selector : undefined
          };
        }
      }
    }
  }

  return undefined;
}

/**
 * Finds a knowledge-base widget whose entry key contains the placeholder token
 * (e.g. placeholder "salle" -> entry "select_selectedSalle"), so each Examples
 * placeholder can be mapped to the dropdown it feeds.
 */
function findWidgetKeyForToken(selectors: SelectorMap | null, token: string): string | undefined {
  if (!selectors) {
    return undefined;
  }
  const tokenLower = token.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!tokenLower) {
    return undefined;
  }
  for (const [path, page] of Object.entries(selectors.pages ?? {})) {
    for (const [entryKey, value] of Object.entries(page)) {
      const record = typeof value === 'object' && value ? value : undefined;
      const isWidget = record?.widgetType === 'choices' || record?.widgetType === 'select' || record?.widgetType === 'button';
      if (isWidget && entryKey.toLowerCase().includes(tokenLower)) {
        return keyFor(path, entryKey);
      }
    }
  }
  return undefined;
}

/** The first concrete option (non-empty value) of a widget, when known. */
function firstValidOption(selectors: SelectorMap | null, key: string | undefined): string | undefined {
  if (!key) {
    return undefined;
  }
  const record = kbRecordByKey(selectors, key);
  const options = record?.options ?? [];
  return options.find((option) => option.label && option.value !== '')?.label ?? options[0]?.label;
}

/**
 * Finds the knowledge-base entry that most likely corresponds to a failing
 * locator, by id, name attribute, option label, or verified-key reference.
 * Returns undefined when no entry matches (selector was invented by generation).
 */
function findKbCandidate(
  locator: string | undefined,
  selectors: SelectorMap | null,
  knownSelectorKeys: string[]
): KbCandidate | undefined {
  if (!locator || !selectors) {
    return undefined;
  }

  const entries: KbCandidate[] = [];
  for (const [path, page] of Object.entries(selectors.pages ?? {})) {
    for (const [entryKey, value] of Object.entries(page)) {
      const selector = typeof value === 'string' ? value : value?.selector;
      if (typeof selector !== 'string' || !selector) {
        continue;
      }
      entries.push({
        key: keyFor(path, entryKey),
        selector,
        record: typeof value === 'object' ? value : undefined
      });
    }
  }

  for (const id of [...locator.matchAll(/#([\w-]+)/g)].map((match) => match[1])) {
    const hit = entries.find((entry) => new RegExp(`#${id}\\b`).test(entry.selector));
    if (hit) {
      return hit;
    }
  }

  for (const name of [...locator.matchAll(/\[name="?([\w-]+)"?\]/g)].map((match) => match[1])) {
    const hit = entries.find((entry) => entry.selector.includes(`[name="${name}"]`));
    if (hit) {
      return hit;
    }
  }

  for (const text of [...locator.matchAll(/getByText\(["']([^"']+)["']/gi)].map((match) => match[1])) {
    const hit = entries.find(
      (entry) => entry.record?.label === text || entry.record?.options?.some((option) => option.label === text)
    );
    if (hit) {
      return hit;
    }
  }

  for (const key of knownSelectorKeys) {
    const hit = entries.find((entry) => entry.key === key);
    if (hit) {
      return hit;
    }
  }

  return undefined;
}

function extractOptionTextFromLine(line: string | undefined): string | undefined {
  if (!line) {
    return undefined;
  }
  const match = line.match(/getByText\(\s*["']([^"']+)["']/i);
  return match?.[1];
}

function extractLocatorFromLine(line: string | undefined): string | undefined {
  if (!line) {
    return undefined;
  }
  const match = line.match(/(?:locator|getByRole|getByLabel|getByPlaceholder|getByTestId)\(\s*["']([^"']+)["']/i);
  return match?.[1];
}

function extractGotoUrl(testSource: string | undefined): string | undefined {
  if (!testSource) {
    return undefined;
  }
  const match = testSource.match(/page\.goto\(\s*["']([^"']+)["']/);
  return match?.[1];
}

function extractAssertedValue(line: string | undefined): string | undefined {
  if (!line) {
    return undefined;
  }
  const match = line.match(/\.(?:toHaveText|toContainText|toHaveValue|toHaveAttribute|toEqual)\(\s*["']([^"']+)["']/i);
  return match?.[1];
}

/** Blends a strategy's base confidence with the failure analysis confidence. */
function blend(reportConfidence: number, base: number): number {
  const combined = base * (0.6 + 0.4 * Math.min(1, reportConfidence));
  return Math.min(0.99, Math.round(combined * 100) / 100);
}

interface PlanOptions {
  repairType: RepairType;
  target: string;
  confidence: number;
  repairable: boolean;
  requiresHumanReview?: boolean;
  currentValue?: string;
  replacementValue?: string;
  actions: string[];
  explanation: string[];
  sourceFile?: string;
}

function makePlan(report: FailureReport, options: PlanOptions): RepairPlan {
  return {
    scenario: report.scenario,
    failureType: report.failureType,
    rootCause: report.rootCause,
    repairType: options.repairType,
    target: options.target,
    currentValue: options.currentValue,
    replacementValue: options.replacementValue,
    confidence: options.confidence,
    repairable: options.repairable,
    requiresHumanReview: options.requiresHumanReview ?? false,
    actions: options.actions.map((action) => ({
      action,
      file: report.location?.file,
      line: report.location?.line
    })),
    explanation: options.explanation,
    sourceFile: report.location?.file
  };
}

function repairSelectorNotFound(ctx: RepairContext): RepairPlan {
  const report = ctx.report;
  const diag = diagnosticsOf(report);
  const locator = diag.failingLocator ?? extractLocatorFromLine(ctx.failingLine) ?? 'the failing locator';
  const candidate = findKbCandidate(locator, ctx.selectors, diag.knownSelectorKeys);

  if (candidate && candidate.selector !== locator) {
    const recordHint = candidate.record?.label ? ` (label: "${candidate.record.label}")` : '';
    return makePlan(report, {
      repairType: 'replace_selector',
      target: `Selector${report.location?.line ? ` (line ${report.location.line})` : ''}`,
      confidence: blend(report.confidence, 0.92),
      repairable: true,
      currentValue: locator,
      replacementValue: candidate.selector,
      actions: [
        `Replace the guessed/stale locator with the verified knowledge-base selector "${candidate.selector}"${recordHint}.`
      ],
      explanation: [
        'The locator resolved to 0 elements, so the test cannot find the element.',
        `The knowledge base entry "${candidate.key}"${recordHint} is the verified selector for this element.`,
        'Using the verified selector keeps the test grounded in the live page (Website Understanding Agent).'
      ]
    });
  }

  return makePlan(report, {
    repairType: 'manual_review',
    target: 'Selector',
    confidence: blend(report.confidence, 0.3),
    repairable: false,
    requiresHumanReview: true,
    currentValue: locator,
    actions: [
      'No verified knowledge-base selector matches this locator.',
      'Re-analyze the page with the Website Understanding Agent to obtain a verified selector before patching.'
    ],
    explanation: [
      'The element was not found and the knowledge base has no matching entry.',
      'Automated repair is not safe here because the correct selector is unknown.'
    ]
  });
}

function repairStrictModeViolation(ctx: RepairContext): RepairPlan {
  const report = ctx.report;
  const diag = diagnosticsOf(report);
  const locator = diag.failingLocator ?? extractLocatorFromLine(ctx.failingLine) ?? 'the failing locator';
  const candidate = findKbCandidate(locator, ctx.selectors, diag.knownSelectorKeys);

  const replacement = candidate && candidate.selector !== locator ? candidate.selector : `${locator}.first()`;

  return makePlan(report, {
    repairType: 'disambiguate_selector',
    target: `Selector (line ${report.location?.line ?? '?'})`,
    confidence: blend(report.confidence, 0.85),
    repairable: true,
    currentValue: locator,
    replacementValue: replacement,
    actions: [
      candidate && candidate.selector !== locator
        ? `Use the verified single-element selector "${candidate.selector}" from the knowledge base.`
        : `Disambiguate the ambiguous locator with .first() (or add a distinguishing attribute).`
    ],
    explanation: [
      'The locator resolved to multiple elements (strict mode violation).',
      candidate && candidate.selector !== locator
        ? `A more specific verified selector exists: ${candidate.selector}.`
        : 'No more specific verified selector exists, so disambiguation with .first() is the safe deterministic fix.'
    ]
  });
}

function choicesWrapperPlan(ctx: RepairContext, baseConfidence: number): RepairPlan | null {
  const report = ctx.report;
  const diag = diagnosticsOf(report);
  const wrapper = resolveChoicesWrapper(ctx.selectors, diag.knownSelectorKeys);

  if (!wrapper) {
    return null;
  }

  const locator = diag.failingLocator ?? extractLocatorFromLine(ctx.failingLine) ?? 'the hidden native select';

  const actions = wrapper.dropdownSelector
    ? [
        `Open the dropdown by clicking the verified wrapper: ${wrapper.wrapperSelector}.`,
        `Select the option inside the verified dropdown list: ${wrapper.dropdownSelector}.`
      ]
    : [
        `Open the dropdown by clicking the verified wrapper: ${wrapper.wrapperSelector}.`,
        'Select the option inside the verified dropdown list by its exact visible text.'
      ];

  return makePlan(report, {
    repairType: 'use_choices_wrapper',
    target: `Choices dropdown interaction (line ${report.location?.line ?? '?'})`,
    confidence: blend(report.confidence, baseConfidence),
    repairable: true,
    currentValue: locator,
    replacementValue: wrapper.wrapperSelector,
    actions,
    explanation: [
      'The native <select> is hidden by Choices.js, so direct visibility assertions / selectOption fail.',
      `The knowledge base verified wrapper "${wrapper.wrapperKey}" is the actionable element.`
    ]
  });
}

function repairVisibilityIssue(ctx: RepairContext): RepairPlan {
  const wrapper = choicesWrapperPlan(ctx, 0.93);
  if (wrapper) {
    return wrapper;
  }

  const report = ctx.report;
  const diag = diagnosticsOf(report);
  const locator = diag.failingLocator ?? extractLocatorFromLine(ctx.failingLine) ?? 'the hidden element';
  const knownKey = diag.knownSelectorKeys[0];
  const record = kbRecordByKey(ctx.selectors, knownKey);
  const conditionallyHidden = record?.widgetType === 'button' && /hidden/i.test(record.note ?? '');

  return makePlan(report, {
    repairType: 'add_visibility_guard',
    target: `Visibility (line ${report.location?.line ?? '?'})`,
    confidence: blend(report.confidence, conditionallyHidden ? 0.85 : 0.7),
    repairable: true,
    currentValue: locator,
    actions: conditionallyHidden
      ? [
          'Guard the interaction: only click the button when it is visible (e.g. wrap in if (await locator.isVisible())).',
          'Assert on the resulting content (event cards) instead of forcing the click.'
        ]
      : [
          'Assert visibility of an actionable container/row instead of the hidden element.',
          'Scroll the element into view (scrollIntoViewIfNeeded) before interacting.'
        ],
    explanation: conditionallyHidden
      ? [
          'The button exists but is hidden — the application only shows it when there is more content.',
          'Forcing a click on a hidden element is the defect; guarding visibility matches the generation guidance.'
        ]
      : ['The element is present but hidden; the assertion/interaction targets a non-actionable element.']
  });
}

function repairTimeout(ctx: RepairContext): RepairPlan {
  const report = ctx.report;
  const diag = diagnosticsOf(report);
  const locator = diag.failingLocator ?? extractLocatorFromLine(ctx.failingLine) ?? 'the element';

  return makePlan(report, {
    repairType: 'add_wait_strategy',
    target: `Wait strategy (line ${report.location?.line ?? '?'})`,
    confidence: blend(report.confidence, 0.65),
    repairable: true,
    currentValue: locator,
    actions: [
      `Precede the action with an explicit expectation: await expect(page.locator("${locator}")).toBeVisible({ timeout: 15000 });`,
      'Prefer response-driven waits (waitForResponse) over bare waits for AJAX content.',
      'Raise the action timeout from the default instead of relying on the test-level timeout.'
    ],
    explanation: [
      'The wait timed out but the error gives no proof the element is missing.',
      'The element likely appears later than the default wait allows, so a targeted wait strategy replaces the guesswork.'
    ]
  });
}

function repairAssertionFailure(ctx: RepairContext): RepairPlan {
  const report = ctx.report;
  const asserted = extractAssertedValue(ctx.failingLine) ?? 'the expected value';
  const line = report.location?.line;

  return makePlan(report, {
    repairType: 'update_expected_value',
    target: `Assertion${line ? ` (line ${line})` : ''}`,
    confidence: blend(report.confidence, 0.4),
    repairable: false,
    requiresHumanReview: true,
    currentValue: asserted,
    actions: [
      `Verify the expected value "${asserted}" against the real page content.`,
      'If the test expectation is wrong, update it to the verified value; if the application is wrong, report the defect.'
    ],
    explanation: [
      'An assertion on application output mismatched its expected value.',
      'The correct value cannot be derived deterministically — a human must confirm whether the test or the application is at fault.'
    ]
  });
}

function repairNavigationFailure(ctx: RepairContext): RepairPlan {
  const report = ctx.report;
  const url = extractGotoUrl(ctx.testSource) ?? 'the navigation URL';
  const kbPaths = Object.keys(ctx.selectors?.pages ?? {});

  let replacementUrl: string | undefined;
  let path: string | undefined;
  try {
    path = new URL(url).pathname;
  } catch {
    path = undefined;
  }

  if (path && kbPaths.length > 0 && !kbPaths.includes(path)) {
    const baseUrl = process.env.BASE_URL ?? ctx.selectors?.url ?? '';
    replacementUrl = `${baseUrl.replace(/\/+$/, '')}${kbPaths[0]}`;
  }

  if (replacementUrl) {
    return makePlan(report, {
      repairType: 'fix_navigation_url',
      target: `Navigation (goto)`,
      confidence: blend(report.confidence, 0.8),
      repairable: true,
      currentValue: url,
      replacementValue: replacementUrl,
      actions: [`Replace the unverified navigation URL "${url}" with the verified page path "${replacementUrl}".`],
      explanation: [
        'Navigation to the URL failed (network / DNS / path).',
        `The path is not among the verified pages; the knowledge base confirms "${kbPaths[0]}" as a real page path.`
      ]
    });
  }

  return makePlan(report, {
    repairType: 'manual_review',
    target: 'Navigation / environment',
    confidence: blend(report.confidence, 0.4),
    repairable: false,
    requiresHumanReview: true,
    currentValue: url,
    actions: [
      'Verify the application URL is reachable from this environment.',
      'Check whether the target host/path actually exists before changing the test.'
    ],
    explanation: [
      'Navigation failed but no verified alternative path is available in the knowledge base.',
      'This is likely an environment issue, not a test defect.'
    ]
  });
}

function repairAuthenticationFailure(ctx: RepairContext): RepairPlan {
  const report = ctx.report;

  return makePlan(report, {
    repairType: 'ensure_credentials',
    target: 'Credentials',
    confidence: blend(report.confidence, 0.5),
    repairable: false,
    requiresHumanReview: true,
    actions: [
      'Provide valid credentials (e.g. via the --credentials flag / environment) and re-run.',
      'Verify the scenario data used for login matches a real user account.'
    ],
    explanation: [
      'Authentication did not succeed (401/403 or still on the login page).',
      'Credentials cannot be invented deterministically — valid ones must be supplied.'
    ]
  });
}

function repairDataIssue(ctx: RepairContext): RepairPlan {
  const report = ctx.report;
  const diag = diagnosticsOf(report);
  const knownKey = diag.knownSelectorKeys[0];

  if (diag.placeholders.length > 0) {
    const current = diag.placeholders.map((placeholder) => `<${placeholder}>`).join(', ');
    const suggestions = diag.placeholders.map((placeholder) => {
      const key = findWidgetKeyForToken(ctx.selectors, placeholder) ?? knownKey;
      return firstValidOption(ctx.selectors, key);
    });
    const replacements = suggestions.filter((option): option is string => !!option);
    const replacementValue = replacements.length > 0 ? replacements.join(', ') : undefined;
    return makePlan(report, {
      repairType: 'fix_examples_table',
      target: 'Examples Table',
      confidence: blend(report.confidence, replacementValue ? 0.95 : 0.7),
      repairable: !!replacementValue,
      requiresHumanReview: !replacementValue,
      currentValue: current,
      replacementValue: replacementValue ?? '(a real option from the knowledge base)',
      actions: [
        `Replace the literal placeholder ${current} with a real option value in the Gherkin Examples table.`,
        replacementValue
          ? `Suggested verified options: "${replacementValue}".`
          : 'No verified option found — re-analyze the dropdown with the Website Understanding Agent.'
      ],
      explanation: [
        'Scenario-outline placeholders survived into the generated test; the Examples data was never substituted.',
        knownKey ? `The failing dropdown is the verified widget "${knownKey}".` : 'The failing widget could not be matched in the knowledge base.'
      ]
    });
  }

  if (diag.unknownOptionTexts.length > 0) {
    const current = diag.unknownOptionTexts[0];
    const option = firstValidOption(ctx.selectors, knownKey);
    return makePlan(report, {
      repairType: 'replace_test_data',
      target: 'Examples Table',
      confidence: blend(report.confidence, option ? 0.95 : 0.65),
      repairable: !!option,
      requiresHumanReview: !option,
      currentValue: current,
      replacementValue: option ?? '(a real option from the knowledge base)',
      actions: [
        `Replace the option "${current}" with an option that actually exists in the dropdown.`,
        option ? `Suggested verified option: "${option}".` : 'No verified option found — re-analyze the dropdown.'
      ],
      explanation: [
        `The option "${current}" is not among the verified options of the dropdown, so the scenario data does not exist in the application.`,
        'Using a knowledge-base-verified option makes the test data valid.'
      ]
    });
  }

  const current = extractOptionTextFromLine(ctx.failingLine) ?? 'the currently selected value';
  const option = firstValidOption(ctx.selectors, knownKey);
  return makePlan(report, {
    repairType: 'replace_test_data',
    target: 'Examples Table',
    confidence: blend(report.confidence, option ? 0.6 : 0.4),
    repairable: !!option,
    requiresHumanReview: !option,
    currentValue: current,
    replacementValue: option ?? '(an alternative option from the knowledge base)',
    actions: [
      `The selected value "${current}" produced results where none were expected (or vice versa).`,
      option ? `Try a different verified option such as "${option}".` : 'Pick a different valid option manually.'
    ],
    explanation: [
      'The selected combination does not match the scenario intent (expected empty but got results).',
      'The replacement must be confirmed against the application data.'
    ]
  });
}

function repairUnsupportedInteraction(ctx: RepairContext): RepairPlan {
  const wrapper = choicesWrapperPlan(ctx, 0.92);
  if (wrapper) {
    return wrapper;
  }

  const report = ctx.report;
  const diag = diagnosticsOf(report);
  const knownKey = diag.knownSelectorKeys[0];
  const record = kbRecordByKey(ctx.selectors, knownKey);
  const interaction = record?.interaction;
  const locator = diag.failingLocator ?? extractLocatorFromLine(ctx.failingLine) ?? 'the element';

  if (interaction) {
    return makePlan(report, {
      repairType: 'correct_interaction',
      target: `Interaction (line ${report.location?.line ?? '?'})`,
      confidence: blend(report.confidence, 0.85),
      repairable: true,
      currentValue: locator,
      replacementValue: interaction,
      actions: [
        `Drive the element with its verified interaction "${interaction}" instead of the unsupported one.`
      ],
      explanation: [
        'The interaction is not supported on the targeted element (e.g. selectOption on a hidden select).',
        `The knowledge base records the verified interaction "${interaction}" for this widget.`
      ]
    });
  }

  return makePlan(report, {
    repairType: 'manual_review',
    target: 'Interaction',
    confidence: blend(report.confidence, 0.4),
    repairable: false,
    requiresHumanReview: true,
    currentValue: locator,
    actions: ['Inspect the widget on the live page and record its correct interaction in the knowledge base.'],
    explanation: [
      'The interaction failed but the knowledge base has no verified interaction recipe for this widget.'
    ]
  });
}

function repairApplicationBug(ctx: RepairContext): RepairPlan {
  const report = ctx.report;

  return makePlan(report, {
    repairType: 'no_repair',
    target: 'Application behavior',
    confidence: blend(report.confidence, 0.5),
    repairable: false,
    requiresHumanReview: true,
    actions: [
      'Do not modify the test: the action completed but the application did not produce the expected result.',
      'Validate the flow manually and report the application defect to the team.'
    ],
    explanation: [
      'The failure is classified as an application bug, not a test defect.',
      'Automatic test repair would mask a real product issue.'
    ]
  });
}

function repairFlakyTest(ctx: RepairContext): RepairPlan {
  const report = ctx.report;
  const diag = diagnosticsOf(report);
  const locator = diag.failingLocator ?? extractLocatorFromLine(ctx.failingLine);

  return makePlan(report, {
    repairType: 'stabilize_flaky_test',
    target: 'Test stability',
    confidence: blend(report.confidence, 0.5),
    repairable: true,
    requiresHumanReview: true,
    currentValue: locator,
    actions: [
      locator ? `Add an explicit wait/assertion for "${locator}" instead of a bare action.` : 'Add explicit waits for async content.',
      'Replace fixed sleeps with response-driven or visibility-driven waits.',
      'Re-run the test several times to confirm stability before further investigation.'
    ],
    explanation: [
      'The failure is intermittent (retry / mixed results), so it is a timing or race condition.',
      'Stabilizing the test is the prerequisite before treating it as an application defect.'
    ]
  });
}

function repairUnknown(ctx: RepairContext): RepairPlan {
  const report = ctx.report;

  return makePlan(report, {
    repairType: 'no_repair',
    target: 'Unknown failure',
    confidence: blend(report.confidence, 0.2),
    repairable: false,
    requiresHumanReview: true,
    actions: [
      'No classification matched, so no deterministic repair is proposed.',
      'Inspect the raw Playwright error, screenshot and trace manually.'
    ],
    explanation: [
      'Unknown failures are intentionally not repaired automatically.',
      'Extend the classification rules in src/failure-analysis/rules.ts once the signature is understood.'
    ]
  });
}

/**
 * Builds a deterministic RepairPlan for a failure report, driven by its
 * failure category and evidence. Never modifies files.
 */
export function buildRepairPlan(report: FailureReport, ctx: RepairContext): RepairPlan {
  switch (report.failureType) {
    case 'selector_not_found':
      return repairSelectorNotFound(ctx);
    case 'strict_mode_violation':
      return repairStrictModeViolation(ctx);
    case 'visibility_issue':
      return repairVisibilityIssue(ctx);
    case 'timeout':
      return repairTimeout(ctx);
    case 'assertion_failure':
      return repairAssertionFailure(ctx);
    case 'navigation_failure':
      return repairNavigationFailure(ctx);
    case 'authentication_failure':
      return repairAuthenticationFailure(ctx);
    case 'data_issue':
      return repairDataIssue(ctx);
    case 'unsupported_interaction':
      return repairUnsupportedInteraction(ctx);
    case 'application_bug':
      return repairApplicationBug(ctx);
    case 'flaky_test':
      return repairFlakyTest(ctx);
    case 'unknown':
      return repairUnknown(ctx);
  }
}
