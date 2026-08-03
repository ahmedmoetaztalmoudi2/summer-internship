# Jira AI Gherkin Generator (Capgemini Engineering Internship)

Automated pipeline converting Jira User Stories into BDD Gherkin (`.feature`) scenarios using Groq Cloud API & Qwen/Llama open-source LLM models.

## 🚀 Pipeline Architecture (Steps 1–3)

1. **Jira REST API v3 (`jira-fetcher.js`)**: Fetch user story title, summary, and ADF description from Jira Cloud.
2. **ADF Converter (`adf-to-text.js`)**: Transform Atlassian Document Format JSON into structured Markdown.
3. **LLM #1 Gherkin Generator (`gherkin-generator.js`)**: Extract business rules and generate standardized BDD Gherkin (`.feature`) files.

---

## 🛠️ Environment Configuration (`.env`)

```env
# Jira API Credentials
JIRA_DOMAIN=your_jira_domain
JIRA_EMAIL=your_email@domain.com
JIRA_API_TOKEN=your_jira_api_token

# Groq Cloud API Credentials (LLM Provider)
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.3-70b-versatile
```

---

## 🏃 Usage Commands

### 1. Run Pipeline (Steps 1–3)
```bash
npm run pipeline                # Process all Jira project tickets
npm run pipeline SCRUM-1        # Process single ticket
npm run pipeline:mock SCRUM-1   # Process single ticket using mock mode
```

### 2. Run Gherkin Generator Directly
```bash
npm run generate:gherkin SCRUM-1
```

---

## 📁 Project Structure

- `jira-fetcher.js`: Fetches Jira issues via REST API v3.
- `adf-to-text.js`: Converts Jira ADF JSON content to readable Markdown text.
- `gherkin-generator.js`: Core LLM module generating `.feature` files via Groq Cloud API.
- `pipeline.js`: Pipeline orchestrator running Step 1 -> Step 2 -> Step 3.
- `features/`: Output directory storing generated `.feature` Gherkin files.
