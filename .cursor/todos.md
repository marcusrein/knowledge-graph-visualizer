# Knowledge Graph App - Todo List

## Completed ✅
- [x] **Backend Setup** - SQLite + Next.js API routes for entities/relations/calendar
- [x] **Frontend Graph** - React Flow canvas with date picker, add nodes, connect nodes  
- [x] **Wallet Integration** - Lightweight wagmi + injected connector (no RainbowKit)
- [x] **Intro Modal** - Welcome modal with "don't show again" (localStorage)
- [x] **Basic Styling** - Tailwind + DaisyUI working, modal redesigned for contrast

## Pending 🚧
- [ ] **Snapshot System** - Daily reset logic + snapshots table and retrieval for calendar
- [ ] **Documentation** - Update README explaining lightweight architecture, daily reset, snapshots

## Future Enhancements 🔮
- [ ] Relation-type selector when connecting nodes (instead of fixed "related")
- [ ] Calendar picker showing entity counts as badges  
- [ ] Real-time collaboration (optional, future enhancement)
- [ ] Custom node styling and improved React Flow controls
- [ ] Toast notifications for wallet connect errors (currently implemented but basic)

## Notes
- App uses single-page Next.js with React Flow
- SQLite for lightweight persistence 
- Daily UTC reset with snapshot browsing
- Desktop-focused (browser extension wallets only)
- No external dependencies (no WalletConnect cloud) 