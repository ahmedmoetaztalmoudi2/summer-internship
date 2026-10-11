import { chromium } from '@playwright/test';
import { classifyElement } from './classifier.js';
import type { ElementAttributes, ElementRole } from './selector-types.js';

/**
 * Form field descriptor returned to the frontend.
 */
export interface DetectableField {
  name: string;
  label: string;
  type:
    | 'text'
    | 'email'
    | 'password'
    | 'tel'
    | 'number'
    | 'date'
    | 'textarea'
    | 'select'
    | 'combobox'
    | 'checkbox'
    | 'radio'
    | 'url';
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
}

/** Context used to decide which page(s) of the site to scan. */
export interface FieldDetectionContext {
  baseUrl: string;
  /** Jira ticket summary/description used to infer the target form. */
  ticketText?: string;
}

const COLLECT_SOURCE = `
  () => {
    const visited = new Set();
    const raw = [];
    const readAttributes = (el) => {
      const input = el;
      let labelText = '';
      const id = el.getAttribute('id');
      if (id) {
        const labelEl = document.querySelector('label[for="' + CSS.escape(id) + '"]');
        if (labelEl) labelText = (labelEl.textContent || '').trim();
      }
      if (!labelText && el.closest('label')) {
        labelText = (el.closest('label').innerText || '').trim();
      }
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        tagName: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || undefined,
        name: el.getAttribute('name') || undefined,
        id: id || undefined,
        placeholder: el.getAttribute('placeholder') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        innerText: labelText || (el.textContent || '').trim() || undefined,
        value: typeof input.value === 'string' ? input.value : undefined,
        required: el.hasAttribute('required'),
        hiddenByCss: style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0 || style.opacity === '0',
        ariaHidden: el.getAttribute('aria-hidden') === 'true',
        role: el.getAttribute('role') || undefined,
        isSelect: el.tagName.toLowerCase() === 'select',
        formIndex: -1,
        options: (() => {
          if (el.tagName.toLowerCase() === 'select') {
            return Array.from(el.options).map(function (o) {
              return { value: o.value, label: o.text || o.value };
            });
          }
          return undefined;
        })()
      };
    };
    const forms = Array.from(document.querySelectorAll('form'));
    forms.forEach(function (form, formIndex) {
      form.querySelectorAll('input:not([type="hidden"]), textarea, select, [role="combobox"]').forEach(function (el) {
        if (visited.has(el)) return;
        visited.add(el);
        const attrs = readAttributes(el);
        attrs.formIndex = formIndex;
        raw.push({ attributes: attrs });
      });
    });
    document.querySelectorAll('input:not([type="hidden"]), textarea, select, [role="combobox"]').forEach(function (el) {
      if (!visited.has(el) && !el.closest('form')) {
        visited.add(el);
        raw.push({ attributes: readAttributes(el) });
      }
    });
    return raw;
  }
`;

const INPUT_TYPE_TO_FIELD: Record<string, DetectableField['type']> = {
  email: 'email',
  password: 'password',
  tel: 'tel',
  number: 'number',
  date: 'date',
  text: 'text',
  url: 'url',
  checkbox: 'checkbox',
  radio: 'radio',
};

const SKIPPED_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'file', 'image']);

const HIDDEN_KEYWORDS = ['csrf', 'captcha', '_token', 'token', 'code_'];

/** Keywords that label a field as a spam-trap "honeypot" input. */
const HONEYPOT_KEYWORDS = [
  'honey', 'honeypot', 'hp_', 'url_', 'website_url', 'your_website',
  'spam', 'gotcha', 'fax', 'phone_number',
];

/**
 * Maps ticket keywords to likely page path fragments on the target site.
 * Used to decide which page(s) to scan beyond the homepage.
 */
const TICKET_PAGE_HINTS: Array<{ keywords: string[]; paths: string[] }> = [
  {
    keywords: ['register', 'signup', 'sign up', 'sign-up', 'creer un compte', 'créer un compte', 'inscr', 'new client', 'nouveau client', 'create account', 'creation de compte', 'création de compte'],
    paths: ['user/register', 'register', 'signup', 'user/signup', 'account/register', 'creer-compte'],
  },
  {
    keywords: ['login', 'log in', 'sign in', 'signin', 'sign-in', 'se connecter', 'connecter', 'connexion', 'authentif'],
    paths: ['user/login', 'login', 'signin', 'user/signin', 'account/login', 'auth'],
  },
  {
    keywords: ['profile', 'profil', 'account', 'compte', 'settings', 'parametre', 'paramètres'],
    paths: ['user/profile', 'profile', 'account', 'mon-compte', 'user/account'],
  },
  {
    keywords: ['search', 'recherche', 'rechercher', 'filter', 'filtre'],
    paths: ['search', 'recherche', 'catalogue', 'category', 'categories', 'evenements', 'events'],
  },
];

/**
 * Builds the list of page URLs to scan based on the site base URL and the
 * Jira ticket text (keywords + full URLs mentioned in the description).
 */
