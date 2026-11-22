import { createReadStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { availableParallelism } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { orderedActions, palettes, seeds } from "../shared/catalog.js";
import { campusLineLimit, campusPlaces } from "../shared/campus.js";
import { campusTopics, demoNotes, demoTopicCounts, topicWindowHours } from "../shared/topics.js";
import { buildMascot, findBlender } from "./blender.js";
import { providers } from "./providers.js";
import { composeRecipe, readSketch } from "./recipe.js";
import { openStore } from "./store.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const data = resolve(process.env.ZZLIGHT_DATA_DIR || join(root, "data"));
const media = join(data, "creations");
const dist = join(root, "dist");
const publicOrigin = process.env.ZZLIGHT_PUBLIC_ORIGIN ? new URL(process.env.ZZLIGHT_PUBLIC_ORIGIN) : null;
const concurrentJobs = availableParallelism() > 2 ? 2 : 1;
const store = await openStore(data);
const blender = await findBlender();
const jobs = new Map();
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp",
  ".glb": "model/gltf-binary", ".ico": "image/x-icon",
};

let cloudflare = process.env.CLOUDFLARE_API_TOKEN;
let openai = process.env.OPENAI_API_KEY;
if (process.argv.includes("--ai-stdin")) {
  const input = createInterface({ input: process.stdin, terminal: false });
  console.log("Ready for two key lines. First Cloudflare, then OpenAI. Use an empty line to skip a provider.");
  let lineCount = 0;
  for await (const line of input) {
    if (lineCount++ === 0) {
      cloudflare = line.trim();
    } else {
      openai = line.trim();
      break;
    }
  }
  input.close();
  process.stdin.pause();
}
const ai = providers({ cloudflare, openai });

function json(response, code, payload) {
  response.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function visitor(request, response) {
  const cookie = request.headers.cookie?.split(/;\s*/).find((part) => part.startsWith("zz_visitor="))?.slice(11);
  if (cookie && uuid.test(cookie)) return cookie;
  const id = randomUUID();
  const secure = publicOrigin?.protocol === "https:" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `zz_visitor=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${secure}`);
  return id;
}

async function readJSON(request) {
  const parts = [];
  let size = 0;
  for await (const part of request) {
    size += part.length;
    if (size > 590_000) {
      request.resume();
      throw new Error("草图太大了，请减少笔迹后重试。");
    }
    parts.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new Error("这份草图无法读取。");
  }
}

const mascotNameLimit = 16;

function readLine(input) {
  const line = typeof input?.line === "string" ? input.line.trim() : "";
  if (!line || [...line].length > campusLineLimit) throw new Error(`请写一句话，最多 ${campusLineLimit} 个字。`);
  return line;
}

function readMascotName(input) {
  const name = typeof input?.name === "string" ? input.name.replace(/[\x00-\x1f\x7f]/g, " ").trim() : "";
  if (!name || [...name].length > mascotNameLimit) throw new Error(`请给吉祥物起个名字，最多 ${mascotNameLimit} 个字。`);
  return name;
}

function readTag(value) {
  if (value === undefined || value === null) return value;
  if (typeof value === "string" && Object.hasOwn(campusTopics, value)) return value;
  throw new Error("请从话题列表中选择一个标签。");
}

function setTag(entry, tag) {
  if (tag === undefined || tag === entry.tag) return;
  if (tag) {
    entry.tag = tag;
    entry.taggedAt = Date.now();
  } else {
    delete entry.tag;
    delete entry.taggedAt;
  }
}

function present(record, owner, state = store.read()) {
  const base = record.seed ? `/mascots/${record.id}` : `/media/${record.id}`;
  const votes = state.votes[record.id] || {};
  const own = record.owner === owner;
  return {
    id: record.id, name: record.name, quote: record.quote, mood: record.mood, kind: record.kind,
    emotion: record.emotion,
    intensity: record.intensity, palette: record.palette, tag: record.tag, stage: palettes[record.palette].stage,
    expression: record.expression?.name,
    actions: record.clips?.map(({ steps, ...clip }) => clip) || orderedActions(record.kind, record.leadAction),
    model: `${base}/mascot.glb`, poster: `${base}/poster.png`,
    source: record.source, prompt: own ? record.prompt : null, own,
    motionWarnings: own ? record.motionWarnings : undefined,
    seed: Boolean(record.seed), published: Boolean(record.published), publishedAt: record.publishedAt,
    campus: record.published ? record.campus : undefined,
    likes: (record.likes || 0) + Object.keys(votes).length, liked: Boolean(votes[owner]),
  };
}

