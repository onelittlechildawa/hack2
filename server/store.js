import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function openStore(directory) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, "state.json");
  let state;
  try {
    state = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    state = { creations: {}, votes: {} };
  }
  state.notes ??= {};
  let writing = Promise.resolve();

  return {
    read: () => state,
    mutate(change) {
      const commit = writing.then(async () => {
        const draft = structuredClone(state);
        const result = change(draft);
        await writeFile(path + ".tmp", JSON.stringify(draft), { mode: 0o600 });
        await rename(path + ".tmp", path);
        state = draft;
        return result;
      });
      writing = commit.catch(() => {});
      return commit;
    },
  };
}
