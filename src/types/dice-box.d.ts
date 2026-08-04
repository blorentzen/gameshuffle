/** Minimal type surface for @3d-dice/dice-box (ships no types). Covers only
 *  the config + methods the Dice Roller uses. */
declare module "@3d-dice/dice-box" {
  interface DiceBoxConfig {
    id?: string;
    assetPath?: string;
    theme?: string;
    themeColor?: string;
    scale?: number;
    gravity?: number;
    offscreen?: boolean;
    origin?: string;
    [key: string]: unknown;
  }

  interface DiceRollResult {
    value: number;
    groupId: number;
    rollId: number;
    sides: number;
    [key: string]: unknown;
  }

  export default class DiceBox {
    constructor(selector: string, config?: DiceBoxConfig);
    constructor(config?: DiceBoxConfig);
    init(): Promise<void>;
    roll(notation: string | string[]): Promise<DiceRollResult[]>;
    add(notation: string | string[]): Promise<DiceRollResult[]>;
    clear(): void;
    onRollComplete?: (results: DiceRollResult[]) => void;
  }
}
