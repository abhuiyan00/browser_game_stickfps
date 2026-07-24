import { describe, expect, it, vi } from "vitest";
import { ObjectPool } from "./ObjectPool";

describe("ObjectPool", () => {
  it("only calls the factory once per item across an acquire/release/acquire cycle", () => {
    const factory = vi.fn(() => ({ id: Math.random() }));
    const pool = new ObjectPool(factory, () => {});

    const a = pool.acquire();
    pool.release(a);
    const b = pool.acquire();

    expect(b).toBe(a);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("allocates a new item only when the pool has none free", () => {
    const factory = vi.fn(() => ({}));
    const pool = new ObjectPool(factory, () => {});

    pool.acquire();
    pool.acquire();

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("calls the reset function on release, before the item can be reacquired", () => {
    const reset = vi.fn();
    const pool = new ObjectPool(() => ({ visible: true }), reset);

    const item = pool.acquire();
    pool.release(item);

    expect(reset).toHaveBeenCalledWith(item);
  });

  it("ignores releasing an item that isn't currently in use", () => {
    const reset = vi.fn();
    const pool = new ObjectPool(() => ({}), reset);
    const stray = {};

    expect(() => pool.release(stray)).not.toThrow();
    expect(reset).not.toHaveBeenCalled();
  });

  it("pre-warms the pool to the requested initial size without using acquire", () => {
    const factory = vi.fn(() => ({}));
    const pool = new ObjectPool(factory, () => {}, 5);

    expect(factory).toHaveBeenCalledTimes(5);
    expect(pool.pooledCount).toBe(5);
    expect(pool.activeCount).toBe(0);
  });

  it("all() returns every item regardless of free/in-use state", () => {
    const pool = new ObjectPool(() => ({}), () => {}, 3);
    const acquired = pool.acquire();
    expect(pool.all()).toHaveLength(3);
    expect(pool.all()).toContain(acquired);
  });
});