function buildCandidatePaths(context: FieldDetectionContext): string[] {
  const base = context.baseUrl.replace(/\/+$/, '');

  // Preserve any full URLs explicitly mentioned in the ticket text.
  const urls = new Set<string>();
  if (context.ticketText) {
    const urlPattern = /(https?:\/\/[^\s)\]"',.]+)/gi;
    let m;
    while ((m = urlPattern.exec(context.ticketText)) !== null) {
      try {
        const u = new URL(m[1]);
        // Only keep URLs from the same host as the target site.
        if (u.origin && base.includes(new URL(base).host)) {
          urls.add(u.origin + u.pathname.replace(/\/+$/, ''));
        }
      } catch { /* ignore malformed url */ }
    }
  }

  const paths = new Set<string>(['']);
  const textLower = (context.ticketText ?? '').toLowerCase();

  for (const hint of TICKET_PAGE_HINTS) {
    if (hint.keywords.some((k) => textLower.includes(k))) {
      for (const p of hint.paths) paths.add('/' + p);
    }
  }

  // Assemble final candidate list: explicit ticket URLs first, then heuristic paths, then homepage.
  const final: string[] = [];
  for (const u of urls) if (!final.includes(u)) final.push(u);
  for (const p of paths) {
    const url = p === '' ? base : `${base}${p.startsWith('/') ? p : '/' + p}`;
    if (!final.includes(url)) final.push(url);
  }
  return final;
}

/**
 * Detects form fields on the given site by scanning the homepage plus any
 * pages implied by the Jira ticket text. Returns up to 12 distinct fields.
 */
export async function detectFormFields(context: FieldDetectionContext): Promise<DetectableField[]> {
  const candidates = buildCandidatePaths(context);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const seen = new Set<string>();
    const fields: DetectableField[] = [];

    for (const url of candidates) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1200);

      const raw = (await page.evaluate(`(${COLLECT_SOURCE})()`).catch(() => [])) as Array<{
        attributes: ElementAttributes & {
          required?: boolean;
          formIndex?: number;
          hiddenByCss?: boolean;
          ariaHidden?: boolean;
          isSelect?: boolean;
          role?: string;
          options?: { value: string; label: string }[];
        };
      }>;

      for (const item of raw) {
        const a = item.attributes;
        const tag = a.tagName;
        const type = (a.type ?? '').toLowerCase();

        // Skip buttons / non-input widgets
        if (tag === 'button') continue;
        if (tag === 'input' && (SKIPPED_TYPES.has(type) || !type)) continue;

        // Skip fields hidden via aria-hidden
        if (a.ariaHidden) continue;

        // Skip security/csrf/captcha fields
        const haystack = `${a.name ?? ''} ${a.id ?? ''} ${a.ariaLabel ?? ''} ${a.placeholder ?? ''}`.toLowerCase();
        if (HIDDEN_KEYWORDS.some((k) => haystack.includes(k))) continue;

        // Skip honeypot / spam-trap fields (identified by name, independent of CSS visibility)
        const nameLower = (a.name ?? '').toLowerCase();
        if (HONEYPOT_KEYWORDS.some((k) => nameLower.includes(k))) continue;

        // Derive a stable name
        const fieldName = (a.name ?? a.id ?? '').trim();
        if (!fieldName) continue;

        // Don't duplicate the same named field across pages
        if (seen.has(fieldName)) continue;
        seen.add(fieldName);

        // Derive a human label
        const label = a.innerText || a.ariaLabel || a.placeholder || prettyName(fieldName);

        // Determine field type
        let fieldType: DetectableField['type'] = 'text';
        if (tag === 'textarea') fieldType = 'textarea';
        else if (tag === 'select' || a.isSelect) fieldType = 'select';
        else if (a.role === 'combobox') fieldType = 'combobox';
        else fieldType = INPUT_TYPE_TO_FIELD[type] ?? 'text';

        fields.push({
          name: fieldName,
          label,
          type: fieldType,
          required: a.required || (a.formIndex ?? -1) >= 0,
          placeholder: a.placeholder,
          options: a.isSelect ? a.options : undefined,
        });
      }

      // Stop early once we have a reasonable set of non-homepage fields.
      if (fields.filter((f) => f.name !== 'q' && f.name !== 'search').length >= 3) break;
    }

    // If the ticket targets a specific form (login/signup/account), drop the
    // generic homepage search/navigation fields, which are not form data.
    const hasSpecificFormHint = TICKET_PAGE_HINTS.slice(0, 3).some((hint) =>
      hint.keywords.some((k) => (context.ticketText ?? '').toLowerCase().includes(k)),
    );
    if (hasSpecificFormHint) {
      return fields
        .filter((f) => f.name !== 'q' && f.name !== 'search')
        .slice(0, 12);
    }

    return fields.slice(0, 12);
  } catch (err) {
    console.warn(`Field detection failed for ${context.baseUrl}:`, err);
    return [];
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function prettyName(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
