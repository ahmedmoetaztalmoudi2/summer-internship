export type ElementRole = 'email' | 'password' | 'username' | 'submit' | 'other';

/**
 * Serializable attributes extracted from a DOM element.
 * Only lightweight, JSON-safe fields are kept so they can round-trip
 * through page.evaluate().
 */
export interface ElementAttributes {
  tagName: string;
  type?: string;
  name?: string;
  id?: string;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  innerText?: string;
  value?: string;
  testId?: string;
}

/**
 * Raw element collected in the browser (page.evaluate).
 */
export interface RawElement {
  attributes: ElementAttributes;
  /** Index of the enclosing <form>; -1 when the element is outside any form. */
  formIndex: number;
  /** Stable, unique CSS path computed from the DOM (used as last-resort fallback). */
  domPath: string;
}

/**
 * A raw element after classification and selector resolution.
 */
export interface ClassifiedElement {
  attributes: ElementAttributes;
  role: ElementRole;
  score: number;
  selector: string;
  domPath: string;
  formIndex: number;
}

/**
 * The reusable knowledge-base entry for a login form.
 */
export interface LoginSelectorMap {
  email?: string;
  password?: string;
  username?: string;
  submit?: string;
}

/**
 * Role -> selector mapping for an arbitrary form.
 */
export interface FormSelectorMap {
  email?: string;
  password?: string;
  username?: string;
  submit?: string;
}

/**
 * Selector knowledge base stored at ./selectors/<domain>.json
 */
export interface SelectorMap {
  url: string;
  domain: string;
  analyzedAt: string;
  login?: LoginSelectorMap;
  forms?: Record<string, FormSelectorMap>;
}
