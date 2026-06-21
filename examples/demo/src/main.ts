import { describeRegion } from "./region.js";
import { createPlayer } from "./player.js";

const player = createPlayer("p-1");
console.log(describeRegion(), player.id);
