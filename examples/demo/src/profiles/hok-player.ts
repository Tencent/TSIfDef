#if HOK
export interface HokPlayerData {
  readonly openId: string;
  readonly globalAccount: {
    readonly countryCode: string;
    readonly shard: "NA" | "EU" | "AP";
  };
#if GLOBAL_GENERAL
  readonly globalFeatures: readonly string[];
#endif
}

export function createHokPlayer(id: string): HokPlayerData {
  return {
    openId: `openid-${id}`,
    globalAccount: {
      countryCode: "US",
      shard: "NA",
    },
#if GLOBAL_GENERAL
    globalFeatures: ["cross-region-match", "global-chat"],
#endif
  };
}

export function summarizeHokPlayer(player: HokPlayerData): string {
  return `${player.openId}@${player.globalAccount.shard}`;
}
#endif
