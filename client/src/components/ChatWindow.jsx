import { useEffect, useRef, useState } from "react";
import MessageInput from "./MessageInput.jsx";
import { REACTION_EMOJI } from "../emojis.js";
import { API_URL } from "../socket.js";

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(ts) {
  if (!ts) return "offline";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "last seen just now";
  if (mins < 60) return `last seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `last seen ${hours}h ago`;
  return `last seen ${Math.floor(hours / 24)}d ago`;
}

function renderBody(text) {
  const parts = text.split(/(@[a-zA-Z0-9_-]+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span className="mention" key={i}>
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function ForwardMenu({ channels, dms, currentChannelId, onPick, onClose }) {
  return (
    <div className="forward-menu">
      <div className="forward-menu-header">
        <span>Forward to…</span>
        <button onClick={onClose}>✕</button>
      </div>
      {channels
        .filter((c) => c.id !== currentChannelId)
        .map((c) => (
          <button key={`ch-${c.id}`} className="forward-target" onClick={() => onPick(c.id)}>
            #{c.name}
          </button>
        ))}
      {dms
        .filter((c) => c.id !== currentChannelId)
        .map((c) => (
          <button key={`dm-${c.id}`} className="forward-target" onClick={() => onPick(c.id)}>
            👤 {c.other?.username}
          </button>
        ))}
    </div>
  );
}

function MessageActions({ message, isOwn, onClose, actions }) {
  return (
    <div className="message-actions">
      <button onClick={() => actions.reply()}>↩ Reply</button>
      <button onClick={() => actions.copy()}>⧉ Copy</button>
      <button onClick={() => actions.forward()}>➦ Forward</button>
      <button onClick={() => actions.star()}>{message.starred ? "★ Unstar" : "☆ Star"}</button>
      {isOwn && !message.is_deleted && <button onClick={() => actions.edit()}>✎ Edit</button>}
      {isOwn && !message.is_deleted && (
        <button className="danger" onClick={() => actions.deleteEveryone()}>
          🗑 Delete for everyone
        </button>
      )}
      <button className="danger" onClick={() => actions.deleteMe()}>
        🗑 Delete for me
      </button>
      <button onClick={onClose}>Close</button>
    </div>
  );
}

export default function ChatWindow({
  channel,
  messages,
  typingUsers,
  currentUser,
  channels,
  dms,
  replyingTo,
  editingMessage,
  autoLoadMedia,
  readReceipts,
  otherUserPresence,
  onBack,
  onSend,
  onTyping,
  onReply,
  onCancelReply,
  onStartEdit,
  onCancelEdit,
  onEditSubmit,
  onDelete,
  onReact,
  onStar,
  onForward,
  onUpload,
}) {
  const streamRef = useRef(null);
  const [openActionsId, setOpenActionsId] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [revealedMedia, setRevealedMedia] = useState(() => new Set());

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [messages, channel?.id]);

  if (!channel) {
    return (
      <div className="channel-main">
        <div className="empty-state" style={{ margin: "auto" }}>
          Select a chat to begin
        </div>
      </div>
    );
  }

  function revealMedia(id) {
    setRevealedMedia((prev) => new Set(prev).add(id));
  }

  function copyText(text) {
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  function isSeenByOthers(message) {
    return Object.entries(readReceipts).some(
      ([userId, lastReadId]) => Number(userId) !== currentUser.id && lastReadId >= message.id
    );
  }

  const headerTitle = channel.is_dm ? channel.other?.username : `# ${channel.name}`;
  const headerStatus = channel.is_dm
    ? otherUserPresence?.online
      ? "online"
      : timeAgo(otherUserPresence?.lastSeen)
    : channel.topic;

  return (
    <div className="channel-main">
      <div className="channel-header">
        <button className="back-btn" onClick={onBack}>
          ←
        </button>
        <div>
          <h1>{headerTitle}</h1>
          {headerStatus && <span className={`topic ${channel.is_dm && otherUserPresence?.online ? "is-online" : ""}`}>{headerStatus}</span>}
        </div>
        <span className="pulse" title="live">
          <span />
          <span />
          <span />
        </span>
      </div>

      <div className="message-stream" ref={streamRef}>
        {messages.length === 0 && (
          <div className="empty-state">No messages yet. Say something.</div>
        )}
        {messages.map((m) => {
          const isOwn = m.username === currentUser.username;
          const mediaVisible = autoLoadMedia || revealedMedia.has(m.id);
          const seen = isOwn ? isSeenByOthers(m) : false;
          const initials = m.username.slice(0, 2).toUpperCase();

          return (
            <div className={`msg-row ${isOwn ? "own" : "other"}`} key={m.id}>
              {!isOwn && (
                <span className="msg-avatar" style={{ background: m.color }}>
                  {initials}
                </span>
              )}

              <div className="msg-col">
                {m.forwarded_from && <div className="forwarded-tag">➦ Forwarded from {m.forwarded_from}</div>}

                <div className={`bubble ${isOwn ? "own" : "other"} ${m.is_deleted ? "deleted" : ""}`}>
                  {!isOwn && !channel.is_dm && (
                    <div className="bubble-author" style={{ color: m.color }}>
                      {m.username}
                    </div>
                  )}

                  {m.reply_to && (
                    <div className="reply-preview">
                      <strong>{m.reply_to.username}</strong> — {m.reply_to.snippet}
                    </div>
                  )}

                  {m.is_deleted ? (
                    <span className="text deleted-text">🚫 This message was deleted</span>
                  ) : (
                    <span className="text">{renderBody(m.body)}</span>
                  )}

                  {m.media_url && !m.is_deleted && (
                    mediaVisible ? (
                      <img className="chat-image" src={`${API_URL}${m.media_url}`} alt="shared" />
                    ) : (
                      <button className="media-placeholder" onClick={() => revealMedia(m.id)}>
                        🖼 Tap to load image
                      </button>
                    )
                  )}

                  <div className="bubble-meta">
                    {m.edited_at && <span className="edited-tag">edited</span>}
                    <span className="bubble-time">{formatTime(m.created_at)}</span>
                    {isOwn && !m.is_deleted && (
                      <span className={`ticks ${seen ? "seen" : ""}`} title={seen ? "Seen" : "Sent"}>
                        {seen ? "✓✓" : "✓"}
                      </span>
                    )}
                  </div>
                </div>

                {m.reactions?.length > 0 && (
                  <div className="reaction-row">
                    {m.reactions.map((r) => (
                      <button
                        key={r.emoji}
                        className={`reaction-pill ${m.my_reaction === r.emoji ? "mine" : ""}`}
                        title={r.usernames.join(", ")}
                        onClick={() => onReact(m.id, r.emoji)}
                      >
                        {r.emoji} {r.count}
                      </button>
                    ))}
                  </div>
                )}

                {!m.is_deleted && (
                  <div className="quick-react-row">
                    {REACTION_EMOJI.map((e) => (
                      <button key={e} className="quick-react" onClick={() => onReact(m.id, e)}>
                        {e}
                      </button>
                    ))}
                    <button
                      className="quick-react more"
                      onClick={() => setOpenActionsId(openActionsId === m.id ? null : m.id)}
                    >
                      ⋯
                    </button>
                  </div>
                )}

                {openActionsId === m.id && (
                  <MessageActions
                    message={m}
                    isOwn={isOwn}
                    onClose={() => setOpenActionsId(null)}
                    actions={{
                      reply: () => {
                        onReply({ id: m.id, username: m.username, snippet: m.body.slice(0, 80) });
                        setOpenActionsId(null);
                      },
                      copy: () => {
                        copyText(m.body);
                        setOpenActionsId(null);
                      },
                      forward: () => {
                        setForwardingMessage(m);
                        setOpenActionsId(null);
                      },
                      star: () => {
                        onStar(m.id, m.starred);
                        setOpenActionsId(null);
                      },
                      edit: () => {
                        onStartEdit(m);
                        setOpenActionsId(null);
                      },
                      deleteEveryone: () => {
                        if (confirm("Delete this message for everyone?")) onDelete(channel.id, m.id, "everyone");
                        setOpenActionsId(null);
                      },
                      deleteMe: () => {
                        onDelete(channel.id, m.id, "me");
                        setOpenActionsId(null);
                      },
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {forwardingMessage && (
        <ForwardMenu
          channels={channels}
          dms={dms}
          currentChannelId={channel.id}
          onClose={() => setForwardingMessage(null)}
          onPick={(targetId) => {
            onForward(forwardingMessage, targetId);
            setForwardingMessage(null);
          }}
        />
      )}

      <div className="typing-strip">
        {typingUsers.length > 0 && (
          <>
            <span className="pulse">
              <span />
              <span />
              <span />
            </span>
            {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing…
          </>
        )}
      </div>

      <MessageInput
        onSend={(text, mediaUrl, mediaType) => onSend(channel.id, text, mediaUrl, mediaType)}
        onTyping={(t) => onTyping(channel.id, t)}
        replyingTo={replyingTo}
        onCancelReply={onCancelReply}
        editingMessage={editingMessage}
        onCancelEdit={onCancelEdit}
        onEditSubmit={onEditSubmit}
        onUpload={onUpload}
      />
    </div>
  );
}
