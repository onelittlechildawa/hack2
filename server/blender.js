import { constants } from "node:fs";
import { access, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { availableParallelism, homedir, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const script = fileURLToPath(new URL("../blender/build_mascot.py", import.meta.url));

export async function findBlender() {
  const executable = process.platform === "win32" ? "blender.exe" : "blender";
  const appPath = "Blender.app/Contents/MacOS/Blender";
  const candidates = [
    process.env.BLENDER_PATH,
    ...((process.env.PATH || "").split(delimiter).filter(Boolean).map((dir) => join(dir, executable))),
    join("/Applications", appPath),
    join(homedir(), "Applications", appPath),
    join(homedir(), "Library/Application Support/Steam/steamapps/common/Blender", appPath),
  ];
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await access(candidate, constants.X_OK);
      if ((await stat(candidate)).isFile()) return resolve(candidate);
    } catch {
      continue;
    }
  }
  return null;
}

export async function buildMascot(blender, recipe, directory) {
  const temporary = await mkdtemp(join(tmpdir(), "zzlight-"));
  try {
    const recipePath = join(temporary, "recipe.json");
    await writeFile(recipePath, JSON.stringify(recipe), { mode: 0o600 });
    const { CLOUDFLARE_API_TOKEN, OPENAI_API_KEY, ...env } = process.env;
    const result = await execute(blender, [
      "--background", "--factory-startup", "--threads", String(Math.min(6, availableParallelism())), "--python-exit-code", "1",
      "--python", script, "--", recipePath, directory,
    ], { env, timeout: 110_000, maxBuffer: 2 * 1024 * 1024 });
    await Promise.all(["mascot.glb", "poster.png"].map((file) => access(join(directory, file))));
    return result.stdout.match(/Verified [^\n]*/)?.[0] || "";
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
