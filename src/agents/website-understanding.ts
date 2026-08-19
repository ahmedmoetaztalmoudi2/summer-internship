import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolveUniqueSelector } from '../analyzer.js';
import { classifyElement } from '../classifier.js';
import { getDomainFromUrl, loadSelectorMap, saveSelectorMap } from '../storage.js';
import type { PageElementRecord, PageSelectorMap, SelectorMap } from '../selector-types.js';
import { collectPageElements } from '../tools/dom-collector.js';
import type { CollectedElement } from '../tools/dom-collector.js';
import { interactionForWidget, normalizeWidget } from '../tools/widget-detector.js';

export interface WebsiteUnderstandingOptions {
  url: string;
  headless?: boolean;
  /** Extra wait after page load so JS-rendered content (Choices.js, AJAX lists) appears. */
  waitMs?: number;
}

export interface WebsiteUnderstandingResult {
  domain: string;
  pagePath: string;
  elementCount: number;
  map: PageSelectorMap;
  filePath: string;
}

function camelCase(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
}

function keyForElement(element: CollectedElement): string | undefined {
  const tag = element.attributes.tagName.toLowerCase();
  const id = element.attributes.id?.trim();
  const name = element.attributes.name?.trim();
  const placeholder = element.attributes.placeholder?.trim();

  if (id) {
    return `${tag}_${camelCase(id)}`;
  }
  if (name) {
    return `${tag}_${camelCase(name)}`;
  }
  if (placeholder && placeholder.length >= 3) {
    return `${tag}_${camelCase(placeholder)}`;
  }
  return undefined;
}

function labelForElement(element: CollectedElement): string | undefined {
  const attrs = element.attributes;
  if (element.options && element.options.length > 0) {
    return element.options[0].label;
  }
  if (attrs.innerText) {
    return attrs.innerText.trim().slice(0, 80);
  }
  if (attrs.placeholder) {
    return attrs.placeholder;
  }
  if (attrs.ariaLabel) {
    return attrs.ariaLabel;
  }
  if (attrs.name) {
    return attrs.name;
  }
  return undefined;
}

/**
 * Adds stable wrapper/dropdown selectors for a Choices.js-enhanced <select>.
 * The native <select> is hidden, so tests must open the visible wrapper
 * (.choices__inner) and click an option inside the dropdown list. The record
 * stores those two extra locators so no test generation step has to derive them.
 */
async function addChoicesSelectors(page: Page, map: PageSelectorMap, baseKey: string, id: string): Promise<void> {
  const container = `#${id} >> xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," choices ")][1]`;
  if ((await page.locator(container).count()) !== 1) {
    return;
  }

  const inner = `${container} >> css=.choices__inner`;
  const dropdown = `${container} >> css=.choices__list--dropdown`;

  if ((await page.locator(inner).count()) === 1) {
    map[`${baseKey}_choicesInner`] = {
      selector: inner,
      widgetType: 'container',
      interaction: 'click',
      label: 'Choices dropdown opener',
      note: 'Click to open the dropdown; the native select is hidden.'
    };
  }
  if ((await page.locator(dropdown).count()) === 1) {
    map[`${baseKey}_choicesDropdown`] = {
      selector: dropdown,
      widgetType: 'container',
      interaction: 'selectOption',
      label: 'Choices dropdown list',
      note: 'Click an option inside this list by its exact visible text.'
    };
  }
}

const EVENT_CONTAINER_IDS = ['dynamic_data', 'results', 'events', 'event-list', 'list', 'cards'];
const EVENT_CARD_CANDIDATES = ['.tour_container', '.event-card', '.event', '.card', '.item', '[class*="event"]'];

/**
 * Detects a dynamic results container (loaded via JS after page load) and the
 * repeating card inside it. Tests use these to assert that events are displayed.
 */
async function addResultContainers(page: Page, map: PageSelectorMap): Promise<void> {
  for (const containerId of EVENT_CONTAINER_IDS) {
    const container = `#${containerId}`;
    if ((await page.locator(container).count()) !== 1) {
      continue;
    }
    for (const candidate of EVENT_CARD_CANDIDATES) {
      const cardSelector = `${container} ${candidate}`;
      if ((await page.locator(cardSelector).count()) > 0) {
        map.eventList = {
          selector: container,
          widgetType: 'container',
          interaction: 'assert',
          label: 'Dynamic results list'
        };
        map.eventCard = {
          selector: cardSelector,
          widgetType: 'container',
          interaction: 'assert',
          label: 'Results card'
        };
        return;
      }
    }
  }
}

/**
 * Website Understanding Agent.
 *
 * Browsers to the target URL, captures every interactive element from the
 * live DOM, verifies a unique Playwright selector for each, detects the widget
 * type (input/button/native-select/Choices.js/modal/table/...) and persists the
 * result into the domain knowledge base under pages[<path>].
 *
 * Reuses analyzer.ts (selector resolution), classifier.ts (roles), storage.ts
 * (knowledge base load/save/merge). The generated knowledge base is the ONLY
 * source of selectors for later test generation — no invention allowed.
 */
export async function analyzeWebsite(options: WebsiteUnderstandingOptions): Promise<WebsiteUnderstandingResult> {
  const browser = await chromium.launch({ headless: options.headless ?? true });

  try {
    const page = await browser.newPage();
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(options.waitMs ?? 3000);

    const collected = await collectPageElements(page);
    const map: PageSelectorMap = {};

    for (const element of collected) {
      const key = keyForElement(element);
      if (!key) {
        continue;
      }

      const selector = await resolveUniqueSelector(page, element);
      if (!selector) {
        continue;
      }

      const widgetType = normalizeWidget(element.widget);
      const { role } = classifyElement(element.attributes);

      const record: PageElementRecord = {
        selector,
        widgetType,
        interaction: interactionForWidget(widgetType),
        label: labelForElement(element),
        role: role !== 'other' ? role : undefined
      };

      if (element.options && element.options.length > 0) {
        record.options = element.options;
      }
      if (element.hidden) {
        record.note = 'Hidden in DOM at analysis time (enhanced widget, utility field or lazy-loaded element).';
      }
      if (element.href) {
        record.note = record.note ? `${record.note} href=${element.href}` : `href=${element.href}`;
      }

      if (widgetType === 'choices' && element.attributes.id) {
        await addChoicesSelectors(page, map, key, element.attributes.id);
      }

      map[key] = record;
    }

    await addResultContainers(page, map);

    const domain = getDomainFromUrl(options.url);
    const pagePath = new URL(options.url).pathname || '/';
    const existing = loadSelectorMap(domain);
    const merged: SelectorMap = {
      ...existing,
      url: options.url,
      domain,
      analyzedAt: new Date().toISOString(),
      pages: {
        ...existing?.pages,
        [pagePath]: map
      }
    };

    const filePath = saveSelectorMap(merged);
    return { domain, pagePath, elementCount: Object.keys(map).length, map, filePath };
  } finally {
    await browser.close();
  }
}
