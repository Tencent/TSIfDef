import assert from "node:assert/strict";
import test from "node:test";

import { coreApiVersion } from "../src/core/index.js";

test("exports the core API marker", () => {
  assert.equal(coreApiVersion, 1);
});

