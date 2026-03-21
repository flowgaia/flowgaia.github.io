/**
 * event-bus.js
 *
 * Central event bus connecting the WASM MVC core to the UI.
 *
 * Flow:
 *   UI action  →  dispatchCommand(cmd)  →  wasmDispatch(json)  →  [events]  →  emitEvent()  →  UI handlers
 */

let _wasmDispatch = null;
const _listeners = {};

/** Called once after WASM is initialised to wire up the dispatch function. */
export function setWasmDispatch(fn) {
  _wasmDispatch = fn;
}

/**
 * Send a command object to the WASM core and broadcast all returned events.
 *
 * @param {{ type: string, payload?: unknown }} cmd
 */
export function dispatchCommand(cmd) {
  if (!_wasmDispatch) {
    console.warn('[event-bus] WASM not ready; command dropped:', cmd);
    return;
  }
  console.debug('[cmd] →', cmd.type, cmd.payload ?? '');
  try {
    const json = JSON.stringify(cmd);
    const eventsJson = _wasmDispatch(json);
    const events = JSON.parse(eventsJson);
    if (Array.isArray(events)) {
      events.forEach(emitEvent);
    }
  } catch (e) {
    console.error('[event-bus] dispatch error:', e, 'command:', cmd);
  }
}

/**
 * Register a handler for a specific event type (or '*' for all events).
 *
 * @param {string} type          - Event type string, or '*' for every event.
 * @param {Function} handler     - Called with event.payload (or whole event for '*').
 * @returns {Function}           - Unsubscribe function.
 */
export function onEvent(type, handler) {
  if (!_listeners[type]) _listeners[type] = [];
  _listeners[type].push(handler);
  return () => {
    _listeners[type] = _listeners[type].filter((h) => h !== handler);
  };
}

// ── Internal ─────────────────────────────────────────────────────────────────

/** Dispatch a single event object to all registered handlers. */
function emitEvent(event) {
  console.debug('[event] ←', event.type, event.payload ?? '');
  // Typed listeners receive payload
  const typed = _listeners[event.type] || [];
  typed.forEach((h) => {
    try {
      h(event.payload);
    } catch (e) {
      console.error('[event-bus] handler error for', event.type, e);
    }
  });

  // Wildcard listeners receive the whole event
  const wildcard = _listeners['*'] || [];
  wildcard.forEach((h) => {
    try {
      h(event);
    } catch (e) {
      console.error('[event-bus] wildcard handler error:', e);
    }
  });
}
