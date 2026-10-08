/**
 * AI 동시 실행 자리. 업무 실행기와 채용 대화·답장이 같은 자리를 나눠 쓴다.
 * 사람이 기다리는 요청(acquire)이 줄을 서 있으면 업무 실행기(tryAcquire)는 비켜 준다.
 */
export class AIGate {
  #active = 0;
  #queue: Array<() => void> = [];
  #capacity: () => number;

  constructor(capacity: () => number) {
    this.#capacity = capacity;
  }

  get active(): number {
    return this.#active;
  }
  get waiting(): number {
    return this.#queue.length;
  }

  /** 줄 없이 바로 자리가 있으면 잡는다(업무 실행기용) */
  tryAcquire(): (() => void) | null {
    if (this.#queue.length > 0 || this.#active >= this.#capacity()) return null;
    this.#active++;
    return this.#releaser();
  }

  /** 자리가 날 때까지 기다린다(사람이 기다리는 요청용) */
  acquire(): Promise<() => void> {
    if (this.#queue.length === 0 && this.#active < this.#capacity()) {
      this.#active++;
      return Promise.resolve(this.#releaser());
    }
    return new Promise((resolve) => {
      this.#queue.push(() => {
        this.#active++;
        resolve(this.#releaser());
      });
    });
  }

  #releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#active--;
      while (this.#queue.length > 0 && this.#active < this.#capacity()) this.#queue.shift()!();
    };
  }
}
