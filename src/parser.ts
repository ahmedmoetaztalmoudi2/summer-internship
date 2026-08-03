import { readFile } from 'node:fs/promises';

export type StepType = 'Given' | 'When' | 'Then' | 'And' | 'But';

export interface ParsedStep {
  type: StepType;
  text: string;
}

export interface ParsedScenario {
  name: string;
  steps: ParsedStep[];
}

export interface ParsedFeature {
  filePath: string;
  featureName?: string;
  scenarios: ParsedScenario[];
}

const featurePattern = /^Feature:\s*(.+)$/i;
const scenarioPattern = /^Scenario(?: Outline)?:\s*(.+)$/i;
const stepPattern = /^(Given|When|Then|And|But)\s+(.+)$/i;

export async function parseFeatureFile(filePath: string): Promise<ParsedFeature> {
  const content = await readFile(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  const scenarios: ParsedScenario[] = [];
  let featureName: string | undefined;
  let currentScenario: ParsedScenario | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const featureMatch = line.match(featurePattern);
    if (featureMatch) {
      featureName = featureMatch[1].trim();
      continue;
    }

    const scenarioMatch = line.match(scenarioPattern);
    if (scenarioMatch) {
      if (currentScenario) {
        scenarios.push(currentScenario);
      }

      currentScenario = {
        name: scenarioMatch[1].trim(),
        steps: []
      };
      continue;
    }

    const stepMatch = line.match(stepPattern);
    if (stepMatch) {
      if (!currentScenario) {
        throw new Error(`Found step before scenario in ${filePath}: ${line}`);
      }

      currentScenario.steps.push({
        type: stepMatch[1].charAt(0).toUpperCase() + stepMatch[1].slice(1).toLowerCase() as StepType,
        text: stepMatch[2].trim()
      });
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
