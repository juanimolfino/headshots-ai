import Link from "next/link";
import type { ReactNode } from "react";
import { getLegalDocumentMarkdown, type LegalDocumentId } from "@/lib/legal/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const documentLinks: Record<string, string> = {
  "Terms of Service": "/terms",
  Terms: "/terms",
  "Privacy Policy": "/privacy",
  "Cookie Policy": "/cookies",
  "Refund Policy": "/refund-policy"
};

function tableCells(line: string) {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
}

function isTableSeparator(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
}

function isSpecialBlockStart(line: string, nextLine?: string) {
  return (
    line.startsWith("#") ||
    line.startsWith("> ") ||
    line.startsWith("- ") ||
    line.trim() === "---" ||
    Boolean(nextLine && line.includes("|") && isTableSeparator(nextLine))
  );
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < text.length) {
    if (text.startsWith("**", index)) {
      const end = text.indexOf("**", index + 2);
      if (end !== -1) {
        nodes.push(<strong key={nodes.length}>{renderInline(text.slice(index + 2, end))}</strong>);
        index = end + 2;
        continue;
      }
    }

    if (text[index] === "*" && text[index + 1] !== "*") {
      const end = text.indexOf("*", index + 1);
      if (end !== -1) {
        nodes.push(<em key={nodes.length}>{renderInline(text.slice(index + 1, end))}</em>);
        index = end + 1;
        continue;
      }
    }

    if (text[index] === "[") {
      const labelEnd = text.indexOf("]", index + 1);
      if (labelEnd !== -1) {
        const label = text.slice(index + 1, labelEnd);
        if (text[labelEnd + 1] === "(") {
          const hrefEnd = text.indexOf(")", labelEnd + 2);
          if (hrefEnd !== -1) {
            const href = text.slice(labelEnd + 2, hrefEnd);
            nodes.push(
              <Link key={nodes.length} href={href} className="font-semibold text-navy underline-offset-2 hover:underline">
                {renderInline(label)}
              </Link>
            );
            index = hrefEnd + 1;
            continue;
          }
        }
        const route = documentLinks[label];
        if (route) {
          nodes.push(
            <Link key={nodes.length} href={route} className="font-semibold text-navy underline-offset-2 hover:underline">
              {label}
            </Link>
          );
          index = labelEnd + 1;
          continue;
        }
      }
    }

    const nextSpecial = ["**", "*", "["]
      .map(marker => text.indexOf(marker, index + 1))
      .filter(position => position !== -1)
      .sort((a, b) => a - b)[0] ?? text.length;
    nodes.push(text.slice(index, nextSpecial));
    index = nextSpecial;
  }

  return nodes;
}

function MarkdownContent({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (line.trim() === "---") {
      blocks.push(<hr key={blocks.length} className="my-8 border-line" />);
      index += 1;
      continue;
    }

    if (line.startsWith("# ")) {
      blocks.push(
        <h1 key={blocks.length} className="font-serif text-4xl font-medium leading-tight tracking-[-0.02em] text-ink">
          {renderInline(line.slice(2))}
        </h1>
      );
      index += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push(
        <h2 key={blocks.length} className="pt-6 font-serif text-2xl font-medium leading-tight text-ink">
          {renderInline(line.slice(3))}
        </h2>
      );
      index += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push(
        <h3 key={blocks.length} className="pt-3 text-lg font-semibold text-ink">
          {renderInline(line.slice(4))}
        </h3>
      );
      index += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("> ")) {
        quoteLines.push(lines[index].trim().slice(2));
        index += 1;
      }
      blocks.push(
        <blockquote key={blocks.length} className="rounded-lg border-l-4 border-navy bg-surface px-5 py-4 text-ink-soft">
          {renderInline(quoteLines.join(" "))}
        </blockquote>
      );
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        items.push(lines[index].trim().slice(2));
        index += 1;
      }
      blocks.push(
        <ul key={blocks.length} className="list-disc space-y-2 pl-5">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (line.includes("|") && lines[index + 1] && isTableSeparator(lines[index + 1].trim())) {
      const headers = tableCells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().includes("|")) {
        rows.push(tableCells(lines[index].trim()));
        index += 1;
      }
      blocks.push(
        <div key={blocks.length} className="overflow-x-auto rounded-lg border border-line">
          <table className="min-w-full divide-y divide-line text-left text-sm">
            <thead className="bg-surface">
              <tr>
                {headers.map((header, headerIndex) => (
                  <th key={headerIndex} className="px-4 py-3 font-semibold text-ink">
                    {renderInline(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-3 align-top text-ink-soft">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isSpecialBlockStart(lines[index].trim(), lines[index + 1]?.trim())
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push(
      <p key={blocks.length} className="leading-7">
        {renderInline(paragraphLines.join(" "))}
      </p>
    );
  }

  return <div className="space-y-5 text-sm text-ink-soft md:text-base">{blocks}</div>;
}

export async function LegalDocumentPage({ documentId }: { documentId: LegalDocumentId }) {
  const markdown = getLegalDocumentMarkdown(documentId);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const backHref = user ? "/dashboard/headshots" : "/";
  const backLabel = user ? "Back to dashboard" : "Back home";

  return (
    <main className="mx-auto max-w-4xl px-6 py-14 text-ink">
      <Link href={backHref} className="text-sm font-semibold text-navy underline-offset-2 hover:underline">
        {backLabel}
      </Link>
      <article className="mt-8">
        <MarkdownContent markdown={markdown} />
      </article>
    </main>
  );
}
