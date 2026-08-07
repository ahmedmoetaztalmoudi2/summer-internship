import type { Page } from '@playwright/test';
import { classifyElement } from './classifier.js';
import { generateSelectorCandidates } from './selector-generator.js';
import type {
  ClassifiedElement,
  ElementRole,
  FormSelectorMap,
  LoginSelectorMap,
  RawElement,
  SelectorMap
} from './selector-types.js';
import { getDomainFromUrl } from './storage.js';

/**
 * Browser-side collector source passed to page.evaluate().
 *
 * It is kept as a plain string (not a function reference) so that bundlers
 * like esbuild/tsx cannot inject helpers (e.g. __name) into the serialized
 * body — helpers do not exist in the page's context and break execution.
 *
 * It walks every <form> and then every orphaned interactive element, extracting
 * JSON-safe attributes plus a unique CSS path for each one.
 *
 * NOTE: avoid backticks and ${} inside this string; use concatenation only.
 */
const COLLECT_PAGE_ELEMENTS_SOURCE = `
  () => {
    const visited = new Set();
    const raw = [];

    const readAttributes = (el) => {
      const input = el;
      return {
        tagName: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || undefined,
        name: el.getAttribute('name') || undefined,
        id: el.getAttribute('id') || undefined,
        className: el.getAttribute('class') || undefined,
        placeholder: el.getAttribute('placeholder') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        innerText: (el.textContent || '').trim() || undefined,
        value: typeof input.value === 'string' ? input.value : undefined,
        testId: el.getAttribute('data-testid')
          || el.getAttribute('data-test')
          || el.getAttribute('data-qa')
          || el.getAttribute('data-cy')
          || undefined
      };
    };

    const domPathOf = (el) => {
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1) {
        let index = 1;
        let sibling = node.previousElementSibling;
        while (sibling) {
          if (sibling.tagName === node.tagName) index += 1;
          sibling = sibling.previousElementSibling;
        }
        parts.unshift(node.tagName.toLowerCase() + ':nth-of-type(' + index + ')');
        node = node.parentElement;
      }
      return parts.join(' > ');
    };

    const pushIfNew = (el, formIndex) => {
      if (visited.has(el)) return;
      visited.add(el);
      raw.push({ attributes: readAttributes(el), formIndex: formIndex, domPath: domPathOf(el) });
    };

    const forms = Array.from(document.querySelectorAll('form'));
    forms.forEach(function (form, formIndex) {
      form.querySelectorAll('input, button, textarea, select').forEach(function (el) {
        pushIfNew(el, formIndex);
      });
    });

    document.querySelectorAll('input, button, textarea, select').forEach(function (el) {
      if (!el.closest('form')) pushIfNew(el, -1);
    });

    return raw;
  }
`;

async function runCollector(page: Page): Promise<RawElement[]> {
  const result = await page.evaluate(`(${COLLECT_PAGE_ELEMENTS_SOURCE})()`);
  return result as RawElement[];
}

/**
 * Picks the first candidate selector that uniquely matches exactly one element.
 * Falls back to the computed DOM path, and finally to the top candidate with an
 * explicit `nth=0` disambiguation as a last resort.
 */
async function resolveUniqueSelector(page: Page, raw: RawElement): Promise<string> {
  const candidates = generateSelectorCandidates(raw.attributes);

  for (const candidate of candidates) {
    try {
      if ((await page.locator(candidate).count()) === 1) {
        return candidate;
      }
    } catch {
      // Invalid selector for this page — keep trying the next candidate.
    }
  }

  try {
    if ((await page.locator(raw.domPath).count()) === 1) {
      return raw.domPath;
    }
  } catch {
    // Fall through to the last resort.
  }

  return `${candidates[0] ?? raw.domPath} >> nth=0`;
}

function groupByForm(elements: ClassifiedElement[]): Map<number, ClassifiedElement[]> {
  const groups = new Map<number, ClassifiedElement[]>();
  for (const element of elements) {
    const list = groups.get(element.formIndex) ?? [];
    list.push(element);
    groups.set(element.formIndex, list);
  }
  return groups;
}

function pickByRole(elements: ClassifiedElement[]): LoginSelectorMap {
  const best = (role: ElementRole): string | undefined =>
    elements
      .filter((element) => element.role === role)
      .sort((a, b) => b.score - a.score)[0]?.selector;

  const map: LoginSelectorMap = {};
  const email = best('email');
  const password = best('password');
  const username = best('username');
  const submit = best('submit');
  if (email) map.email = email;
  if (password) map.password = password;
  if (username) map.username = username;
  if (submit) map.submit = submit;
  return map;
}

/**
 * Detects the most likely login form: a <form> (or orphaned set of fields)
 * that contains at least one password field together with an email/username
 * field. The highest-scoring candidate group wins.
 */
function buildLoginMap(byForm: Map<number, ClassifiedElement[]>): LoginSelectorMap | undefined {
  let candidate: ClassifiedElement[] | undefined;
  let bestScore = 0;

  for (const [formIndex, elements] of byForm) {
    if (formIndex < 0) {
      continue;
    }
    const roles = new Set(elements.map((element) => element.role));
    const hasPassword = roles.has('password');
    const hasUser = roles.has('email') || roles.has('username');
    if (!hasPassword || !hasUser) {
      continue;
    }
    const score = elements.reduce((sum, element) => sum + element.score, 0);
    if (score > bestScore) {
      bestScore = score;
      candidate = elements;
    }
  }

  if (!candidate) {
    const standalone = [...byForm.entries()]
      .filter(([formIndex]) => formIndex < 0)
      .flatMap(([, elements]) => elements);
    const roles = new Set(standalone.map((element) => element.role));
    if (roles.has('password') && (roles.has('email') || roles.has('username'))) {
      candidate = standalone;
    }
  }

  return candidate ? pickByRole(candidate) : undefined;
}

function buildFormsMap(byForm: Map<number, ClassifiedElement[]>): Record<string, FormSelectorMap> {
  const forms: Record<string, FormSelectorMap> = {};
  const sorted = [...byForm.entries()]
    .filter(([formIndex]) => formIndex >= 0)
    .sort((a, b) => a[0] - b[0]);

  for (const [formIndex, elements] of sorted) {
    const map = pickByRole(elements);
    if (Object.keys(map).length > 0) {
      forms[`form-${formIndex + 1}`] = map;
    }
  }

  return forms;
}

/**
 * Analyzes a live page: extracts every interactive element, classifies them,
 * resolves unique Playwright selectors and returns a reusable SelectorMap.
 */
export async function analyzePage(page: Page, url: string): Promise<SelectorMap> {
  const rawElements = await runCollector(page);

  const classified: ClassifiedElement[] = [];
  for (const raw of rawElements) {
    const { role, score } = classifyElement(raw.attributes);
    const selector = role === 'other' ? '' : await resolveUniqueSelector(page, raw);
    classified.push({ ...raw, role, score, selector });
  }

  const byForm = groupByForm(classified);

  return {
    url,
    domain: getDomainFromUrl(url),
    analyzedAt: new Date().toISOString(),
    login: buildLoginMap(byForm),
    forms: buildFormsMap(byForm)
  };
}
