#if TEST_A
export interface TestARecord {
  readonly id: string;
  readonly scope: {
    readonly environment: "alpha" | "beta";
    readonly channel: "desktop" | "mobile";
  };
#if TEST_SHARED
  readonly sharedFlags: readonly string[];
#endif
}

export function createTestARecord(id: string): TestARecord {
  return {
    id: `a-${id}`,
    scope: {
      environment: "alpha",
      channel: "desktop",
    },
#if TEST_SHARED
    sharedFlags: ["search", "telemetry"],
#endif
  };
}

export function summarizeTestARecord(record: TestARecord): string {
  return `${record.id}@${record.scope.channel}`;
}
#endif
