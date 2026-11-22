import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Pill, Sparkles } from "lucide-react";
import { orderedActions, palettes, seeds } from "../shared/catalog.js";
import { campusPlaces } from "../shared/campus.js";
import { primaryEmotions } from "../shared/emotions.js";
import { campusTopics } from "../shared/topics.js";
import AppDock from "./AppDock.jsx";
import Community from "./Community.jsx";
import DrawStage from "./DrawStage.jsx";
import Lab from "./Lab.jsx";
import Manual from "./Manual.jsx";
import MessageWall from "./MessageWall.jsx";
import { cropSketch, sketchImage } from "./Sketchpad.jsx";
import "./style.css";

const loadCampusMap = () => import("./CampusMap.jsx");
const CampusMap = lazy(loadCampusMap);

const demoFeed = seeds.map((seed) => ({
  ...seed, stage: palettes[seed.palette].stage, actions: orderedActions(seed.kind, seed.leadAction),
  model: `/mascots/${seed.id}/mascot.glb`, poster: `/mascots/${seed.id}/poster.png`,
  seed: true, published: true, publishedAt: 0,
}));

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      method: options.method || "GET",
      ...(options.body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new Error("制造间暂时掉线了，请重试。");
  }
  const value = await response.json().catch(() => null);
  if (!response.ok || !value) throw new Error(value?.error || "制造间暂时掉线了，请重试。");
  return value;
}

function currentRoute() {
  const [page, id, spot] = window.location.hash.slice(1).split("/");
  if (!page || page === "draw") return { page: "draw", place: Object.hasOwn(campusPlaces, id) ? id : undefined };
  if (page === "board") return { page };
  if (page === "messages") return { page, topic: Object.hasOwn(campusTopics, id) ? id : undefined };
  if (page === "campus") return { page, id, place: Object.hasOwn(campusPlaces, spot) ? spot : undefined };
  if ((page === "manual" || page === "post") && id) return { page, id };
  return { page: "lab", place: Object.hasOwn(campusPlaces, id) ? id : undefined };
}

function useReducedMotion() {
  const [reduce, setReduce] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduce;
}

function Header({ route, latest }) {
  return <header className="site-header">
    <div className="page-width header-inner">
      <a href="#draw" className="brand" aria-label="电子布洛芬首页">
        <span className="brand-mark"><Pill size={21} strokeWidth={2.5} aria-hidden="true" /></span>
        <span className="brand-text">
          <strong>电子布洛芬</strong>
          <small className="brand-issue">校园情绪实验</small>
        </span>
      </a>
      <div className="header-tail">
        {latest && <a href={`#manual/${latest.id}`} className="last-mascot"
          aria-current={route.page === "manual" ? "page" : undefined}>
          <Sparkles size={16} strokeWidth={2.4} aria-hidden="true" /> <span>我的吉祥物</span>
        </a>}
      </div>
    </div>
  </header>;
}

