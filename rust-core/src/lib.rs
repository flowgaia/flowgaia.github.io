pub mod controller;
pub mod model;
pub mod queue;
pub mod search;
pub mod shuffle;

use std::cell::RefCell;

use wasm_bindgen::prelude::*;

use controller::{Command, Controller};

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/// Called automatically when the WASM module is instantiated.
///
/// Installs a panic hook that forwards Rust panics to the browser console as
/// readable error messages instead of opaque `unreachable executed` traps.
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

// ---------------------------------------------------------------------------
// Singleton controller
// ---------------------------------------------------------------------------

thread_local! {
    static CONTROLLER: RefCell<Controller> = RefCell::new(Controller::new());
}

// ---------------------------------------------------------------------------
// Public WASM API
// ---------------------------------------------------------------------------

/// Dispatch a JSON-encoded `Command` and return a JSON-encoded array of
/// `Event`s.
///
/// # Example (JavaScript)
/// ```js
/// const events = JSON.parse(dispatch(JSON.stringify({ type: "Play" })));
/// ```
///
/// On parse or serialisation failure the function still returns a valid JSON
/// array containing a single `Error` event rather than throwing.
#[wasm_bindgen]
pub fn dispatch(command_json: &str) -> String {
    let result = (|| -> Result<String, String> {
        let cmd: Command =
            serde_json::from_str(command_json).map_err(|e| format!("Parse error: {}", e))?;
        let events = CONTROLLER.with(|c| c.borrow_mut().dispatch(cmd));
        serde_json::to_string(&events).map_err(|e| format!("Serialize error: {}", e))
    })();

    match result {
        Ok(json) => json,
        Err(e) => {
            // Escape the error message for safe embedding in JSON.
            let escaped = e.replace('\\', "\\\\").replace('"', "\\\"");
            format!("[{{\"type\":\"Error\",\"payload\":\"{}\"}}]", escaped)
        }
    }
}

/// Return the full `PlayerState` serialised as JSON.
///
/// Useful for debugging or for an initial state snapshot when rehydrating a UI
/// after a hot-reload.
#[wasm_bindgen]
pub fn get_state() -> String {
    CONTROLLER.with(|c| serde_json::to_string(&c.borrow().state).unwrap_or_else(|_| "{}".into()))
}

/// Smoke-test export.  Returns a greeting string so the embedding page can
/// verify the WASM module loaded correctly.
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Music Core WASM is ready.", name)
}
