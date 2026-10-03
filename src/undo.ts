export interface UndoEntry {
  label: string;
  undo(): void;
}

/** Simple LIFO undo stack. */
export class UndoStack {
  private stack: UndoEntry[] = [];
  constructor(private limit = 100) {}
  push(entry: UndoEntry): void {
    this.stack.push(entry);
    if (this.stack.length > this.limit) this.stack.shift();
  }
  undo(): UndoEntry | null {
    const e = this.stack.pop();
    if (!e) return null;
    e.undo();
    return e;
  }
  get size(): number { return this.stack.length; }
}
