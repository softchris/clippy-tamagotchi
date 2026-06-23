# 📎 C.L.I.P.P.Y.

**Copilot's Living Interactive Personal Pet for You**

A Tamagotchi-style virtual pet canvas extension for the [GitHub Copilot](https://github.com/features/copilot) desktop app. Choose from 10 classic MS Office assistants, keep them happy, and watch them react to your real coding activity!

![Clippy Tamagotchi](./screenshot.png)

## ✨ Features

- **10 Classic Characters** — Clippy, Bonzi, F1, Genie, Genius, Links, Merlin, Peedy, Rocky, Rover
- **Tamagotchi Mechanics** — Feed, play, sleep, and clean your pet to keep stats up
- **Name Your Pet** — Give your companion a custom nickname
- **Thought Bubbles** — Clippy tells you what they need based on their lowest stat
- **Idle Animations** — Characters bounce, wander, sleep, and react based on mood
- **🌙/☀️ Theme Toggle** — Dark and light mode support
- **🔇 Mute Button** — Silence clippy.js sounds with one click (persists across reloads)
- **💤 Sleep Recovery** — Friendly overlay with "Wake Up" button if the extension restarts

## 🚀 Session Awareness

Clippy reacts to your real GitHub activity in real-time!

| Action | Happiness | Bonus |
|--------|-----------|-------|
| 🌟 Close an issue | +10 | +5 energy |
| ✅ Build succeeds | +10 | +5 energy |
| ✨ Tests pass | +10 | +5 energy |
| 🎉 PR merged | +10 | +5 energy |
| 📝 Create an issue | +5 | +3 hunger |
| 📨 Open a PR | +5 | +3 hunger |
| 💬 Comment on issue | +5 | +3 hunger |
| ✏️ Edit an issue | +3 | — |
| 👤 Assign an issue | +3 | — |
| 💥 Build fails | -5 | — |
| 🔴 Tests fail | -5 | — |

### How it works

- **GitHub GraphQL polling** — Checks your repos every 30s via `gh` CLI (real-time, no propagation delay)
- **Activity Log** — Shows today's events with timestamps and stat effects
- **Daily Summary** — Tracks your daily productivity streak
- **`notify_clippy` tool** — The Copilot agent can also push events during coding sessions

## 📦 Installation

### Prerequisites

- [GitHub Copilot desktop app](https://githubnext.com/projects/copilot-workspace) (v1.0.60+)
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated

### Option 1: Install from Gist (Recommended)

1. Open the GitHub Copilot app
2. Open the Command Palette
3. Select **"Install extension from gist"**
4. Paste this gist URL:
   ```
   https://gist.github.com/softchris/51c8e8a1ada7736e0e9d7fa1421c0aa6
   ```
5. Choose **User** scope (installs for you across all projects)

### Option 2: Manual Install

1. Clone this repo:
   ```bash
   git clone https://github.com/softchris/clippy-tamagotchi.git
   ```

2. Copy to your Copilot extensions directory:
   ```bash
   # macOS/Linux
   cp -r clippy-tamagotchi ~/.copilot/extensions/clippy-tamagotchi

   # Windows
   xcopy clippy-tamagotchi %USERPROFILE%\.copilot\extensions\clippy-tamagotchi /E /I
   ```

3. Restart the Copilot app or run `extensions_reload` from a session

### Option 3: Project-scoped

Place in your repo's `.github/extensions/clippy-tamagotchi/` directory to share with your team.

## 🎮 Usage

Once installed, open the canvas from any chat or session:

> "Open clippy tamagotchi"

Or the agent may open it automatically when relevant.

### Controls

| Button | Location | Action |
|--------|----------|--------|
| 🔇/🔊 | Top-left | Toggle sound |
| ❓ | Top-right | How it works (modal) |
| 🌙/☀️ | Top-right | Toggle dark/light mode |
| 🍕 | Bottom | Feed pet |
| 🎮 | Bottom | Play with pet |
| 💤 | Bottom | Put pet to sleep |
| 🧼 | Bottom | Clean pet |

### Configuring Watched Repos

By default, the extension watches these repos (edit `WATCHED_REPOS` in `extension.mjs`):

```js
const WATCHED_REPOS = [
  "github/devrel",
  "softchris/mcp-book",
  "softchris/agentic-book",
  "softchris/mmm",
  "softchris/mcp-workshop",
  "microsoft/Web-Dev-For-Beginners"
];
```

Change these to your own repos to track your activity!

## ⚠️ Stat Decay

Stats decay over time! If any stat hits 0, Clippy dies 💀. Keep working and caring to stay alive. You can revive with the "Revive Pet" button.

## 🛠️ Development

This is a single-file ES module extension (`extension.mjs`). It runs a loopback HTTP server serving the interactive UI, and uses:

- [clippy.js](https://github.com/clippyjs/clippy.js/) for character sprites and animations (via jsDelivr CDN)
- GitHub GraphQL API (via `gh` CLI) for real-time activity tracking
- `@github/copilot-sdk` for canvas registration, tools, and hooks

## 📄 License

MIT
