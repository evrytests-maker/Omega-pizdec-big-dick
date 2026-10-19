// Two leaderboards from one submission: omega-pizdec (lore-scaled volume) and base (realistic).
export const BOARDS = ['omega-pizdec', 'base'];
export const DEFAULT_BOARD = 'omega-pizdec';

export const boardOf = (v) => (BOARDS.includes(v) ? v : DEFAULT_BOARD);
export const zkey = (board) => `lb:${board}`;
export const totalKey = (board) => `stats:${board}`;
