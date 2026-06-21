#if HOK
import {
  createHokPlayer,
  summarizeHokPlayer,
  type HokPlayerData,
} from "./profiles/hok-player.js";

export type PlayerData = HokPlayerData;
export const createPlayer = createHokPlayer;
export const summarizePlayer = summarizeHokPlayer;
#elif DOMESTIC
import {
  createDomesticPlayer,
  summarizeDomesticPlayer,
  type DomesticPlayerData,
} from "./profiles/domestic-player.js";

export type PlayerData = DomesticPlayerData;
export const createPlayer = createDomesticPlayer;
export const summarizePlayer = summarizeDomesticPlayer;
#endif
