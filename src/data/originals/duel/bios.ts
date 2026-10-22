/**
 * A line about each Daily Duel trainer, for the challenger card ("Larry challenged you to a duel"):
 * who they are in their games, in one sentence. Keyed by person (rules.ts personOf), so every team a
 * person brings shares it and the line has to fit each of their roles. Facts only, from the games.
 * Started 2026-10-22 with the first three weeks of trainers; the rest of the roster follows. A
 * trainer without a line shows their title and game alone.
 */

export const DUEL_BIOS: Readonly<Record<string, string>> = {
  larry: "A salaryman who'd rather be home, Paldea's Normal-type Gym Leader on the side, and its Flying-type Elite Four when the league calls.",
  gladion: "Lillie's older brother, who left home with Type: Null, worked as Team Skull's enforcer, and stays on to run the Aether Foundation.",
  giovanni: "The boss of Team Rocket, who also runs Viridian City's Gym, and leads Team Rainbow Rocket in Ultra Sun and Ultra Moon.",
  geeta: "Paldea's Top Champion and the chairwoman of its Pokémon League, who tests every new Champion herself.",
  opal: "Ballonlea's Fairy-type Gym Leader, who quizzes challengers in the middle of battle while she looks for someone to take her place.",
  bea: "Stow-on-Side's Fighting-type Gym Leader in Pokémon Sword, a karate prodigy known for training without rest.",
  drake: "The last of Hoenn's Elite Four and its Dragon master, who asks whether you know what it takes to battle with Pokémon as partners.",
  lance: "The last of Kanto's Elite Four and a Dragon master, who later becomes Champion of the Indigo Plateau.",
  bede: "Chairman Rose's hand-picked challenger, thrown out of the Gym Challenge, who returns as Opal's Fairy-type successor.",
  cyrus: "The leader of Team Galactic, who tried to erase the world and make a new one with the power of Dialga and Palkia.",
  alder: "Unova's Champion, who would rather wander the region and teach young trainers than sit and defend his title.",
  brycen: "Icirrus City's Ice-type Gym Leader, a movie star who stepped away from acting to run the Gym.",
  marlon: "Humilau City's Water-type Gym Leader, a laid-back surfer who loves the sea.",
  lorelei: "The first of Kanto's Elite Four and an Ice-type specialist, from Four Island in the Sevii Islands.",
  drasna: "A Dragon-type member of Kalos's Elite Four, whose easygoing manner hides a lifetime of training.",
  hugh: "Your rival in Unova, who wants his little sister's stolen Purrloin back from Team Plasma.",
  colress: "A scientist obsessed with drawing out the full power of Pokémon, by any means.",
  blue: "Professor Oak's grandson and your rival from Pallet Town, who becomes Champion just before you do.",
  valerie: "Laverre City's Fairy-type Gym Leader and a fashion designer, originally from Johto.",
  grant: "Cyllage City's Rock-type Gym Leader, a rock climber who scales the cliffs outside his city.",
  lacey: "A cheerful Blueberry Academy student and the Fairy-type specialist of its Elite Four.",
};

export const bioFor = (person: string): string | null => DUEL_BIOS[person] ?? null;
