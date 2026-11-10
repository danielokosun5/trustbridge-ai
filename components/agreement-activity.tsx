import { Clock3 } from "lucide-react";
import type { AgreementActivity } from "@/lib/agreements/repository";
import { Card } from "@/components/ui";

const describe = (event: AgreementActivity) => event.eventType === "share_created" ? "Review link created" : event.eventType === "share_viewed" ? "Review link first viewed" : `Response recorded: ${event.response === "accepted" ? "Accepted" : "Rejected"}`;

export function AgreementActivityHistory({ activity }: { activity: AgreementActivity[] }) {
  return <Card className="agreement-activity-card"><div className="share-controls-heading"><span className="share-icon"><Clock3 size={17} /></span><div><p className="eyebrow">AGREEMENT HISTORY</p><h2>Activity</h2><p>Link events are recorded without identifying the link holder.</p></div></div>
    {activity.length === 0 ? <p className="activity-history-empty">No review link activity yet.</p> : <ol className="agreement-activity-list">{activity.map((event, index) => <li key={`${event.createdAt}-${event.eventType}-${index}`}><span className="activity-history-dot" /><span><strong>{describe(event)}</strong><time dateTime={event.createdAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}</time></span></li>)}</ol>}
    <p className="activity-history-note">A first-view event means the link was opened. It does not establish that the terms were read or understood.</p>
  </Card>;
}
