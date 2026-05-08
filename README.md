# DeskCalendar

An elegant transparent calendar widget for Windows desktop. Sits on your wallpaper like a native part of the system.

## Features

- **Transparent glass-morphism UI** — seamless desktop integration with adjustable opacity
- **Two display modes** — Compact (dot indicators) and Overview (inline event text)
- **Event management** — add, edit, delete events with color labels and optional time/notes
- **Countdown** — click ⏱ on any event to see remaining days/hours/minutes
- **Chinese / Japanese calendar** — switch between 中文 (Mon-first) and 日本語 (Sun-first)
- **Quick navigation** — left/right arrows for month, click year for month picker
- **Font scaling** — small / default / large, affects all text proportionally
- **Dark & light themes** — follows system preference, toggle in settings
- **Auto-start** — optional launch on Windows boot
- **Grid lines** — optional subtle borders between calendar cells
- **Drag to copy** — drag an event card onto any date cell to duplicate it
- **Smart window resize** — auto-fits height when selecting dates with events

## Getting Started

```bash
npm install
npm start
```

## Build

```bash
npm run build
```

Output goes to `release/DeskCalendar-win32-x64/`. The `.exe` is portable — no installation needed.

## Tech Stack

- [Electron](https://www.electronjs.org/) — desktop shell
- Vanilla HTML/CSS/JS — no framework, zero build step
- Glass-morphism with `backdrop-filter` and CSS custom properties
