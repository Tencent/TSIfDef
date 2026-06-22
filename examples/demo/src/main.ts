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
