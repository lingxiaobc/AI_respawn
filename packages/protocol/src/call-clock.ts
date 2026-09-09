/** All deadlines use one monotonic clock on the gateway. */
export class CallClock {
  #started?: number;
  #idleSince?: number;
  activate(now: number) {
    if(this.#started===undefined){this.#started=now;this.#idleSince=now;}
  }
  listening(now:number){if(this.#started!==undefined)this.#idleSince=now;}
  busy(){this.#idleSince=undefined;}
  activity(now:number){if(this.#started!==undefined&&this.#idleSince!==undefined)this.#idleSince=now;}
  snapshot(now:number) {
    if(this.#started===undefined)return null;
    const maxRemaining=Math.max(0,Math.ceil((this.#started+900_000-now)/1000));
    const idleRemaining=this.#idleSince===undefined?130:Math.max(0,Math.ceil((this.#idleSince+130_000-now)/1000));
    return {elapsedSeconds:Math.max(0,Math.floor((now-this.#started)/1000)),maxRemaining,idleRemaining,
      ended:maxRemaining===0?"MAX_DURATION":idleRemaining===0?"IDLE_TIMEOUT":null};
  }
}
