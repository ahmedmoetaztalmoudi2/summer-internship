import type { ElementAttributes } from './selector-types.js';

const TEST_ID_ATTRIBUTES = ['data-testid', 'data-test', 'data-qa', 'data-cy'] as const;

/**
 * Escapes a string so it can be used as a CSS identifier (e.g. in "#my-id").
 * Mirrors the CSS.escape() behaviour for the characters that matter in real pages.
 */
function escapeCssIdentifier(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const code = value.charCodeAt(i);
    const isAlphaNumDash = /[a-zA-Z0-9_-]/.test(char);

    if (isAlphaNumDash && !(i === 0 && /[0-9]/.test(char))) {
      out += char;
    } else if (code <= 0x1f || /[~!@$%^&*()+=,./';:"?<>[\]{}|\\`#\s]/.test(char)) {
      out += `\\${code.toString(16)} `;
    } else {
      out += `\\${char}`;
    }
  }
  return out;
}

/** Escapes a value for use inside a double-quoted CSS attribute selector. */
function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Returns candidate selectors in priority order:
 * data-testid -> #id -> name -> aria-label -> placeholder -> text -> type -> tag.
 *
 * The first candidate that uniquely matches the element on the live page is
 * chosen by the analyzer. Each candidate is intentionally "soft" (attribute
 * based) and avoids nth-child unless every other option is exhausted.
 */
export function generateSelectorCandidates(attributes: ElementAttributes): string[] {
  const candidates: string[] = [];
  const tag = attributes.tagName.toLowerCase();

  for (const testIdAttribute of TEST_ID_ATTRIBUTES) {
    if (attributes.testId && attributes.testId.length > 0) {
      candidates.push(`[${testIdAttribute}="${escapeAttributeValue(attributes.testId)}"]`);
      break;
    }
  }

  if (attributes.id && attributes.id.length > 0) {
    candidates.push(`#${escapeCssIdentifier(attributes.id)}`);
  }

  if (attributes.name && attributes.name.length > 0) {
    candidates.push(`${tag}[name="${escapeAttributeValue(attributes.name)}"]`);
  }

  if (attributes.ariaLabel && attributes.ariaLabel.length > 0) {
    candidates.push(`[aria-label="${escapeAttributeValue(attributes.ariaLabel)}"]`);
  }

  if (attributes.placeholder && attributes.placeholder.length > 0) {
    candidates.push(`${tag}[placeholder="${escapeAttributeValue(attributes.placeholder)}"]`);
  }

  const text = (attributes.innerText ?? attributes.value ?? '').trim();
  if (text.length > 0 && (tag === 'button' || tag === 'a' || attributes.type === 'submit')) {
    candidates.push(`${tag}:has-text("${escapeAttributeValue(text.slice(0, 40))}")`);
  }

  if (attributes.type && attributes.type.length > 0) {
    const interestingTypes = ['email', 'password', 'submit', 'tel', 'text'];
    if (interestingTypes.includes(attributes.type)) {
      candidates.push(`${tag}[type="${escapeAttributeValue(attributes.type)}"]`);
    }
  }

  if (tag === 'input' || tag === 'button' || tag === 'textarea' || tag === 'select') {
    candidates.push(tag);
  }

  return candidates;
}

/**
 * Convenience wrapper that returns the single highest-priority selector
 * without live uniqueness verification (pure / offline friendly).
 */
export function generateSelector(attributes: ElementAttributes): string {
  return generateSelectorCandidates(attributes)[0] ?? attributes.tagName.toLowerCase();
}
