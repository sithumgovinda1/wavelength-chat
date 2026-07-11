import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import db from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PORT = process.env.PORT || 8080;
// Set this on your host (Render env var, etc). Anyone registering must know this code,
// so the app stays private to whoever you share it with.
const INVITE_CODE = process.env.INVITE_CODE || "";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// ---------- Uploads (images shared in chat) ----------

const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// A small palette of accent colors assigned round-robin to new users
const USER_COLORS = ["#F2A93B", "#4FD1C5", "#E5484D", "#8B7FE8", "#5BB8F5", "#F276B0"];
const REACTION_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Shape a raw message row (plus joined author info) into what the client expects,
// including its reply-preview, reaction summary, and whether the requesting user starred it.
function hydrateMessage(row, viewerId) {
  const reactions = db
    .prepare(
      `SELECT emoji, COUNT(*) as count, GROUP_CONCAT(users.username) as usernames
       FROM reactions JOIN users ON users.id = reactions.user_id
       WHERE message_id = ? GROUP BY emoji`
    )
    .all(row.id)
    .map((r) => ({ emoji: r.emoji, count: r.count, usernames: r.usernames.split(",") }));

  const myReaction = db
    .prepare("SELECT emoji FROM reactions WHERE message_id = ? AND user_id = ?")
    .get(row.id, viewerId);

  const starred = !!db
    .prepare("SELECT 1 FROM starred WHERE message_id = ? AND user_id = ?")
    .get(row.id, viewerId);

  let replyTo = null;
  if (row.reply_to_id) {
    const r = db
      .prepare(
        `SELECT messages.id, messages.body, messages.is_deleted, users.username
         FROM messages JOIN users ON users.id = messages.user_id WHERE messages.id = ?`
      )
      .get(row.reply_to_id);
    if (r) {
      replyTo = {
        id: r.id,
        username: r.username,
        snippet: r.is_deleted ? "Deleted message" : r.body.slice(0, 120),
      };
    }
  }

  return {
    id: row.id,
    channel_id: row.channel_id,
    body: row.is_deleted ? "" : row.body,
    created_at: row.created_at,
    username: row.username,
    color: row.color,
    edited_at: row.edited_at || null,
    is_deleted: !!row.is_deleted,
    media_url: row.is_deleted ? null : row.media_url,
    media_type: row.is_deleted ? null : row.media_type,
    forwarded_from: row.forwarded_from || null,
    reply_to: replyTo,
    reactions,
    my_reaction: myReaction?.emoji || null,
    starred,
  };
}

function getChannelMessages(channelId, viewerId, limit = 50) {
  const rows = db
    .prepare(
      `SELECT messages.*, users.username, users.color
       FROM messages
       JOIN users ON users.id = messages.user_id
       LEFT JOIN hidden_messages h ON h.message_id = messages.id AND h.user_id = ?
       WHERE messages.channel_id = ? AND h.id IS NULL
       ORDER BY messages.id DESC LIMIT ?`
    )
    .all(viewerId, channelId, limit);
  return rows.reverse().map((r) => hydrateMessage(r, viewerId));
}

// Attaches a chat-list preview (last message + unread count) to a channel/DM row,
// the way Telegram's chat list shows a snippet and a badge for each conversation.
function attachChannelMeta(channel, userId) {
  const last = db
    .prepare(
      `SELECT messages.*, users.username FROM messages
       JOIN users ON users.id = messages.user_id
       LEFT JOIN hidden_messages h ON h.message_id = messages.id AND h.user_id = ?
       WHERE channel_id = ? AND h.id IS NULL
       ORDER BY messages.id DESC LIMIT 1`
    )
    .get(userId, channel.id);

  const readRow = db
    .prepare("SELECT last_read_message_id FROM read_state WHERE channel_id = ? AND user_id = ?")
    .get(channel.id, userId);
  const lastRead = readRow?.last_read_message_id || 0;

  const unread = db
    .prepare(
      "SELECT COUNT(*) c FROM messages WHERE channel_id = ? AND id > ? AND user_id != ? AND is_deleted = 0"
    )
    .get(channel.id, lastRead, userId).c;

  return {
    ...channel,
    last_message: last
      ? {
          body: last.is_deleted ? "Deleted message" : last.media_url ? "📷 Photo" : last.body,
          username: last.username,
          created_at: last.created_at,
        }
      : null,
    unread_count: unread,
  };
}

