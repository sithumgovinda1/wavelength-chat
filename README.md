# Wavelength — a private chat app for you and your friends

A WhatsApp-style real-time chat app: channels, live messaging, typing indicators, presence —
built as an **installable website (PWA)** rather than a native APK, and made **private** with
a shared invite code so only people you tell can join. Both choices were made specifically to
fit a $0 budget:

- **Why a website instead of a native app:** a real Android app needs either a Google Play
  developer account ($25 one-time) or you'd have to send friends an unsigned APK, which Android
  blocks by default and most people won't know how to override safely. A website that's
  "installable" (a Progressive Web App) sidesteps both problems — friends open a link in Chrome,
  tap **Add to Home screen**, and it behaves like a real app: its own icon, its own window, no
  browser bar. No store, no signing, no fee.
- **Why one server for everything:** free hosts are more limited than paid ones, so this app is
  built so the *same* free service both serves the app and runs the live chat backend — you only
  need to deploy one thing.

## What's private about it

Anyone can find the URL, but only people who know your **invite code** can create an account.
You set that code yourself (see step 2 below) and share it with friends however you like —
text, WhatsApp, whatever.

## 1. Get the code online (GitHub — free)

You need somewhere for Render (the free host, step 2) to pull your code from.

1. Create a free account at [github.com](https://github.com) if you don't have one.
2. Create a new **public or private** repository, e.g. `wavelength-chat`.
3. Upload everything in this folder to that repository (GitHub's web UI lets you drag-and-drop
   files if you don't want to use git on the command line — look for "uploading an existing file"
   on your new repo's page).

## 2. Deploy to Render (free, no credit card)

[Render](https://render.com) has a genuine free tier for web services, no card required, and it
supports WebSockets (what this app uses for live messaging) out of the box.

1. Sign up at render.com (you can sign in with your GitHub account).
2. Click **New > Blueprint**, and pick the GitHub repo you just created. Render will read the
   `render.yaml` file in this project and set almost everything up automatically.
3. Before the first deploy finishes, open the new service's **Environment** tab and set:
   - `INVITE_CODE` — make up a word or phrase, e.g. `midnight-otters`. This is what your friends
     will need to type in when they register.
   - (`JWT_SECRET` is generated for you automatically — leave it as is.)
4. Deploy. Render gives you a URL like `https://wavelength-chat.onrender.com` — that's your app.

**One free-tier quirk to know about:** on the free plan, Render puts your app to sleep after
~15 minutes with no visitors, and it takes 30–50 seconds to wake back up on the next visit.
That's normal and free — just means the very first message of the day loads a bit slowly.

## 3. Install it on Android

Send friends the Render URL. On their phone, in Chrome:

- Chrome will often show an **"Add Wavelength to Home screen"** banner automatically, or
- They can tap the **⋮ menu > Add to Home screen / Install app**, or
- Once they're signed in, there's an **"⬇ Install app"** button in the app's sidebar itself.

After that it opens like any other app — its own icon, full screen, no browser bar.

## 4. Everyone signs up

- Each friend opens the app, taps **Create one**, and registers with a username, password, and
  the invite code you gave them.
- Once in, anyone can open **# general** or make a new channel with the `+ open a frequency…`
  box in the sidebar.

## Running it on your own computer first (optional, recommended)

Useful if you want to try it before deploying, or to keep developing it.

```bash
# terminal 1
cd server
npm install
npm run dev          # http://localhost:4000

# terminal 2
cd client
npm install
npm run dev           # http://localhost:5173 — open this one in your browser
```

Set an invite code locally too, if you want to test that flow:

```bash
INVITE_CODE="test123" npm run dev   # run inside server/
```

## Features

- Real-time messaging, unified chat list (group "frequencies" + private DMs), presence, typing indicators
- **Telegram-style bubble UI** with proper single-pane mobile navigation (chat list ↔ conversation, with a back button — not a 3-column Discord layout squeezed onto a phone)
- Reply/quote, edit, delete (for you or for everyone), copy, forward — to frequencies or DMs
- Reactions (👍❤️😂😮😢🙏), starred messages, message search
- Image sharing (up to 8MB), auto-load-images toggle
- **True online/offline status with "last seen"** for every registered friend, not just who's currently connected
- **Read receipts** — ✓ sent, teal ✓✓ seen — on your own messages
- **Private 1:1 chats** — search for a friend by username and start a direct message, invisible to everyone else
- **Clearable frequencies** — permanently delete a group channel and all its messages; DMs get a "clear chat" (hides your copy, the other person's is untouched)
- **In-app/background-tab notifications** via the browser Notification API when a message arrives in a chat you're not currently viewing

**Note on notifications:** this uses the browser's Notification API, which fires while the app/tab is open (including in the background) but **not** if Android has fully killed the app process. A more bulletproof "closed-app" push notification system is possible (Web Push + VAPID keys, still free) as a future addition if you want it.

**Note on uploaded images:** like the SQLite chat history, uploaded images are stored as
plain files on the server, which free hosts can wipe on redeploy. Fine for casual sharing;
don't rely on it as permanent photo storage.

## Known limitations of the free setup

- **Chat history isn't guaranteed forever.** The free database here is a SQLite file stored
  alongside the app. Render's free plan can wipe local files on redeploys or occasional restarts.
  For a small friend group this is usually fine (and cheap!) but if you want messages to survive
  forever, the easiest free upgrade later is swapping SQLite for a free hosted database like
  [Turso](https://turso.tech) — ask me and I can wire that in.
- **Sleep/wake delay** as mentioned above — only affects the first message after a period of
  inactivity.
- **No push notifications** while the app/tab is closed — that requires a paid Apple/Google
  push service tier in most free setups. Messages still arrive instantly while the app is open.

## Project structure

```
chat-platform/
  render.yaml            # one-click free deploy config for Render
  server/
    server.js             # Express routes + Socket.io + serves the built frontend
    db.js                  # SQLite schema + seed channels
  client/
    public/
      manifest.webmanifest   # makes the site installable
      service-worker.js       # offline app-shell caching
      icons/                    # app icons
    src/
      App.jsx                # top-level state, socket wiring, install-prompt handling
      socket.js                # socket.io-client connection helper
      components/
        Login.jsx                # sign in / register (with invite code)
        Sidebar.jsx                # channel list + install button
        ChatWindow.jsx              # message stream + composer
        MessageInput.jsx
        MemberList.jsx
      index.css                     # design system (colors, type, layout)
```
