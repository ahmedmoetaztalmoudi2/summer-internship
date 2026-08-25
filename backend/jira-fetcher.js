require('dotenv').config({ quiet: true });
const fetch = require('node-fetch');

/**
 * Reads a required config value from process.env and trims whitespace.
 * Trimming prevents silent auth failures when .env values have trailing CRLF/LF.
 */
function getEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

/**
 * Builds the Base64 Basic Auth header value from Jira email + API token.
 */
function getAuthHeader() {
  const email = getEnv('JIRA_EMAIL');
  const apiToken = getEnv('JIRA_API_TOKEN');
  const encoded = Buffer.from(`${email}:${apiToken}`).toString('base64');
  return `Basic ${encoded}`;
}

/**
 * Sends an authenticated request to the Jira REST API v3.
 * Throws with the response body when the status is not OK.
 */
async function jiraFetch(path, options = {}) {
  const domain = getEnv('JIRA_DOMAIN');
  const url = `https://${domain}.atlassian.net${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: getAuthHeader(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira error: ${res.status} ${res.statusText} — ${body}`);
  }

  return res.json();
}

const { adfToText } = require('./adf-to-text');

/**
 * Converts a raw Jira issue object into our simplified ticket shape.
 */
function mapIssue(issue) {
  return {
    key: issue.key,
    summary: issue.fields.summary,
    description: adfToText(issue.fields.description),
  };
}

/**
 * Fetches a single Jira issue by ticket key (e.g. "SCRUM-1").
 */
async function getTicket(ticketKey) {
  const data = await jiraFetch(`/rest/api/3/issue/${ticketKey}`);
  return mapIssue(data);
}

/**
 * Fetches every issue visible to your account using JQL search.
 * Uses pagination so it works even when you have more than one page of tickets.
 *
 * @param {string} [jql] - Optional JQL filter. Defaults to all project issues.
 */
async function getAllTickets(jql = 'project IS NOT EMPTY ORDER BY key ASC') {
  const tickets = [];
  let nextPageToken;

  do {
    const body = {
      jql,
      fields: ['summary', 'description'],
      maxResults: 50,
    };
    if (nextPageToken) {
      body.nextPageToken = nextPageToken;
    }

    const data = await jiraFetch('/rest/api/3/search/jql', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    for (const issue of data.issues || []) {
      tickets.push(mapIssue(issue));
    }

    nextPageToken = data.isLast ? undefined : data.nextPageToken;
  } while (nextPageToken);

  return tickets;
}

module.exports = { getTicket, getAllTickets };

// Run directly:
//   node jira-fetcher.js           → fetch all tickets
//   node jira-fetcher.js SCRUM-1   → fetch one ticket
if (require.main === module) {
  const ticketKey = process.argv[2];

  const run = ticketKey ? getTicket(ticketKey) : getAllTickets();

  run.then(console.log).catch(console.error);
}