// ---------- Auth ----------

app.post("/api/register", (req, res) => {
  const { username, password, inviteCode } = req.body || {};
  if (INVITE_CODE && inviteCode !== INVITE_CODE) {
    return res.status(403).json({ error: "Wrong invite code" });
  }
  if (!username || !password || username.length < 2 || password.length < 4) {
    return res.status(400).json({
      error: "Username (2+ chars) and password (4+ chars) are required",
    });
  }
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return res.status(409).json({ error: "That username is taken" });

  const color = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
  const password_hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(
      "INSERT INTO users (username, password_hash, color, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(username, password_hash, color, Date.now());

  const user = { id: info.lastInsertRowid, username, color };
  res.json({ token: signToken(user), user });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!row || !bcrypt.compareSync(password || "", row.password_hash)) {
    return res.status(401).json({ error: "Wrong username or password" });
  }
  const user = { id: row.id, username: row.username, color: row.color };
  res.json({ token: signToken(user), user });
});

// ---------- Channels & history ----------

app.get("/api/channels", authMiddleware, (req, res) => {
  const channels = db.prepare("SELECT * FROM channels WHERE is_dm = 0 ORDER BY id").all();
  res.json({ channels: channels.map((c) => attachChannelMeta(c, req.user.id)) });
});

app.post("/api/channels", authMiddleware, (req, res) => {
  const { name, topic } = req.body || {};
  const clean = (name || "").trim().toLowerCase().replace(/\s+/g, "-");
  if (!clean || clean.length < 2) {
    return res.status(400).json({ error: "Channel name must be 2+ characters" });
  }
  const existing = db.prepare("SELECT id FROM channels WHERE name = ?").get(clean);
  if (existing) return res.status(409).json({ error: "Channel already exists" });

  const info = db
    .prepare("INSERT INTO channels (name, topic, created_at) VALUES (?, ?, ?)")
    .run(clean, topic || "", Date.now());
  const channel = db.prepare("SELECT * FROM channels WHERE id = ?").get(info.lastInsertRowid);
  io.emit("channel:created", channel);
  res.json({ channel });
});

