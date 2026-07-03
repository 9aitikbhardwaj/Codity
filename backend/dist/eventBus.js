"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setSocketIO = setSocketIO;
exports.emitEvent = emitEvent;
let io = null;
function setSocketIO(socketIO) {
    io = socketIO;
}
function emitEvent(event, data) {
    if (io) {
        io.emit(event, data);
    }
}
