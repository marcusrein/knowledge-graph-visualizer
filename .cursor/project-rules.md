# Project Fundamentals

- Interactive knowledge graph visualizer built with React Flow.
- Single-page Next.js (App Router) site with Tailwind & DaisyUI styling.
- Users connect with crypto wallet (Wagmi + RainbowKit) – address only, no signatures.
- Fixed set of relation types between nodes.
- Lightweight persistence: SQLite database of daily graphs, snapshots saved per UTC day.
- Calendar picker shows snapshot counts; today’s graph resets at 00:00 UTC.
- Intro modal on first visit explaining daily reset and snapshots (dismissable via localStorage).
- Real-time collaboration optional, future enhancement (not implemented yet).
- Minimal backend API routes inside Next.js to read/write graph & snapshots.
- Keep codebase small; avoid unnecessary dependencies or boilerplate. 