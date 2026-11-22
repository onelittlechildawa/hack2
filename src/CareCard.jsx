import { HeartHandshake, Mail, MapPin, Phone, X } from "lucide-react";
import { rucCareInfo } from "../shared/care.js";

export default function CareCard({ variant = "comic", onDismiss }) {
  return <aside className={`care-card care-card-${variant}`} role="status" aria-live="polite" aria-label="中国人民大学心理咨询支持方式">
    <div className="care-card-head">
      <div className="care-card-title">
        <HeartHandshake size={18} strokeWidth={2.3} aria-hidden="true" />
        <strong>{rucCareInfo.title}</strong>
      </div>
      {onDismiss && <button type="button" className="care-dismiss" aria-label="收起关怀提示" onClick={onDismiss}>
        <X size={15} strokeWidth={2.4} aria-hidden="true" />
      </button>}
    </div>
    <p className="care-card-intro">{rucCareInfo.intro}</p>
    <ul className="care-card-list">
      {rucCareInfo.campuses.map((campus) => <li key={campus.name}>
        <span className="care-campus">
          <MapPin size={14} strokeWidth={2.3} aria-hidden="true" />
          <span><b>{campus.name}：</b>{campus.location}</span>
        </span>
        <a className="care-link" href={`tel:${campus.tel}`}>
          <Phone size={13} strokeWidth={2.3} aria-hidden="true" /> {campus.phone}
        </a>
      </li>)}
      <li>
        <span className="care-campus">
          <Mail size={14} strokeWidth={2.3} aria-hidden="true" />
          <span><b>心理咨询邮箱：</b><a className="care-link" href={`mailto:${rucCareInfo.email}`}>{rucCareInfo.email}</a></span>
        </span>
      </li>
    </ul>
    <p className="care-card-foot">{rucCareInfo.clinic}</p>
  </aside>;
}
