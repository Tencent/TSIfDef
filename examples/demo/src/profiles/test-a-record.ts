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
