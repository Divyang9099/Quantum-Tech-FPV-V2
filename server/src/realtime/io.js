let io;
export const setIo = (i) => { io = i; };
export const emit = (rooms, event, payload = {}) => {
  if (!io) return;
  [].concat(rooms).forEach((r) => io.to(r).emit(event, payload));
};
