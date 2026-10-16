// Test runner only: fresh contexts, bounded resources and synthetic JSON input.
// QuickJS/Boa versions match the independently pinned client-source review.
use std::io::{self, BufRead, Write};
use std::time::{Duration, Instant};

fn quickjs(code: &str) -> Result<String, String> {
    let rt = rquickjs::Runtime::new().map_err(|e| e.to_string())?;
    rt.set_memory_limit(256 * 1024 * 1024);
    let deadline = Instant::now() + Duration::from_secs(5);
    rt.set_interrupt_handler(Some(Box::new(move || Instant::now() >= deadline)));
    let ctx = rquickjs::Context::full(&rt).map_err(|e| e.to_string())?;
    ctx.with(|c| c.eval::<String, _>(code.as_bytes()).map_err(|e| e.to_string()))
}

fn boa(code: &str) -> Result<String, String> {
    let mut c = boa_engine::Context::default();
    c.runtime_limits_mut().set_loop_iteration_limit(10_000_000);
    c.eval(boa_engine::Source::from_bytes(code))
        .map_err(|e| e.to_string())?
        .to_string(&mut c)
        .map_err(|e| e.to_string())?
        .to_std_string()
        .map_err(|e| e.to_string())
}

fn main() {
    let engine = std::env::args().nth(1).unwrap_or_else(|| "quickjs".to_owned());
    for line in io::stdin().lock().lines() {
        let output = match line {
            Ok(raw) => match serde_json::from_str::<serde_json::Value>(&raw) {
                Ok(value) => match value.get("code").and_then(|v| v.as_str()) {
                    Some(code) if code.len() <= 16 * 1024 * 1024 => {
                        let result = match engine.as_str() {
                            "quickjs" => quickjs(code),
                            "boa" => boa(code),
                            _ => Err("unsupported engine".to_owned()),
                        };
                        match result {
                            Ok(result) => serde_json::json!({"ok":true,"result":result}),
                            Err(error) => serde_json::json!({"ok":false,"error":error}),
                        }
                    }
                    _ => serde_json::json!({"ok":false,"error":"missing or oversized code"}),
                },
                Err(_) => serde_json::json!({"ok":false,"error":"invalid JSON"}),
            },
            Err(_) => break,
        };
        println!("{}", output);
        io::stdout().flush().unwrap();
    }
}
