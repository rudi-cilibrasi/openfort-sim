import islandSource from "../examples/switchback-island.verse?raw";
import parkourSource from "../examples/skyline-sprint.verse?raw";
import rangeSource from "../examples/bot-yard.verse?raw";

export const examples = {
  island: {
    title: "Switchback Island",
    tag: "DEVICES & EVENTS",
    description: "A button, a barrier, and a little cause and effect.",
    lesson:
      "Change GateHeight or Reward, then compile. Walk to the amber button and press E. The OnEvent handler opens the gate and awards points.",
    source: islandSource,
  },
  parkour: {
    title: "Skyline Sprint",
    tag: "LOOPS & MOVEMENT",
    description: "Build a course with a loop. Give gravity a suggestion.",
    lesson:
      "Change Steps to build a longer staircase. Jump onto the purple launch zone. Its enter event runs LaunchPlayer; the finish pad runs your reward code.",
    source: parkourSource,
  },
  range: {
    title: "Bot Yard",
    tag: "STATE & CONDITIONS",
    description: "Your code makes the rules. The bots provide the company.",
    lesson:
      "Click the world to aim, then click to fire at a bot or target. Hit events run in WASM. Change PointsPerHit or the victory condition to change the game.",
    source: rangeSource,
  },
};
