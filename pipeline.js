require('dotenv').config({ quiet: true });
const { getAllTickets } = require('./jira-fetcher');
const { generateAndSaveFeature } = require('./gherkin-generator');

/**
 * Runs the Jira -> ADF -> Gherkin Generator pipeline.
 * Halts after Step 3 (saving Gherkin .feature file).
 *
 * @param {string} [ticketKey] - Optional Jira ticket key (e.g. 'SCRUM-1')
 * @param {object} [options]
 */
async function runPipeline(ticketKey, options = {}) {
  const provider = options.provider || process.env.LLM_PROVIDER || 'groq';

  console.log('====================================================');
  console.log('   Jira AI Gherkin Generator Pipeline (Step 1-3)    ');
  console.log('====================================================\n');
  console.log(`LLM provider: ${provider}\n`);

  if (ticketKey) {
    await processSingleTicket(ticketKey, provider);
    return;
  }

  console.log('Fetching all project tickets from Jira...');
  const tickets = await getAllTickets();
  console.log(`Found ${tickets.length} tickets to process.\n`);

  for (const ticket of tickets) {
    try {
      console.log(`---> Processing ticket: ${ticket.key} - ${ticket.summary}`);
      await processSingleTicket(ticket.key, provider);
    } catch (err) {
      console.error(`[ERROR] Failed to process ${ticket.key}: ${err.message}\n`);
    }
  }

  console.log('====================================================');
  console.log('   Pipeline execution completed successfully!       ');
  console.log('====================================================');
}

async function processSingleTicket(ticketKey, provider) {
  console.log(`\n====================================================`);
  console.log(`Processing Ticket: ${ticketKey}`);
  console.log(`====================================================`);

  // Step 1 & 2 & 3: Fetch Jira, Convert ADF & LLM #1 Gherkin
  const gherkinResult = await generateAndSaveFeature(ticketKey, './features', { provider });
  console.log(`[Step 3 - Gherkin OK] Saved feature file: ${gherkinResult.featurePath}`);
  console.log(`\n[Pipeline Complete] Stopped at Step 3 (Gherkin Generation) as requested.`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const provider = parsePipelineArgs(args);
  const ticketKey = args.find((arg) => !arg.startsWith('--'));

  runPipeline(ticketKey, { provider }).catch((err) => {
    console.error('Fatal error in pipeline:', err);
    process.exit(1);
  });
}

module.exports = { runPipeline };

function parsePipelineArgs(args) {
  if (args.includes('--mock')) return 'mock';
  if (args.includes('--groq') || args.includes('--qwen')) return 'groq';

  const providerArg = args.find((arg) => arg.startsWith('--provider='));
  if (providerArg) return providerArg.split('=')[1];

  return undefined;
}
