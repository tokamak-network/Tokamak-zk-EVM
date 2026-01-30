use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use prove::{ProveInputPaths, Prover, TranscriptManager};

#[cfg(feature = "timing")]
use prove::timing;

#[cfg(feature = "timing")]
#[derive(serde::Serialize)]
struct StageSummary {
    total_ms: f64,
    poly_ms: f64,
    encode_ms: f64,
}

#[cfg(feature = "timing")]
#[derive(serde::Serialize)]
struct SetupParamsSummary {
    l: usize,
    l_user_out: usize,
    l_user: usize,
    l_block: usize,
    l_D: usize,
    m_D: usize,
    n: usize,
    s_D: usize,
    s_max: usize,
}

#[cfg(feature = "timing")]
#[derive(serde::Serialize)]
struct TimingReport {
    generated_at_unix_ms: u128,
    total_wall_ms: f64,
    setup_params: SetupParamsSummary,
    summary: BTreeMap<String, StageSummary>,
    events: Vec<timing::TimingEvent>,
}

fn read_env(name: &str) -> Option<String> {
    env::var(name).ok().and_then(|v| {
        if v.trim().is_empty() {
            None
        } else {
            Some(v)
        }
    })
}

#[cfg(feature = "timing")]
#[test]
fn timing_prove_stages() {
    let qap_path = match read_env("PROVE_QAP_PATH") {
        Some(v) => v,
        None => {
            eprintln!("Skipping timing test: PROVE_QAP_PATH is not set.");
            return;
        }
    };
    let synthesizer_path = match read_env("PROVE_SYNTHESIZER_PATH") {
        Some(v) => v,
        None => {
            eprintln!("Skipping timing test: PROVE_SYNTHESIZER_PATH is not set.");
            return;
        }
    };
    let setup_path = match read_env("PROVE_SETUP_PATH") {
        Some(v) => v,
        None => {
            eprintln!("Skipping timing test: PROVE_SETUP_PATH is not set.");
            return;
        }
    };
    let output_path = read_env("PROVE_OUT_PATH").unwrap_or_else(|| "prove/output".to_string());

    let output_dir = PathBuf::from(&output_path);
    if let Err(err) = fs::create_dir_all(&output_dir) {
        eprintln!("Failed to create output dir {output_path}: {err}");
    }

    let paths = ProveInputPaths {
        qap_path: &qap_path,
        synthesizer_path: &synthesizer_path,
        setup_path: &setup_path,
        output_path: &output_path,
    };

    timing::reset();
    let wall_start = Instant::now();

    let (mut prover, _binding) = Prover::init(&paths);
    let setup_params = SetupParamsSummary {
        l: prover.setup_params.l,
        l_user_out: prover.setup_params.l_user_out,
        l_user: prover.setup_params.l_user,
        l_block: prover.setup_params.l_block,
        l_D: prover.setup_params.l_D,
        m_D: prover.setup_params.m_D,
        n: prover.setup_params.n,
        s_D: prover.setup_params.s_D,
        s_max: prover.setup_params.s_max,
    };
    let mut manager = TranscriptManager::new();

    let proof0 = prover.prove0();
    let thetas = proof0.verify0_with_manager(&mut manager);

    let proof1 = prover.prove1(&thetas);
    let kappa0 = proof1.verify1_with_manager(&mut manager);

    let proof2 = prover.prove2(&thetas, kappa0);
    let (chi, zeta) = proof2.verify2_with_manager(&mut manager);

    let proof3 = prover.prove3(chi, zeta);
    let kappa1 = proof3.verify3_with_manager(&mut manager);

    let (_proof4, _proof4_test) = prover.prove4(&proof3, &thetas, kappa0, chi, zeta, kappa1);

    let total_wall_ms = wall_start.elapsed().as_secs_f64() * 1000.0;
    let events = timing::take_events();

    let mut summary: BTreeMap<String, StageSummary> = BTreeMap::new();
    for event in &events {
        let mut stage = None;
        for part in event.name.split('.') {
            if part.starts_with("prove") {
                stage = Some(part.to_string());
                break;
            }
        }
        let stage = stage.unwrap_or_else(|| {
            event
                .name
                .split('.')
                .next()
                .unwrap_or(event.name)
                .to_string()
        });
        let entry = summary.entry(stage).or_insert(StageSummary {
            total_ms: 0.0,
            poly_ms: 0.0,
            encode_ms: 0.0,
        });
        let ms = event.nanos as f64 / 1_000_000.0;
        match event.category {
            "poly" => entry.poly_ms += ms,
            "encode" => entry.encode_ms += ms,
            _ => {}
        }
        if event.name.ends_with(".total") {
            entry.total_ms += ms;
        }
    }

    for entry in summary.values_mut() {
        if entry.total_ms == 0.0 {
            entry.total_ms = entry.poly_ms + entry.encode_ms;
        }
    }

    let generated_at_unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let report = TimingReport {
        generated_at_unix_ms,
        total_wall_ms,
        setup_params,
        summary,
        events,
    };

    let report_json = serde_json::to_string_pretty(&report).expect("failed to serialize timing report");
    if let Some(out_path) = read_env("TIMING_OUT") {
        if let Err(err) = fs::write(&out_path, report_json.as_bytes()) {
            eprintln!("Failed to write timing report to {out_path}: {err}");
        }
    } else {
        println!("{report_json}");
    }
}

#[cfg(not(feature = "timing"))]
#[test]
fn timing_prove_stages_disabled() {
    eprintln!("timing feature is disabled; run with --features timing to collect metrics.");
}
