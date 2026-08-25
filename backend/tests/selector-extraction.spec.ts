import { test, expect } from '@playwright/test';
import { analyzePage } from '../src/analyzer.js';
import { learnSelectors } from '../src/learning.js';
import { loadDotEnv } from '../src/env.js';
import { saveSelectorMap } from '../src/storage.js';
import type { SelectorMap } from '../src/selector-types.js';

loadDotEnv();

const baseUrl = (process.env.SELECTOR_URL ?? process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const mode = (process.env.SELECTOR_MODE ?? 'learn').toLowerCase();

test.describe(`Selector extraction for ${baseUrl}`, () => {
  test('extract interactive elements and persist the selector knowledge base', async ({ page }) => {
    test.setTimeout(90_000);

    console.log(`Navigating to ${baseUrl} ...`);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    let map: SelectorMap;
    let filePath: string;

    if (mode === 'learn') {
      const result = await learnSelectors(page, baseUrl);
      map = result.map;
      filePath = result.filePath || saveSelectorMap(map);
      console.log(`Updated fields: ${result.updatedFields.join(', ') || 'none'}`);
    } else {
      map = await analyzePage(page, baseUrl);
      filePath = saveSelectorMap(map);
    }

    console.log(`Saved to: ${filePath}`);
    console.log(JSON.stringify(map, null, 2));

    expect(map.domain).toBeTruthy();
    expect(map.url).toBe(baseUrl);
    expect(filePath).toContain(map.domain);
    expect(map.login, 'expected the page to expose a login form (email/password)').toBeTruthy();
    expect(Object.keys(map.login ?? {}).length).toBeGreaterThan(0);
  });
});
