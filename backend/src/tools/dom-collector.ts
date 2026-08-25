import type { Page } from '@playwright/test';
import type { ElementAttributes, SelectOptionRecord } from '../selector-types.js';

/**
 * A DOM element captured from the live page together with the extra signals
 * needed for widget-type detection (hidden state, options, links, modals).
 */
export interface CollectedElement {
  attributes: ElementAttributes;
  /** Browser-side widget hint: 'choices' | 'select' | 'button' | ... */
  widget: string;
  hidden: boolean;
  href?: string;
  dataToggle?: string;
  options?: SelectOptionRecord[];
  /** Index of the enclosing <form>; -1 when the element is outside any form. */
  formIndex: number;
  /** Stable, unique CSS path computed from the DOM (last-resort fallback). */
  domPath: string;
}

/**
 * Browser-side collector source passed to page.evaluate().
 *
 * It is kept as a plain string (not a function reference) so that bundlers
 * like esbuild/tsx cannot inject helpers (e.g. __name) into the serialized
 * body — helpers do not exist in the page's context and break execution.
 *
 * NOTE: avoid backticks and ${} inside this string; use concatenation only.
 */
const COLLECT_WIDGET_ELEMENTS_SOURCE = `
  () => {
    const result = [];
    const visited = new Set();

    const readAttributes = (el) => {
      const input = el;
      const text = (el.textContent || '').trim();
      return {
        tagName: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || undefined,
        name: el.getAttribute('name') || undefined,
        id: el.getAttribute('id') || undefined,
        className: el.getAttribute('class') || undefined,
        placeholder: el.getAttribute('placeholder') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        innerText: text.slice(0, 200) || undefined,
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

    const isHidden = (el) =>
      el.hidden === true || el.getAttribute('hidden') !== null || el.offsetParent === null;

    const detectWidget = (el) => {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      const dataToggle = el.getAttribute('data-bs-toggle');
      const role = el.getAttribute('role');
      if (tag === 'select') return el.closest('.choices') ? 'choices' : 'select';
      if (tag === 'button') return dataToggle === 'modal' ? 'modal' : 'button';
      if (tag === 'textarea') return 'textarea';
      if (tag === 'table') return 'table';
      if (tag === 'a') return dataToggle === 'modal' ? 'modal' : 'link';
      if (tag === 'input') {
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image') return 'button';
        return 'input';
      }
      if (role === 'dialog' || role === 'alertdialog') return 'modal';
      return 'other';
    };

    const readOptions = (el) => {
      if (el.tagName.toLowerCase() !== 'select') return undefined;
      const out = [];
      const wrapper = el.closest('.choices');
      if (wrapper) {
        const items = wrapper.querySelectorAll('.choices__list--dropdown .choices__item[data-value]');
        for (let i = 0; i < items.length && i < 300; i++) {
          const item = items[i];
          out.push({ value: item.getAttribute('data-value') || '', label: (item.textContent || '').trim() });
        }
        if (out.length > 0) return out;
      }
      for (let i = 0; i < el.options.length && i < 300; i++) {
        const opt = el.options[i];
        out.push({ value: opt.value || '', label: (opt.text || '').trim() });
      }
      return out;
    };

    const pushIfNew = (el, formIndex) => {
      if (visited.has(el)) return;
      visited.add(el);
      result.push({
        attributes: readAttributes(el),
        widget: detectWidget(el),
        hidden: isHidden(el),
        href: el.getAttribute('href') || undefined,
        dataToggle: el.getAttribute('data-bs-toggle') || undefined,
        options: readOptions(el),
        formIndex: formIndex,
        domPath: domPathOf(el)
      });
    };

    const forms = Array.from(document.querySelectorAll('form'));
    forms.forEach(function (form, formIndex) {
      form.querySelectorAll('input, button, textarea, select, a, table').forEach(function (el) {
        pushIfNew(el, formIndex);
      });
    });

    document.querySelectorAll(
      'input, button, textarea, select, a, table, [role="dialog"], [role="alertdialog"]'
    ).forEach(function (el) {
      if (!el.closest('form')) pushIfNew(el, -1);
    });

    return result;
  }
`;

export async function collectPageElements(page: Page): Promise<CollectedElement[]> {
  const result = await page.evaluate(`(${COLLECT_WIDGET_ELEMENTS_SOURCE})()`);
  return result as CollectedElement[];
}
