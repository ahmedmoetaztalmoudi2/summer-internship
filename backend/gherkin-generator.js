require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { getTicket } = require('./jira-fetcher');

const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_GROQ_MODEL = 'qwen/qwen3.6-27b';

const SYSTEM_PROMPT = `
You are an expert QA Automation Engineer and BDD (Behavior-Driven Development) specialist.
Your goal is to extract ALL business rules and acceptance criteria from a Jira user story and convert them into a complete, executable Gherkin .feature file.

CRITICAL OUTPUT RULES — VIOLATION WILL REJECT YOUR RESPONSE:
- You must output ONLY a valid Gherkin feature file.
- The FIRST line MUST start with "Feature:" (or "Fonctionnalite:" in French).
- Every test case MUST use "Scenario:" or "Scenario Outline:".
- Output raw Gherkin only. Do NOT wrap in markdown fences.
- Do NOT include commentary, explanations, rule-checking, or self-review after the Gherkin.

DO NOT output any of the following (these will cause validation failure):
- CSS selectors (input[, button[, select[, #id, .class, >>, nth-of-type)
- XPath expressions
- JSON or HTML
- JavaScript or TypeScript code
- Playwright methods (locator, page.locator, getByRole, etc.)
- DOM structure or element trees
- Markdown code fences

LANGUAGE RULES:
1. Match the input ticket language. If the ticket is French, use French Gherkin wording. If it is English, use English Gherkin wording.
2. Start with "Feature:" or "Fonctionnalite:" followed by a short title.

COVERAGE RULES (MOST IMPORTANT):
3. Generate a scenario for EVERY acceptance criterion in the Jira ticket. Do NOT skip any criterion.
4. If the Jira ticket lists 5 acceptance criteria, you MUST produce at least 5 scenarios (or scenario outlines).
5. The "Page capabilities" section helps you use correct business language, but the Jira acceptance criteria are the PRIMARY source for what scenarios to write.
6. Even if a capability is not listed in the page capabilities, write the scenario if the Jira ticket requires it. Use reasonable business language based on the Jira description.
7. Only omit a scenario if the Jira ticket itself says it cannot be tested or is explicitly out of scope.

SCENARIO RULES:
8. Use business-level language only: "the user enters their email", "the user clicks the search button", "the user selects a venue".
9. Do NOT reference selectors, IDs, element names, CSS classes, or any implementation details.
10. When a scenario must assert an outcome, use generic wording: "an error message should be displayed" or "the results should be shown".
11. Use "Scenario Outline:" and "Examples:" only when one behavior must be tested with multiple data rows.
12. If test credentials are NOT provided, do NOT write a "successful login" scenario — but DO write all failure/edge-case scenarios.
13. Cover happy path, edge cases, error handling, and validation rules from the Jira ticket.
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

Page capabilities:
- User can enter an email address
- User can enter a password
- User can submit the login form
- An error message is shown on invalid credentials

Test credentials:
Not provided.

Example Output (grounded in the page capabilities above; "successful login" and "account lockout" are OMITTED because no credentials were provided and account lockout is not a visible UI behavior):
Feature: User Authentication

  Background:
    Given the user is on the login page

  Scenario Outline: Failed login with invalid credentials
    Given the user enters "<email>" in the email field
    And the user enters "<password>" in the password field
    When the user submits the login form
    Then an error message should be displayed

    Examples:
      | email          | password    |
      | wrong@test.com | Secret123!  |
      | user@example.com | WrongPass |
`.trim();

