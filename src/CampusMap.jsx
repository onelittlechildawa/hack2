import { useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Check, Expand, Flame, Footprints, House, MapPin, MessageCircle, Minus, Navigation2, Pencil, Plus, Send, Share2, Shrink, Users, Utensils, Volume2, Waves, X } from "lucide-react";
import { campusLineLimit, campusPlaces, campusRoute, campusViews, projectCampus } from "../shared/campus.js";
import { hasCareSignal } from "../shared/care.js";
import { emotionLabel } from "../shared/emotions.js";
import AppDock from "./AppDock.jsx";
import CampusArtwork from "./CampusArtwork.jsx";
import { TopicLeaderboard, TopicLink, TopicSelect } from "./CampusTopics.jsx";
import CareCard from "./CareCard.jsx";
import { Like } from "./Community.jsx";
import FullscreenButton from "./FullscreenButton.jsx";
import ShareDialog from "./ShareDialog.jsx";
import Viewer from "./Viewer.jsx";
import { campusPerformanceFor } from "./campusPerformances.js";
import useCampusCamera from "./useCampusCamera.js";
import "./campus.css";

const placeIcons = { gate: MapPin, library: BookOpen, pool: Waves, canteen: Utensils, dorm: House, field: Footprints };
const neighborOffsets = { gate: [-43, 2], library: [39, 24], pool: [-47, 31],
  canteen: [-52, 58], dorm: [33, -26], field: [46, 4] };
const canRead = () => "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

function screenPosition({ x, y }, { width, height }) {
  return { left: `${x / width * 100}%`, top: `${y / height * 100}%` };
}

function pathFrames(points, view) {
  let distance = 0;
  const traveled = points.map((point, i) => {
    if (i) distance += Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y);
    return distance;
  });
  return {
    duration: Math.max(750, Math.round(distance * 5.3)),
    frames: points.map((point, index) => ({ ...screenPosition(projectCampus(point, view), view.size),
      offset: traveled[index] / distance })),
  };
}

function placedNeighbors(posts, pilotId) {
  return Object.entries(campusPlaces).flatMap(([id, place]) => {
    const [dx, dy] = neighborOffsets[id];
    return posts.filter((post) => post.id !== pilotId && post.campus?.place === id)
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .map((post, index) => ({ post, x: place.x + dx, y: place.y + dy, marker: index === 0 }));
  });
}

