# Project Glossary

A living reference for abbreviations, acronyms, and technical terms used in this project.  
Each entry is a one-line plain-English definition.

---

## Core pipeline concepts

| Term | Definition |
|------|------------|
| **User story** | A short description of a feature from an end-user perspective, usually written as “As a … I want … so that …”. |
| **Acceptance criteria** | A checklist of conditions that must be true for a user story to be considered complete and testable. |
| **BDD** | Behavior-Driven Development — a testing approach where scenarios are written in plain language that describes expected system behavior. |
| **Gherkin** | A structured plain-text language (Feature, Scenario, Given/When/Then) used to describe test scenarios in BDD. |
| **Feature** | The top-level Gherkin keyword that names the capability being tested (e.g. `Feature: User login`). |
| **Scenario** | A single Gherkin test case describing one flow through the feature (e.g. `Scenario: Successful login with valid credentials`). |
| **Given / When / Then** | Gherkin step keywords meaning precondition, action, and expected outcome respectively. |
| **LLM** | Large Language Model — an AI model (e.g. Claude) that generates or transforms text from a prompt. |
| **Pipeline** | An automated sequence of steps (fetch → convert → generate → run → sync) that runs with minimal manual intervention. |

---

## Jira & Atlassian

| Term | Definition |
|------|------------|
| **Jira** | Atlassian’s issue-tracking tool where user stories, bugs, and tasks are stored and managed. |
| **Jira ticket / issue** | A single work item in Jira, identified by a key such as `SCRUM-1`. |
| **Ticket key** | The unique identifier for a Jira issue, combining project code and number (e.g. `SCRUM-1`). |
| **ADF** | Atlassian Document Format — Jira’s nested JSON structure for rich-text fields like descriptions. |
| **JQL** | Jira Query Language — a SQL-like syntax for searching and filtering Jira issues. |
| **Xray** | A Jira plugin for test management that stores test cases, runs, and results inside Jira. |
| **SCRUM** | In this project, the Jira project key prefix for your user stories (`SCRUM-1` … `SCRUM-5`). |

---

## APIs & networking

| Term | Definition |
|------|------------|
| **API** | Application Programming Interface — a defined way for programs to request and exchange data with a service. |
| **REST** | Representational State Transfer — a common style for web APIs that uses HTTP methods and URLs to access resources. |
| **REST API v3** | The version of Jira’s HTTP API used in this project to fetch issue data as JSON. |
| **HTTP** | Hypertext Transfer Protocol — the foundation protocol used for web requests and API calls. |
| **HTTP status code** | A three-digit response code (e.g. `200` success, `404` not found, `401` unauthorized) indicating the result of a request. |
| **404 Not Found** | An HTTP status meaning the requested URL or resource could not be found on the server. |
| **403 Forbidden** | An HTTP status meaning the server understood the request but refuses to authorize it. |
| **401 Unauthorized** | An HTTP status meaning authentication failed or credentials were missing/invalid. |
| **Permission masking** | When an API returns 404 instead of 401/403 so attackers cannot tell whether a resource exists. |
| **200 OK** | An HTTP status meaning the request succeeded and the server returned the expected data. |
| **Basic Auth** | An HTTP authentication scheme that sends `username:password` (here, email + API token) encoded in Base64 in the `Authorization` header. |
| **Bearer Auth** | An HTTP authentication scheme that sends a token (e.g. `Authorization: Bearer <token>`) without encoding username and password together. |
| **Base64** | An encoding scheme that converts binary or text data into ASCII-safe characters, used by Basic Auth. |
| **Authorization header** | An HTTP request header that carries credentials or tokens so the server can verify the caller’s identity. |
| **Accept header** | An HTTP request header that tells the server which response format the client expects (e.g. `application/json`). |
| **Endpoint** | A specific URL path on an API that performs one operation (e.g. `/rest/api/3/issue/SCRUM-1`). |
| **Pagination** | Fetching large result sets in chunks (pages) instead of one giant response. |
| **nextPageToken** | An opaque cursor returned by Jira’s search API pointing to the next page of results. |
| **Project key** | The short uppercase prefix in a ticket key (e.g. `SCRUM` in `SCRUM-1`). |
| **Postman** | A desktop/web tool for manually sending HTTP requests and inspecting responses, useful for debugging APIs. |
| **Rate limit** | A cap on how many API requests you can make in a time window; exceeding it returns an error (often HTTP 429). |

