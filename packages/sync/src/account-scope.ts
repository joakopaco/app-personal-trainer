export class AccountLifetime {
  private generation = 0;
  private alive = false;
  begin() {
    const generation = ++this.generation;
    this.alive = true;
    return {
      active: () => this.alive && this.generation === generation,
      end: () => {
        if (this.generation === generation) this.alive = false;
      },
    };
  }
  stop() {
    this.alive = false;
    this.generation++;
  }
  capture() {
    const generation = this.generation;
    return () => this.alive && this.generation === generation;
  }
}
