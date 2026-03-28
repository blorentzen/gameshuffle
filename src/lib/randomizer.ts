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

export function filterByDrift(
  vehicles: Vehicle[],
  driftTypes: string[]
): Vehicle[] {
  if (driftTypes.length === 0) return vehicles;
  return vehicles.filter((v) => v.drift && driftTypes.includes(v.drift));
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
  vehiTypeFilters: string[] = []
): KartCombo {
  const chars =
    charFilters.length > 0
      ? filterByWeight(data.characters, charFilters)
      : data.characters;
  let vehis = data.vehicles;
  if (vehiFilters.length > 0) vehis = filterByDrift(vehis, vehiFilters);
  if (vehiTypeFilters.length > 0) vehis = filterByVehicleType(vehis, vehiTypeFilters);

  const wheels = data.wheels ?? [];
  const gliders = data.gliders ?? [];

  return {
    character: chars[getRandomNumber(chars.length)],
    vehicle: vehis[getRandomNumber(vehis.length)],
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
