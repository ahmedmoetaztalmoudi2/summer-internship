import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTestRun } from "@/hooks/useTestRun";
import { PipelineProgress } from "@/components/qa/PipelineProgress";
import { AdditionalInformationForm } from "@/components/qa/AdditionalInformationForm";
import { TestSummary } from "@/components/qa/TestSummary";
import { TestResultCard } from "@/components/qa/TestResultCard";
import { CodeViewer } from "@/components/qa/CodeViewer";
import { GherkinViewer } from "@/components/qa/GherkinViewer";
import { CapgeminiEngineeringLogo } from "@/components/qa/CapgeminiEngineeringLogo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/run/$runId")({
  head: () => ({
    meta: [
      { title: "Agent Run — QA Testing Agent" },
      {
        name: "description",
        content:
          "Live pipeline execution, test results, failure analysis and generated Playwright code for this QA agent run.",
      },
      { property: "og:title", content: "Agent Run — QA Testing Agent" },
      {
        property: "og:description",
        content: "Live pipeline execution and test results for this QA agent run.",
      },
    ],
  }),
  component: RunPage,
});

function RunPage() {
  const { runId } = Route.useParams();
  const run = useTestRun(runId);
  const [tab, setTab] = useState<"playwright" | "gherkin">("playwright");

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <CapgeminiEngineeringLogo compact />
          <Link to="/" className="text-sm text-muted-foreground hover:text-brand">
            New test
          </Link>
        </div>
      </header>

      {run.error ? (
        <div className="mx-auto max-w-4xl px-6 pt-8">
          <p className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-danger/20">
            {run.error}
          </p>
        </div>
      ) : null}

      <PipelineProgress
        ticket={run.ticket}
        websiteUrl={run.websiteUrl}
        status={run.status}
        stages={run.stages}
      />

      <section className="px-6 py-16">
        <div className="mx-auto max-w-4xl">
          {run.results ? (
            <>
              <TestSummary summary={run.results.summary} />
              <div className="space-y-4">
                {run.results.tests.map((test) => (
                  <TestResultCard key={test.id} test={test} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Results will appear here once the agent finishes executing the generated tests.
            </p>
          )}
        </div>
      </section>

      <section className="bg-code-bg px-6 py-16 text-code-fg">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 flex border-b border-code-fg/15">
            <button
              type="button"
              onClick={() => setTab("playwright")}
              className={cn(
                "border-b-2 px-4 py-2 text-xs font-medium transition-colors",
                tab === "playwright"
                  ? "border-brand text-code-fg"
                  : "border-transparent text-code-fg/50 hover:text-code-fg",
              )}
            >
              Playwright Code
            </button>
            <button
              type="button"
              onClick={() => setTab("gherkin")}
              className={cn(
                "border-b-2 px-4 py-2 text-xs font-medium transition-colors",
                tab === "gherkin"
                  ? "border-brand text-code-fg"
                  : "border-transparent text-code-fg/50 hover:text-code-fg",
              )}
            >
              Gherkin
            </button>
          </div>

          {tab === "playwright" ? (
            <CodeViewer
              code={run.results?.playwrightCode ?? ""}
              emptyMessage="Playwright code will appear here once the agent generates it."
            />
          ) : (
            <GherkinViewer gherkin={run.results?.gherkin ?? ""} />
          )}
        </div>
      </section>

      {run.requiresInput ? (
        <AdditionalInformationForm
          message={run.inputMessage}
          fields={run.fields}
          submitting={run.submitting}
          onSubmit={run.submitInput}
        />
      ) : null}
    </main>
  );
}
