import { BracketToolPage, bracketToolMetadata } from "@/components/brackets/BracketToolPage";

export const metadata = bracketToolMetadata("roundrobin");

export default function RoundRobinGeneratorPage() {
  return <BracketToolPage page="roundrobin" />;
}
