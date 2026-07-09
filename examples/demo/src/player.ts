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
import {
  createTestARecord,
  summarizeTestARecord,
  type TestARecord,
} from "./profiles/test-a-record.js";

export type PlayerData = TestARecord;
export const createPlayer = createTestARecord;
export const summarizePlayer = summarizeTestARecord;
#elif TEST_B
import {
  createTestBRecord,
  summarizeTestBRecord,
  type TestBRecord,
} from "./profiles/test-b-record.js";

export type PlayerData = TestBRecord;
export const createPlayer = createTestBRecord;
export const summarizePlayer = summarizeTestBRecord;
#endif
