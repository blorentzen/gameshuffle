import { BracketToolPage, bracketToolMetadata } from "@/components/brackets/BracketToolPage";

export const metadata = bracketToolMetadata("elim");

export default function BracketGeneratorPage() {
  return <BracketToolPage page="elim" />;
}
