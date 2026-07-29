import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CardImage } from "@/components/tcg/CardImage";
import type { TcgCard } from "@/lib/scrydex/types";

/**
 * Renders a deck guide's GFM-markdown body to CDS-styled React. Server
 * component (react-markdown renders server-side — good for SEO).
 *
 * When `cardsByName` is supplied, each decklist-table row whose card-name cell
 * matches a catalog card gets a thumbnail prepended INTO that cell (no extra
 * column, so column counts and non-decklist tables — swaps, matchups — are
 * untouched). Energy rows / unmatched rows render unchanged.
 */

type HastNode = { type?: string; value?: string; tagName?: string; children?: HastNode[] };

function hastText(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  if (Array.isArray(node.children)) return node.children.map(hastText).join("");
  return "";
}

function normName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function DeckBody({
  markdown,
  cardsByName,
}: {
  markdown: string;
  cardsByName?: Map<string, TcgCard>;
}) {
  const withCards = !!cardsByName && cardsByName.size > 0;

  const components: Components = {
    a: ({ href, children }) => {
      if (href && href.startsWith("/")) {
        return <Link href={href}>{children}</Link>;
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    table: ({ children }) => (
      <div className="deck-prose__table-wrap">
        <table>{children}</table>
      </div>
    ),
    ...(withCards
      ? {
          tr: ({ node, children }) => {
            const cells = (node?.children ?? []).filter(
              (c) => (c as HastNode).type === "element",
            ) as HastNode[];
            const isHeader = cells.some((c) => c.tagName === "th");
            // Card name lives in the 2nd column of decklist tables
            // (Count | Card | Set…). Match it to a catalog card.
            const card =
              !isHeader && cells[1]
                ? cardsByName!.get(normName(hastText(cells[1])))
                : undefined;
            if (!card) return <tr>{children}</tr>;

            const kids = Children.toArray(children).filter(isValidElement);
            const enhanced = kids.map((child, i) => {
              if (i !== 1 || !isValidElement(child)) return child;
              const el = child as React.ReactElement<{
                children?: ReactNode;
                className?: string;
              }>;
              return cloneElement(
                el,
                { className: "deck-prose__cardname-cell" },
                <span className="deck-prose__cardname">
                  <span className="deck-prose__cardname-thumb">
                    <CardImage
                      images={card.images}
                      name={card.name}
                      size="small"
                    />
                  </span>
                  <span>{el.props.children}</span>
                </span>,
              );
            });
            return <tr>{enhanced}</tr>;
          },
        }
      : {}),
  };

  return (
    <div className="deck-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
