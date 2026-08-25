import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RepairPlan } from './types.js';
import { syntaxCheck } from './validator.js';

export class PatchError extends Error {}

export function scenarioSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface PatchEdit {
  description: string;
  atLine?: number;
}

export interface PatchResult {
  file: string;
  applied: boolean;
  backupPath?: string;
  before?: string;
  after?: string;
  edits: PatchEdit[];
  error?: string;
}

export interface ApplyRepairOptions {
  attempt: number;
  backupsDir?: string;
  testDir?: string;
}

/**
 * Replaces a locator argument wherever it appears as the FULL argument of a
 * `locator("...")` call — NOT as the base of a longer " >> " chain (those
 * strings differ, so they are naturally skipped). The replacement is re-quoted
 * with single quotes when the wrapper chain contains double quotes, keeping the
 * patched file valid TypeScript.
 */
function replaceSafeLocator(source: string, current: string, replacement: string): { content: string; edits: PatchEdit[] } {
  if (!current || !replacement || current === replacement) {
    return { content: source, edits: [] };
  }

  const quoteChar = replacement.includes('"') ? "'" : '"';
  let count = 0;
  const content = source.replace(/locator\(\s*(['"])((?:\\.|(?!\1)[^\\])*?)\1\s*\)/g, (match, _quote: string, inner: string) => {
    if (inner !== current) {
      return match;
    }
    count += 1;
    return `locator(${quoteChar}${replacement}${quoteChar})`;
  });

  if (count === 0) {
    return { content: source, edits: [] };
  }
  return {
    content,
    edits: [{ description: `Replaced standalone locator "${current}" with "${replacement}" (${count} occurrence(s)).` }]
  };
}

interface InteractionCapture {
  statement: string;
  locator: string;
  method: string;
  args: string;
}

/** Captures a full single-line `await page.locator("X").method(args);` statement. */
function captureInteraction(line: string): InteractionCapture | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('await') || !trimmed.endsWith(';')) {
    return undefined;
  }
  const locatorMatch = trimmed.match(/locator\(\s*["']([^"']+)["']/);
  if (!locatorMatch) {
    return undefined;
  }
  const methodMatch = trimmed.match(/\.(click|dblclick|hover|fill|press|type|selectOption|check|uncheck|tap|focus)\s*\(/);
  if (!methodMatch) {
    return undefined;
  }
  const method = methodMatch[1];
  const open = trimmed.indexOf(`.${method}(`);
  const afterOpen = trimmed.slice(open + method.length + 2);
  const close = afterOpen.lastIndexOf(')');
  const args = close >= 0 ? afterOpen.slice(0, close) : '';
  return { statement: trimmed, locator: locatorMatch[1], method, args };
}

/**
 * Wraps a failing single-line interaction with an explicit visibility guard
 * (mirrors the generation guidance for conditionally-visible buttons):
 *
 *   const el_1 = page.locator("X");
 *   if (await el_1.isVisible()) {
 *     await el_1.click(...);
 *   }
 */
function wrapInteractionWithVisibilityGuard(
  source: string,
  lineNumber: number,
  variablePrefix = 'el'
): { content: string; edits: PatchEdit[] } {
  const lines = source.split('\n');
  const index = lineNumber - 1;
  if (index < 0 || index >= lines.length) {
    return { content: source, edits: [] };
  }
  const capture = captureInteraction(lines[index]);
  if (!capture) {
    return { content: source, edits: [] };
  }

  const indent = lines[index].match(/^\s*/)?.[0] ?? '';
  const varName = `${variablePrefix}_${lineNumber}`;
  const argsSuffix = capture.args ? `(${capture.args})` : '()';
  const block = [
    `${indent}const ${varName} = page.locator("${capture.locator}");`,
    `${indent}if (await ${varName}.isVisible()) {`,
    `${indent}  await ${varName}.${capture.method}${argsSuffix};`,
    `${indent}}`
  ];

  lines[index] = block.join('\n');
  return {
    content: lines.join('\n'),
    edits: [
      {
        description: `Wrapped the ${capture.method}() on "${capture.locator}" in an isVisible() guard at line ${lineNumber}.`,
        atLine: lineNumber
      }
    ]
  };
}

/**
 * Raises the test timeout by inserting `test.setTimeout(...)` right after the
 * `test("...", ...)` declaration when one is not already present. Safe for any
 * generated Playwright spec.
 */
function addTestTimeout(source: string, timeoutMs = 60000): { content: string; edits: PatchEdit[] } {
  if (source.includes('test.setTimeout')) {
    return { content: source, edits: [] };
  }
  const lines = source.split('\n');
  const index = lines.findIndex((line) => /^\s*test\(\s*["']/.test(line));
  if (index < 0) {
    return { content: source, edits: [] };
  }
  const indent = lines[index].match(/^\s*/)?.[0] ?? '';
  lines.splice(index + 1, 0, `${indent}  test.setTimeout(${timeoutMs});`);
  return {
    content: lines.join('\n'),
    edits: [{ description: `Added test.setTimeout(${timeoutMs}) after the test() declaration (line ${index + 1}).`, atLine: index + 1 }]
  };
}

/**
 * Replaces a dropdown option text (or a set of scenario-outline placeholders)
 * inside the generated test, keeping the surrounding getByText(..., { exact })
 * call intact.
 */
function replaceDataOption(source: string, current: string, replacement: string): { content: string; edits: PatchEdit[] } {
  if (!current || !replacement || current === replacement) {
    return { content: source, edits: [] };
  }

  let content = source;
  const edits: PatchEdit[] = [];

  const currentTokens = current
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  const replacementTokens = replacement
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  const isPlaceholders = currentTokens.length > 0 && currentTokens.every((token) => /^<.+>$/.test(token));

  if (isPlaceholders) {
    const pairs = currentTokens.map((token, index) => [token, replacementTokens[index]] as const);
    for (const [placeholder, value] of pairs) {
      if (!value) {
        continue;
      }
      const count = content.split(placeholder).length - 1;
      if (count > 0) {
        content = content.split(placeholder).join(value);
        edits.push({ description: `Replaced placeholder ${placeholder} with "${value}" (${count} occurrence(s)).` });
      }
    }
    return { content, edits };
  }

  // Target the exact getByText(...) call with the option text, quoted either way.
  const quoteVariants = [`["']`, `["']`];
  let replaced = false;
  for (const quote of quoteVariants) {
    const pattern = new RegExp(
      `(getByText\\(\\s*${quote})${escapeRegExp(current)}(${quote}(?:,\\s*\\{[^}]*\\})?\\s*\\))`,
      'g'
    );
    const matches = content.match(pattern) ?? [];
    if (matches.length > 0) {
      content = content.replace(pattern, `$1${replacement}$2`);
      edits.push({ description: `Replaced dropdown option "${current}" with "${replacement}" in getByText() (${matches.length} occurrence(s)).` });
      replaced = true;
    }
  }

  if (!replaced) {
    const count = content.split(current).length - 1;
    if (count > 0) {
      content = content.split(current).join(replacement);
      edits.push({ description: `Replaced "${current}" with "${replacement}" (${count} plain occurrence(s)).` });
    }
  }

  return { content, edits };
}

/**
 * Computes the concrete, deterministic edit for a RepairPlan against the
 * current test source. Returns the patched content plus a description of each
 * edit. Never writes to disk.
 */
export function computePatch(plan: RepairPlan, source: string): { content: string; edits: PatchEdit[] } {
  const line = plan.actions[0]?.line ?? undefined;
  const current = plan.currentValue;
  const replacement = plan.replacementValue;

  switch (plan.repairType) {
    case 'replace_selector':
    case 'disambiguate_selector':
    case 'use_choices_wrapper':
    case 'correct_interaction':
      if (current && replacement) {
        return replaceSafeLocator(source, current, replacement);
      }
      return { content: source, edits: [] };

    case 'add_visibility_guard':
      if (typeof line === 'number') {
        return wrapInteractionWithVisibilityGuard(source, line);
      }
      return { content: source, edits: [] };

    case 'add_wait_strategy':
    case 'increase_timeout':
      return addTestTimeout(source);

    case 'replace_test_data':
    case 'fix_examples_table':
      if (current && replacement) {
        return replaceDataOption(source, current, replacement);
      }
      return { content: source, edits: [] };

    default:
      return { content: source, edits: [] };
  }
}

/**
 * Applies a repair to the target test file:
 *  1. computes the deterministic patch;
 *  2. syntax-checks the patched content (never write broken TypeScript);
 *  3. backs up the previous state (original + attempt snapshot);
 *  4. writes the patched file.
 *
 * Returns `{ applied: false }` when the patch is a no-op or was already applied.
 */
export async function applyRepair(
  plan: RepairPlan,
  options: ApplyRepairOptions
): Promise<PatchResult> {
  const file = plan.sourceFile ?? plan.actions[0]?.file;
  if (!file) {
    return { file: '(none)', applied: false, edits: [], error: 'No target file in the plan.' };
  }

  let before: string;
  try {
    before = await readFile(file, 'utf8');
  } catch {
    return { file, applied: false, edits: [], error: `Could not read target file "${file}".` };
  }

  const { content, edits } = computePatch(plan, before);
  if (edits.length === 0 || content === before) {
    return { file, applied: false, before, after: before, edits, error: 'Patch produced no changes (already applied or no-op).' };
  }

  const syntax = syntaxCheck(content);
  if (!syntax.ok) {
    return { file, applied: false, before, edits, error: `Patched file failed syntax check: ${syntax.error}` };
  }

  const slug = scenarioSlug(plan.scenario);
  const backupsDir = options.backupsDir ?? path.resolve('repair-backups');
  const scenarioDir = path.join(backupsDir, slug);
  await mkdir(scenarioDir, { recursive: true });

  const originalPath = path.join(scenarioDir, 'original.spec.ts');
  try {
    await readFile(originalPath, 'utf8');
  } catch {
    await writeFile(originalPath, before, 'utf8');
  }

  const attemptPath = path.join(scenarioDir, `attempt-${options.attempt}-before.spec.ts`);
  await writeFile(attemptPath, before, 'utf8');

  await writeFile(file, content, 'utf8');

  return {
    file,
    applied: true,
    backupPath: originalPath,
    before,
    after: content,
    edits
  };
}

/** Restores a test file from its original backup (rollback on failed repairs). */
export async function rollbackRepair(backupPath: string | undefined, file: string): Promise<boolean> {
  if (!backupPath) {
    return false;
  }
  try {
    await copyFile(backupPath, file);
    return true;
  } catch {
    return false;
  }
}
