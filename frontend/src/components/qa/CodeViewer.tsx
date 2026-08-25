import { useState } from "react";

/** Minimal, dependency-free tokenizer for displaying generated TS/Playwright code. */
function highlight(code: string) {
  const pattern =
    /(\/\/[^\n]*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(import|from|export|const|let|await|async|function|return|new|test|expect|describe)\b/g;

  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(code)) !== null) {
    if (match.index > last) nodes.push(code.slice(last, match.index));
    const [text, comment, str, keyword] = match;
    if (comment) nodes.push(<span key={key++} className="text-muted-foreground">{text}</span>);
    else if (str) nodes.push(<span key={key++} className="text-brand-muted">{text}</span>);
    else if (keyword) nodes.push(<span key={key++} className="text-brand">{text}</span>);
    else nodes.push(text);
    last = match.index + text.length;
  }
  nodes.push(code.slice(last));
  return nodes;
}

interface Props {
  code: string;
  language?: "typescript" | "gherkin";
  emptyMessage?: string;
}

export function CodeViewer({ code, language = "typescript", emptyMessage }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  if (!code) {
    return (
      <p className="py-8 text-sm text-code-fg/60">
        {emptyMessage ?? "Nothing generated yet."}
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-2 rounded border border-code-fg/20 bg-code-fg/10 px-3 py-1.5 text-[11px] font-medium text-code-fg transition-colors hover:bg-code-fg/20"
        >
          {copied ? "Copied" : "Copy Code"}
        </button>
      </div>
      <pre className="overflow-x-auto font-mono text-[13px] leading-relaxed text-code-fg">
        <code>{language === "typescript" ? highlight(code) : code}</code>
      </pre>
    </div>
  );
}
