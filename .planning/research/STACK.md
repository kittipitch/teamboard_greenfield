# Stack Research

**Domain:** Team retrospective board web app (server-rendered, no-build-pipeline)
**Researched:** 2026-04-19
**Confidence:** HIGH

## Fixed Constraints (Not Researched — User-Specified)

| Technology | Version | Role |
|------------|---------|------|
| Bun | latest stable | Runtime — replaces Node.js |
| Express | 4.x | HTTP server, routing, middleware |
| JSON file | — | Data store — no database |

Everything below is researched and recommended *within* these constraints.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| EJS | 5.0.1 | Server-side HTML templating | First-class Express integration via `app.set('view engine', 'ejs')`; ships HTML fragments that HTMX can swap in; plain `.ejs` files are `.html` with `<%= %>` tags — no DSL to learn; 15k+ downstream packages on npm means near-zero abandonment risk |
| HTMX | 2.0.8 | Browser-side interactivity (add/edit/delete cards without page reloads) | CDN-only, no build step; 14 kB min+gz; replaces fetch() + DOM wiring for every CRUD action with declarative HTML attributes; pairs directly with Express returning HTML fragments from routes; the dominant no-SPA pattern in 2025 |
| Pico CSS | 2.1.1 | Visual styling | Classless variant styles semantic HTML with a single `<link>` tag; ~8 kB gzipped; columns, cards, and form inputs look acceptable with zero custom CSS; no build step, no utility classes to memorise |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| SortableJS | 1.15.7 | Drag-and-drop card reordering between columns | Add only if card reordering is added to scope; CDN one-liner; framework-free; works against HTMX POST endpoints on drop |
| Alpine.js | 3.14.x | Local UI state (inline edit toggle, character counter) | Add only when a UI behaviour is too complex for HTMX alone but does not warrant a full component model; CDN one-liner; do not add Alpine if every interaction maps to a server round-trip — HTMX covers that alone |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Bun (built-in watch) | Auto-restart on file save | `bun --watch server.js` — no nodemon needed; Bun's native watcher is faster and has zero extra dependencies |
| Bun test runner | Unit tests for JSON file helpers | `bun test` — built into runtime, no Jest install needed |

---

## Installation

