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