function extractBusinessCapabilities(selectors) {
  if (!selectors || typeof selectors !== 'object') return [];

  const capabilities = [];

  if (selectors.login) {
    if (selectors.login.email) capabilities.push('User can enter an email address');
    if (selectors.login.password) capabilities.push('User can enter a password');
    if (selectors.login.submit) capabilities.push('User can submit the login form');
  }

  if (selectors.forms) {
    for (const [formName, form] of Object.entries(selectors.forms)) {
      if (form.submit) capabilities.push(`User can submit ${formName}`);
    }
  }

  if (selectors.pages) {
    for (const [pagePath, elements] of Object.entries(selectors.pages)) {
      for (const [key, el] of Object.entries(elements)) {
        if (el.widgetType === 'input' && el.interaction === 'fill') {
          capabilities.push(`User can enter text in "${el.label || key}"`);
        } else if (el.widgetType === 'button' && el.interaction === 'click') {
          capabilities.push(`User can click "${el.label || key}"`);
        } else if (el.widgetType === 'link' && el.interaction === 'click') {
          capabilities.push(`User can navigate via "${el.label || key}"`);
        } else if (el.widgetType === 'choices' || el.interaction === 'choicesDropdown') {
          const optCount = el.options?.length ?? 0;
          capabilities.push(`User can select from "${el.label || key}" (${optCount} options)`);
        } else if (el.widgetType === 'container' && el.interaction === 'assert') {
          capabilities.push(`Page displays "${el.label || key}"`);
        }
      }
    }
  }

  return [...new Set(capabilities)];
}

function buildCoverageBoosterMessage(ticket, acceptanceCriteria, previousOutput) {
  const criteriaList = acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n');

  return `
CRITICAL: Your previous Gherkin output only has ${countScenarios(previousOutput)} scenario(s), but the Jira ticket has ${acceptanceCriteria.length} acceptance criteria. You MUST cover ALL of them.

Here are the acceptance criteria from the Jira ticket:
${criteriaList}

Your previous output was:
${previousOutput}

REWRITE the complete Gherkin feature file. You MUST include a scenario for EACH acceptance criterion listed above. Do NOT skip any. Do NOT merge criteria into one scenario. Each criterion deserves its own Scenario or Scenario Outline.

Output the COMPLETE rewritten Gherkin feature file. Do NOT include any explanation.
`.trim();
}

