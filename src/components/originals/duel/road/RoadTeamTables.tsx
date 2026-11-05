import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { TableScroll } from "@/components/ui/TableScroll";
import { speciesName, speciesTypes } from "@/lib/originals/duel/speciesTypes";

/**
 * A trainer's teams as plain tables, server-rendered above the duel (SEO pass 2026-11-05: people searching
 * "<name> pokemon team" want the team). One table per team: the game, then each Pokémon in battle order with its
 * types in the games. Hidden while a duel is on, like the rest of the page around it.
 */
export function RoadTeamTables({ name, teams }: {
  name: string;
  teams: { id: string; gameLabel: string; title: string; species: string[] }[];
}) {
  const many = teams.length > 1;
  return (
    <section className="road-teamtables road-quiet" aria-labelledby="road-teamtables-title">
      <h2 id="road-teamtables-title" className="road-section__title">{name}&apos;s Pokémon team{many ? "s" : ""}</h2>
      <div className="road-teamtables__grid">
        {teams.map((t) => (
          <div key={t.id} className="road-teamtables__team">
            <h3 className="road-teamtables__game">{t.gameLabel}</h3>
            <p className="road-teamtables__title">{t.title}</p>
            <TableScroll label={`${name}'s team in ${t.gameLabel}`}>
              <Table className="road-teamtables__table">
                <TableHeader>
                  <TableRow>
                    <TableHead><span aria-hidden="true">#</span><span className="sr-only">Order</span></TableHead>
                    <TableHead>Pokémon</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {t.species.map((s, i) => (
                    <TableRow key={`${s}-${i}`}>
                      <TableCell className="road-teamtables__n">{i + 1}</TableCell>
                      <TableCell>{speciesName(s)}</TableCell>
                      <TableCell>{speciesTypes(s)?.join(", ") ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          </div>
        ))}
      </div>
    </section>
  );
}
