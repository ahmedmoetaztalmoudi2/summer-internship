# QA Testing Project

This project has been reorganized into separate frontend and backend directories.

## Project Structure

```
QA_Testing/
├── frontend/          # React/TanStack Start frontend application
│   ├── src/          # Frontend source code
│   ├── public/       # Static assets
│   └── package.json  # Frontend dependencies
├── backend/          # Node.js/TypeScript backend pipeline
│   ├── src/          # Backend source code
│   ├── tests/        # Generated Playwright tests
│   ├── features/     # Gherkin feature files
│   └── package.json  # Backend dependencies
└── node_modules/     # Shared dependencies
```

## Frontend

The frontend is a React application built with TanStack Start that provides a UI for the QA testing pipeline.

**Location:** `frontend/`

**Key files:**
- `src/services/qaApi.ts` - API client for backend communication
- `src/services/httpClient.ts` - HTTP client with mock API support
- `package.json` - Frontend dependencies and scripts

**Environment variables:**
- `VITE_QA_API_URL` - Backend API URL (defaults to mock API if not set)

**Running the frontend:**
```bash
cd frontend
npm run dev
```

## Backend

The backend is a Node.js/TypeScript application that handles:
- Jira ticket fetching
- Gherkin scenario generation
- Playwright test generation
- Test execution and reporting
- Failure analysis and auto-repair

**Location:** `backend/`

**Key files:**
- `src/full-pipeline.ts` - Main pipeline orchestration
- `src/agents/` - AI agents for various tasks
- `playwright.config.ts` - Playwright configuration
- `package.json` - Backend dependencies and scripts

**Running the backend:**
```bash
cd backend
npm run pipeline:full <ticket-id> <url>
```

## Configuration

The frontend can connect to the backend by setting the `VITE_QA_API_URL` environment variable:

```bash
# In frontend/.env
VITE_QA_API_URL=http://localhost:3000
```

If no backend URL is configured, the frontend will use the built-in mock API for development.