function App() {
  const [route, setRoute] = useState(currentRoute);
  const [draft, setDraft] = useState({ mood: primaryEmotions.tired.mood, emotion: null, intensity: 3, kind: "gag", palette: "auto", tag: "", strokes: [], useAI: true, motionText: "" });
  const [posts, setPosts] = useState(demoFeed);
  const [notes, setNotes] = useState([]);
  const [topics, setTopics] = useState(() => Object.keys(campusTopics).map((id) => ({ id, count: 0, joined: false })));
  const [pendingTopic, setPendingTopic] = useState(null);
  const [topicError, setTopicError] = useState("");
  const [booted, setBooted] = useState(false);
  const [providers, setProviders] = useState([]);
  const [latest, setLatest] = useState(null);
  const [detail, setDetail] = useState(null);
  const [arrival, setArrival] = useState(null);
  const [busy, setBusy] = useState("");
  const [formError, setFormError] = useState("");
  const [boardError, setBoardError] = useState("");
  const [pendingLikes, setPendingLikes] = useState(new Set());
  const [detailStatus, setDetailStatus] = useState({ id: "", message: "" });
  const canvas = useRef(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    function update() {
      const next = currentRoute();
      setRoute(next);
      setArrival((previous) => previous?.id === next.id && previous?.to === next.place ? previous : null);
    }
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.page, route.id, route.place, route.topic]);

  useEffect(() => {
    let active = true;
    api("/api/bootstrap").then((data) => {
      if (!active) return;
      setPosts(data.feed);
      setProviders(data.providers);
      setLatest(data.latest);
    }).catch((error) => {
      if (active) setFormError(error.message);
    }).finally(() => {
      if (active) setBooted(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!booted) return;
    let active = true;
    function refresh() {
      if (document.hidden) return;
      api("/api/feed").then((feed) => { if (active) setPosts(feed); }).catch(() => {});
      if (route.page === "messages") api("/api/notes").then((list) => { if (active) setNotes(list); }).catch(() => {});
      if (route.page === "messages" || route.page === "campus" || route.page === "draw") {
        api("/api/topics").then((list) => { if (active) setTopics(list); }).catch(() => {});
      }
    }
    refresh();
    const timer = setInterval(refresh, route.page === "campus" ? 4_000 : 10_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [booted, route.page]);

  useEffect(() => {
    if (!route.id) return;
    let active = true;
    api(`/api/creations/${encodeURIComponent(route.id)}`).then(({ mascot }) => {
      if (!active) return;
      if (mascot) setDetail(mascot);
      else setDetailStatus({ id: route.id, message: "这只吉祥物还在生成中。" });
    }).catch((error) => { if (active) setDetailStatus({ id: route.id, message: error.message }); });
    return () => { active = false; };
  }, [route.id]);

  function setStrokes(change) {
    setFormError("");
    setDraft((previous) => ({
      ...previous,
      strokes: typeof change === "function" ? change(previous.strokes) : change,
    }));
  }

  async function generate(event) {
    event.preventDefault();
    if (busy) return;
    if (!draft.strokes.length) {
      setFormError("先画两笔，或者点「用范例」。");
      canvas.current?.focus();
      return;
    }
    const { page, place } = route;
    const destination = place ?? (page === "draw" ? "library" : undefined);
    setBusy("reading");
    setFormError("");
    if (destination) void loadCampusMap().catch(() => {});
    try {
      const aspect = 1;
      const strokes = cropSketch(draft.strokes);
      const useAI = Boolean(providers.length && draft.useAI);
      const { id } = await api("/api/creations", {
        method: "POST", body: { ...draft, emotion: draft.emotion ?? "tired", strokes, aspect, useAI,
          sketch: useAI ? sketchImage(strokes, aspect) : null },
      });
      const until = Date.now() + 175_000;
      while (Date.now() < until) {
        const result = await api(`/api/creations/${id}`);
        if (result.stage === "ready") {
          setLatest(result.mascot);
          setDetail(result.mascot);
          const current = currentRoute();
          if (current.page === page && current.place === place) {
            if (page === "draw") setArrival({ id, from: place ?? "gate", to: destination });
            location.hash = destination ? `campus/${id}/${destination}` : `manual/${id}`;
          }
          return;
        }
        if (result.stage === "failed") throw new Error(result.error);
        setBusy(result.stage);
        await new Promise((resolve) => setTimeout(resolve, 650));
      }
      throw new Error("配制暂时超时，请刷新后查看「我的吉祥物」。");
    } catch (error) {
      setFormError(error.message);
    } finally {
      setBusy("");
    }
  }

  function updateCreation(updated) {
    setDetail(updated);
    setLatest((previous) => previous?.id === updated.id ? updated : previous);
    setPosts((previous) => [...previous.filter((entry) => entry.id !== updated.id), ...(updated.published ? [updated] : [])]
      .sort((a, b) => b.likes - a.likes || b.publishedAt - a.publishedAt));
  }

  async function publish(mascot, published) {
    const updated = await api(`/api/creations/${mascot.id}/publish`, { method: "PUT", body: { published } });
    updateCreation(updated);
  }

  async function renameMascot(mascot, name) {
    const updated = await api(`/api/creations/${mascot.id}/name`, { method: "PUT", body: { name } });
    updateCreation(updated);
  }

  function refreshTopics() {
    api("/api/topics").then(setTopics).catch(() => {});
  }

  async function postOnCampus(mascot, place, line, tag) {
    const updated = await api(`/api/creations/${mascot.id}/campus`, { method: "PUT", body: { place, line, tag } });
    updateCreation(updated);
    refreshTopics();
  }

  async function saveNote(note, line, tag) {
    if (note?.campus) return postOnCampus(note, note.campus.place, line, tag);
    const updated = await api(note ? `/api/notes/${note.id}` : "/api/notes", {
      method: note ? "PUT" : "POST", body: { line, tag },
    });
    setNotes((previous) => [updated, ...previous.filter((entry) => entry.id !== updated.id)]);
    refreshTopics();
  }

  async function removeNote(note) {
    if (note.campus) return postOnCampus(note, null);
    await api(`/api/notes/${note.id}`, { method: "DELETE" });
    setNotes((previous) => previous.filter((entry) => entry.id !== note.id));
    refreshTopics();
  }

  async function joinTopic(id, joined) {
    if (pendingTopic) return;
    setPendingTopic(id);
    setTopicError("");
    try {
      setTopics(await api(`/api/topics/${id}`, { method: "PUT", body: { joined } }));
    } catch (error) {
      setTopicError(error.message);
    } finally {
      setPendingTopic(null);
    }
  }

  async function toggleLike(mascot, collection = "feed") {
    if (pendingLikes.has(mascot.id)) return;
    setBoardError("");
    setPendingLikes((previous) => new Set(previous).add(mascot.id));
    try {
      const updated = await api(`/api/${collection}/${mascot.id}/like`, { method: "PUT", body: { liked: !mascot.liked } });
      if (collection === "notes") setNotes((previous) => previous.map((entry) => entry.id === updated.id ? updated : entry));
      else {
        setPosts((previous) => previous.map((entry) => entry.id === updated.id ? updated : entry)
          .sort((a, b) => b.likes - a.likes || b.publishedAt - a.publishedAt));
        setDetail((previous) => previous?.id === updated.id ? updated : previous);
      }
    } catch (error) {
      setBoardError(error.message);
    } finally {
      setPendingLikes((previous) => {
        const next = new Set(previous);
        next.delete(mascot.id);
        return next;
      });
    }
  }

  const fromFeed = route.page === "post";
  const inCampus = route.page === "campus";
  const current = fromFeed
    ? posts.find(({ id }) => id === route.id)
    : detail?.id === route.id ? detail : latest?.id === route.id ? latest : null;
  const missingMessage = detailStatus.id === route.id ? detailStatus.message
    : fromFeed && detail?.id === route.id ? "这只吉祥物已离开情绪图鉴。" : "正在找这只吉祥物…";
  const pilot = route.id ? current : latest || demoFeed[0];
  function selectEmotion(emotion) {
    setDraft((previous) => ({ ...previous, emotion, mood: primaryEmotions[emotion].mood }));
  }

  const drawProps = { draft: { ...draft, emotion: draft.emotion ?? "tired" }, setDraft, setStrokes, selectEmotion,
    surfaceRef: canvas, providers, busy, error: formError, onGenerate: generate };
  const topicProps = { topics, pendingTopic, onJoinTopic: joinTopic, topicError };

  if (route.page === "draw") return <DrawStage {...drawProps} booted={booted} topics={topics}
    place={route.place ? { ...campusPlaces[route.place], id: route.place } : undefined} />;

  if (inCampus) return <main>
    {!booted && !route.id ? <div className="scene scene-loading" role="status">正在展开校园地图…</div>
      : pilot ? <Suspense fallback={<div className="scene scene-loading" role="status">正在展开校园地图…</div>}>
      <CampusMap key={`${pilot.id}/${route.place || ""}`} pilot={pilot} initialPlace={route.place} {...topicProps}
        previewEmotion={route.id ? null : draft.emotion} previewIntensity={draft.intensity}
        arrival={arrival?.id === pilot.id ? arrival : null} posts={posts} reducedMotion={reducedMotion} onCampus={postOnCampus}
        onRename={renameMascot} onToggle={toggleLike} pendingLikes={pendingLikes} boardError={boardError} />
    </Suspense> : <div className="scene scene-loading"><p role="status">{missingMessage}</p><a href="#campus">打开校园地图</a></div>}
  </main>;

  return <div className="page-shell">
    <Header route={route} latest={latest} />
    <main className="page-width">
      {route.page === "lab" && <Lab {...drawProps} posts={posts} reducedMotion={reducedMotion}
        place={route.place ? campusPlaces[route.place] : undefined} />}
      {route.page === "board" && <Community posts={posts} pendingLikes={pendingLikes} onToggle={toggleLike} error={boardError} />}
      {route.page === "messages" && <MessageWall notes={notes} posts={posts} pendingLikes={pendingLikes} topic={route.topic} {...topicProps}
        onToggle={toggleLike} onSave={saveNote} onRemove={removeNote} error={boardError} />}
      {route.id && (current ? <>
        <Manual key={current.id} mascot={current} community={fromFeed} reducedMotion={reducedMotion}
          onPublish={publish} onRename={renameMascot} onToggle={toggleLike} pendingLike={pendingLikes.has(current.id)} />
        {boardError && fromFeed && <p className="problem" role="alert">{boardError}</p>}
      </> : <div className="loading-page">
        <p role="status">{missingMessage}</p>
        <a className="text-link" href={fromFeed ? "#board" : "#lab"}>返回{fromFeed ? "情绪图鉴" : "制造间"}</a>
      </div>)}
    </main>
    <footer className="page-width site-footer">
      <span className="footer-stamp">电子布洛芬</span>
      <span>校园情绪实验 · 慢慢走一会儿</span>
    </footer>
    <AppDock active={route.page === "post" ? "board" : route.page === "manual" ? "lab" : route.page} />
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);
