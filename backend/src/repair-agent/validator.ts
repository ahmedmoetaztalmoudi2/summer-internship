import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import type { FailureCategory } from '../failure-analysis/types.js';
import { collectSelectorStrings } from '../failure-analysis/analyzer.js';
import type { SelectorMap } from '../selector-types.js';
import type { RepairPlan, RepairType } from './types.js';

/**
 * Failure categories that are considered SAFE to auto-repair. Everything else
 * (application bugs, authentication, navigation, unknown, assertions, flaky)
 * is escalated for human review.
 */
export const SAFE_REPAIR_FAILURE_TYPES: readonly FailureCategory[] = [
  'selector_not_found',
  'strict_mode_violation',
  'visibility_issue',
  'timeout',
  'data_issue',
  'unsupported_interaction'
];

/** Repair types the patcher knows how to turn into concrete deterministic edits. */
export const PATCHABLE_REPAIR_TYPES: readonly RepairType[] = [
  'replace_selector',
  'disambiguate_selector',
  'use_choices_wrapper',
  'add_visibility_guard',
  'add_wait_strategy',
  'increase_timeout',
  'fix_examples_table',
  'replace_test_data',
  'correct_interaction'
];

export function isSafeFailureType(failureType: string): boolean {
  return (SAFE_REPAIR_FAILURE_TYPES as readonly string[]).includes(failureType);
}

export interface ValidationResult {
  safe: boolean;
  reason: string;
  checked: string[];
}

/** TypeScript syntax gate — rejects a patched file before it is written. */
export function syntaxCheck(source: string): { ok: boolean; error?: string } {
  const fileName = 'patched.spec.ts';
  const result = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  });
  const diagnostic = result.diagnostics?.[0];
  if (diagnostic) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    const position = diagnostic.start ?? 0;
    return { ok: false, error: `Syntax error at offset ${position}: ${message}` };
  }
  return { ok: true };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Union of every verified widget option label in the knowledge base. */
function collectAllOptionLabels(selectors: SelectorMap | null): Set<string> {
  const labels = new Set<string>();
  for (const [path, page] of Object.entries(selectors?.pages ?? {})) {
    for (const [key, value] of Object.entries(page)) {
      if (value && typeof value === 'object' && Array.isArray(value.options)) {
        for (const option of value.options) {
          if (typeof option?.label === 'string' && option.label.trim()) {
            labels.add(option.label.trim().toLowerCase());
          }
        }
      }
    }
  }
  return labels;
}

/**
 * Validates a RepairPlan before it is applied to a test file.
 *
 * Safety rules enforced here:
 *  - only safe failure categories may be auto-repaired;
 *  - the plan must be repairable and must not require human review;
 *  - the target file must be a *.spec.ts (never touch arbitrary files);
 *  - selector replacements must be verified in the knowledge base (or a safe
 *    deterministic transform of the current locator);
 *  - data replacements must be verified options from the knowledge base;
 *  - only one repair strategy is applied at a time.
 */
export async function validateRepair(
  plan: RepairPlan,
  selectors: SelectorMap | null,
  testDir?: string
): Promise<ValidationResult> {
  const checked: string[] = [];

  if (!plan.repairable) {
    return { safe: false, reason: 'Plan is not repairable (diagnostic only).', checked: [...checked, 'repairable'] };
  }
  checked.push('repairable');

  if (plan.requiresHumanReview) {
    return { safe: false, reason: 'Plan requires human review.', checked: [...checked, 'requiresHumanReview'] };
  }
  checked.push('requiresHumanReview');

  if (!isSafeFailureType(plan.failureType)) {
    return {
      safe: false,
      reason: `Failure category "${plan.failureType}" is not in the safe auto-repair set — requires human review.`,
      checked: [...checked, 'failureType']
    };
  }
  checked.push('failureType');

  if (!PATCHABLE_REPAIR_TYPES.includes(plan.repairType)) {
    return {
      safe: false,
      reason: `Repair type "${plan.repairType}" has no deterministic patcher — requires human review.`,
      checked: [...checked, 'repairType']
    };
  }
  checked.push('repairType');

  const file = plan.sourceFile ?? plan.actions[0]?.file;
  if (!file || !/\.spec\.ts$/.test(file)) {
    return {
      safe: false,
      reason: `Target "${file ?? '(none)'}" is not a *.spec.ts test file — refusing to patch.`,
      checked: [...checked, 'targetFile']
    };
  }
  checked.push('targetFile');

  if (testDir) {
    const normalizedTarget = file.replace(/\\/g, '/').toLowerCase();
    const normalizedTestDir = testDir.replace(/\\/g, '/').toLowerCase();
    if (!normalizedTarget.startsWith(normalizedTestDir)) {
      return {
        safe: false,
        reason: `Target file "${file}" is outside the tests directory "${testDir}" — refusing to patch.`,
        checked: [...checked, 'targetInTestDir']
      };
    }
    checked.push('targetInTestDir');
  }

  const current = plan.currentValue;
  const replacement = plan.replacementValue;

  if (current !== undefined && replacement !== undefined) {
    const selectorRelated: RepairType[] = ['replace_selector', 'disambiguate_selector', 'use_choices_wrapper', 'correct_interaction'];
    if (selectorRelated.includes(plan.repairType)) {
      const kbSelectors = new Set(collectSelectorStrings(selectors).values());
      const chainDerived = current.includes(' >> ') || replacement.startsWith(`${current} >> `);
      const disambiguated = replacement === `${current}.first()` || replacement === `${current}.last()`;
      const verified = kbSelectors.has(replacement);
      if (!(verified || chainDerived || disambiguated)) {
        return {
          safe: false,
          reason: `Replacement selector "${replacement}" is not a verified knowledge-base selector (nor a safe transform of "${current}").`,
          checked: [...checked, 'replacementSelector']
        };
      }
      checked.push('replacementSelector');
    }

    const dataRelated: RepairType[] = ['replace_test_data', 'fix_examples_table'];
    if (dataRelated.includes(plan.repairType)) {
      const validLabels = collectAllOptionLabels(selectors);
      if (validLabels.size === 0) {
        return { safe: false, reason: 'Knowledge base has no verified option values to substitute.', checked: [...checked, 'replacementData'] };
      }
      const tokens = replacement
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean);
      const unknown = tokens.filter((token) => !validLabels.has(token.toLowerCase()));
      if (unknown.length > 0) {
        return {
          safe: false,
          reason: `Replacement value(s) ${unknown.map((token) => `"${token}"`).join(', ')} are not verified knowledge-base options.`,
          checked: [...checked, 'replacementData']
        };
      }
      checked.push('replacementData');
    }
  }

  if (plan.actions.length === 0) {
    return { safe: false, reason: 'Plan has no concrete actions to apply.', checked: [...checked, 'actions'] };
  }
  checked.push('actions');

  // Fail fast if the current file is already broken in a way we cannot fix.
  try {
    const source = await readFile(file, 'utf8');
    const syntax = syntaxCheck(source);
    if (!syntax.ok) {
      return { safe: false, reason: `Current test file is not valid TypeScript: ${syntax.error}.`, checked: [...checked, 'syntax'] };
    }
    checked.push('syntax');
  } catch {
    return { safe: false, reason: `Could not read target file "${file}".`, checked: [...checked, 'readable'] };
  }

  return { safe: true, reason: 'Repair passes all safety checks.', checked };
}
