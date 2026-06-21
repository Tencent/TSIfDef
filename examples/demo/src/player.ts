import { region } from "./region.js";

// Nested macros: the inner GLOBAL_GENERAL block only participates when its parent
// branch is active. Under HOK both are active; under DOMESTIC the whole block is
// inactive (grayed and folded), and its symbols never reach the type checker.
#if HOK
export interface PlayerData {
  readonly id: string;
  readonly region: typeof region;
#if GLOBAL_GENERAL
  readonly globalId: string;
#endif
}

export function createPlayer(id: string): PlayerData {
  return {
    id,
    region,
#if GLOBAL_GENERAL
    globalId: `g-${id}`,
#endif
  };
}
#elif DOMESTIC
export interface PlayerData {
  readonly id: string;
  readonly region: typeof region;
}

export function createPlayer(id: string): PlayerData {
  return { id, region };
}
#endif
