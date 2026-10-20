import { BracketToolPage, bracketToolMetadata } from "@/components/brackets/BracketToolPage";

export const metadata = bracketToolMetadata("swiss");

export default function SwissPairingGeneratorPage() {
  return <BracketToolPage page="swiss" />;
}