function buildGherkinMessages(ticket, options = {}) {
  validateTicket(ticket);

  const credentialsContext =
    options.credentials && Object.keys(options.credentials).length > 0
      ? JSON.stringify(options.credentials, null, 2)
      : 'Not provided.';

  const capabilities = options.capabilities || [];
  const capabilitiesContext =
    capabilities.length > 0
      ? capabilities.map((c) => `- ${c}`).join('\n')
      : 'Not provided.';

  const userPrompt = `
Jira Ticket Key: ${ticket.key}
Summary: ${ticket.summary}

Clean Description and Acceptance Criteria:
${ticket.description || 'No description provided.'}

Page capabilities (what the user CAN do on the page — use these to ground your scenarios in business language):
${capabilitiesContext}

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
  const provider = getLlmProvider(options);

  let apiKey, baseUrl, model;
  apiKey = options.apiKey || process.env.GROQ_API_KEY || process.env.LLM_API_KEY;
  baseUrl = (options.baseUrl || process.env.GROQ_BASE_URL || DEFAULT_GROQ_BASE_URL).replace(/\/+$/, '');
  model = options.model || process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;

  if (!apiKey) {
    throw new Error(
      `Missing GROQ_API_KEY in .env!\n` +
        `Please set GROQ_API_KEY=gsk_... in your .env file.`
    );
  }

  const messages = buildGherkinMessages(ticket, options);

  const maxAttempts = 5;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
      lastError = new Error(`Groq API error (${res.status}): ${errorText}`);
      const retryable = res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503;
      if (!retryable || attempt === maxAttempts) throw lastError;
      const delayMs = Math.min(5000 * 2 ** (attempt - 1), 30000);
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content || '';
    const finishReason = data.choices?.[0]?.finish_reason || 'unknown';
    const gherkinContent = cleanGherkinContent(rawContent);

    console.log(`[llm-request] Attempt ${attempt}: model=${model}, rawContent=${rawContent.length} chars, cleaned=${gherkinContent.length} chars, finish_reason=${finishReason}`);

    try {
      validateGherkinContent(gherkinContent);

      const acceptanceCriteria = extractAcceptanceCriteria(ticket.description);
      const scenarioCount = countScenarios(gherkinContent);
      const criteriaCount = acceptanceCriteria.length;

      if (criteriaCount > 1 && scenarioCount < criteriaCount) {
        console.log(`[coverage] WARNING: Only ${scenarioCount} scenario(s) generated but Jira has ${criteriaCount} acceptance criteria.`);
        console.log(`[coverage] Criteria: ${acceptanceCriteria.join(' | ')}`);
        if (attempt < maxAttempts) {
          console.log(`[coverage] Retrying with stronger coverage prompt...`);
          const coverageBooster = buildCoverageBoosterMessage(ticket, acceptanceCriteria, gherkinContent);
          messages.push({ role: 'assistant', content: gherkinContent });
          messages.push({ role: 'user', content: coverageBooster });
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
      }

      return gherkinContent;
    } catch (validationError) {
      lastError = validationError;
      if (attempt < maxAttempts) {
        const rejectReason = detectContamination(gherkinContent);
        console.log(`[llm-request] Gherkin attempt ${attempt} FAILED validation: ${validationError.message}`);
        if (rejectReason) console.log(`[llm-request] Contamination detected: ${rejectReason}`);
        console.log(`[DEBUG] Raw content (first 600 chars):\n${rawContent.substring(0, 600)}`);
        console.log(`[DEBUG] Cleaned content (first 600 chars):\n${gherkinContent.substring(0, 600)}`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError;
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

function countScenarios(gherkinContent) {
  const scenarioPattern = /^\s*(Scenario Outline|Scenario Template|Scenario|Scénario|Scénario Outline|Scénario d'exemple|Plan du Scenario|Plan du scénario)\s*:/im;
  const matches = gherkinContent.match(new RegExp(scenarioPattern, 'gm'));
  return matches ? matches.length : 0;
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

  text = text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();

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
    .replace(/\n+\s*\*+Check against rules[\s\S]*$/i, '')
    .replace(/\n+\s*#{1,3}\s*Check against rules[\s\S]*$/i, '')
    .trim();

  text = text.replace(/^\s*(Scénario Outline|Scénario d'exemple)\s*:/gim, 'Scenario Outline:');

  const hasExamples = /^\s*(Examples|Exemples|Exemple)\s*:/im.test(text);
  if (!hasExamples) {
    text = text.replace(/^\s*(Scenario Outline|Plan du Scenario|Plan du scénario)\s*:/gim, 'Scenario:');
  }

  return text;
}

function detectContamination(content) {
  const reasons = [];

  if (/input\s*\[|button\s*\[|select\s*\[|textarea\s*\[/i.test(content)) {
    reasons.push('CSS attribute selectors (input[, button[, etc.)');
  }
  if (/(?:^|\s)#[a-zA-Z_][\w-]*/m.test(content)) {
    reasons.push('CSS ID selectors (#id)');
  }
  if (/>>|nth-of-type|nth-child/i.test(content)) {
    reasons.push('DOM traversal operators (>>, nth-of-type)');
  }
  if (/page\.locator|\.locator\(|getByRole|getByText|getByLabel/i.test(content)) {
    reasons.push('Playwright locator calls');
  }
  if (/\{[\s]*"[^"]+"\s*:\s*"[^"]*"/.test(content)) {
    reasons.push('JSON structure');
  }
  if (/<(?:input|button|select|textarea|div|form)\b/i.test(content)) {
    reasons.push('HTML tags');
  }

  return reasons.length > 0 ? reasons.join('; ') : null;
}

function validateGherkinContent(content) {
  if (!content) {
    throw new Error('LLM returned an empty Gherkin response.');
  }

  const hasFeature = /^\s*(Feature|Fonctionnalite|Fonctionnalité)\s*:/im.test(content);
  const hasScenario = /^\s*(Scenario Outline|Scenario Template|Scenario|Scénario|Scénario Outline|Scénario d'exemple|Plan du Scenario|Plan du scénario)\s*:/im.test(
    content
  );

  if (!hasFeature || !hasScenario) {
    throw new Error('LLM response does not look like a valid Gherkin feature.');
  }

  const contamination = detectContamination(content);
  if (contamination) {
    throw new Error(`Gherkin contains implementation details: ${contamination}`);
  }
}

async function generateAndSaveFeature(ticketKey, outputDir = './features', options = {}) {
  const provider = getLlmProvider(options);
  const jiraOverrides = options.jiraOverrides;
  console.log(`[Step 3] Fetching ticket ${ticketKey} from Jira...`);
  const ticket = await getTicket(ticketKey, jiraOverrides);

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
  extractBusinessCapabilities,
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
