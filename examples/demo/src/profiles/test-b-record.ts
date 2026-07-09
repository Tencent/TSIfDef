// Copyright (C) 2026 Tencent. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
