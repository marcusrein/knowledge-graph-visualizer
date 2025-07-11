import type * as Party from "partykit/server";

interface User {
  id: string;
  address: string;
  lastSeen: number;
}

interface DataEvent {
  type: 'entity-create' | 'entity-update' | 'entity-delete' | 'relation-create' | 'relation-update' | 'relation-delete' | 'relation-link-create';
  timestamp: number;
  editorAddress: string;
  data: {
    nodeId: string;
    [key: string]: unknown;
  };
  eventId: string;
}

interface ConflictResolution {
  winnerEventId: string;
  loserEventId: string;
  resolution: 'last-write-wins' | 'merge' | 'manual';
  timestamp: number;
}

export default class Server implements Party.Server {
  users: User[] = [];
  pendingEvents: Map<string, DataEvent> = new Map();
  eventHistory: DataEvent[] = [];
  conflictResolutions: ConflictResolution[] = [];

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    console.log(`Connected:
  id: ${conn.id}
  room: ${this.room.id}
  url: ${new URL(ctx.request.url).pathname}`);
    
    // Send current users and recent events to the newly connected client
    conn.send(JSON.stringify({ 
      type: "sync", 
      users: this.users,
      recentEvents: this.eventHistory.slice(-50) // Last 50 events for sync
    }));
  }

  onClose(conn: Party.Connection) {
    this.users = this.users.filter((user) => user.id !== conn.id);
    this.room.broadcast(JSON.stringify({ type: "sync", users: this.users }), []);
  }

  onMessage(message: string, sender: Party.Connection) {
    const msg = JSON.parse(message);
    const now = Date.now();

    // Update user last seen timestamp
    const user = this.users.find(u => u.id === sender.id);
    if (user) {
      user.lastSeen = now;
    }

    if (msg.type === 'sync-user') {
      const existingUser = this.users.find((user) => user.id === sender.id);
      if (!existingUser && msg.address) {
        this.users.push({ id: sender.id, address: msg.address, lastSeen: now });
      }
      this.room.broadcast(JSON.stringify({ type: "sync", users: this.users }), []);
      return;
    }
    
    if (msg.type === 'selection') {
      const user = this.users.find(u => u.id === sender.id);
      if (user) {
        this.room.broadcast(JSON.stringify({ 
          type: "selection", 
          address: user.address, 
          nodeId: msg.nodeId 
        }), [sender.id]);
      }
      return;
    }

    if (msg.type === 'node-move') {
      // Add conflict detection for simultaneous moves
      const moveEvent: DataEvent = {
        type: 'entity-update',
        timestamp: now,
        editorAddress: user?.address || 'unknown',
        data: {
          nodeId: msg.payload.nodeId,
          position: msg.payload.position,
          operationType: 'move'
        },
        eventId: `move-${msg.payload.nodeId}-${now}`
      };

      this.addEventToHistory(moveEvent);
      this.room.broadcast(message, [sender.id]);
      return;
    }

    // Handle data synchronization events
    if (this.isDataEvent(msg.type)) {
      const event: DataEvent = {
        type: msg.type,
        timestamp: msg.timestamp || now,
        editorAddress: user?.address || 'unknown',
        data: msg.data,
        eventId: msg.eventId || `${msg.type}-${now}-${Math.random()}`
      };

      // Check for conflicts
      const conflict = this.detectConflict(event);
      if (conflict) {
        const resolution = this.resolveConflict(event, conflict);
        this.broadcastConflictResolution(resolution, sender);
        return;
      }

      // Store event and broadcast to all other clients
      this.addEventToHistory(event);
      this.room.broadcast(JSON.stringify({
        type: 'data-sync',
        event: event,
        serverTimestamp: now
      }), [sender.id]);

      // Send acknowledgment back to sender
      sender.send(JSON.stringify({
        type: 'data-ack',
        eventId: event.eventId,
        serverTimestamp: now,
        status: 'success'
      }));

      return;
    }

    // For other messages, just broadcast them
    this.room.broadcast(message, [sender.id]);
  }

  private isDataEvent(type: string): boolean {
    return [
      'entity-create', 'entity-update', 'entity-delete',
      'relation-create', 'relation-update', 'relation-delete',
      'relation-link-create'
    ].includes(type);
  }

  private addEventToHistory(event: DataEvent) {
    this.eventHistory.push(event);
    
    // Keep only last 1000 events to prevent memory bloat
    if (this.eventHistory.length > 1000) {
      this.eventHistory = this.eventHistory.slice(-1000);
    }
  }

  private detectConflict(newEvent: DataEvent): DataEvent | null {
    // Look for recent events on the same node
    const recentEvents = this.eventHistory.filter(event => 
      event.data.nodeId === newEvent.data.nodeId &&
      event.timestamp > newEvent.timestamp - 5000 && // Within 5 seconds
      event.editorAddress !== newEvent.editorAddress &&
      event.type === newEvent.type
    );

    return recentEvents.length > 0 ? recentEvents[recentEvents.length - 1] : null;
  }

  private resolveConflict(newEvent: DataEvent, conflictingEvent: DataEvent): ConflictResolution {
    // Last write wins strategy - can be enhanced with more sophisticated logic
    const winner = newEvent.timestamp > conflictingEvent.timestamp ? newEvent : conflictingEvent;
    const loser = winner === newEvent ? conflictingEvent : newEvent;

    const resolution: ConflictResolution = {
      winnerEventId: winner.eventId,
      loserEventId: loser.eventId,
      resolution: 'last-write-wins',
      timestamp: Date.now()
    };

    this.conflictResolutions.push(resolution);
    
    // Add winning event to history
    if (winner === newEvent) {
      this.addEventToHistory(newEvent);
    }

    return resolution;
  }

  private broadcastConflictResolution(resolution: ConflictResolution, originalSender: Party.Connection) {
    const message = JSON.stringify({
      type: 'conflict-resolution',
      resolution: resolution,
      timestamp: Date.now()
    });

    this.room.broadcast(message, []);
    
    // Send specific acknowledgment to original sender
    originalSender.send(JSON.stringify({
      type: 'data-ack',
      eventId: resolution.loserEventId,
      status: 'conflict-resolved',
      resolution: resolution
    }));
  }

  // Periodic cleanup of stale data
  private cleanup() {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    // Remove stale users (inactive for 5+ minutes)
    const beforeCount = this.users.length;
    this.users = this.users.filter(user => user.lastSeen > fiveMinutesAgo);
    
    if (this.users.length !== beforeCount) {
      this.room.broadcast(JSON.stringify({ type: "sync", users: this.users }), []);
    }

    // Cleanup old conflict resolutions (keep last 100)
    if (this.conflictResolutions.length > 100) {
      this.conflictResolutions = this.conflictResolutions.slice(-100);
    }
  }

  // Run cleanup every 5 minutes
  onStart() {
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }
} 