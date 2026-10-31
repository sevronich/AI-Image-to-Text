// Abort is cooperative; the version check also rejects late completions from
// non-cooperative decoders, fetches and model responses after a new selection.
export function createRequestSession() {
  let version = 0;
  let controller;
  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      const token = ++version;
      const currentController = controller;
      return { signal: controller.signal, isCurrent: () => token === version && !currentController.signal.aborted };
    },
    invalidate() { version++; controller?.abort(); },
  };
}
