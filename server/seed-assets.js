import { fileURLToPath } from "node:url";
import { buildMascot, findBlender } from "./blender.js";
import { seeds } from "../shared/catalog.js";

const blender = await findBlender();
if (!blender) throw new Error("Set BLENDER_PATH to the Blender executable.");

for (const seed of seeds) {
  const directory = fileURLToPath(new URL(`../public/mascots/${seed.id}/`, import.meta.url));
  try {
    const summary = await buildMascot(blender, seed, directory);
    console.log(seed.id, summary);
  } catch (error) {
    console.error(error.stderr || error.stdout || error.message);
    process.exitCode = 1;
    break;
  }
}
