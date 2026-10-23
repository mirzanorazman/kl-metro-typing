import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Metrics } from '../engine/metrics';
import { LEADERBOARD_LIMIT } from '../engine/leaderboard';
import {
  DISPATCH_BOARD_KEY,
  dispatchQualifies,
  loadDispatchBoard,
  saveDispatchBoard,
  submitDispatchEntry,
  type DispatchBoard,
  type DispatchEntry,
} from './dispatchBoardStore';

const metrics = (score: number): Metrics => ({ wpm: score, accuracy: 1, score });
const empty = (): DispatchBoard => ({ version: 1, entries: [] });
const entry = (score: number, playedAt: number, id = `e${score}-${playedAt}`): DispatchEntry => ({
  id, name: 'A', score, delivered: 10, shifts: 2, wpm: score, accuracy: 1, playedAt,
});
const submit = (board: DispatchBoard, score: number, playedAt: number, name = 'Ana', verified = false) =>
  submitDispatchEntry(board, { name, score, delivered: 5, shifts: 1, metrics: metrics(score), playedAt, verified });

beforeEach(() => localStorage.clear());

describe('loadDispatchBoard / saveDispatchBoard', () => {
  it('loads empty when nothing is stored', () => {
    expect(loadDispatchBoard()).toEqual(empty());
  });

  it('round-trips through localStorage', () => {
    const board: DispatchBoard = { version: 1, entries: [entry(50, 1)] };
    saveDispatchBoard(board);
    expect(loadDispatchBoard()).toEqual(board);
  });

  it.each([
    ['not json', '{nope'],
    ['a string', '"hello"'],
    ['null', 'null'],
    ['unknown version', JSON.stringify({ version: 2, entries: [entry(1, 1)] })],
    ['entries not an array', JSON.stringify({ version: 1, entries: {} })],
  ])('loads empty from garbage: %s', (_label, raw) => {
    localStorage.setItem(DISPATCH_BOARD_KEY, raw);
    expect(loadDispatchBoard()).toEqual(empty());
  });

  it('loads empty when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(loadDispatchBoard()).toEqual(empty());
    spy.mockRestore();
  });

  it('does not throw when storage is full', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => saveDispatchBoard(empty())).not.toThrow();
    spy.mockRestore();
  });
});

describe('submitDispatchEntry', () => {
  it('sorts by score descending and returns the 1-indexed rank', () => {
    let board = submit(empty(), 30, 1).board;
    board = submit(board, 50, 2).board;
    const res = submit(board, 40, 3);
    expect(res.board.entries.map((e) => e.score)).toEqual([50, 40, 30]);
    expect(res.rank).toBe(2);
  });

  it('breaks ties toward the earlier playedAt', () => {
    const board = submit(empty(), 40, 100).board;
    const res = submit(board, 40, 200);
    expect(res.rank).toBe(2);
    expect(res.board.entries.map((e) => e.playedAt)).toEqual([100, 200]);
  });

  it('trims the name, copies metrics and saves', () => {
    const res = submit(empty(), 40, 1, '  Ana  ', true);
    const [e] = res.board.entries;
    expect(e!.name).toBe('Ana');
    expect(e).toMatchObject({ score: 40, delivered: 5, shifts: 1, wpm: 40, accuracy: 1, playedAt: 1, verified: true });
    expect(loadDispatchBoard()).toEqual(res.board);
  });

  it('leaves verified off unverified entries', () => {
    const [e] = submit(empty(), 40, 1).board.entries;
    expect('verified' in e!).toBe(false);
  });

  it('caps the board at LEADERBOARD_LIMIT and reports null rank when pushed off', () => {
    let board = empty();
    for (let i = 1; i <= LEADERBOARD_LIMIT; i++) board = submit(board, 100 + i, i).board;
    const res = submit(board, 1, 999);
    expect(res.board.entries).toHaveLength(LEADERBOARD_LIMIT);
    expect(res.rank).toBeNull();
    const top = submit(board, 500, 1000);
    expect(top.board.entries).toHaveLength(LEADERBOARD_LIMIT);
    expect(top.rank).toBe(1);
  });

  it('does not mutate the board passed in', () => {
    const board = empty();
    submit(board, 40, 1);
    expect(board.entries).toEqual([]);
  });
});

describe('dispatchQualifies', () => {
  it('is true while the board is not full', () => {
    expect(dispatchQualifies(empty(), 0)).toBe(true);
  });

  it('when full, is true only above the cutoff', () => {
    const entries = Array.from({ length: LEADERBOARD_LIMIT }, (_, i) => entry(100 - i, i));
    const board: DispatchBoard = { version: 1, entries };
    const cutoff = entries[LEADERBOARD_LIMIT - 1]!.score;
    expect(dispatchQualifies(board, cutoff)).toBe(false);
    expect(dispatchQualifies(board, cutoff + 1)).toBe(true);
  });
});
