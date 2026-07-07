/**
 * Shared registry contract (Sprint 4.1 refinement 18).
 *
 * All platform registries (attribution models, normalizers, plugins) follow
 * this exact surface so the codebase has one mental model for extension.
 */
export interface Registry<T> {
  register(key: string, value: T): void;
  unregister(key: string): void;
  get(key: string): T | undefined;
  list(): T[];
  clear(): void;
}

export class MapRegistry<T> implements Registry<T> {
  private readonly items = new Map<string, T>();

  register(key: string, value: T): void {
    this.items.set(key, value);
  }

  unregister(key: string): void {
    this.items.delete(key);
  }

  get(key: string): T | undefined {
    return this.items.get(key);
  }

  list(): T[] {
    return Array.from(this.items.values());
  }

  clear(): void {
    this.items.clear();
  }
}
