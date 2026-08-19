import type { ElementAttributes, WidgetType } from '../selector-types.js';

const WIDGET_TYPES: readonly WidgetType[] = [
  'input',
  'textarea',
  'checkbox',
  'radio',
  'button',
  'link',
  'select',
  'choices',
  'modal',
  'table',
  'container',
  'other'
];

/**
 * Sanitizes a browser-side widget hint into a valid WidgetType.
 * Unknown/missing hints degrade to 'other'.
 */
export function normalizeWidget(value: string | undefined): WidgetType {
  if (value && (WIDGET_TYPES as readonly string[]).includes(value)) {
    return value as WidgetType;
  }
  return 'other';
}

/**
 * Offline (attribute-only) widget classification. Used as a fallback when the
 * browser-side hint is unavailable; the live collector remains the source of
 * truth for Choises.js/modals because those require DOM ancestor checks.
 */
export function detectWidgetType(attributes: ElementAttributes): WidgetType {
  const tag = attributes.tagName.toLowerCase();
  const type = (attributes.type ?? '').toLowerCase();

  if (tag === 'select') return 'select';
  if (tag === 'textarea') return 'textarea';
  if (tag === 'table') return 'table';
  if (tag === 'a') return 'link';
  if (tag === 'button') return 'button';
  if (tag === 'input') {
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image') return 'button';
    return 'input';
  }
  return 'other';
}

/**
 * The canonical Playwright interaction strategy for a widget type.
 * Consumed by the Interaction Adapter (later phase) and stored in the
 * knowledge base so test generation never has to guess how to drive an element.
 */
export function interactionForWidget(widgetType: WidgetType): string {
  switch (widgetType) {
    case 'input':
    case 'textarea':
      return 'fill';
    case 'checkbox':
    case 'radio':
      return 'check';
    case 'button':
    case 'link':
      return 'click';
    case 'select':
      return 'selectOption';
    case 'choices':
      return 'choicesDropdown';
    case 'modal':
      return 'open';
    case 'table':
    case 'container':
      return 'assert';
    default:
      return 'click';
  }
}
