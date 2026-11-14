/** The tools each running turn has called, kept until the turn is recorded. Only successful, distinct calls. */
export class TurnToolLog {
  private readonly tools = new Map<string, string[]>();

  add(turnId: string, tool: string): void {
    const list = this.tools.get(turnId) ?? [];
    if (!list.includes(tool)) list.push(tool);
    this.tools.set(turnId, list);
  }

  take(turnId: string): string[] {
    const list = this.tools.get(turnId) ?? [];
    this.tools.delete(turnId);
    return list;
  }
}
