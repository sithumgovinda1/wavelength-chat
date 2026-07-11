import { useState } from "react";

export default function NewChatPanel({ onClose, onSearchUsers, onStartDM, onCreateChannel }) {
  const [tab, setTab] = useState("dm"); // "dm" | "channel"
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [error, setError] = useState("");

  async function runSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      setResults(await onSearchUsers(query.trim()));
    } finally {
      setLoading(false);
    }
  }

  async function pickUser(username) {
    const data = await onStartDM(username);
    if (data?.error) setError(data.error);
    else onClose();
  }

  async function submitChannel(e) {
    e.preventDefault();
    if (!channelName.trim()) return;
    const data = await onCreateChannel(channelName.trim());
    if (data?.error) setError(data.error);
    else onClose();
  }

  return (
    <div className="channel-main">
      <div className="channel-header">
        <h1>New chat</h1>
        <button className="panel-close" onClick={onClose}>
          ✕ Close
        </button>
      </div>

      <div className="tab-row">
        <button className={tab === "dm" ? "active" : ""} onClick={() => setTab("dm")}>
          👤 Message a friend
        </button>
        <button className={tab === "channel" ? "active" : ""} onClick={() => setTab("channel")}>
          # New frequency
        </button>
      </div>

      {error && <div className="auth-error" style={{ margin: "0 22px" }}>{error}</div>}

      {tab === "dm" ? (
        <>
          <form className="composer" onSubmit={runSearch} style={{ borderTop: "none" }}>
            <input
              placeholder="Search by username…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <button className="send-btn" disabled={!query.trim()}>
              Search
            </button>
          </form>
          <div className="message-stream">
            {loading && <div className="empty-state">Searching…</div>}
            {!loading && results.length === 0 && query && (
              <div className="empty-state">No one found with that username</div>
            )}
            {!loading &&
              results.map((u) => (
                <button key={u.id} className="user-result" onClick={() => pickUser(u.username)}>
                  <span className="avatar" style={{ background: u.color }}>
                    {u.username.slice(0, 2).toUpperCase()}
                  </span>
                  {u.username}
                </button>
              ))}
          </div>
        </>
      ) : (
        <form className="new-frequency-form" onSubmit={submitChannel}>
          <label>Frequency name</label>
          <input
            placeholder="e.g. movie-night"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            autoFocus
          />
          <button className="auth-submit" disabled={!channelName.trim()}>
            Create frequency
          </button>
        </form>
      )}
    </div>
  );
}
