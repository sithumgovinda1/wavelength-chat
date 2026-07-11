import { useState } from "react";

function timeShort(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ChatRow({ item, active, onSelect, unread, onMenu, menuOpen, onClearOrDelete, isDm, presence }) {
  const title = isDm ? item.other?.username : `# ${item.name}`;
  const initials = isDm ? item.other?.username?.slice(0, 2).toUpperCase() : item.name.slice(0, 2).toUpperCase();
  const color = isDm ? item.other?.color : "#F2A93B";
  const preview = item.last_message
    ? `${item.last_message.username ? item.last_message.username + ": " : ""}${item.last_message.body || ""}`
    : "No messages yet";

  return (
    <div className={`chat-row-wrap ${active ? "active" : ""}`}>
      <button className="chat-row" onClick={() => onSelect(item.id)}>
        <span className="avatar chat-avatar" style={{ background: color }}>
          {initials}
          {isDm && presence?.online && <span className="online-dot" />}
        </span>
        <span className="chat-row-main">
          <span className="chat-row-top">
            <span className="chat-row-title">{title}</span>
            <span className="chat-row-time">{timeShort(item.last_message?.created_at)}</span>
          </span>
          <span className="chat-row-bottom">
            <span className="chat-row-preview">{preview}</span>
            {unread > 0 && <span className="unread-badge">{unread}</span>}
          </span>
        </span>
      </button>
      <button className="chat-row-menu-btn" onClick={() => onMenu(item.id)}>
        ⋯
      </button>
      {menuOpen && (
        <div className="chat-row-menu">
          <button onClick={() => onClearOrDelete(item)}>
            {isDm ? "🗑 Clear chat" : "🗑 Clear frequency"}
          </button>
          <button onClick={() => onMenu(null)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  channels,
  dms,
  activeId,
  onSelect,
  onDeleteChannel,
  onClearDm,
  user,
  onLogout,
  onInstall,
  onOpenSearch,
  onOpenStarred,
  onOpenNewChat,
  autoLoadMedia,
  onToggleAutoLoad,
  unreadCounts,
  operators,
}) {
  const [menuOpenId, setMenuOpenId] = useState(null);

  const combined = [
    ...channels.map((c) => ({ ...c, isDm: false })),
    ...dms.map((c) => ({ ...c, isDm: true })),
  ].sort((a, b) => (b.last_message?.created_at || b.created_at) - (a.last_message?.created_at || a.created_at));

  function handleClearOrDelete(item) {
    const label = item.isDm ? item.other?.username : `#${item.name}`;
    const msg = item.isDm
      ? `Clear your chat with ${label}? Only your copy is cleared.`
      : `Permanently delete ${label} and all its messages for everyone? This can't be undone.`;
    if (!confirm(msg)) return;
    if (item.isDm) onClearDm(item.id);
    else onDeleteChannel(item.id);
    setMenuOpenId(null);
  }

  const initials = user.username.slice(0, 2).toUpperCase();

  return (
    <div className="rail-left">
      <div className="brand">
        <span className="brand-dot" />
        Wavelength
      </div>

      <div className="tool-row">
        <button className="tool-btn" onClick={onOpenSearch}>
          🔎 Search
        </button>
        <button className="tool-btn" onClick={onOpenStarred}>
          ⭐ Starred
        </button>
      </div>

      <button className="new-chat-btn" onClick={onOpenNewChat}>
        ✎ New chat
      </button>

      <div className="channel-list">
        {combined.length === 0 && <div className="empty-state">No chats yet — start one above</div>}
        {combined.map((item) => (
          <ChatRow
            key={`${item.isDm ? "dm" : "ch"}-${item.id}`}
            item={item}
            isDm={item.isDm}
            active={item.id === activeId}
            unread={unreadCounts[item.id] || 0}
            onSelect={onSelect}
            onMenu={(id) => setMenuOpenId(menuOpenId === id ? null : id)}
            menuOpen={menuOpenId === item.id}
            onClearOrDelete={handleClearOrDelete}
            presence={item.isDm ? operators.find((o) => o.id === item.other?.id) : null}
          />
        ))}
      </div>

      <label className="autoload-toggle">
        <input type="checkbox" checked={autoLoadMedia} onChange={onToggleAutoLoad} />
        Auto-load images
      </label>

      {onInstall && (
        <button className="install-btn" onClick={onInstall}>
          ⬇ Install app
        </button>
      )}
      <div className="user-badge">
        <div className="avatar" style={{ background: user.color }}>
          {initials}
        </div>
        {user.username}
        <button className="logout-btn" onClick={onLogout}>
          sign out
        </button>
      </div>
    </div>
  );
}
