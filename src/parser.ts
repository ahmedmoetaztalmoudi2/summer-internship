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
const stepPattern = /^(Given|When|Then|And|But)\s+(.+)$/i;

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

    if (currentScenario?.examples && !line.startsWith('|') && !stepPattern.test(line)) {
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
      const step: ParsedStep = {
        type: stepMatch[1].charAt(0).toUpperCase() + stepMatch[1].slice(1).toLowerCase() as StepType,
        text: stepMatch[2].trim()
      };

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
