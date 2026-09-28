#[cfg(feature = "timing")]
use std::collections::BTreeMap;
#[cfg(feature = "timing")]
use std::env;
#[cfg(feature = "timing")]
use std::fs;
#[cfg(feature = "timing")]
use std::path::PathBuf;
#[cfg(feature = "timing")]
use std::time::{Instant, SystemTime, UNIX_EPOCH};

#[cfg(feature = "timing")]
use prove::{timing, univariate_cli, ProveInputPaths};

#[cfg(feature = "timing")]
#[derive(serde::Serialize)]
struct TimingReport {
    generated_at_unix_ms: u128,
    total_wall_ms: f64,
    // Parent spans include child spans; these sums are diagnostic, not additive.
    inclusive_category_ms: BTreeMap<String, f64>,
    events: Vec<timing::TimingEvent>,
}

#[cfg(feature = "timing")]
fn required_env(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .and_then(|value| (!value.trim().is_empty()).then_some(value))
}

#[cfg(feature = "timing")]
#[test]
fn timing_univariate_prove_stages() {
    let Some(qap_path) = required_env("PROVE_QAP_PATH") else {
        eprintln!("Skipping timing test: PROVE_QAP_PATH is not set.");
        return;
    };
    let synthesizer_path = required_env("PROVE_SYNTHESIZER_PATH")
        .expect("PROVE_SYNTHESIZER_PATH is required when PROVE_QAP_PATH is set");
    let tau_sequence_path = required_env("PROVE_TAU_SEQUENCE_PATH")
        .expect("PROVE_TAU_SEQUENCE_PATH is required when PROVE_QAP_PATH is set");
    let keys_path = required_env("PROVE_KEYS_PATH")
        .expect("PROVE_KEYS_PATH is required when PROVE_QAP_PATH is set");
    let output_path = required_env("PROVE_OUT_PATH").unwrap_or_else(|| "prove/output".to_string());
    let report_path = required_env("TIMING_OUT")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("prove/optimization/timing.release.json"));
    let paths = ProveInputPaths {
        qap_path: &qap_path,
        synthesizer_path: &synthesizer_path,
        tau_sequence_path: &tau_sequence_path,
        keys_path: &keys_path,
        output_path: &output_path,
    };

    timing::reset();
    let started = Instant::now();
    univariate_cli::prove(&paths, univariate_cli::ProverDevice::Cpu)
        .expect("univariate CPU timing run must produce a proof");
    let total_wall_ms = started.elapsed().as_secs_f64() * 1_000.0;
    let events = timing::take_events();
    let mut category_ms = BTreeMap::new();
    for event in &events {
        *category_ms.entry(event.category.clone()).or_insert(0.0) +=
            event.nanos as f64 / 1_000_000.0;
    }
    let report = TimingReport {
        generated_at_unix_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0),
        total_wall_ms,
        inclusive_category_ms: category_ms,
        events,
    };
    if let Some(parent) = report_path.parent() {
        fs::create_dir_all(parent).expect("timing report directory must be writable");
    }
    fs::write(
        &report_path,
        serde_json::to_vec_pretty(&report).expect("timing report must serialize"),
    )
    .expect("timing report must be writable");
    println!(
        "Wrote univariate release timing to {}",
        report_path.display()
    );
}

#[cfg(not(feature = "timing"))]
#[test]
fn timing_univariate_prove_stages_disabled() {
    eprintln!("timing feature is disabled; run with --features timing to collect metrics.");
}
