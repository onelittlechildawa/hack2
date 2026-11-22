import { useEffect, useRef, useState } from "react";
import { AlertTriangle, MapPin, MessageCircle, Send } from "lucide-react";
import { campusLineLimit, campusPlaces } from "../shared/campus.js";
import { hasCareSignal } from "../shared/care.js";
import { campusTopics, topicWindowHours } from "../shared/topics.js";
import { TopicLink, TopicSelect, TopicSignal } from "./CampusTopics.jsx";
import CareCard from "./CareCard.jsx";
import { Like } from "./Community.jsx";

export default function MessageWall({ notes, posts, pendingLikes, onToggle, onSave, onRemove, error,
  topic, topics, pendingTopic, onJoinTopic, topicError }) {
  const [line, setLine] = useState("");
  const [tag, setTag] = useState(topic || "");
  const [editing, setEditing] = useState(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [carePinned, setCarePinned] = useState(false);
  const [careDismissed, setCareDismissed] = useState(false);
  const field = useRef(null);
  const liveCare = hasCareSignal(line);
  const showCare = carePinned || (liveCare && !careDismissed);
  const messages = [...notes, ...posts.filter((post) => post.campus?.line).map((post) => ({
    ...post, line: post.campus.line, tag: post.campus.tag, createdAt: post.publishedAt,
  }))].filter((message) => !topic || message.tag === topic).sort((a, b) => b.createdAt - a.createdAt);
  const activeTopic = topics.find(({ id }) => id === topic);

  useEffect(() => {
    if (!editing) setTag(topic || "");
  }, [topic, editing]);

  function clear() {
    setEditing(null);
    setLine("");
  }

  function startEdit(message) {
    setProblem("");
    setNotice("");
    setEditing(message);
    setLine(message.line);
    setTag(message.tag || "");
    field.current?.focus();
  }

  async function send(event) {
    event.preventDefault();
    if (working || !line.trim()) return;
    const triggeredCare = hasCareSignal(line);
    setWorking(true);
    setProblem("");
    setNotice("");
    try {
      await onSave(editing, line, tag || null);
      setNotice(editing ? "已保存修改" : "已匿名投进纸条箱");
      if (triggeredCare) {
        setCarePinned(true);
        setCareDismissed(false);
      }
      clear();
    } catch (error) {
      setProblem(error.message);
    } finally {
      setWorking(false);
    }
  }

  async function remove(message) {
    setWorking(true);
    setProblem("");
    setNotice("");
    try {
      await onRemove(message);
      if (editing?.id === message.id) clear();
      setNotice("已收回留言");
    } catch (error) {
      setProblem(error.message);
    } finally {
      setWorking(false);
    }
  }

  return <section className="board">
    <div className="board-intro comic-panel">
      <div><h1>纸条箱</h1><p>投进一张匿名纸条，或给有共鸣的人点个「我也在」。</p></div>
      <a href="#campus" className="button accent-yellow"><MapPin size={18} aria-hidden="true" /> 逛校园</a>
    </div>
    <div className="wall-layout">
      <form className="wall-form comic-panel" onSubmit={send}>
        <label htmlFor="wall-line">{editing ? "修改留言" : "留一句"}</label>
        <textarea id="wall-line" ref={field} rows={3} value={line} maxLength={campusLineLimit}
          placeholder="此刻想说什么？" onChange={(event) => {
            const next = event.target.value;
            setLine(next);
            if (!hasCareSignal(next)) setCareDismissed(false);
          }} disabled={working} />
        {showCare && <CareCard variant="comic" onDismiss={() => { setCarePinned(false); setCareDismissed(true); }} />}
        <TopicSelect value={tag} onChange={setTag} disabled={working} />
        <div className="wall-form-actions">
          <small>最多 {campusLineLimit} 字</small>
          {editing && <button className="button" type="button" disabled={working} onClick={clear}>取消</button>}
          <button className="button primary" type="submit" disabled={working || !line.trim()}>
            <Send size={16} aria-hidden="true" /> {editing ? "保存修改" : "投进纸条箱"}
          </button>
        </div>
        {notice && <p role="status" className="wall-notice">{notice}</p>}
        {problem && <p className="problem" role="alert"><AlertTriangle size={16} aria-hidden="true" /> {problem}</p>}
      </form>
      <div className="wall-feed comic-panel">
        <div className="wall-topics" role="group" aria-label="按情境筛选留言">
          <TopicLink active={!topic} />
          {Object.keys(campusTopics).map((id) => <TopicLink key={id} id={id} active={id === topic} />)}
        </div>
        {activeTopic && <div className="wall-topic-status">
          <span>近 {topicWindowHours} 小时有 {activeTopic.count} 人参与</span>
          <TopicSignal topic={activeTopic} pending={pendingTopic} onJoin={onJoinTopic} />
        </div>}
        {topicError && <p className="problem" role="alert">{topicError}</p>}
        {error && <p className="problem" role="alert">{error}</p>}
        <ul aria-label="校园留言">
          {messages.map((message) => {
            const place = message.campus && campusPlaces[message.campus.place];
            return <li className="wall-note" key={message.id}>
              <div className="wall-note-meta">
                {place ? <>
                  <a className="wall-author" href={`#post/${message.id}`}><img src={message.poster} alt="" /> {message.name}</a>
                  <a className="wall-place" href={`#campus//${message.campus.place}`}><MapPin size={14} aria-hidden="true" /> {place.name}</a>
                  {message.seed && <small>演示样本</small>}
                </> : <>
                  <span className="wall-author"><MessageCircle size={15} aria-hidden="true" /> {message.own ? "我的留言" : "匿名同学"}</span>
                  {message.seed && <small>演示样本</small>}
                </>}
                {message.tag && <TopicLink id={message.tag} />}
              </div>
              <p className="wall-line">{message.line}</p>
              <div className="wall-note-actions">
                <Like mascot={message} quiet pending={pendingLikes.has(message.id)}
                  onToggle={() => onToggle(message, message.campus ? "feed" : "notes")} />
                {message.own && <>
                  <button type="button" disabled={working} onClick={() => startEdit(message)}>编辑</button>
                  <button type="button" disabled={working} onClick={() => remove(message)}>收回</button>
                </>}
              </div>
            </li>;
          })}
        </ul>
        {!messages.length && <p className="wall-empty">{activeTopic ? "这个标签还没有公开留言。" : "这里还没有留言。"}</p>}
      </div>
    </div>
  </section>;
}
