/**
 * Generic fixed-growth object pool. `acquire()` reuses a released instance
 * instead of allocating, so steady-state gameplay (bullets/particles firing
 * every frame during a firefight) does not trigger GC pressure (C4).
 */
export class ObjectPool<T> {
  private free: T[] = [];
  private inUse = new Set<T>();
  private factory: () => T;
  private reset: (item: T) => void;

  constructor(factory: () => T, reset: (item: T) => void, initialSize = 0) {
    this.factory = factory;
    this.reset = reset;
    for (let i = 0; i < initialSize; i++) {
      this.free.push(this.factory());
    }
  }

  acquire(): T {
    const item = this.free.pop() ?? this.factory();
    this.inUse.add(item);
    return item;
  }

  release(item: T): void {
    if (!this.inUse.delete(item)) return;
    this.reset(item);
    this.free.push(item);
  }

  get activeCount(): number {
    return this.inUse.size;
  }

  get pooledCount(): number {
    return this.free.length + this.inUse.size;
  }

  /** Every item ever created by this pool, free or in use — for one-time scene-graph mounting. */
  all(): T[] {
    return [...this.free, ...this.inUse];
  }
}
