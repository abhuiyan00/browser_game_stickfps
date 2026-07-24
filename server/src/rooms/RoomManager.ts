import type { NetChannel, NetServer } from "../net/transport";
import { Room } from "./Room";
import { generateRoomCode, isValidRoomCode } from "./roomCode";

interface Membership {
  roomCode: string;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private membership = new Map<string, Membership>();

  constructor(private io: NetServer) {}

  createRoom(channel: NetChannel): Room | null {
    if (!channel.id) return null;
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const room = new Room(code, this.io);
    this.rooms.set(code, room);
    const joined = this.joinRoom(channel, code);
    if (!joined) this.rooms.delete(code); // don't leak an empty room if the join failed
    return joined;
  }

  joinRoom(channel: NetChannel, rawCode: string): Room | null {
    if (!channel.id || !isValidRoomCode(rawCode)) return null;
    const room = this.rooms.get(rawCode.toUpperCase());
    if (!room || room.isFull()) return null;

    // Joining while already in a room must remove the player from the old one
    // first — otherwise they'd linger there as an immortal zombie holding the
    // room (and its 60Hz loop) alive forever.
    this.leaveCurrentRoom(channel.id);

    room.addPlayer(channel.id);
    channel.join(room.code);
    this.membership.set(channel.id, { roomCode: room.code });
    return room;
  }

  private leaveCurrentRoom(channelId: string): void {
    const membership = this.membership.get(channelId);
    if (!membership) return;
    const room = this.rooms.get(membership.roomCode);
    this.membership.delete(channelId);
    if (!room) return;
    room.removePlayer(channelId);
    if (room.players.size === 0) this.rooms.delete(room.code);
  }

  getRoomForChannel(channel: NetChannel): Room | undefined {
    if (!channel.id) return undefined;
    const membership = this.membership.get(channel.id);
    if (!membership) return undefined;
    return this.rooms.get(membership.roomCode);
  }

  handleDisconnect(channel: NetChannel): void {
    if (!channel.id) return;
    const room = this.getRoomForChannel(channel);
    if (!room) return;

    room.removePlayer(channel.id);
    this.membership.delete(channel.id);
    if (room.players.size === 0) this.rooms.delete(room.code);
  }
}
