import { readFile } from 'node:fs/promises';

export type StepType = 'Given' | 'When' | 'Then' | 'And' | 'But';

export interface ParsedStep {
  type: StepType;
  text: string;
}

export interface ParsedScenario {
  name: string;
  steps: ParsedStep[];
  examples?: string[][];
}

export interface ParsedFeature {
  filePath: string;
  featureName?: string;
  scenarios: ParsedScenario[];
}

const featurePattern = /^\s*(?:Feature|Fonctionnalité|Fonctionnalite)\s*:\s*(.+)$/i;
const scenarioPattern = /^\s*(?:Scenario Outline|Scenario Template|Scenario|Scénario|Plan du scenario|Plan du scénario)\s*:\s*(.+)$/i;
const backgroundPattern = /^\s*(?:Background|Contexte)\s*:\s*$/i;
// English + French step keywords. French keywords are mapped to their English
// StepType equivalents (e.g. "Étant donné que" -> Given, "Quand" -> When,
// "Alors" -> Then, "Et que"/"Et" -> And, "Mais" -> But).
const STEP_KEYWORD_TO_TYPE: Record<string, StepType> = {
  given: 'Given',
  when: 'When',
  then: 'Then',
  and: 'And',
  but: 'But',
  'étant donné que': 'Given',
  'étant donné': 'Given',
  'etant donné que': 'Given',
  'etant donné': 'Given',
  soit: 'Given',
  quand: 'When',
  lorsque: 'When',
  alors: 'Then',
  donc: 'Then',
  'et que': 'And',
  et: 'And',
  mais: 'But',
};

// Ordered longest-first so multi-word French keywords ("Étant donné que",
// "Et que") match before their single-word prefixes ("Étant", "Et").
const KEYWORDS = Object.keys(STEP_KEYWORD_TO_TYPE).sort((a, b) => b.length - a.length);

// Matches a known English or French step keyword, then captures the step text.
// Case-insensitive; keyword boundaries avoid matching inside longer words.
const stepPattern = new RegExp(
  '^(' +
    KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
    ')\\s+(.+)$',
  'i'
);

function stepTypeFromKeyword(keyword: string): StepType | null {
  const lower = keyword.toLowerCase();
  return STEP_KEYWORD_TO_TYPE[lower] ?? null;
}

export async function parseFeatureFile(filePath: string): Promise<ParsedFeature> {
  const content = await readFile(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  const scenarios: ParsedScenario[] = [];
  let featureName: string | undefined;
  let currentScenario: ParsedScenario | null = null;
  let backgroundSteps: ParsedStep[] = [];
  let backgroundSeen = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    if (/^Examples?\s*:\s*$/i.test(line)) {
      if (currentScenario) {
        currentScenario.examples = [];
      }
      continue;
    }

    if (line.startsWith('|') && currentScenario?.examples) {
      const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);
      currentScenario.examples.push(cells);
      continue;
    }

    if (
      currentScenario?.examples &&
      !line.startsWith('|') &&
      !stepPattern.test(line) &&
      !scenarioPattern.test(line) &&
      !featurePattern.test(line) &&
      !backgroundPattern.test(line)
    ) {
      currentScenario.examples = undefined;
    }

    const featureMatch = line.match(featurePattern);
    if (featureMatch) {
      featureName = featureMatch[1].trim();
      continue;
    }

    if (backgroundPattern.test(line)) {
      backgroundSeen = true;
      currentScenario = null;
      continue;
    }

    const scenarioMatch = line.match(scenarioPattern);
    if (scenarioMatch) {
      if (currentScenario) {
        scenarios.push(currentScenario);
      }

      currentScenario = {
        name: scenarioMatch[1].trim(),
        steps: backgroundSeen ? backgroundSteps.map((step) => ({ ...step })) : []
      };
      continue;
    }

    const stepMatch = line.match(stepPattern);
    if (stepMatch) {
      const type = stepTypeFromKeyword(stepMatch[1]);
      if (!type) {
        continue;
      }
      let text = stepMatch[2].trim();
      // For "Étant donné que ..." / "Et que ..." the connective "que" becomes
      // part of the step text; strip a leading "que" so it reads naturally.
      text = text.replace(/^que\s+/i, '').trim();

      const step: ParsedStep = { type, text };

      if (backgroundSeen && !currentScenario) {
        backgroundSteps.push(step);
        continue;
      }

      if (!currentScenario) {
        throw new Error(`Found step before scenario in ${filePath}: ${line}`);
      }

      currentScenario.steps.push(step);
    }
  }

  if (currentScenario) {
    scenarios.push(currentScenario);
  }

  if (scenarios.length === 0) {
    throw new Error(`No scenarios found in ${filePath}`);
  }

  return {
    filePath,
    featureName,
    scenarios
  };
}