function presentNote(note, owner, state = store.read()) {
  const votes = state.votes[note.id] || {};
  return {
    id: note.id, line: note.line, createdAt: note.createdAt,
    own: !note.seed && note.owner === owner, seed: Boolean(note.seed),
    tag: note.tag, likes: (note.likes || 0) + Object.keys(votes).length, liked: Boolean(votes[owner]),
  };
}

const bootTime = Date.now();
const seedNotes = demoNotes.map((note) => ({
  ...note,
  seed: true,
  createdAt: bootTime - note.offsetMinutes * 60_000,
}));
const seedNoteMap = Object.fromEntries(seedNotes.map((note) => [note.id, note]));

function topicCutoff() {
  return Date.now() - topicWindowHours * 3_600_000;
}

function topicHeat(owner, state = store.read()) {
  const cutoff = topicCutoff();
  const members = Object.fromEntries(Object.keys(campusTopics).map((id) => [id, new Set()]));
  function include(person, item) {
    if (person && item?.taggedAt >= cutoff && Object.hasOwn(members, item.tag)) members[item.tag].add(person);
  }
  for (const note of Object.values(state.notes)) include(note.owner, note);
  for (const post of Object.values(state.creations)) {
    if (post.published) include(post.owner, post.campus);
  }
  return Object.entries(members).map(([id, people]) => {
    const signals = state.topicSignals?.[id] || {};
    for (const [person, time] of Object.entries(signals)) {
      if (time >= cutoff) people.add(person);
    }
    return { id, count: (demoTopicCounts[id] || 0) + people.size, joined: signals[owner] >= cutoff };
  }).sort((a, b) => b.count - a.count);
}

const demoPosts = seeds.map((seed) => ({ ...seed, seed: true, published: true, publishedAt: 0, source: "demo" }));
const seedMap = Object.fromEntries(demoPosts.map((seed) => [seed.id, seed]));

function publicCreation(id, state) {
  const record = state.creations[id] || seedMap[id];
  return record?.published ? record : null;
}

function feed(owner, state = store.read()) {
  return [...demoPosts, ...Object.values(state.creations).filter(({ published }) => published)]
    .map((record) => present(record, owner, state)).sort((a, b) => b.likes - a.likes || b.publishedAt - a.publishedAt);
}

async function generate(job, input) {
  const directory = join(media, job.id);
  try {
    const recipe = await composeRecipe(input, (prompt, sketch) => ai.create(prompt, sketch));
    job.stage = "sculpting";
    await mkdir(directory, { recursive: true });
    const summary = await buildMascot(blender, recipe, directory);
    console.log(`[${recipe.source} → Blender] ${summary || "GLB ready"}`);
    const { mark, outline, ...details } = recipe;
    const record = { ...details, id: job.id, owner: job.owner, published: false, createdAt: Date.now() };
    await store.mutate((state) => { state.creations[job.id] = record; });
    job.stage = "ready";
  } catch (error) {
    console.warn("[Build]", error.stderr?.split("\n").filter(Boolean).slice(-6).join("\n") || error.message);
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    job.stage = "failed";
  } finally {
    job.completed = Date.now();
  }
}

async function setVote(request, response, owner, id, getEntry, describe) {
  let liked;
  try {
    ({ liked } = await readJSON(request));
    if (typeof liked !== "boolean") throw new Error("请指定是否共鸣。");
  } catch (error) {
    return json(response, 400, { error: error.message });
  }
  const updated = await store.mutate((state) => {
    const entry = getEntry(id, state);
    if (!entry) return null;
    const votes = state.votes[id] ||= {};
    if (liked) votes[owner] = true;
    else delete votes[owner];
    return describe(entry, owner, state);
  });
  return updated ? json(response, 200, updated) : json(response, 404, { error: "这条内容已被收回。" });
}

