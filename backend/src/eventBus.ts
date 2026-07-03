import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export function setSocketIO(socketIO: SocketIOServer) {
  io = socketIO;
}

export function emitEvent(event: string, data: any) {
  if (io) {
    io.emit(event, data);
  }
}
