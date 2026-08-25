import type { Page } from '@playwright/test';
import { analyzePage } from './analyzer.js';
import { getDomainFromUrl, loadSelectorMap, saveSelectorMap } from './storage.js';
import type { LoginSelectorMap, SelectorMap } from './selector-types.js';

/**
 * Verifies a selector resolves to exactly one element on the live page.
 * Invalid selectors count as non-matching.
 */
export async function selectorMatches(page: Page, selector: string): Promise<boolean> {
  if (!selector) {
    return false;
  }
  try {
    return (await page.locator(selector).count()) === 1;
  } catch {
    return false;
  }
}

export interface LearnResult {
  domain: string;
  map: SelectorMap;
  changed: boolean;
  updatedFields: string[];
  filePath: string;
}

const LOGIN_FIELDS = ['email', 'password', 'username', 'submit'] as const;

/**
 * Auto-learning routine:
 *  1. Re-analyze the live page to obtain fresh candidate selectors.
 *  2. For each stored login selector, keep it only if it still matches.
 *  3. Replace broken selectors with the freshly discovered one.
 *  4. Persist the merged knowledge base and report what changed.
 */
export async function learnSelectors(page: Page, url: string): Promise<LearnResult> {
  const domain = getDomainFromUrl(url);
  const existing = loadSelectorMap(domain);
  const fresh = await analyzePage(page, url);

  const updatedFields: string[] = [];
  const login: LoginSelectorMap = {};

  for (const field of LOGIN_FIELDS) {
    const oldSelector = existing?.login?.[field];
    const newSelector = fresh.login?.[field];
    const oldStillWorks = oldSelector ? await selectorMatches(page, oldSelector) : false;

    if (oldStillWorks) {
      login[field] = oldSelector;
    } else if (newSelector) {
      login[field] = newSelector;
      if (oldSelector && oldSelector !== newSelector) {
        updatedFields.push(field);
      }
    }
  }

  const merged: SelectorMap = {
    ...existing,
    ...fresh,
    login,
    forms: { ...existing?.forms, ...fresh.forms }
  };

  const previousSignature = existing
    ? JSON.stringify({ login: existing.login, forms: existing.forms })
    : '{}';
  const nextSignature = JSON.stringify({ login: merged.login, forms: merged.forms });
  const changed = previousSignature !== nextSignature;

  if (!changed) {
    return { domain, map: merged, changed, updatedFields, filePath: '' };
  }

  const filePath = saveSelectorMap(merged);
  return { domain, map: merged, changed, updatedFields, filePath };
}
