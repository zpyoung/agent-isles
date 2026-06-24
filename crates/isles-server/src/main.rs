//! `isles-server <file|dir> [--port N] [--host H] [--url-host H]`
//!
//! Serves the Agent Isles Markdown reader for a file or folder. This is the
//! standalone/browser entrypoint and the binary the Tauri shell launches as a
//! sidecar.

use std::process::ExitCode;

use isles_server::{resolve_source, serve, ServeConfig};

#[tokio::main]
async fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let parsed = match parse_args(&args) {
        Ok(p) => p,
        Err(msg) => {
            eprintln!("{msg}\n");
            eprintln!("{USAGE}");
            return ExitCode::from(2);
        }
    };
    if parsed.help {
        println!("{USAGE}");
        return ExitCode::SUCCESS;
    }

    let source = match resolve_source(&parsed.path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("isles-server: {e}");
            return ExitCode::FAILURE;
        }
    };

    let config = ServeConfig {
        source,
        host: parsed.host,
        port: parsed.port,
        url_host: parsed.url_host,
    };
    match serve(config).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("isles-server: {e}");
            ExitCode::FAILURE
        }
    }
}

const USAGE: &str = "Agent Isles reader server.

Usage:
  isles-server <file.md|dir> [--port <port>] [--host <host>] [--url-host <host>]

Options:
  --port <port>       Port to bind (default: 0 = ephemeral)
  --host <host>       Host/interface to bind (default: 127.0.0.1)
  --url-host <host>   Hostname to show in the printed URL
  -h, --help          Show this help";

struct Parsed {
    path: String,
    port: u16,
    host: String,
    url_host: Option<String>,
    help: bool,
}

fn parse_args(args: &[String]) -> Result<Parsed, String> {
    let mut path: Option<String> = None;
    let mut port: u16 = 0;
    let mut host = "127.0.0.1".to_string();
    let mut url_host: Option<String> = None;
    let mut help = false;

    let mut i = 0;
    while i < args.len() {
        let a = &args[i];
        let mut value = |name: &str| -> Result<String, String> {
            let v = args.get(i + 1).cloned();
            match v {
                Some(v) if !v.starts_with('-') => {
                    i += 1;
                    Ok(v)
                }
                _ => Err(format!("{name} requires a value")),
            }
        };
        match a.as_str() {
            "-h" | "--help" => help = true,
            "--port" => {
                let v = value("--port")?;
                port = v
                    .parse()
                    .map_err(|_| "--port must be an integer 0-65535".to_string())?;
            }
            "--host" => host = value("--host")?,
            "--url-host" => url_host = Some(value("--url-host")?),
            other if other.starts_with('-') => return Err(format!("Unknown option: {other}")),
            other => {
                if path.is_some() {
                    return Err(format!("Unexpected extra argument: {other}"));
                }
                path = Some(other.to_string());
            }
        }
        i += 1;
    }

    if !help && path.is_none() {
        return Err("Missing <file.md|dir>".to_string());
    }
    Ok(Parsed {
        path: path.unwrap_or_default(),
        port,
        host,
        url_host,
        help,
    })
}
