//! The native shell. Deliberately small: the agent itself runs in the
//! window (src/agent), and this file only does what a web page cannot do
//! safely: keep keys in the operating system's keychain, and put an
//! always-visible off switch in the system tray.

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

const SERVICE: &str = "app.nosprhite";

/// Only these names can be stored or read. The window cannot use this to
/// reach any other entry in the keychain.
const ALLOWED: [&str; 2] = ["github_token", "stripe_key"];

fn entry(name: &str) -> Result<keyring::Entry, String> {
    if !ALLOWED.contains(&name) {
        return Err(format!("{name} is not a key this app stores"));
    }
    keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_set(name: String, value: String) -> Result<(), String> {
    entry(&name)?.set_password(value.trim()).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_get(name: String) -> Result<Option<String>, String> {
    match entry(&name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn secret_delete(name: String) -> Result<(), String> {
    match entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// The window tells the tray whether the agent is running, so the tray
/// always shows the true state and offers the opposite action.
#[tauri::command]
fn tray_state(app: AppHandle, running: bool) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main") {
        let tip = if running { "Nosprhite: working" } else { "Nosprhite: off" };
        tray.set_tooltip(Some(tip)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![secret_set, secret_get, secret_delete, tray_state])
        .setup(|app| {
            let stop = MenuItem::with_id(app, "stop", "Stop the agent", true, None::<&str>)?;
            let start = MenuItem::with_id(app, "start", "Start the agent", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Open the village", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&stop, &start, &show, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("Nosprhite: off")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    // Stop is handled in the window, which aborts any request in flight.
                    "stop" => {
                        let _ = app.emit("tray-agent", "stop");
                    }
                    "start" => {
                        let _ = app.emit("tray-agent", "start");
                    }
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Nosprhite");
}