```bash
# Backend (already committed to by user — included for completeness)
bun add express

# Templating
bun add ejs

# CSS — CDN only, no npm install needed
# Add to HTML <head>:
# <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.classless.min.css">

# HTMX — CDN only, no npm install needed
# Add to HTML <body> (or <head> with defer):
# <script src="https://cdn.jsdelivr.net/npm/htmx.org@2.0.8/dist/htmx.min.js"></script>

# Optional: drag-and-drop (only when card reordering is in scope)
# CDN: <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.7/Sortable.min.js"></script>

# Optional: Alpine.js (only when local UI state is needed)
# CDN: <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| EJS | Nunjucks | Better choice if templates need inheritance macros or async rendering — overkill for a three-column board with trivial data shapes |
| EJS | Handlebars | If the team strongly dislikes `<% %>` syntax and prefers `{{ }}` — feature-equivalent for this use case but less tightly integrated with Express view system |
| EJS | Eta | More modern TypeScript-native engine; however, Eta dropped native `app.engine()` support in v4 (requires manual wiring) and has unclear Bun compatibility status — EJS is a safer default |
| Pico CSS (classless) | Plain hand-written CSS | Correct choice if the design needs to deviate significantly from Pico defaults; start with Pico and eject to plain CSS when it fights you |
| Pico CSS | Tailwind CDN | Tailwind CDN ships the full utility sheet (~3 MB unoptimised) unless a build step purges it — incompatible with the no-build constraint |
| Pico CSS | Bootstrap | Bootstrap CDN is 150+ kB CSS + JavaScript; brings modal and dropdown JavaScript that competes with HTMX for DOM ownership; too heavy for this scope |
| HTMX | Vanilla fetch() + innerHTML | Viable for three endpoints; becomes repetitive boilerplate as the endpoint count grows past ~6; HTMX eliminates that class of code entirely |
| HTMX | React / Vue / Svelte | All require a build pipeline (Vite, webpack, etc.) which the project explicitly wants to avoid; also invert the rendering model — the server would return JSON instead of HTML, adding an API layer that serves no purpose here |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| React / Vue / Svelte | Require build pipeline (Vite/webpack); shift rendering to client; server becomes a JSON API — adds complexity that delivers no value for a single-board CRUD app | HTMX + EJS |
| Tailwind CSS (CDN, no build) | CDN version ships 3 MB+ of raw utility classes; purging requires a build step; creates a false choice between bloat and complexity | Pico CSS classless CDN |
| nodemon | Bun's native `--watch` flag eliminates the need; extra dependency with no benefit on Bun runtime | `bun --watch server.js` |
| Jest / Vitest | Bun ships its own Jest-compatible test runner (`bun test`); zero extra install needed | `bun test` |
| jQuery | No use case — HTMX handles all DOM mutation; Alpine handles any remaining UI state; jQuery's event/Ajax layer duplicates both | HTMX + Alpine (if needed) |
| Socket.io / WebSocket libraries | Explicitly out of scope (no real-time sync) | — |

---

## Stack Patterns by Variant

**If card reordering across columns is added to scope:**
- Add SortableJS via CDN
- Wire `onEnd` callback to an HTMX-style `fetch` POST, or use `htmx.ajax()` directly
- Do not reach for a framework just to handle drag-and-drop

**If inline editing requires a textarea toggle (show/hide):**
- Use Alpine.js `x-show` / `x-data` for the toggling state
- Keep the actual save action as an HTMX `hx-put` to the server
- Do not use Alpine for the network call — that is HTMX's job

**If the app grows beyond one board (future):**
- Re-evaluate the template engine: Nunjucks layouts become worthwhile at 4+ distinct page templates
- Re-evaluate the CSS: Pico classless constrains custom layout; migrate to Pico with class-based utilities or plain CSS at that point
- The Bun + Express + EJS + HTMX core stays valid up to moderate traffic

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| EJS 5.0.1 | Express 4.x | `app.set('view engine', 'ejs')` works unchanged; Express 5.x also compatible |
| EJS 5.0.1 | Bun latest | EJS is pure JS with no native bindings; works on any runtime that runs Node-compatible JS |
| HTMX 2.0.8 | All modern browsers | IE11 support dropped in HTMX 2.x; not a concern for a team internal tool |
| Pico CSS 2.1.1 | HTMX 2.x | No JavaScript interaction; purely CSS; no conflicts |
| SortableJS 1.15.7 | HTMX 2.x | No conflicts; they operate on separate concerns (drag vs. Ajax) |
| Alpine.js 3.14.x | HTMX 2.x | Well-documented combination; HTMX docs explicitly endorse Alpine for client-side state it doesn't cover |

---

## Sources

- https://htmx.org/posts/2024-06-17-htmx-2-0-0-is-released/ — HTMX 2.0 release confirmation
- https://github.com/bigskysoftware/htmx/releases — HTMX 2.0.8 current stable version
- https://picocss.com/docs/v2 — Pico CSS v2 feature documentation
- https://github.com/picocss/pico/releases — Pico CSS 2.1.1 current stable (released 2025-03-15)
- https://www.npmjs.com/package/ejs — EJS 5.0.1 current stable
- https://www.npmjs.com/package/sortablejs — SortableJS 1.15.7 current stable
- https://www.npmjs.com/package/alpinejs — Alpine.js 3.14.x current stable
- https://bun.com/docs/guides/ecosystem/express — Bun + Express official compatibility guide
- https://strapi.io/blog/htmx-lightweight-alternative-javascript-frameworks — HTMX vs React use-case analysis (MEDIUM confidence — third-party editorial)
- https://eta.js.org/docs/4.x.x/resources/express — Eta v4 Express integration (reviewed; ruled out due to dropped app.engine() support)

---
*Stack research for: team retrospective board web app (Bun + Express + JSON, no-build-pipeline frontend)*
*Researched: 2026-04-19*
