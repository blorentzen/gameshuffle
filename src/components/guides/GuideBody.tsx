import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders a guide's GFM-markdown body. Server component, so the prose is in the
 * HTML for crawlers rather than hydrated in.
 *
 * Raw HTML is deliberately NOT enabled (no rehype-raw). These bodies are pasted
 * in through an editor, and markdown-only means a paste can never introduce a
 * script or an iframe, so there is nothing to sanitize. If a guide ever needs
 * something markdown cannot express, that is a component, not an escape hatch.
 *
 * Internal links go through next/link so a reader moving between guides gets a
 * client transition; external ones open in a new tab with the usual rel guard.
 */
export function GuideBody({ markdown }: { markdown: string }) {
  const components: Components = {
    a({ href, children, ...rest }) {
      const to = String(href ?? "");
      if (to.startsWith("/")) {
        return <Link href={to}>{children}</Link>;
      }
      return (
        <a href={to} target="_blank" rel="noopener noreferrer" {...rest}>
          {children}
        </a>
      );
    },
    // Tables can outgrow the reading measure; give them their own scroller so
    // the page body never scrolls sideways.
    table({ children }) {
      return (
        <div className="guide__table-wrap">
          <table>{children}</table>
        </div>
      );
    },
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {markdown}
    </ReactMarkdown>
  );
}
