import type * as Party from "partykit/server";

interface User {
  id: string;
  address: string;
}

export default class Server implements Party.Server {
  users: User[] = [];

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    console.log(`Connected:
  id: ${conn.id}
  room: ${this.room.id}
  url: ${new URL(ctx.request.url).pathname}`);
    // A new person joined! Send them the list of everyone who's already here.
    conn.send(JSON.stringify({ type: "sync", users: this.users }));
  }

  onClose(conn: Party.Connection) {
    this.users = this.users.filter((user) => user.id !== conn.id);
    this.room.broadcast(JSON.stringify({ type: "sync", users: this.users }), []);
  }

  onMessage(message: string, sender: Party.Connection) {
    const msg = JSON.parse(message);

    if (msg.type === 'sync-user') {
      const existingUser = this.users.find((user) => user.id === sender.id);
      if (!existingUser && msg.address) {
        this.users.push({ id: sender.id, address: msg.address });
      }
      this.room.broadcast(JSON.stringify({ type: "sync", users: this.users }), []);
      return;
    }
    
    if (msg.type === 'selection') {
      const user = this.users.find(u => u.id === sender.id);
      if (user) {
        this.room.broadcast(JSON.stringify({ type: "selection", address: user.address, nodeId: msg.nodeId }), [sender.id]);
      }
      return;
    }

    // For other messages, just broadcast them
    this.room.broadcast(message, [sender.id]);
  }
} 