import { chromium } from '@playwright/test';
import { analyzePage } from './analyzer.js';
import { learnSelectors } from './learning.js';
import { saveSelectorMap } from './storage.js';

interface CliOptions {
  url: string;
  learn: boolean;
  headless: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const urlArg = args.find((arg) => arg.startsWith('--url='));
  const positional = args.find((arg) => !arg.startsWith('--') && /^https?:\/\//i.test(arg));
  const url = urlArg ? urlArg.split('=')[1] : positional;

  if (!url) {
    throw new Error('Missing required argument: --url=<url>');
  }

  return {
    url,
    learn: args.includes('--learn'),
    headless: !args.includes('--headed')
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ headless: options.headless });

  try {
    const page = await browser.newPage();
    console.log(`[analyze] Navigating to ${options.url} ...`);
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    if (options.learn) {
      const result = await learnSelectors(page, options.url);
      console.log(`[learn] Domain: ${result.domain}`);
      console.log(`[learn] Changed: ${result.changed} (${result.updatedFields.join(', ') || 'none'})`);
      if (result.filePath) {
        console.log(`[learn] Saved to: ${result.filePath}`);
      }
      console.log(`\n${JSON.stringify(result.map, null, 2)}`);
      return;
    }

    const map = await analyzePage(page, options.url);
    const filePath = saveSelectorMap(map);
    console.log(`[analyze] Selector map saved to: ${filePath}`);
    console.log(`\n${JSON.stringify(map, null, 2)}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('[cli] Fatal error:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