---

## Data formats & encoding

| Term | Definition |
|------|------------|
| **JSON** | JavaScript Object Notation — a lightweight text format for structured data (`{ "key": "value" }`). |
| **Plain text** | Unformatted character data without markup or nested structure — the target output after converting ADF. |
| **CRLF / LF** | Line-ending characters: CRLF is `\r\n` (Windows), LF is `\n` (Unix/macOS); stray CRLF in `.env` can corrupt values. |
| **UTF-8** | The standard character encoding for text files and JSON, supporting international characters (e.g. French text in your stories). |
| **Trailing whitespace / newline** | Invisible spaces or line breaks at the end of a value that can break authentication if copied into `.env`. |

---

## Environment & configuration

| Term | Definition |
|------|------------|
| **.env** | A local file that stores secret configuration (API keys, domain, email) as `KEY=value` pairs, not committed to git. |
| **dotenv** | An npm package that loads variables from `.env` into `process.env` when your Node.js script starts. |
| **process.env** | A Node.js object holding environment variables available to the running script (e.g. `process.env.JIRA_EMAIL`). |
| **JIRA_DOMAIN** | The subdomain of your Atlassian site (e.g. `mycompany` in `mycompany.atlassian.net`). |
| **JIRA_EMAIL** | The Atlassian account email used as the username in Basic Auth. |
| **JIRA_API_TOKEN** | A secret token generated in Atlassian account settings, used as the password in Basic Auth (not your login password). |
| **ANTHROPIC_API_KEY** | The secret key for calling Anthropic’s Claude API, stored in `.env` for the Gherkin generator. |

---

## Node.js & JavaScript

| Term | Definition |
|------|------------|
| **Node.js** | A JavaScript runtime that lets you run JS outside the browser, used as the backend for this pipeline. |
| **npm** | Node Package Manager — the tool for installing libraries (`npm install`) and running scripts defined in `package.json`. |
| **CommonJS** | The traditional Node.js module system using `require()` to import and `module.exports` to export code. |
| **ESM** | ECMAScript Modules — the modern `import`/`export` syntax; `node-fetch` v3 is ESM-only and breaks `require()`. |
| **require()** | A CommonJS function that loads another module’s exported code into the current file. |
| **module.exports** | The CommonJS way to expose functions or objects from a file so other files can `require()` them. |
| **async / await** | JavaScript syntax for writing asynchronous code (e.g. API calls) in a readable, sequential style. |
| **fetch** | A function that sends HTTP requests and returns a Promise; provided by `node-fetch` v2 in this project. |
| **Buffer** | A Node.js built-in type for handling binary data; used here to Base64-encode credentials for Basic Auth. |
| **TS / JS** | TypeScript (typed superset of JavaScript) vs plain JavaScript; this project uses JS now, TS planned for Playwright later. |

---

## Testing & automation (planned stages)

| Term | Definition |
|------|------------|
| **Playwright** | A browser automation framework for writing and running end-to-end tests in real browsers. |
| **POM** | Page Object Model — a test design pattern where each web page is represented by a class hiding selectors and actions. |
| **E2E test** | End-to-end test — automation that exercises the full application flow through the UI, like a real user. |
| **Test run** | An execution of one or more automated tests, producing pass/fail results to sync back to Xray. |
| **CI** | Continuous Integration — automatically building and running tests on every code change (e.g. via GitHub Actions). |

---

## Project files (this repo)

| Term | Definition |
|------|------------|
| **jira-fetcher.js** | Script that calls the Jira REST API and returns a ticket’s summary and description. |
| **adf-to-text.js** | Module that converts Jira’s ADF JSON description into readable plain text. |
| **gherkin-generator.js** | Module that sends a user story to Claude and returns structured Gherkin scenarios as JSON. |
| **pipeline.js** | Entry point that chains fetch → ADF conversion → Gherkin generation and prints the result. |

---

## How to use this file

When a new term is introduced during development, add a row to the appropriate section (or create a new section) so this glossary stays up to date throughout the internship project.
