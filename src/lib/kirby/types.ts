/** Kirby Air Riders data model. Client-safe. */

export type MachineType = "Star" | "Bike" | "Chariot" | "Tank" | "Legendary";
export type StadiumKind = "battle" | "race" | "glide" | "collect" | "boss";

export interface KirbyRider { name: string; img: string; starter: boolean }
export interface KirbyMachine { name: string; img: string; type: MachineType; starter: boolean }
export interface KirbyCourse { name: string; img: string; starter: boolean }
export interface KirbyStadium { name: string; kind: StadiumKind }

export interface KirbyGame {
  slug: string;
  label: string;
  assetBase: string;
  artReady: boolean;
  riders: KirbyRider[];
  machines: KirbyMachine[];
  machineTypes: { id: MachineType; label: string; color: string }[];
  airRideCourses: KirbyCourse[];
  topRideCourses: KirbyCourse[];
  stadiums: KirbyStadium[];
  stadiumKinds: { id: StadiumKind; label: string }[];
}
