import type { FailureAnalysisInput, FailureCategory, RootCause } from './types.js';

/**
 * The normalized context the rule engine derives from a single failure.
 * All fields are precomputed once so every rule can match against the same
 * evidence without re-parsing the raw error text.
 */
export interface RuleContext {
  input: FailureAnalysisInput;
  /** ANSI-stripped full error message + stack. */
  errorText: string;
  messageLines: string[];
  /** Extracted call-log section (everything after "Call log:"). */
  callLog?: string;
  /** Locator-bearing lines from the error (the failing selector chain). */
  locatorLines: string[];
  /** The single most relevant failing locator, when it can be isolated. */
  failingLocator?: string;
  /** Literal scenario-outline placeholders still present (e.g. "<salle>"). */
  placeholders: string[];
  /** True when a locator log shows an element actually resolved in the DOM. */
  hasResolved: boolean;
  /** True when a locator log shows the element resolved to 0 elements. */
  hasZeroResolved: boolean;
  /** Knowledge-base keys whose verified selector appears in the failing locator. */
  knownSelectorKeys: string[];
  /**
   * Option text(s) requested through getByText(...) inside the failing locator
   * that are NOT among the verified options of the matching Choices widget.
   * Strong evidence the scenario data does not exist in the application.
   */
  unknownOptionTexts: string[];
}

export interface FailureRule {
  category: FailureCategory;
  rootCause: RootCause;
  baseConfidence: number;
  /** Any pattern matching the error text triggers the rule. */
  patterns: RegExp[];
  /** Optional extra condition evaluated after the patterns. */
  matches?: (ctx: RuleContext) => boolean;
  recommendation: (ctx: RuleContext) => string;
}

/**
 * Rules are evaluated in priority order; the first match wins.
 * Priority reflects evidence specificity: strong, unambiguous signatures are
 * checked before generic ones (e.g. a visibility assertion precedes a generic
 * expect() mismatch; explicit "resolved to 0 elements" precedes a wait timeout).
 */
