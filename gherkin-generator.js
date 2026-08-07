require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { getTicket } = require('./jira-fetcher');

const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `
You are an expert QA Automation Engineer and BDD (Behavior-Driven Development) specialist.
Your goal is to extract business rules from a Jira user story and convert them into a clean, EXECUTABLE Gherkin .feature file grounded in the REAL page structure.

STRICT RULES (VERY IMPORTANT):
1. Match the input ticket language. If the ticket is French, use French Gherkin wording. If it is English, use English Gherkin wording.
2. Start with "Feature:" or "Fonctionnalite:" followed by a short title.
3. GROUNDING: Only write scenarios whose steps can actually be executed against the page structure provided under "Known page structure". Use ONLY the real elements (inputs, buttons, links, etc.) listed there.
4. NO HALLUCINATION: Do NOT invent user-visible messages (e.g. "Identifiants invalides"), success messages, account lock behavior, redirect targets, or any feature that is NOT present in the "Known page structure". When a scenario must assert an outcome, use generic wording such as "an error message should be displayed" or "the user should be redirected".
5. SKIP WHAT CANNOT BE EXECUTED: If an acceptance criterion has no matching element or behavior in the "Known page structure", omit that scenario entirely. Never invent a UI to cover it.
6. SUCCESSFUL LOGIN: only write a "successful login" scenario when test credentials are provided. Otherwise cover login failure only.
7. Cover happy path, edge cases and invalid inputs ONLY when they map to real, present page elements.
8. Use "Scenario Outline:" and "Examples:" only when one behavior must be tested with multiple data rows.
9. Do not reference selectors, IDs, or implementation details in the Gherkin. Keep it business-level but grounded.
10. Output raw Gherkin only. Do not wrap the answer in markdown fences.
`.trim();

const FEW_SHOT_FEATURE_EXAMPLE = `
Example Input:
Ticket: SCRUM-4
Summary: Authentication with Email and Password
Description:
As a registered user, I want to log in using my email and password so that I can access my dashboard.
Acceptance Criteria:
- Successful login redirects to dashboard.
- Display error "Invalid credentials" when email or password is wrong.
- Lock account after 5 consecutive failed attempts.

Known page structure (real DOM):
{ "login": { "email": "input[name='email']", "password": "input[name='password']", "submit": "button.btn_full" } }

Test credentials:
Not provided.

Example Output (grounded in the page structure above; "successful login" and "account lockout" are OMITTED because no credentials were provided and no lockout element exists on the page):
Feature: User Authentication

  Background:
    Given the user is on the login page

  Scenario Outline: Failed login with invalid credentials
    Given the user enters "<email>"
    And the user enters "<password>"
    When the user submits the login form
    Then an error message should be displayed

    Examples:
      | email          | password    |
      | wrong@test.com | Secret123!  |
      | user@example.com | WrongPass |
`.trim();

function buildGherkinMessages(ticket, options = {}) {
  validateTicket(ticket);

  const selectorsContext =
    options.selectors && Object.keys(options.selectors).length > 0
      ? JSON.stringify(options.selectors, null, 2)
      : 'Not provided.';

  const credentialsContext =
    options.credentials && Object.keys(options.credentials).length > 0
      ? JSON.stringify(options.credentials, null, 2)
      : 'Not provided.';

  const userPrompt = `
Jira Ticket Key: ${ticket.key}
Summary: ${ticket.summary}

Clean Description and Acceptance Criteria:
${ticket.description || 'No description provided.'}

Known page structure (real DOM — ONLY write scenarios that can be executed against these elements):
${selectorsContext}

Test credentials (only include a successful-login scenario when provided):
${credentialsContext}

Extract all business rules and acceptance criteria, then produce the complete Gherkin .feature document following the strict rules.
`.trim();

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: FEW_SHOT_FEATURE_EXAMPLE },
    { role: 'user', content: userPrompt },
  ];
}

async function generateGherkin(ticket, options = {}) {
  validateTicket(ticket);
  const provider = getLlmProvider(options);

  if (provider === 'mock') {
    const gherkinContent = generateMockGherkin(ticket);
    validateGherkinContent(gherkinContent);
    return gherkinContent;
  }

  return generateGherkinWithGroq(ticket, options);
}

function getLlmProvider(options = {}) {
  return (options.provider || process.env.LLM_PROVIDER || 'groq').toLowerCase();
}

async function generateGherkinWithGroq(ticket, options = {}) {
  const apiKey = options.apiKey || process.env.GROQ_API_KEY || process.env.LLM_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Missing GROQ_API_KEY in .env!\n' +
        'Please get a free Groq API key from https://console.groq.com/keys and set GROQ_API_KEY=gsk_... in your .env file.'
    );
  }

  const baseUrl = (options.baseUrl || process.env.GROQ_BASE_URL || DEFAULT_GROQ_BASE_URL).replace(/\/+$/, '');
  const model = options.model || process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
  const messages = buildGherkinMessages(ticket, options);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Groq API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const rawContent = data.choices?.[0]?.message?.content || '';

  const gherkinContent = cleanGherkinContent(rawContent);
  validateGherkinContent(gherkinContent);

  return gherkinContent;
}

