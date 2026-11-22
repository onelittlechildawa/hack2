import { useId } from "react";
import { campusTopics, topicWindowHours } from "../shared/topics.js";

export function TopicLink({ id, active, children }) {
  return <a className="topic-link" href={id ? `#messages/${id}` : "#messages"}
    aria-current={active ? "true" : undefined}>{children ?? (id ? `#${campusTopics[id]}` : "全部")}</a>;
}

export function TopicSelect({ value, onChange, disabled }) {
  const id = useId();
  return <div className="topic-select">
    <label htmlFor={id}>情境标签（可选）</label>
    <select id={id} value={value || ""} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
      <option value="">不加标签</option>
      {Object.entries(campusTopics).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select>
  </div>;
}

export function TopicSignal({ topic, pending, onJoin }) {
  return <button className="topic-signal" type="button" aria-pressed={topic.joined} disabled={Boolean(pending)}
    aria-label={`${topic.joined ? "取消我也在" : "我也在"}，${campusTopics[topic.id]}`}
    onClick={() => onJoin(topic.id, !topic.joined)}>{topic.joined ? "已加入" : "我也在"}</button>;
}

export function TopicLeaderboard({ topics, pending, onJoin, error }) {
  const max = Math.max(1, ...topics.map(({ count }) => count));
  return <div className="topic-board">
    <p>近 {topicWindowHours} 小时 · 每个匿名会话在同一标签计一次</p>
    <ol aria-label="校园话题热力">
      {topics.map((topic) => <li key={topic.id}>
        <div className="topic-rank">
          <div><TopicLink id={topic.id} /><span>{topic.count} 人</span></div>
          <i aria-hidden="true" style={{ "--heat": `${topic.count / max * 100}%` }} />
        </div>
        <TopicSignal topic={topic} pending={pending} onJoin={onJoin} />
      </li>)}
    </ol>
    {error && <p className="problem" role="alert">{error}</p>}
  </div>;
}