async function api(request, response, pathname, owner) {
  const method = request.method;
  if (method === "GET" && pathname === "/api/bootstrap") {
    const state = store.read();
    const latest = Object.values(state.creations).filter((record) => record.owner === owner).at(-1);
    return json(response, 200, {
      providers: ai.labels, blender: Boolean(blender), feed: feed(owner, state),
      latest: latest ? present(latest, owner, state) : null,
    });
  }
  if (method === "GET" && pathname === "/api/feed") return json(response, 200, feed(owner));
  if (method === "GET" && pathname === "/api/topics") return json(response, 200, topicHeat(owner));
  if (method === "GET" && pathname === "/api/notes") {
    const state = store.read();
    return json(response, 200, [...Object.values(state.notes), ...seedNotes].map((note) => presentNote(note, owner, state)));
  }
  if (method === "POST" && pathname === "/api/notes") {
    let line, tag;
    try {
      const input = await readJSON(request);
      line = readLine(input);
      tag = readTag(input.tag);
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
    const note = { id: randomUUID(), owner, line, createdAt: Date.now() };
    setTag(note, tag);
    await store.mutate((state) => { state.notes[note.id] = note; });
    return json(response, 201, presentNote(note, owner));
  }
  if (method === "POST" && pathname === "/api/creations") {
    if (!blender) return json(response, 503, { error: "没有找到 Blender。请在本机设置 BLENDER_PATH 后重启。" });
    for (const [id, job] of jobs) {
      if (job.completed && Date.now() - job.completed > 600_000) jobs.delete(id);
    }
    let input;
    try {
      input = readSketch(await readJSON(request));
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
    const active = [...jobs.values()].filter((job) => !job.completed);
    if (active.length >= concurrentJobs || active.some((job) => job.owner === owner)) {
      return json(response, 429, { error: "Blender 还在配制，请稍后再试。" });
    }
    const job = { id: randomUUID(), owner, stage: "reading" };
    jobs.set(job.id, job);
    json(response, 202, { id: job.id });
    void generate(job, input);
    return;
  }

  const [, , collection, id, operation, extra] = pathname.split("/");
  if (method === "PUT" && collection === "topics" && !operation && !extra && Object.hasOwn(campusTopics, id)) {
    let joined;
    try {
      ({ joined } = await readJSON(request));
      if (typeof joined !== "boolean") throw new Error("请指定是否加入这个话题。");
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
    const topics = await store.mutate((draft) => {
      const groups = draft.topicSignals ||= {};
      const cutoff = topicCutoff();
      const signals = groups[id] = Object.fromEntries(Object.entries(groups[id] || {}).filter(([, at]) => at >= cutoff));
      if (joined) signals[owner] = Date.now();
      else delete signals[owner];
      return topicHeat(owner, draft);
    });
    return json(response, 200, topics);
  }
  if (extra || !id || !(uuid.test(id) || Object.hasOwn(seedMap, id) || Object.hasOwn(seedNoteMap, id))) {
    return json(response, 404, { error: "这里没有这个吉祥物。" });
  }
  const state = store.read();
  if (collection === "notes") {
    const note = state.notes[id] || seedNoteMap[id];
    if (note && method === "PUT" && operation === "like") {
      return setVote(request, response, owner, id, (noteId, draft) => draft.notes[noteId] || seedNoteMap[noteId], presentNote);
    }
    if (note?.owner === owner && !operation && (method === "PUT" || method === "DELETE")) {
      let line, tag;
      if (method === "PUT") {
        try {
          const input = await readJSON(request);
          line = readLine(input);
          tag = readTag(input.tag);
        } catch (error) {
          return json(response, 400, { error: error.message });
        }
      }
      const updated = await store.mutate((draft) => {
        const current = draft.notes[id];
        if (!current) return null;
        if (method === "PUT") {
          current.line = line;
          setTag(current, tag);
          return presentNote(current, owner, draft);
        }
        delete draft.notes[id];
        delete draft.votes[id];
        return { id };
      });
      if (updated) return json(response, 200, updated);
    }
    return json(response, 404, { error: "找不到可操作的留言。" });
  }
  const record = state.creations[id] || seedMap[id];
  if (method === "GET" && collection === "creations" && !operation) {
    const job = jobs.get(id);
    if (record && (record.published || record.owner === owner)) {
      return json(response, 200, { stage: "ready", mascot: present(record, owner) });
    }
    if (job?.owner === owner) {
      return json(response, 200, {
        stage: job.stage, error: job.stage === "failed" ? "Blender 这次没捏成，请再试一次。" : undefined,
      });
    }
  }
  if (method === "PUT" && collection === "creations" && operation === "name" && record?.owner === owner) {
    let name;
    try {
      name = readMascotName(await readJSON(request));
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
    const updated = await store.mutate((draft) => {
      const creation = draft.creations[id];
      if (!creation) return null;
      creation.name = name;
      return present(creation, owner, draft);
    });
    if (updated) return json(response, 200, updated);
  }
  if (method === "PUT" && collection === "creations" && operation === "publish" && record?.owner === owner) {
    let published;
    try {
      ({ published } = await readJSON(request));
      if (typeof published !== "boolean") throw new Error("请指定是否发布。");
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
    await store.mutate((draft) => {
      const creation = draft.creations[id];
      if (creation.published === published) return;
      creation.published = published;
      creation.publishedAt = published ? Date.now() : null;
      if (!published) delete creation.campus;
    });
    return json(response, 200, present(store.read().creations[id], owner));
  }
  if (method === "PUT" && collection === "creations" && operation === "campus" && record?.owner === owner) {
    let place, line, tag;
    try {
      ({ place, line, tag } = await readJSON(request));
      if (place !== null && (typeof place !== "string" || !Object.hasOwn(campusPlaces, place))) {
        throw new Error("请在地图上选择一个校园地点。");
      }
      if (place !== null) {
        line = readLine({ line });
        tag = readTag(tag);
      }
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
    const updated = await store.mutate((draft) => {
      const creation = draft.creations[id];
      if (place === null) {
        delete creation.campus;
      } else {
        creation.campus = { ...creation.campus, place, line };
        setTag(creation.campus, tag);
        if (!creation.published) {
          creation.published = true;
          creation.publishedAt = Date.now();
        }
      }
      return present(creation, owner, draft);
    });
    return json(response, 200, updated);
  }
  if (method === "PUT" && collection === "feed" && operation === "like" && record?.published) {
    return setVote(request, response, owner, id, publicCreation, present);
  }
  return json(response, 404, { error: "这里没有这个吉祥物。" });
}

async function sendFile(response, path, cache = "no-store", head = false) {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return false;
  response.writeHead(200, {
    "Content-Type": mime[extname(path)] || "application/octet-stream",
    "Content-Length": info.size, "Cache-Control": cache,
    "X-Content-Type-Options": "nosniff",
  });
  if (head) response.end();
  else createReadStream(path).on("error", () => response.destroy()).pipe(response);
  return true;
}

let vite;
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    const { pathname } = url;
    const method = request.method;
    if (pathname.startsWith("/api/")) {
      const origin = publicOrigin?.origin ?? `http://${request.headers.host}`;
      if (method !== "GET" && request.headers.origin && request.headers.origin !== origin) {
        return json(response, 403, { error: "请在演示页面内操作。" });
      }
      return await api(request, response, pathname, visitor(request, response));
    }
    if (pathname.startsWith("/media/")) {
      const match = pathname.match(/^\/media\/([^/]+)\/(mascot\.glb|poster\.png)$/);
      const owner = visitor(request, response);
      const record = match && uuid.test(match[1]) && store.read().creations[match[1]];
      if ((method === "GET" || method === "HEAD") && record && (record.published || record.owner === owner) &&
          await sendFile(response, join(media, record.id, match[2]), "private, no-store", method === "HEAD")) return;
      return json(response, 404, { error: "找不到这个模型文件。" });
    }
    if (vite) {
      vite.middlewares(request, response, () => json(response, 404, { error: "找不到这个页面。" }));
      return;
    }
    const asset = resolve(dist, "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname));
    if (asset.startsWith(dist + sep) && (method === "GET" || method === "HEAD") &&
        await sendFile(response, asset, pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache", method === "HEAD")) return;
    return json(response, 404, { error: "找不到这个页面。请先运行 npm run build。" });
  } catch (error) {
    console.error("[Local server]", error.message);
    if (!response.headersSent) json(response, 500, { error: "制造间临时掉线，请重试。" });
    else response.destroy();
  }
});

if (process.argv.includes("--watch")) {
  const { createServer: createVite } = await import("vite");
  vite = await createVite({
    root,
    server: {
      middlewareMode: true,
      allowedHosts: ["hack2.onelittlechild.cn"],
      ws: { server },
      fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/data/**", data + "/**"] },
    },
  });
}

const port = Number(process.env.PORT || 4173);
server.listen(port, "127.0.0.1", () => {
  console.log(`电子布洛芬 http://127.0.0.1:${server.address().port}`);
  console.log(`Blender: ${blender ? "ready" : "missing"} · 配方: ${ai.labels.join(" → ") || "本地"}`);
});
