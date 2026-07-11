import { useEffect, useState, useCallback, useRef } from "react";
import Login from "./components/Login.jsx";
import Sidebar from "./components/Sidebar.jsx";
import ChatWindow from "./components/ChatWindow.jsx";
import MemberList from "./components/MemberList.jsx";
import SearchPanel from "./components/SearchPanel.jsx";
import StarredPanel from "./components/StarredPanel.jsx";
import NewChatPanel from "./components/NewChatPanel.jsx";
import { connectSocket, getSocket, API_URL } from "./socket.js";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("wl_token"));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("wl_user");
    return raw ? JSON.parse(raw) : null;
  });

  const [channels, setChannels] = useState([]); // group "frequencies"
  const [dms, setDms] = useState([]); // 1:1 private chats
  const [activeId, setActiveId] = useState(null);
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [operators, setOperators] = useState([]);
  const [typingByChannel, setTypingByChannel] = useState({});
  const [installPrompt, setInstallPrompt] = useState(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [panel, setPanel] = useState(null); // null | "search" | "starred" | "newchat"
  const [autoLoadMedia, setAutoLoadMedia] = useState(
    () => localStorage.getItem("wl_autoload") !== "off"
  );
  const [readReceipts, setReadReceipts] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});

  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token]
  );

  function toggleAutoLoad() {
    setAutoLoadMedia((prev) => {
      const next = !prev;
      localStorage.setItem("wl_autoload", next ? "on" : "off");
      return next;
    });
  }

  // ---------- Install prompt ----------
  useEffect(() => {
    function handler(e) {
      e.preventDefault();
      setInstallPrompt(e);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  // ---------- Notifications ----------
  useEffect(() => {
    if (token && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [token]);

  function notify(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      new Notification(title, { body, icon: "/icons/icon-192.png" });
    } catch {
      // ignore — some mobile browsers restrict this outside a service worker
    }
  }

  function handleAuth(tok, usr) {
    localStorage.setItem("wl_token", tok);
    localStorage.setItem("wl_user", JSON.stringify(usr));
    setToken(tok);
    setUser(usr);
  }

  function handleLogout() {
    localStorage.removeItem("wl_token");
    localStorage.removeItem("wl_user");
    getSocket()?.disconnect();
    setToken(null);
    setUser(null);
    setChannels([]);
    setDms([]);
    setActiveId(null);
    setMessagesByChannel({});
  }

  function upsertMessage(msg) {
    setMessagesByChannel((prev) => {
      const list = prev[msg.channel_id] || [];
      const idx = list.findIndex((m) => m.id === msg.id);
      const nextList = idx === -1 ? [...list, msg] : list.map((m) => (m.id === msg.id ? msg : m));
      return { ...prev, [msg.channel_id]: nextList };
    });
  }

  function loadChannelsAndDms() {
    fetch(`${API_URL}/api/channels`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        setChannels(data.channels || []);
        const counts = {};
        (data.channels || []).forEach((c) => (counts[c.id] = c.unread_count || 0));
        setUnreadCounts((prev) => ({ ...prev, ...counts }));
        setActiveId((prev) => prev || data.channels?.[0]?.id || null);
      })
      .catch(() => {});

    fetch(`${API_URL}/api/dms`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        setDms(data.dms || []);
        const counts = {};
        (data.dms || []).forEach((c) => (counts[c.id] = c.unread_count || 0));
        setUnreadCounts((prev) => ({ ...prev, ...counts }));
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (!token) return;
    loadChannelsAndDms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);

    socket.on("presence:update", (list) => setOperators(list));

    socket.on("message:new", (msg) => {
      setMessagesByChannel((prev) => ({
        ...prev,
        [msg.channel_id]: [...(prev[msg.channel_id] || []), msg],
      }));

      const isMine = msg.username === user?.username;
      const isActive = msg.channel_id === activeIdRef.current;

      if (!isMine && !isActive) {
        setUnreadCounts((prev) => ({ ...prev, [msg.channel_id]: (prev[msg.channel_id] || 0) + 1 }));
        notify(msg.username, msg.media_url ? "📷 Photo" : msg.body);
      }

      // Bump the chat-list preview live instead of waiting for a refetch
      const preview = { body: msg.media_url ? "📷 Photo" : msg.body, username: msg.username, created_at: msg.created_at };
      setChannels((prev) => prev.map((c) => (c.id === msg.channel_id ? { ...c, last_message: preview } : c)));
      setDms((prev) => prev.map((c) => (c.id === msg.channel_id ? { ...c, last_message: preview } : c)));
    });

    socket.on("message:updated", (msg) => upsertMessage(msg));

    socket.on("message:removed", ({ messageId }) => {
      setMessagesByChannel((prev) => {
        const next = {};
        for (const [chId, list] of Object.entries(prev)) next[chId] = list.filter((m) => m.id !== messageId);
        return next;
      });
    });

    socket.on("message:reactions", ({ messageId, reactions }) => {
      setMessagesByChannel((prev) => {
        const next = {};
        for (const [chId, list] of Object.entries(prev)) {
          next[chId] = list.map((m) => (m.id === messageId ? { ...m, reactions } : m));
        }
        return next;
      });
    });

    socket.on("message:starred", ({ messageId, starred }) => {
      setMessagesByChannel((prev) => {
        const next = {};
        for (const [chId, list] of Object.entries(prev)) {
          next[chId] = list.map((m) => (m.id === messageId ? { ...m, starred } : m));
        }
        return next;
      });
    });

    socket.on("read:snapshot", ({ channelId, reads }) => {
      const map = {};
      for (const r of reads) map[r.user_id] = r.last_read_message_id;
      setReadReceipts((prev) => ({ ...prev, [channelId]: map }));
    });

    socket.on("read:update", ({ channelId, userId, lastReadMessageId }) => {
      setReadReceipts((prev) => ({
        ...prev,
        [channelId]: { ...(prev[channelId] || {}), [userId]: lastReadMessageId },
      }));
    });

    socket.on("channel:created", (channel) => {
      setChannels((prev) => (prev.some((c) => c.id === channel.id) ? prev : [...prev, channel]));
    });

    socket.on("channel:deleted", ({ channelId }) => {
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
      setDms((prev) => prev.filter((c) => c.id !== channelId));
      if (activeIdRef.current === channelId) {
        setActiveId(null);
        setMobileChatOpen(false);
      }
    });

    socket.on("typing:update", ({ username, channelId, typing }) => {
      setTypingByChannel((prev) => {
        const current = new Set(prev[channelId] || []);
        if (typing) current.add(username);
        else current.delete(username);
        return { ...prev, [channelId]: [...current] };
      });
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!activeId || !token) return;
    const socket = getSocket();
    socket?.emit("channel:join", activeId);

    if (!messagesByChannel[activeId]) {
      fetch(`${API_URL}/api/channels/${activeId}/messages`, { headers: authHeaders() })
        .then((r) => r.json())
        .then((data) => {
          setMessagesByChannel((prev) => ({ ...prev, [activeId]: data.messages || [] }));
        })
        .catch(() => {});
    }
    setUnreadCounts((prev) => ({ ...prev, [activeId]: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, token]);

  useEffect(() => {
    if (!activeId) return;
    const list = messagesByChannel[activeId];
    if (list && list.length) {
      getSocket()?.emit("message:read", { channelId: activeId, messageId: list[list.length - 1].id });
    }
  }, [activeId, messagesByChannel]);

  function selectChat(channelId) {
    setActiveId(channelId);
    setMobileChatOpen(true);
    setPanel(null);
  }

  function handleSend(channelId, body, mediaUrl, mediaType) {
    getSocket()?.emit("message:send", {
      channelId,
      body,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      replyToId: replyingTo?.id || null,
    });
    setReplyingTo(null);
  }

  function handleEditSubmit(messageId, body) {
    getSocket()?.emit("message:edit", { messageId, body });
    setEditingMessage(null);
  }

  function handleDelete(channelId, messageId, scope) {
    getSocket()?.emit("message:delete", { messageId, scope });
  }

  function handleReact(messageId, emoji) {
    getSocket()?.emit("message:react", { messageId, emoji });
  }

  function handleStar(messageId, starred) {
    getSocket()?.emit("message:star", { messageId, starred: !starred });
  }

  function handleForward(message, targetChannelId) {
    getSocket()?.emit("message:send", {
      channelId: targetChannelId,
      body: message.body,
      mediaUrl: message.media_url,
      mediaType: message.media_type,
      forwardedFrom: message.username,
    });
  }

  async function handleUpload(file) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/api/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  }

  async function handleSearch(query) {
    const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
    const data = await res.json();
    return data.results || [];
  }

  async function loadStarred() {
    const res = await fetch(`${API_URL}/api/starred`, { headers: authHeaders() });
    const data = await res.json();
    return data.results || [];
  }

  async function searchUsers(query) {
    const res = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(query)}`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    return data.users || [];
  }

  async function startDM(username) {
    const res = await fetch(`${API_URL}/api/dms`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (res.ok) {
      setDms((prev) => (prev.some((c) => c.id === data.channel.id) ? prev : [{ ...data.channel, last_message: null, unread_count: 0 }, ...prev]));
      selectChat(data.channel.id);
    }
    return data;
  }

  async function clearDmChat(channelId) {
    await fetch(`${API_URL}/api/dms/${channelId}/clear`, { method: "POST", headers: authHeaders() });
    setMessagesByChannel((prev) => ({ ...prev, [channelId]: [] }));
  }

  async function deleteChannel(channelId) {
    await fetch(`${API_URL}/api/channels/${channelId}`, { method: "DELETE", headers: authHeaders() });
  }

  function handleTyping(channelId, isTyping) {
    getSocket()?.emit(isTyping ? "typing:start" : "typing:stop", channelId);
  }

  async function handleCreateChannel(name) {
    const res = await fetch(`${API_URL}/api/channels`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.ok) {
      setChannels((prev) => (prev.some((c) => c.id === data.channel.id) ? prev : [...prev, data.channel]));
      selectChat(data.channel.id);
    }
    return data;
  }

  function jumpToChannel(channelId) {
    selectChat(channelId);
  }

  function goBackToList() {
    setMobileChatOpen(false);
  }

  if (!token || !user) {
    return <Login onAuth={handleAuth} />;
  }

  const allChats = [...channels, ...dms];
  const activeChannel = allChats.find((c) => c.id === activeId) || null;
  const currentMessages = (activeId && messagesByChannel[activeId]) || [];
  const currentTyping = (activeId && typingByChannel[activeId]) || [];
  const otherUserPresence = activeChannel?.is_dm
    ? operators.find((o) => o.id === activeChannel.other?.id)
    : null;

  return (
    <div className={`app-shell ${mobileChatOpen ? "mobile-show-chat" : "mobile-show-list"}`}>
      <Sidebar
        channels={channels}
        dms={dms}
        activeId={activeId}
        onSelect={selectChat}
        onCreate={handleCreateChannel}
        onDeleteChannel={deleteChannel}
        onClearDm={clearDmChat}
        user={user}
        onLogout={handleLogout}
        onInstall={installPrompt ? handleInstall : null}
        onOpenSearch={() => setPanel("search")}
        onOpenStarred={() => setPanel("starred")}
        onOpenNewChat={() => setPanel("newchat")}
        autoLoadMedia={autoLoadMedia}
        onToggleAutoLoad={toggleAutoLoad}
        unreadCounts={unreadCounts}
        operators={operators}
      />

      {panel === "search" && (
        <SearchPanel onClose={() => setPanel(null)} onSearch={handleSearch} onJump={jumpToChannel} />
      )}
      {panel === "starred" && (
        <StarredPanel onClose={() => setPanel(null)} onLoad={loadStarred} onJump={jumpToChannel} onStar={handleStar} />
      )}
      {panel === "newchat" && (
        <NewChatPanel
          onClose={() => setPanel(null)}
          onSearchUsers={searchUsers}
          onStartDM={startDM}
          onCreateChannel={handleCreateChannel}
        />
      )}

      {!panel && (
        <ChatWindow
          channel={activeChannel}
          messages={currentMessages}
          typingUsers={currentTyping.filter((u) => u !== user.username)}
          currentUser={user}
          channels={channels}
          dms={dms}
          replyingTo={replyingTo}
          editingMessage={editingMessage}
          autoLoadMedia={autoLoadMedia}
          readReceipts={(activeId && readReceipts[activeId]) || {}}
          otherUserPresence={otherUserPresence}
          onBack={goBackToList}
          onSend={handleSend}
          onTyping={handleTyping}
          onReply={setReplyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onStartEdit={(m) => setEditingMessage({ id: m.id, body: m.body })}
          onCancelEdit={() => setEditingMessage(null)}
          onEditSubmit={handleEditSubmit}
          onDelete={handleDelete}
          onReact={handleReact}
          onStar={handleStar}
          onForward={handleForward}
          onUpload={handleUpload}
        />
      )}

      {!panel && !activeChannel?.is_dm && <MemberList operators={operators} activeChannelId={activeId} />}
    </div>
  );
}
