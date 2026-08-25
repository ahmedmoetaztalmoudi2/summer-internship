const KEYWORDS = /^(\s*)(Feature:|Scenario Outline:|Scenario:|Background:|Given|When|Then|And|But|Examples:)/;

export function GherkinViewer({ gherkin }: { gherkin: string }) {
  if (!gherkin) {
    return <p className="py-8 text-sm text-code-fg/60">No Gherkin scenarios generated yet.</p>;
  }

  return (
    <pre className="overflow-x-auto font-mono text-[13px] leading-relaxed text-code-fg">
      <code>
        {gherkin.split("\n").map((line, index) => {
          const match = line.match(KEYWORDS);
          if (!match) return <div key={index}>{line || "\u00A0"}</div>;
          return (
            <div key={index}>
              {match[1]}
              <span className="text-brand-muted">{match[2]}</span>
              {line.slice(match[0].length)}
            </div>
          );
        })}
      </code>
    </pre>
  );
}
