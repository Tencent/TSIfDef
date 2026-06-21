#if DOMESTIC
export interface DomesticPlayerData {
  readonly roleId: number;
  readonly channel: "wechat" | "qq";
  readonly compliance: {
    readonly realNameVerified: boolean;
    readonly playtimeLimitMinutes: number;
  };
}

export function createDomesticPlayer(id: string): DomesticPlayerData {
  return {
    roleId: Number(id.replace(/\D/g, "")) || 1,
    channel: "wechat",
    compliance: {
      realNameVerified: true,
      playtimeLimitMinutes: 180,
    },
  };
}

export function summarizeDomesticPlayer(player: DomesticPlayerData): string {
  return `${player.channel}:${player.roleId}:${player.compliance.playtimeLimitMinutes}m`;
}
#endif
