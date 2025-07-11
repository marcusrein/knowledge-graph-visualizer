# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Knowledge Graph Visualizer application that enables real-time collaborative graph creation and visualization. Users can create nodes (topics/knowledge), relations, and spaces to organize and visualize connections between different entities.

## Development Commands

```bash
# Development
npm run dev          # Start Next.js dev server with Turbopack (http://localhost:3000)
npm run partykit:dev # Start PartyKit WebSocket server (required for real-time features)

# Production
npm run build        # Build for production
npm run start        # Start production server

# Code Quality
npm run lint         # Run ESLint
```

**Important**: Always run both `npm run dev` and `npm run partykit:dev` in separate terminals for full functionality during development.

## Architecture Overview

### Tech Stack
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Graph Visualization**: ReactFlow with Dagre layout
- **Real-time**: PartyKit (WebSocket server in `/party`)
- **Database**: SQLite with Better-SQLite3
- **Styling**: Tailwind CSS 4 + DaisyUI
- **Web3**: Wagmi + Viem for wallet connections

### Key Components

1. **Graph Page** (`app/page.tsx`): Main visualization component
   - Handles node creation, dragging, and connections
   - Manages real-time synchronization
   - Implements auto-layout with Dagre

2. **Node Types**:
   - `TopicNode` (`components/TopicNode.tsx`): Knowledge/topic nodes
   - `RelationNode` (`components/RelationNode.tsx`): Connection nodes
   - `SpaceNode` (`components/SpaceNode.tsx`): Grouping containers

3. **Inspector** (`components/Inspector.tsx`): Property editor panel
   - Edit node properties (text, visibility, color)
   - Delete nodes
   - Toggle orientation for relation nodes

4. **Database Schema** (`lib/db.ts`):
   - `entities`: All nodes (topics, relations, spaces)
   - `relation_links`: Connections between nodes
   - Database resets daily (ephemeral data)

### API Routes

All API routes are in `app/api/`:
- `/entities`: CRUD operations for nodes
- `/relations`: Relation-specific operations
- `/relation-links`: Managing connections
- `/calendar`: Calendar-related features

### Real-time Synchronization

PartyKit server (`party/index.ts`) handles:
- Broadcasting node updates
- Cursor position sharing
- User presence
- Conflict resolution

### Important Patterns

1. **Node Creation**: Double-click on canvas creates topic nodes at cursor position
2. **Space Management**: Nodes can be dragged into spaces, which automatically resize
3. **Relation Nodes**: Must be positioned inside their parent space
4. **Optimistic Updates**: UI updates immediately, then syncs with server
5. **Node Types**: 'topic' and 'knowledge' are aliases (normalized to 'topic')

## Common Development Tasks

### Adding New Node Types
1. Create component in `/components/`
2. Add to `nodeTypes` in `app/page.tsx`
3. Update database schema if needed
4. Add type handling in API routes

### Modifying Graph Behavior
- Layout logic: `app/page.tsx` (search for `dagreGraph`)
- Node interactions: Individual node components
- Real-time sync: `party/index.ts`

### Database Operations
- Use prepared statements in `lib/db.ts`
- All database operations should handle the daily reset gracefully
- Entity IDs are auto-generated UUIDs

## Testing

Currently no test suite is configured. When implementing tests:
- Use the built-in Next.js testing setup
- Focus on API route testing
- Test real-time synchronization scenarios
- Mock PartyKit connections for unit tests