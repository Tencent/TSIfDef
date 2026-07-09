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

import { createPlayer, summarizePlayer } from "./player.js";
import { describeRegion, profileName } from "./region.js";

const player = createPlayer("p-1");
const result = {
  profile: profileName,
  region: describeRegion(),
  summary: summarizePlayer(player),
  player,
};

// Put a breakpoint here: the debugger should show a different object shape for
// each launch configuration while remaining mapped to this original source.

#if defined(TEST_A)
console.log("TEST_A");
#endif
console.log(JSON.stringify(result, null, 2));