export const RULES: readonly FailureRule[] = [
  {
    category: 'strict_mode_violation',
    rootCause: 'bad_selector',
    baseConfidence: 0.95,
    patterns: [/strict mode violation/i],
    recommendation: (ctx) =>
      `The failing locator resolved to multiple elements at once. Tighten the selector (add a distinguishing attribute such as name/id/data-testid) or disambiguate with .first()/.nth().${ctx.failingLocator ? ` Failing locator: ${ctx.failingLocator}` : ''}`
  },

  {
    category: 'data_issue',
    rootCause: 'bad_test_data',
    baseConfidence: 0.96,
    patterns: [],
    matches: (ctx) =>
      ctx.placeholders.length > 0 ||
      ctx.unknownOptionTexts.length > 0 ||
      (/tohavecount\s*\(\s*0\s*\)/i.test(ctx.errorText) && /received:\s*[1-9]/i.test(ctx.errorText)),
    recommendation: (ctx) => {
      if (ctx.placeholders.length > 0) {
        const verb = ctx.placeholders.length > 1 ? 'were' : 'was';
        return `Literal scenario-outline placeholder${ctx.placeholders.length > 1 ? 's' : ''} ${ctx.placeholders
          .map((p) => `"<${p}>"`)
          .join(', ')} ${verb} emitted into the test instead of a real value. Fix the Examples table / data substitution in the Gherkin so every "<token>" is replaced, then regenerate the test.`;
      }
      if (ctx.unknownOptionTexts.length > 0) {
        return `The scenario selects option value${ctx.unknownOptionTexts.length > 1 ? 's' : ''} ${ctx.unknownOptionTexts
          .map((text) => `"${text}"`)
          .join(', ')} that ${ctx.unknownOptionTexts.length > 1 ? 'are' : 'is'} not among the verified options of the dropdown in the knowledge base. The test data does not exist in the application — pick a real option value.`;
      }
      return 'The scenario expects no results (toHaveCount(0)) but the application returned events. The selected test data is invalid for this flow; pick salle/date combinations that genuinely have no events.';
    }
  },

  {
    category: 'navigation_failure',
    rootCause: 'environment_issue',
    baseConfidence: 0.92,
    patterns: [
      /net::err_[a-z_]+/i,
      /failed to navigate/i,
      /navigation (failed|error|aborted)/i,
      /cannot navigate/i,
      /err_(name_not_resolved|connection_refused|timed_out|aborted|ssl|failed)/i,
      /page\.goto[^\n]*(failed|timeout|error)/i
    ],
    recommendation: (ctx) =>
      'Navigation to the page failed (network / DNS / TLS / environment error). Confirm the starting URL and any appended path are reachable from this machine, then re-run. Not a selector or application-logic defect.'
  },

  {
    category: 'unsupported_interaction',
    rootCause: 'bad_selector',
    baseConfidence: 0.9,
    patterns: [
      /is not an? (input|textarea|select|checkbox|radio|button|link|option) element/i,
      /is not a <(input|select|textarea|checkbox|radio|button|option)>/i,
      /not a valid select element/i,
      /element is not a select/i,
      /(readonly|read-only)/i,
      /is disabled/i,
      /element is not enabled/i,
      /not enabled/i,
      /cannot (type|fill|check|uncheck|select option|press)/i,
      /select option failed/i
    ],
    recommendation: (ctx) =>
      `The interaction is not supported on the targeted element (e.g. selectOption on a Choices.js-hidden <select>, or typing into a non-input). Drive the widget through its verified interaction recipe instead${ctx.failingLocator ? ` (failing locator: ${ctx.failingLocator})` : ''}.`
  },

  {
    category: 'authentication_failure',
    rootCause: 'bad_test_data',
    baseConfidence: 0.85,
    patterns: [
      /\b(401|403)\b/,
      /unauthorized/i,
      /forbidden/i,
      /authentication (failed|error)/i,
      /login (failed|error)/i,
      /invalid (credentials|email|password)/i,
      /incorrect (email|password|credentials)/i,
      /tohaveurl[^\n]*\/login/i
    ],
    recommendation: () =>
      'Authentication did not succeed (401/403, still on a login page, or an invalid-credentials message). Check the credentials / scenario data used by the test; if the credentials are correct, this may be an application bug or environment misconfiguration.'
  },

  {
    category: 'visibility_issue',
    rootCause: 'bad_selector',
    baseConfidence: 0.9,
    patterns: [
      /tobevisible\(\)?[^\n]*failed/i,
      /expected:\s*visible/i,
      /received:\s*hidden/i,
      /unexpected value "hidden"/i,
      /element is not visible/i,
      /element is hidden/i
    ],
    matches: (ctx) => {
      // A pure assertion mismatch on visibility wins here; an actionability
      // timeout that never mentions visibility falls through to the timeout rule.
      return (
        /expected:\s*visible/i.test(ctx.errorText) ||
        /received:\s*hidden/i.test(ctx.errorText) ||
        /tobevisible\(\)?[^\n]*failed/i.test(ctx.errorText) ||
        /element is not visible/i.test(ctx.errorText)
      );
    },
    recommendation: (ctx) => {
      const wrapperHint = ctx.knownSelectorKeys.some((key) => /choicesInner|choicesDropdown/i.test(key))
        ? ' This looks like a Choices.js native <select>: interact via the verified "_choicesInner" wrapper and assert on that wrapper, never on the hidden native select.'
        : '';
      return `The element exists but is hidden (or the assertion demanded visibility on a hidden element).${wrapperHint} Assert visibility of an actionable container/row, or scroll the element into view before interacting.${ctx.failingLocator ? ` Failing locator: ${ctx.failingLocator}` : ''}`;
    }
  },

  {
    category: 'selector_not_found',
    rootCause: 'bad_selector',
    baseConfidence: 0.9,
    patterns: [
      /resolved to 0 elements/i,
      /element is not attached to the dom/i,
      /cannot find element/i,
      /no element found/i,
      /selector[^\n]*does not exist/i,
      /locator[^\n]*not found/i,
      /waiting for locator\([^\n]*\)[^\n]*resolved to 0/i
    ],
    matches: (ctx) => ctx.hasZeroResolved,
    recommendation: (ctx) =>
      `The locator did not resolve to any element — the selector is stale or was guessed${ctx.knownSelectorKeys.length > 0 ? ' (it was NOT found in the verified knowledge base, so it may have been invented by test generation)' : ''}. Re-verify the element against the live page with the Website Understanding Agent, or use a knowledge-base selector.${ctx.failingLocator ? ` Failing locator: ${ctx.failingLocator}` : ''}`
  },

  {
    category: 'application_bug',
    rootCause: 'application_behavior',
    baseConfidence: 0.6,
    patterns: [
      /expect\([^\n]*\)\.[a-zA-Z]+\([^\n]*\) failed/i,
      /expected:/i,
      /received:/i,
      /tohaveurl[^\n]*failed/i
    ],
    matches: (ctx) => {
      if (ctx.placeholders.length > 0 || ctx.unknownOptionTexts.length > 0) {
        return false;
      }
      const urlMismatch = /tohaveurl[^\n]*failed/i.test(ctx.errorText);
      const loginUrl = /tohaveurl[^\n]*\/login/i.test(ctx.errorText);
      const resolvedContentMismatch =
        ctx.hasResolved && /expect\([^\n]*\)\.[a-zA-Z]+\s*\([^\n]*\)\s*failed/i.test(ctx.errorText);
      return (resolvedContentMismatch || (urlMismatch && !loginUrl)) && !ctx.hasZeroResolved;
    },
    recommendation: () =>
      'The action completed but the application did not produce the expected result (content, text, URL or count mismatch on a present element). Validate the flow manually: if a real user gets the expected result, the assertion/test data is wrong; otherwise this is a genuine application defect worth reporting.'
  },

  {
    category: 'assertion_failure',
    rootCause: 'assertion_logic',
    baseConfidence: 0.8,
    patterns: [/expect\([^\n]*\)\.[a-zA-Z]+[^\n]*failed/i, /expected:/i, /received:/i],
    matches: (ctx) => /expect\(/i.test(ctx.errorText) && /failed/i.test(ctx.errorText),
    recommendation: (ctx) =>
      `An assertion on the actual application output did not match the expected value. Compare the expected value in the test against the real page content; the assertion (or its data) is likely wrong, or the behavior differs from the requirement.${ctx.input.location?.file ? ` Failing line: ${ctx.input.location.file}${ctx.input.location.line ? `:${ctx.input.location.line}` : ''}` : ''}`
  },

  {
    category: 'timeout',
    rootCause: 'timing_issue',
    baseConfidence: 0.7,
    patterns: [
      /test timeout of \d+ms exceeded/i,
      /timed out/i,
      /timeout exceeded/i,
      /waiting for locator\([^\n]*\)/i,
      /waiting for (element|selector|response|navigation|request)[^\n]*(timeout|exceeded)/i,
      /locator\.(click|fill|press|type|check|uncheck)[^\n]*timeout/i,
      /waitforselector/i,
      /waitforloadstate/i
    ],
    matches: (ctx) => {
      const isTimeout =
        /timeout/i.test(ctx.errorText) && /(exceeded|waiting for|timed out)/i.test(ctx.errorText);
      const visibilityHandled = /element is not visible/i.test(ctx.errorText);
      const explicitZero = ctx.hasZeroResolved;
      return isTimeout && !visibilityHandled && !explicitZero;
    },
    recommendation: (ctx) =>
      `A wait timed out while the failure gives no proof the element is missing — the element likely appears later than the default wait allows. Increase the wait/action timeout or replace a bare click with expect(locator).toBeVisible() first; also consider response-driven waits (waitForResponse) for AJAX content.${ctx.failingLocator ? ` Failing locator: ${ctx.failingLocator}` : ''}`
  },

  {
    category: 'selector_not_found',
    rootCause: 'bad_selector',
    baseConfidence: 0.55,
    patterns: [/waiting for locator\([^\n]*\)/i, /test timeout of \d+ms exceeded/i],
    matches: (ctx) => {
      const timedOutWaiting =
        ctx.locatorLines.length > 0 && /timeout/i.test(ctx.errorText) && /waiting for locator/i.test(ctx.errorText);
      const noResolution = !ctx.hasResolved && !ctx.hasZeroResolved;
      const noPlaceholder = ctx.placeholders.length === 0;
      const notKnownToKb = ctx.knownSelectorKeys.length === 0;
      return timedOutWaiting && noResolution && noPlaceholder && notKnownToKb;
    },
    recommendation: (ctx) =>
      'The test timed out while waiting for a locator that is not part of the verified knowledge base and never resolved — the selector was likely guessed or is stale. Re-verify it against the live page, or replace it with a knowledge-base selector.'
  },

  {
    category: 'flaky_test',
    rootCause: 'timing_issue',
    baseConfidence: 0.85,
    patterns: [/flaky/i, /intermittent/i],
    matches: (ctx) => {
      const retried = (ctx.input.retry ?? 0) > 0;
      const mixedResults = /flaky/i.test(ctx.errorText);
      return retried || mixedResults;
    },
    recommendation: () =>
      'This failure looks intermittent (a retry or mixed pass/fail pattern). Stabilize the test first — fix wait strategies, remove race conditions (fixed sleeps, unawaited network) — then re-run to confirm before treating it as an application defect.'
  },

  {
    category: 'unknown',
    rootCause: 'unknown',
    baseConfidence: 0.2,
    patterns: [],
    matches: () => true,
    recommendation: () =>
      'No classification rule matched this failure signature. Inspect the raw Playwright error, screenshots and trace manually, then extend the rules in src/failure-analysis/rules.ts.'
  }
];
