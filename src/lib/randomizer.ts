import type {
  Character,
  Vehicle,
  GameData,
  KartCombo,
  SelectedTrack,
  Cup,
} from "@/data/types";

export function getRandomNumber(max: number): number {
  return Math.floor(Math.random() * max);
}

export function filterByWeight(
  characters: Character[],
  weights: string[]
): Character[] {
  if (weights.length === 0) return characters;
  return characters.filter((c) => c.weight && weights.includes(c.weight));
}

/** The vehicle filter: MK8DX's drift types, or a vehicle's `kind` where the game sets one (Mario Kart Wii). */
export function filterByDrift(
  vehicles: Vehicle[],
  driftTypes: string[]
): Vehicle[] {
  if (driftTypes.length === 0) return vehicles;
  return vehicles.filter((v) => {
    const key = v.kind ?? v.drift;
    return key && driftTypes.includes(key);
  });
}

export function filterByVehicleType(
  vehicles: Vehicle[],
  types: string[]
): Vehicle[] {
  if (types.length === 0) return vehicles;
  return vehicles.filter((v) => v.type && types.includes(v.type));
}

export function randomizeKartCombo(
  data: GameData,
  charFilters: string[],
  vehiFilters: string[],
  vehiTypeFilters: string[] = [],
  /** Characters other players already have (for games that don't allow repeats). */
  takenCharacters: string[] = []
): KartCombo {
  const filtered =
    charFilters.length > 0
      ? filterByWeight(data.characters, charFilters)
      : data.characters;
  const open = filtered.filter((c) => !takenCharacters.includes(c.name));
  const chars = open.length > 0 ? open : filtered;
  const character = chars[getRandomNumber(chars.length)];
  let vehis = data.vehicles;
  if (vehiFilters.length > 0) vehis = filterByDrift(vehis, vehiFilters);
  if (vehiTypeFilters.length > 0) vehis = filterByVehicleType(vehis, vehiTypeFilters);
  // Mario Kart Wii: a driver only takes vehicles of their own size. When the filters leave none in that size,
  // the size still wins (a Small driver never gets a Large bike).
  if (character?.weight && data.vehicles.some((v) => v.size)) {
    const sized = vehis.filter((v) => v.size === character.weight);
    vehis = sized.length > 0 ? sized : data.vehicles.filter((v) => v.size === character.weight);
  }

  const wheels = data.wheels ?? [];
  const gliders = data.gliders ?? [];

  return {
    character,
    vehicle: vehis.length > 0
      ? vehis[getRandomNumber(vehis.length)]
      : { name: "N/A", img: "" },
    wheels: wheels.length > 0
      ? wheels[getRandomNumber(wheels.length)]
      : { name: "N/A", img: "" },
    glider: gliders.length > 0
      ? gliders[getRandomNumber(gliders.length)]
      : { name: "N/A", img: "" },
  };
}

export function randomizeTrackList(
  cups: Cup[],
  count: number,
  noDups: boolean,
  tourOnly: boolean
): SelectedTrack[] {
  const tracks: SelectedTrack[] = [];
  const chosen: string[] = [];

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    const maxAttempts = 1000;

    while (attempts < maxAttempts) {
      attempts++;
      const cupIdx = getRandomNumber(cups.length);
      const cup = cups[cupIdx];
      const courseIdx = getRandomNumber(cup.courses.length);
      const course = cup.courses[courseIdx];

      // Check tour-only filter
      if (tourOnly && course.type !== "Tour") continue;

      // Check no-duplicates filter
      if (noDups && chosen.includes(course.name)) continue;

      chosen.push(course.name);
      tracks.push({
        raceNumber: i + 1,
        course,
        cupImg: cup.img,
      });
      break;
    }
  }

  return tracks;
}