export default function CampusMap({ pilot, initialPlace, arrival, posts, reducedMotion, onCampus, onRename, onToggle,
  pendingLikes, boardError, topics, pendingTopic, onJoinTopic, topicError, previewEmotion, previewIntensity }) {
  const [place, setPlace] = useState(() => arrival?.from ?? initialPlace ?? (pilot.own ? pilot.campus?.place : undefined) ?? "gate");
  const [path, setPath] = useState(() => arrival && arrival.from !== arrival.to ? campusRoute(arrival.from, arrival.to) : []);
  const [trip, setTrip] = useState(() => path.length > 1 ? { points: path, to: arrival.to, intro: true } : null);
  const [line, setLine] = useState(() => [...(pilot.campus?.line || pilot.quote)].slice(0, campusLineLimit).join(""));
  const [tag, setTag] = useState(pilot.campus?.tag || pilot.tag || "");
  const [nameInput, setNameInput] = useState(pilot.name);
  const [renaming, setRenaming] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [carePinned, setCarePinned] = useState(false);
  const [careDismissed, setCareDismissed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [bubble, setBubble] = useState(null);
  const [selected, setSelected] = useState(null);
  const [performing, setPerforming] = useState(null);
  const [replay, setReplay] = useState(0);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [overview, setOverview] = useState(false);
  const [panel, setPanel] = useState(null);
  const [destinationsOpen, setDestinationsOpen] = useState(false);
  const actor = useRef(null);
  const travelClock = useRef(null);
  const readAloud = useRef(false);
  const camera = useCampusCamera(actor, overview);
  const { centerActor } = camera;
  const view = overview ? campusViews.overview : campusViews.oblique;
  const position = (point) => screenPosition(projectCampus(point, view), view.size);
  const neighbors = placedNeighbors(posts, pilot.id);
  const chosen = neighbors.find(({ post }) => post.id === selected);
  const localNeighbors = neighbors.filter(({ post }) => post.campus.place === place);
  const currentPlace = campusPlaces[place];
  const animated = Boolean(trip && !reducedMotion);
  const performance = campusPerformanceFor(pilot, previewEmotion);
  const showPerformance = !trip && performing === performance.id;
  const showing = chosen ? { ...chosen, line: chosen.post.campus.line || chosen.post.quote }
    : bubble ? { ...currentPlace, line: bubble } : null;
  const bubblePoint = showing && projectCampus(showing, view);

  useEffect(() => {
    if (!trip) return;
    const { duration, frames } = pathFrames(trip.points, view);
    const animation = actor.current.animate(frames, {
      duration: reducedMotion ? 1 : duration,
      delay: trip.intro && !reducedMotion ? 530 : 0,
      fill: "both",
    });
    if (travelClock.current?.trip === trip) animation.currentTime = travelClock.current.elapsed;
    let cameraFrame;
    function follow() {
      centerActor();
      cameraFrame = requestAnimationFrame(follow);
    }
    cameraFrame = requestAnimationFrame(follow);
    let active = true;
    animation.finished.then(() => {
      if (!active) return;
      centerActor();
      setPlace(trip.to);
      setTrip(null);
      setReplay((value) => value + 1);
    }).catch(() => {});
    return () => {
      active = false;
      travelClock.current = { trip, elapsed: animation.currentTime ?? 0 };
      cancelAnimationFrame(cameraFrame);
      animation.cancel();
    };
  }, [trip, reducedMotion, view, centerActor]);

  useEffect(() => () => {
    if (readAloud.current) window.speechSynthesis.cancel();
  }, []);

  function walkTo(to) {
    if (trip || to === place) return;
    const points = campusRoute(place, to);
    if (points.length < 2) return;
    setSelected(null);
    setPanel(null);
    setDestinationsOpen(false);
    setBubble(null);
    setNotice("");
    camera.follow();
    setPath(points);
    setTrip({ to, points });
  }

  function observe(id) {
    setSelected((previous) => previous === id ? null : id);
    setPanel("neighbors");
    setDestinationsOpen(false);
    setNotice("");
  }

  function openPanel(next) {
    setSelected(null);
    setDestinationsOpen(false);
    setPanel((previous) => previous === next ? null : next);
  }

  function speak(text) {
    if (!canRead()) return;
    readAloud.current = true;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "zh-CN";
    speech.rate = 1;
    window.speechSynthesis.speak(speech);
  }

  async function saveName(event) {
    event.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed || savingName || !onRename) return;
    if (trimmed === pilot.name) {
      setRenaming(false);
      return;
    }
    setSavingName(true);
    setNameError("");
    try {
      await onRename(pilot, trimmed);
      setRenaming(false);
      setNotice("已更新吉祥物名字");
    } catch (error) {
      setNameError(error.message);
    } finally {
      setSavingName(false);
    }
  }

  async function announce(event) {
    event.preventDefault();
    const text = line.trim();
    if (!text || trip || sending) return;
    const triggeredCare = hasCareSignal(text);
    setSelected(null);
    setProblem("");
    setNotice("");
    setBubble(text);
    setReplay((value) => value + 1);
    if (triggeredCare) {
      setCarePinned(true);
      setCareDismissed(false);
    }
    if (!pilot.own) return;
    setSending(true);
    try {
      await onCampus(pilot, place, text, tag || null);
      setNotice(`已在${currentPlace.name}匿名留言`);
    } catch (error) {
      setProblem(error.message);
    } finally {
      setSending(false);
    }
  }

  async function takeBack() {
    setProblem("");
    setSending(true);
    try {
      await onCampus(pilot, null);
      setNotice("已收回地图留言");
      setBubble(null);
    } catch (error) {
      setProblem(error.message);
    } finally {
      setSending(false);
    }
  }

  const showCare = carePinned || (hasCareSignal(line) && !careDismissed);

  const profile = <>
    {pilot.own && onRename && <div className="campus-rename-block">
      {renaming ? <form className="campus-rename-form" onSubmit={saveName}>
        <label htmlFor="campus-mascot-name">吉祥物名字</label>
        <div className="campus-rename-row">
          <input id="campus-mascot-name" type="text" maxLength={16} value={nameInput} autoFocus
            disabled={savingName} placeholder="最多 16 字"
            onChange={(event) => setNameInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") { setRenaming(false); setNameInput(pilot.name); setNameError(""); } }} />
          <button type="submit" className="scene-button scene-primary scene-icon" aria-label="保存名字"
            disabled={savingName || !nameInput.trim()}><Check size={16} aria-hidden="true" /></button>
          <button type="button" className="scene-button scene-icon" aria-label="取消改名" disabled={savingName}
            onClick={() => { setRenaming(false); setNameInput(pilot.name); setNameError(""); }}><X size={16} aria-hidden="true" /></button>
        </div>
        {nameError && <p className="problem" role="alert"><AlertTriangle size={15} aria-hidden="true" /> {nameError}</p>}
      </form> : <div className="campus-rename-summary">
        <span>当前名字：<strong>{pilot.name}</strong></span>
        <button type="button" className="campus-text-button" onClick={() => {
          setNameInput(pilot.name);
          setNameError("");
          setRenaming(true);
        }}><Pencil size={13} aria-hidden="true" /> 改名</button>
      </div>}
    </div>}
    <form className="campus-speech-form" onSubmit={announce}>
      <label htmlFor="campus-line"><MessageCircle size={16} aria-hidden="true" /> 想说的话</label>
      <textarea id="campus-line" value={line} onChange={(event) => {
        const next = event.target.value;
        setLine(next);
        if (!hasCareSignal(next)) setCareDismissed(false);
      }} rows={2}
        maxLength={campusLineLimit} placeholder="留一句话在这里" disabled={sending} />
      {showCare && <CareCard variant="scene" onDismiss={() => { setCarePinned(false); setCareDismissed(true); }} />}
      {pilot.own && <TopicSelect value={tag} onChange={setTag} disabled={sending} />}
      <button type="submit" className="scene-button scene-primary" disabled={!line.trim() || Boolean(trip) || sending}>
        <Send size={16} aria-hidden="true" /> {pilot.own ? "匿名发言" : "说一句"}
      </button>
      {pilot.own && <small>发言会把吉祥物和这句话留在当前地点。</small>}
    </form>
    {pilot.own && pilot.campus && <button type="button" className="campus-text-button"
      disabled={sending} onClick={takeBack}>收回地图留言</button>}
    {notice && <p className="campus-notice" role="status">{notice}</p>}
    {problem && <p className="problem" role="alert"><AlertTriangle size={16} aria-hidden="true" /> {problem}</p>}
  </>;

  return <section className="scene campus" data-arrival={Boolean(arrival) || undefined} data-overview={overview || undefined}
    style={{ "--map-ratio": view.size.width / view.size.height, "--map-zoom": camera.zoom }}>
    <div className="campus-viewport" ref={camera.viewport} tabIndex={0} role="region" aria-label="校园地图，拖动平移，滚轮缩放"
      {...camera.pointerHandlers}>
      <div className="campus-world">
        <div className="campus-map" ref={camera.map}>
          <CampusArtwork route={path} view={view} />
          {Object.entries(campusPlaces).map(([id, location]) => {
            const Glyph = placeIcons[location.icon];
            return <button key={id} type="button" className="campus-pin"
              aria-label={`前往${location.name}`} aria-current={place === id && !trip ? "location" : undefined}
              data-place={id} data-target={trip?.to === id || undefined} disabled={Boolean(trip)}
              style={position({ x: location.labelX, y: location.labelY })} onClick={() => walkTo(id)}>
              <Glyph size={15} strokeWidth={2.2} aria-hidden="true" /> {location.name}
            </button>;
          })}
          {neighbors.filter(({ marker }) => marker).map(({ post, x, y }) => <button key={post.id} type="button" className="campus-neighbor"
            aria-label={`听${post.name}发言`} aria-pressed={selected === post.id}
            style={position({ x, y })} onClick={() => observe(post.id)}>
            <img src={post.poster} alt="" draggable={false} />
          </button>)}
          <div ref={actor} className="campus-pilot" data-moving={animated || undefined}
            data-performance={showPerformance ? performance.id : undefined}
            style={position(currentPlace)}>
            <img className="campus-poster" src={pilot.poster} alt={pilot.name} draggable={false} />
            <Viewer model={pilot.model} action={trip ? "campus-walk" : performance.id}
              replay={replay} play={!trip || animated} loop={animated} interactive={false}
              performanceIntensity={previewEmotion ? previewIntensity : pilot.intensity}
              reducedMotion={reducedMotion} onPerformance={setPerforming} />
            {showPerformance && !showing && <span className="campus-performance-status" role="status">
              {performance.emotion} · {performance.name}
            </span>}
          </div>
          {showing && <div className={`campus-bubble ${bubblePoint.y < .46 * view.size.height ? "bubble-below" : ""}`}
            style={screenPosition({ x: Math.min(.86 * view.size.width, Math.max(.14 * view.size.width, bubblePoint.x)),
              y: bubblePoint.y }, view.size)}>
            <span>{showing.line}</span>
            {canRead() && <button type="button" className="campus-voice" aria-label="朗读这句话"
              onClick={() => speak(showing.line)}><Volume2 size={16} aria-hidden="true" /></button>}
          </div>}
        </div>
      </div>
    </div>
    <div className="campus-vignette" aria-hidden="true" />
    <header className="scene-header campus-header">
      <div className="campus-heading">
        <p>中国人民大学 · 中关村校区</p>
        <h1>校园漫游</h1>
        <span className="campus-location" data-travel={trip ? "walking" : "arrived"} role="status">
          {trip ? `走向${campusPlaces[trip.to].name}` : `在${currentPlace.name}`}
        </span>
      </div>
    </header>
    <div className="campus-tools">
      <div className="campus-tools-row">
        <span className="campus-north" aria-label="指北针"><Navigation2 style={{ rotate: `${view.north}deg` }} size={16} aria-hidden="true" /> 北</span>
        <FullscreenButton />
      </div>
      <div className="campus-zoom" role="group" aria-label="地图缩放">
        <button type="button" className="scene-button scene-icon" disabled={!camera.canZoomOut}
          onClick={camera.zoomOut} aria-label="缩小地图"><Minus size={17} aria-hidden="true" /></button>
        <output aria-label="缩放比例">{Math.round(camera.zoom * 100)}%</output>
        <button type="button" className="scene-button scene-icon" disabled={!camera.canZoomIn}
          onClick={camera.zoomIn} aria-label="放大地图"><Plus size={17} aria-hidden="true" /></button>
      </div>
      <div className="campus-tools-row">
        <button type="button" className="scene-button" onClick={() => {
          camera.reset();
          setOverview((previous) => !previous);
        }}>
          {overview ? <Shrink size={16} aria-hidden="true" /> : <Expand size={16} aria-hidden="true" />} {overview ? "斜俯视" : "全图"}
        </button>
        <button className="scene-button" type="button" aria-expanded={panel === "topics"} onClick={() => openPanel("topics")}>
          <Flame size={16} aria-hidden="true" /> 热力榜
        </button>
      </div>
    </div>
    <div className="campus-hud">
      <div className="campus-controls">
        <div className="campus-player">
          <img src={pilot.poster} alt="" />
          <div><span>{pilot.own ? "我的吉祥物" : "试玩吉祥物"}</span><strong>{pilot.name}</strong></div>
          {pilot.own && onRename && <button type="button" className="campus-player-edit" aria-label="编辑吉祥物名字" title="编辑吉祥物名字"
            onClick={() => {
              setSelected(null);
              setDestinationsOpen(false);
              setPanel("speech");
              setNameInput(pilot.name);
              setNameError("");
              setRenaming(true);
            }}><Pencil size={14} aria-hidden="true" /></button>}
        </div>
        <button type="button" className="scene-button" aria-expanded={panel === "speech"} onClick={() => openPanel("speech")}>
          <MessageCircle size={17} aria-hidden="true" /> 留一句
        </button>
        <button type="button" className="scene-button" aria-expanded={panel === "neighbors"} onClick={() => openPanel("neighbors")}>
          <Users size={17} aria-hidden="true" /> 遇见
        </button>
        <button type="button" className="scene-button" onClick={() => setShareOpen(true)}>
          <Share2 size={16} aria-hidden="true" /> 转发
        </button>
      </div>
      <div className="campus-destinations">
        <button className="scene-button" type="button" aria-expanded={destinationsOpen} onClick={() => {
          setDestinationsOpen((open) => !open);
          setPanel(null);
          setSelected(null);
        }}><MapPin size={17} aria-hidden="true" /> 去哪里</button>
        {destinationsOpen && <div className="scene-popup campus-places">
          {Object.entries(campusPlaces).map(([id, location]) => <button key={id} type="button" className="scene-button"
            disabled={Boolean(trip) || id === place} onClick={() => walkTo(id)}>{location.name}</button>)}
        </div>}
      </div>
      {panel && <aside className="scene-popup campus-popup" aria-labelledby="campus-popup-title">
        <div className="campus-popup-heading">
          <h2 id="campus-popup-title">{panel === "speech" ? `在${currentPlace.name}留一句` : panel === "topics" ? "校园热力榜" : "遇见吉祥物"}</h2>
          <button type="button" className="scene-button scene-icon" aria-label="收起面板" onClick={() => openPanel(panel)}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        {panel === "speech" ? <>
          {profile}
          {pilot.own && <a className="campus-text-button" href={`#manual/${pilot.id}`}>查看我的 3D 模型</a>}
        </> : panel === "topics" ? <TopicLeaderboard topics={topics} pending={pendingTopic} onJoin={onJoinTopic} error={topicError} />
          : chosen ? <div className="campus-meeting-body">
          <div className="campus-meeting-title">
            <div>
              <a href={`#post/${chosen.post.id}`}>{chosen.post.name}</a>
              <p>{campusPlaces[chosen.post.campus.place].name} · {emotionLabel(chosen.post)}
                {chosen.post.seed ? " · 演示样本" : ""}</p>
            </div>
            <Like mascot={chosen.post} pending={pendingLikes.has(chosen.post.id)} onToggle={onToggle} quiet />
          </div>
          <p className="campus-heard-line">{chosen.post.campus.line || chosen.post.quote}</p>
          {chosen.post.campus.tag && <TopicLink id={chosen.post.campus.tag} />}
          {boardError && <p className="problem" role="alert">{boardError}</p>}
        </div> : <div className="campus-meeting-body">
          {localNeighbors.length ? <div className="campus-local-neighbors" aria-label={`${currentPlace.name}的吉祥物`}>
            {localNeighbors.map(({ post }) => <button type="button" className="scene-button" key={post.id} onClick={() => observe(post.id)}>
              <img src={post.poster} alt="" /> {post.name}
            </button>)}
          </div> : <p>点地图上的吉祥物，看看它留下了什么。</p>}
          <a className="campus-text-button" href="#messages">打开纸条箱</a>
        </div>}
      </aside>}
    </div>
    <a className="campus-attribution" href="https://www.openstreetmap.org/copyright" target="_blank"
      rel="noreferrer">© OpenStreetMap contributors</a>
    <AppDock active="campus" drawHref={`#draw/${place}`} drawLabel={`在${currentPlace.name}画两笔`} />
    <ShareDialog mascot={pilot} line={line} open={shareOpen} onClose={() => setShareOpen(false)} />
  </section>;
}
