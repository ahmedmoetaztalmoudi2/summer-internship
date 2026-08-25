import { analyzeWebsite } from './agents/website-understanding.js';

interface PageAnalyzerOptions {
  url: string;
  headless: boolean;
}

function parseArgs(args: string[]): PageAnalyzerOptions {
  const urlArg = args.find((arg) => arg.startsWith('--url='));
  const positional = args.find((arg) => !arg.startsWith('--') && /^https?:\/\//i.test(arg));
  const url = urlArg ? urlArg.split('=')[1] : positional;

  if (!url) {
    throw new Error('Missing required argument: --url=<url>');
  }

  return {
    url,
    headless: !args.includes('--headed')
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await analyzeWebsite({ url: options.url, headless: options.headless });

  console.log(`[page-analyze] Captured ${result.elementCount} element record(s) for ${result.pagePath}`);
  console.log(`[page-analyze] Saved page selectors to: ${result.filePath}`);
  console.log(`\n${JSON.stringify(result.map, null, 2)}`);
}

main().catch((error) => {
  console.error('[page-analyze] Fatal error:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
