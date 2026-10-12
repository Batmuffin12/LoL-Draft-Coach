import { describe, expect, it } from "vitest";
import { StatePusher } from "../src/main/state-pusher";

/** A pusher whose "next turn" runs when the test says so. */
function setup() {
  const sent: { n: number }[] = [];
  const queue: (() => void)[] = [];
  const pusher = new StatePusher<{ n: number }>((s) => sent.push(s), (fn) => queue.push(fn));
  const nextTurn = () => queue.splice(0).forEach((fn) => fn());
  return { sent, pusher, nextTurn, queue };
}

describe("StatePusher", () => {
  it("sends only the last state of an event-loop turn", () => {
    const { sent, pusher, nextTurn, queue } = setup();
    pusher.push({ n: 1 });
    pusher.push({ n: 2 });
    pusher.push({ n: 3 });
    expect(sent).toEqual([]);
    expect(queue).toHaveLength(1);
    nextTurn();
    expect(sent).toEqual([{ n: 3 }]);
  });

  it("skips a state equal to the last one sent, and sends the next change", () => {
    const { sent, pusher, nextTurn } = setup();
    pusher.push({ n: 1 });
    nextTurn();
    pusher.push({ n: 1 });
    nextTurn();
    expect(sent).toEqual([{ n: 1 }]);
    pusher.push({ n: 2 });
    nextTurn();
    pusher.push({ n: 1 });
    nextTurn();
    expect(sent).toEqual([{ n: 1 }, { n: 2 }, { n: 1 }]);
  });

  it("resends on request (a reloaded renderer) even when unchanged, and drops what was pending", () => {
    const { sent, pusher, nextTurn } = setup();
    pusher.push({ n: 1 });
    nextTurn();
    pusher.push({ n: 2 });
    pusher.resend({ n: 1 });
    nextTurn();
    expect(sent).toEqual([{ n: 1 }, { n: 1 }]);
    // The resent state counts as the last one sent.
    pusher.push({ n: 1 });
    nextTurn();
    expect(sent).toHaveLength(2);
  });

  it("schedules again after each turn", () => {
    const { sent, pusher, nextTurn, queue } = setup();
    pusher.push({ n: 1 });
    nextTurn();
    pusher.push({ n: 2 });
    expect(queue).toHaveLength(1);
    nextTurn();
    expect(sent).toEqual([{ n: 1 }, { n: 2 }]);
  });
});