// Permanently clears a frequency: wipes its messages and removes it for everyone.
app.delete("/api/channels/:id", authMiddleware, (req, res) => {
  const channel = db.prepare("SELECT * FROM channels WHERE id = ?").get(req.params.id);
  if (!channel) return res.status(404).json({ error: "Not found" });
  if (channel.is_dm) return res.status(400).json({ error: "Use the DM clear option instead" });

  const ids = db.prepare("SELECT id FROM messages WHERE channel_id = ?").all(channel.id).map((r) => r.id);
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM reactions WHERE message_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM starred WHERE message_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM hidden_messages WHERE message_id IN (${placeholders})`).run(...ids);
  }
  db.prepare("DELETE FROM read_state WHERE channel_id = ?").run(channel.id);
  db.prepare("DELETE FROM messages WHERE channel_id = ?").run(channel.id);
  db.prepare("DELETE FROM channels WHERE id = ?").run(channel.id);

  io.emit("channel:deleted", { channelId: channel.id });
  res.json({ ok: true });
});

app.get("/api/channels/:id/messages", authMiddleware, (req, res) => {
  res.json({ messages: getChannelMessages(req.params.id, req.user.id) });
});

// ---------- Users & direct messages ----------

app.get("/api/users/search", authMiddleware, (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ users: [] });
  const rows = db
    .prepare("SELECT id, username, color FROM users WHERE username LIKE ? AND id != ? LIMIT 20")
    .all(`%${q}%`, req.user.id);
  res.json({ users: rows });
});

app.get("/api/dms", authMiddleware, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM channels WHERE is_dm = 1 AND (dm_user_a = ? OR dm_user_b = ?) ORDER BY id DESC")
    .all(req.user.id, req.user.id);
  const dms = rows.map((ch) => {
    const otherId = ch.dm_user_a === req.user.id ? ch.dm_user_b : ch.dm_user_a;
    const other = db.prepare("SELECT id, username, color FROM users WHERE id = ?").get(otherId);
    return { ...attachChannelMeta(ch, req.user.id), other };
  });
  res.json({ dms });
});

app.post("/api/dms", authMiddleware, (req, res) => {
  const { username } = req.body || {};
  const target = db.prepare("SELECT id, username, color FROM users WHERE username = ?").get(username);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.id === req.user.id) return res.status(400).json({ error: "That's you" });

  const a = Math.min(req.user.id, target.id);
  const b = Math.max(req.user.id, target.id);
  const name = `dm-${a}-${b}`;

  let channel = db.prepare("SELECT * FROM channels WHERE name = ?").get(name);
  if (!channel) {
    const info = db
      .prepare(
        "INSERT INTO channels (name, topic, created_at, is_dm, dm_user_a, dm_user_b) VALUES (?, '', ?, 1, ?, ?)"
      )
      .run(name, Date.now(), a, b);
    channel = db.prepare("SELECT * FROM channels WHERE id = ?").get(info.lastInsertRowid);
  }
  res.json({ channel: { ...channel, other: target } });
});

// "Clear chat" for a DM — hides the current messages just for the requesting user.
// The other person's copy is untouched, and since rows aren't destroyed, nothing here
// is truly unrecoverable at the database level (a future "restore" could reverse it).
app.post("/api/dms/:id/clear", authMiddleware, (req, res) => {
  const ids = db.prepare("SELECT id FROM messages WHERE channel_id = ?").all(req.params.id).map((r) => r.id);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO hidden_messages (user_id, message_id, created_at) VALUES (?, ?, ?)"
  );
  const now = Date.now();
  for (const id of ids) insert.run(req.user.id, id, now);
  res.json({ ok: true });
});

// ---------- Search ----------

app.get("/api/search", authMiddleware, (req, res) => {
  const q = (req.query.q || "").trim();
  if (q.length < 2) return res.json({ results: [] });
  const rows = db
    .prepare(
      `SELECT messages.*, users.username, users.color, channels.name as channel_name
       FROM messages
       JOIN users ON users.id = messages.user_id
       JOIN channels ON channels.id = messages.channel_id
       LEFT JOIN hidden_messages h ON h.message_id = messages.id AND h.user_id = ?
       WHERE messages.body LIKE ? AND messages.is_deleted = 0 AND h.id IS NULL
       ORDER BY messages.id DESC LIMIT 40`
    )
    .all(req.user.id, `%${q}%`);
  res.json({
    results: rows.map((r) => ({ ...hydrateMessage(r, req.user.id), channel_name: r.channel_name })),
  });
});

// ---------- Starred ----------

app.get("/api/starred", authMiddleware, (req, res) => {
  const rows = db
    .prepare(
      `SELECT messages.*, users.username, users.color, channels.name as channel_name
       FROM starred
       JOIN messages ON messages.id = starred.message_id
       JOIN users ON users.id = messages.user_id
       JOIN channels ON channels.id = messages.channel_id
       WHERE starred.user_id = ?
       ORDER BY starred.created_at DESC`
    )
    .all(req.user.id);
  res.json({
    results: rows.map((r) => ({ ...hydrateMessage(r, req.user.id), channel_name: r.channel_name })),
  });
});

// ---------- Media upload ----------

app.post("/api/upload", authMiddleware, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file received" });
  res.json({ url: `/uploads/${req.file.filename}`, type: "image" });
});

// ---------- Socket.io realtime layer ----------

const userSockets = new Map(); // userId -> Set(socket.id) — supports multiple tabs/devices
const userChannel = new Map(); // userId -> the channel they most recently joined

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

// Broadcasts the FULL friend roster (not just who's connected right now), so offline
// friends still show up with a "last seen" time instead of disappearing entirely.
function broadcastPresence() {
  const users = db.prepare("SELECT id, username, color, last_seen FROM users").all();
  const roster = users.map((u) => ({
    id: u.id,
    username: u.username,
    color: u.color,
    online: (userSockets.get(u.id)?.size || 0) > 0,
    channelId: userChannel.get(u.id) || null,
    lastSeen: u.last_seen,
  }));
  io.emit("presence:update", roster);
}

function messageOwnerId(messageId) {
  return db.prepare("SELECT user_id, channel_id FROM messages WHERE id = ?").get(messageId);
}

io.on("connection", (socket) => {
  const uid = socket.user.id;
  if (!userSockets.has(uid)) userSockets.set(uid, new Set());
  userSockets.get(uid).add(socket.id);
  broadcastPresence();

  socket.on("channel:join", (channelId) => {
    userChannel.set(uid, channelId);
    socket.rooms.forEach((r) => {
      if (r !== socket.id) socket.leave(r);
    });
    socket.join(`channel:${channelId}`);
    broadcastPresence();

    // Send this socket the current read state for the channel it just joined
    const reads = db
      .prepare(
        `SELECT read_state.user_id, users.username, last_read_message_id
         FROM read_state JOIN users ON users.id = read_state.user_id
         WHERE channel_id = ?`
      )
      .all(channelId);
    socket.emit("read:snapshot", { channelId, reads });
  });

  socket.on("message:send", ({ channelId, body, replyToId, mediaUrl, mediaType, forwardedFrom }) => {
    const text = (body || "").trim();
    if (!text && !mediaUrl) return;
    if (!channelId) return;

    const info = db
      .prepare(
        `INSERT INTO messages (channel_id, user_id, body, created_at, reply_to_id, media_url, media_type, forwarded_from)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        channelId,
        socket.user.id,
        text,
        Date.now(),
        replyToId || null,
        mediaUrl || null,
        mediaType || null,
        forwardedFrom || null
      );

    const row = db
      .prepare(
        `SELECT messages.*, users.username, users.color FROM messages
         JOIN users ON users.id = messages.user_id WHERE messages.id = ?`
      )
      .get(info.lastInsertRowid);

    // Broadcast personalized to each member of the room (starred/my_reaction differ per viewer,
    // but for a brand-new message these are always empty/false, so one shared payload is fine).
    io.to(`channel:${channelId}`).emit("message:new", hydrateMessage(row, socket.user.id));
  });

  socket.on("message:edit", ({ messageId, body }) => {
    const text = (body || "").trim();
    if (!text) return;
    const owner = messageOwnerId(messageId);
    if (!owner || owner.user_id !== socket.user.id) return; // only the author may edit
    db.prepare("UPDATE messages SET body = ?, edited_at = ? WHERE id = ?").run(
      text,
      Date.now(),
      messageId
    );
    const row = db
      .prepare(
        `SELECT messages.*, users.username, users.color FROM messages
         JOIN users ON users.id = messages.user_id WHERE messages.id = ?`
      )
      .get(messageId);
    io.to(`channel:${owner.channel_id}`).emit("message:updated", hydrateMessage(row, socket.user.id));
  });

  socket.on("message:delete", ({ messageId, scope }) => {
    const owner = messageOwnerId(messageId);
    if (!owner) return;

    if (scope === "everyone") {
      if (owner.user_id !== socket.user.id) return; // only the author can delete for everyone
      db.prepare("UPDATE messages SET is_deleted = 1 WHERE id = ?").run(messageId);
      const row = db
        .prepare(
          `SELECT messages.*, users.username, users.color FROM messages
           JOIN users ON users.id = messages.user_id WHERE messages.id = ?`
        )
        .get(messageId);
      io.to(`channel:${owner.channel_id}`).emit("message:updated", hydrateMessage(row, socket.user.id));
    } else {
      // "for me" — hide it only for the requesting user, recoverable since the row isn't touched
      db.prepare(
        "INSERT OR IGNORE INTO hidden_messages (user_id, message_id, created_at) VALUES (?, ?, ?)"
      ).run(socket.user.id, messageId, Date.now());
      socket.emit("message:removed", { messageId });
    }
  });

  socket.on("message:unhide", (messageId) => {
    db.prepare("DELETE FROM hidden_messages WHERE user_id = ? AND message_id = ?").run(
      socket.user.id,
      messageId
    );
  });

  socket.on("message:react", ({ messageId, emoji }) => {
    if (!REACTION_EMOJI.includes(emoji)) return;
    const owner = messageOwnerId(messageId);
    if (!owner) return;

    const existing = db
      .prepare("SELECT emoji FROM reactions WHERE message_id = ? AND user_id = ?")
      .get(messageId, socket.user.id);

    if (existing && existing.emoji === emoji) {
      db.prepare("DELETE FROM reactions WHERE message_id = ? AND user_id = ?").run(
        messageId,
        socket.user.id
      );
    } else {
      db.prepare(
        `INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji`
      ).run(messageId, socket.user.id, emoji, Date.now());
    }

    const reactions = db
      .prepare(
        `SELECT emoji, COUNT(*) as count, GROUP_CONCAT(users.username) as usernames
         FROM reactions JOIN users ON users.id = reactions.user_id
         WHERE message_id = ? GROUP BY emoji`
      )
      .all(messageId)
      .map((r) => ({ emoji: r.emoji, count: r.count, usernames: r.usernames.split(",") }));

    io.to(`channel:${owner.channel_id}`).emit("message:reactions", { messageId, reactions });
  });

  socket.on("message:star", ({ messageId, starred }) => {
    if (starred) {
      db.prepare(
        "INSERT OR IGNORE INTO starred (user_id, message_id, created_at) VALUES (?, ?, ?)"
      ).run(socket.user.id, messageId, Date.now());
    } else {
      db.prepare("DELETE FROM starred WHERE user_id = ? AND message_id = ?").run(
        socket.user.id,
        messageId
      );
    }
    socket.emit("message:starred", { messageId, starred });
  });

  socket.on("typing:start", (channelId) => {
    socket.to(`channel:${channelId}`).emit("typing:update", {
      username: socket.user.username,
      channelId,
      typing: true,
    });
  });

  socket.on("typing:stop", (channelId) => {
    socket.to(`channel:${channelId}`).emit("typing:update", {
      username: socket.user.username,
      channelId,
      typing: false,
    });
  });

  socket.on("message:read", ({ channelId, messageId }) => {
    if (!channelId || !messageId) return;
    db.prepare(
      `INSERT INTO read_state (channel_id, user_id, last_read_message_id, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(channel_id, user_id) DO UPDATE SET
         last_read_message_id = MAX(last_read_message_id, excluded.last_read_message_id),
         updated_at = excluded.updated_at`
    ).run(channelId, uid, messageId, Date.now());

    io.to(`channel:${channelId}`).emit("read:update", {
      channelId,
      userId: uid,
      username: socket.user.username,
      lastReadMessageId: messageId,
    });
  });

  socket.on("disconnect", () => {
    const set = userSockets.get(uid);
    set?.delete(socket.id);
    if (!set || set.size === 0) {
      db.prepare("UPDATE users SET last_seen = ? WHERE id = ?").run(Date.now(), uid);
      userChannel.delete(uid);
    }
    broadcastPresence();
  });
});

// ---------- Serve the built frontend (single free host, no separate static site needed) ----------

const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));

// Anything that isn't /api/*, /uploads/*, or a real static file falls through to the SPA's index.html
app.get(/^(?!\/api|\/uploads).*/, (req, res, next) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

server.listen(PORT, () => {
  console.log(`Chat server listening on http://localhost:${PORT}`);
});
