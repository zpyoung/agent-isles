// scripts/dev/debounce.mjs
// Coalesces rapid calls into a single trailing call that receives all accumulated args.

export function createDebouncer(fn, ms, timers = globalThis) {
  let handle = null;
  let batch = [];
  return (arg) => {
    batch.push(arg);
    if (handle !== null) timers.clearTimeout(handle);
    handle = timers.setTimeout(() => {
      const current = batch;
      batch = [];
      handle = null;
      fn(current);
    }, ms);
  };
}
