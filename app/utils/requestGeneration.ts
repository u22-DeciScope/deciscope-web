export class RequestGeneration {
  private current = 0;

  begin() {
    this.current += 1;
    return this.current;
  }

  invalidate() {
    this.current += 1;
  }

  isCurrent(generation: number) {
    return generation === this.current;
  }
}
