import { useState } from "react";

export default function SearchPanel({ onClose, onSearch, onJump }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function runSearch(e) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setLoading(true);
    setSearched(true);
    try {
      const r = await onSearch(query.trim());
      setResults(r);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="channel-main">
      <div className="channel-header">
        <h1>Search</h1>
        <button className="panel-close" onClick={onClose}>
          ✕ Close
        </button>
      </div>

      <form className="composer" onSubmit={runSearch} style={{ borderTop: "none" }}>
        <input
          placeholder="Search messages…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <button className="send-btn" disabled={query.trim().length < 2}>
          Search
        </button>
      </form>

      <div className="message-stream">
        {loading && <div className="empty-state">Searching…</div>}
        {!loading && searched && results.length === 0 && (
          <div className="empty-state">No messages found for "{query}"</div>
        )}
        {!loading &&
          results.map((m) => (
            <button key={m.id} className="search-result" onClick={() => onJump(m.channel_id)}>
              <div className="search-result-meta">
                <span className="author" style={{ color: m.color }}>
                  {m.username}
                </span>
                <span className="search-channel">#{m.channel_name}</span>
              </div>
              <div className="search-result-body">{m.is_deleted ? "🚫 Deleted message" : m.body}</div>
            </button>
          ))}
      </div>
    </div>
  );
}
