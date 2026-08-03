import path from 'node:path';
import process from 'node:process';
import { generatePlaywrightTests } from './generator.js';
import { parseFeatureFile } from './parser.js';
import { createReport, writeReport } from './reporter.js';
import { runGeneratedTests } from './runner.js';

async function main(): Promise<void> {
  const featureInput = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('features/example.feature');
  const generatedTestsDir = path.resolve('tests/generated');
  const reportPath = path.resolve('report.json');

  const parsedFeature = await parseFeatureFile(featureInput);
  await generatePlaywrightTests(parsedFeature, generatedTestsDir);

  const executionSummary = await runGeneratedTests(generatedTestsDir);
  const report = createReport(executionSummary);

  await writeReport(report, reportPath);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
