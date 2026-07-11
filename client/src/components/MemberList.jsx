function timeAgo(ts) {
  if (!ts) return "never online";
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function MemberList({ operators, activeChannelId }) {
  const online = operators.filter((o) => o.online);
  const offline = operators
    .filter((o) => !o.online)
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

  const here = online.filter((o) => o.channelId === activeChannelId);
  const elsewhere = online.filter((o) => o.channelId !== activeChannelId);

  return (
    <div className="rail-right">
      <h2>On this frequency — {here.length}</h2>
      {here.map((o) => (
        <div className="operator" key={o.id}>
          <span className="signal-icon">
            <span />
            <span />
            <span />
            <span />
          </span>
          {o.username}
        </div>
      ))}

      {elsewhere.length > 0 && (
        <>
          <h2 style={{ marginTop: 24 }}>Elsewhere — {elsewhere.length}</h2>
          {elsewhere.map((o) => (
            <div className="operator" key={o.id} style={{ opacity: 0.6 }}>
              <span className="signal-icon">
                <span />
                <span />
                <span />
                <span />
              </span>
              {o.username}
            </div>
          ))}
        </>
      )}

      {offline.length > 0 && (
        <>
          <h2 style={{ marginTop: 24 }}>Offline — {offline.length}</h2>
          {offline.map((o) => (
            <div className="operator offline" key={o.id}>
              <span className="offline-dot" />
              <span>
                {o.username}
                <span className="last-seen">{timeAgo(o.lastSeen)}</span>
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
