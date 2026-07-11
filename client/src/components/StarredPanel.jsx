import { useEffect, useState } from "react";

export default function StarredPanel({ onClose, onLoad, onJump, onStar }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onLoad()
      .then(setResults)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function unstar(id) {
    onStar(id, true); // true = currently starred, so this toggles it off
    setResults((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <div className="channel-main">
      <div className="channel-header">
        <h1>⭐ Starred messages</h1>
        <button className="panel-close" onClick={onClose}>
          ✕ Close
        </button>
      </div>

      <div className="message-stream">
        {loading && <div className="empty-state">Loading…</div>}
        {!loading && results.length === 0 && (
          <div className="empty-state">Nothing starred yet. Long-press ⋯ on any message to star it.</div>
        )}
        {!loading &&
          results.map((m) => (
            <div key={m.id} className="search-result">
              <div className="search-result-meta">
                <span className="author" style={{ color: m.color }}>
                  {m.username}
                </span>
                <span className="search-channel">#{m.channel_name}</span>
              </div>
              <div className="search-result-body">{m.is_deleted ? "🚫 Deleted message" : m.body}</div>
              <div className="starred-actions">
                <button onClick={() => onJump(m.channel_id)}>Go to channel</button>
                <button onClick={() => unstar(m.id)}>Unstar</button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
