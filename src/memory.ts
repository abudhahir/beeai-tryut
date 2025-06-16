export interface MemoryEntry {
  timestamp: Date;
  role: 'user' | 'assistant';
  content: string;
}

export class SessionMemory {
  private entries: MemoryEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 100) {
    this.maxEntries = maxEntries;
  }

  addEntry(role: 'user' | 'assistant', content: string): void {
    const entry: MemoryEntry = {
      timestamp: new Date(),
      role,
      content
    };

    this.entries.push(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  getHistory(): MemoryEntry[] {
    return [...this.entries];
  }

  getContext(): string {
    return this.entries
      .map(entry => `${entry.role}: ${entry.content}`)
      .join('\n');
  }

  clear(): void {
    this.entries = [];
  }

  getLastEntries(count: number): MemoryEntry[] {
    return this.entries.slice(-count);
  }
}