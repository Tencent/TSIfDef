#if TEST_B
export interface TestBRecord {
  readonly id: number;
  readonly scope: "local" | "remote";
  readonly audit: {
    readonly approved: boolean;
    readonly ttlMinutes: number;
  };
}

export function createTestBRecord(id: string): TestBRecord {
  return {
    id: Number(id.replace(/\D/g, "")) || 1,
    scope: "local",
    audit: {
      approved: true,
      ttlMinutes: 180,
    },
  };
}

export function summarizeTestBRecord(record: TestBRecord): string {
  return `${record.scope}:${record.id}:${record.audit.ttlMinutes}m`;
}
#endif