function generateMockGherkin(ticket) {
  const title = sanitizeGherkinText(ticket.summary || ticket.key);
  const criteria = extractAcceptanceCriteria(ticket.description);

  const lines = [
    `Feature: ${title}`,
    '',
    `  # MOCK MODE: generated locally for ${ticket.key}`,
    '',
    '  Scenario: Main business behavior from the Jira story',
    '    Given the Jira user story is ready for test design',
    `    When the behavior "${title}" is analyzed`,
    '    Then at least one BDD scenario should be produced',
  ];

  if (criteria.length > 0) {
    lines.push('', '  Scenario Outline: Acceptance criteria coverage');
    lines.push('    Given the acceptance criterion "<criterion>"');
    lines.push('    When the generated test scenarios are reviewed');
    lines.push('    Then the criterion should be covered by at least one scenario');
    lines.push('', '    Examples:', '      | criterion |');

    for (const criterion of criteria) {
      lines.push(`      | ${escapeGherkinTableCell(criterion)} |`);
    }
  }

  return lines.join('\n');
}

function extractAcceptanceCriteria(description = '') {
  return String(description)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => sanitizeGherkinText(line.replace(/^[-*]\s+/, '')))
    .filter(Boolean)
    .slice(0, 10);
}

function sanitizeGherkinText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '/')
    .trim();
}

function escapeGherkinTableCell(value) {
  return sanitizeGherkinText(value).replace(/\\/g, '\\\\');
}

function validateTicket(ticket) {
  if (!ticket || typeof ticket !== 'object') {
    throw new Error('A Jira ticket object is required to generate Gherkin.');
  }

  if (!ticket.key || !ticket.summary) {
    throw new Error('Ticket must include key and summary.');
  }
}

function cleanGherkinContent(content) {
  let text = String(content || '').trim();

  const fencedBlock = text.match(/```(?:gherkin|feature)?\s*([\s\S]*?)```/i);
  if (fencedBlock) {
    text = fencedBlock[1].trim();
  }

  const featureIndex = text.search(/^\s*(Feature|Fonctionnalite|Fonctionnalité)\s*:/im);
  if (featureIndex > 0) {
    text = text.slice(featureIndex).trim();
  }

  text = text
    .replace(/^```(?:gherkin|feature)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/\n+\s*(Jira Ticket Key|Summary|Clean Description|Description and acceptance criteria)\s*:[\s\S]*$/i, '')
    .trim();

  const hasExamples = /^\s*(Examples|Exemples)\s*:/im.test(text);
  if (!hasExamples) {
    text = text.replace(/^\s*(Scenario Outline|Plan du Scenario|Plan du scénario)\s*:/gim, 'Scenario:');
  }

  return text;
}

function validateGherkinContent(content) {
  if (!content) {
    throw new Error('LLM returned an empty Gherkin response.');
  }

  const hasFeature = /^\s*(Feature|Fonctionnalite|Fonctionnalité)\s*:/im.test(content);
  const hasScenario = /^\s*(Scenario Outline|Scenario Template|Scenario|Scénario|Plan du Scenario|Plan du scénario)\s*:/im.test(
    content
  );

  if (!hasFeature || !hasScenario) {
    throw new Error('LLM response does not look like a valid Gherkin feature.');
  }
}

async function generateAndSaveFeature(ticketKey, outputDir = './features', options = {}) {
  const provider = getLlmProvider(options);
  console.log(`[Step 3] Fetching ticket ${ticketKey} from Jira...`);
  const ticket = await getTicket(ticketKey);

  if (provider === 'mock') {
    console.log(`[Step 3] Generating mock Gherkin locally for ${ticketKey}...`);
  } else {
    console.log(`[Step 3] Generating Gherkin scenarios via Groq API (Qwen 2.5) for ${ticketKey}...`);
  }

  const gherkinContent = await generateGherkin(ticket, { ...options, provider });

  const absoluteOutputDir = path.resolve(process.cwd(), outputDir);
  if (!fs.existsSync(absoluteOutputDir)) {
    fs.mkdirSync(absoluteOutputDir, { recursive: true });
  }

  const featurePath = path.join(absoluteOutputDir, `${ticketKey}.feature`);
  fs.writeFileSync(featurePath, gherkinContent, 'utf-8');

  console.log(`[Step 3] Feature file successfully saved to: ${featurePath}`);

  return {
    ticketKey,
    summary: ticket.summary,
    featurePath,
    gherkinContent,
  };
}

module.exports = {
  buildGherkinMessages,
  cleanGherkinContent,
  generateAndSaveFeature,
  generateGherkin,
  generateMockGherkin,
  generateGherkinWithGroq,
  getLlmProvider,
  validateGherkinContent,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const provider = parseProviderArg(args);
  const ticketKey = args.find((arg) => !arg.startsWith('--')) || 'SCRUM-1';

  generateAndSaveFeature(ticketKey, './features', { provider })
    .then((result) => {
      console.log('\n--- Generated Gherkin (.feature) ---\n');
      console.log(result.gherkinContent);
    })
    .catch((err) => {
      console.error(`Error generating Gherkin: ${err.message}`);
      process.exit(1);
    });
}

function parseProviderArg(args) {
  if (args.includes('--mock')) return 'mock';
  if (args.includes('--groq') || args.includes('--qwen')) return 'groq';

  const providerArg = args.find((arg) => arg.startsWith('--provider='));
  if (providerArg) return providerArg.split('=')[1];

  return undefined;
}
