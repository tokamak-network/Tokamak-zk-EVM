#[path = "../../../common/contracts/rust/backend_build_metadata.rs"]
pub mod backend_build_metadata;
pub mod cli;
#[path = "../../../../../versioning/compatibility.rs"]
pub mod compatibility;
pub mod crs_artifacts;
pub mod crs_provenance;
pub mod crs_publication_admission;
pub mod errors;
pub mod field_structures;
pub mod frontend_artifacts;
pub mod group_structures;
#[path = "../../../common/contracts/rust/input_origin.rs"]
pub mod input_origin;
mod input_origin_serde;
pub mod ntt_domain;
pub mod r1cs;
pub mod subcircuit_library;
#[path = "../../../common/contracts/rust/subcircuit_source_digest.rs"]
pub mod subcircuit_source_digest;
pub mod univariate_crs;
pub mod univariate_field;
pub mod univariate_polynomial;
pub mod univariate_proof;
pub mod univariate_relation;
pub mod univariate_setup;
pub mod univariate_transcript;
pub mod utils;
pub mod vector_operations;

#[cfg(feature = "timing")]
pub mod timing {
    use std::sync::{Mutex, OnceLock};
    use std::time::{Duration, Instant};

    use serde::Serialize;

    #[derive(Clone, Debug, Serialize)]
    pub struct SizeInfo {
        pub label: &'static str,
        pub dims: Vec<usize>,
    }

    #[derive(Clone, Debug, Serialize)]
    pub struct TimingEvent {
        pub name: String,
        pub category: String,
        pub nanos: u128,
        pub sizes: Vec<SizeInfo>,
    }

    #[derive(Default)]
    struct TimingCollector {
        events: Vec<TimingEvent>,
    }

    static COLLECTOR: OnceLock<Mutex<TimingCollector>> = OnceLock::new();

    fn collector() -> &'static Mutex<TimingCollector> {
        COLLECTOR.get_or_init(|| Mutex::new(TimingCollector::default()))
    }

    pub fn reset() {
        if let Ok(mut guard) = collector().lock() {
            guard.events.clear();
        }
    }

    pub fn record(
        name: &'static str,
        category: &'static str,
        duration: Duration,
        sizes: Vec<SizeInfo>,
    ) {
        record_string(name.to_string(), category.to_string(), duration, sizes);
    }

    fn record_string(name: String, category: String, duration: Duration, sizes: Vec<SizeInfo>) {
        if let Ok(mut guard) = collector().lock() {
            guard.events.push(TimingEvent {
                name,
                category,
                nanos: duration.as_nanos(),
                sizes,
            });
        }
    }

    pub fn take_events() -> Vec<TimingEvent> {
        if let Ok(mut guard) = collector().lock() {
            return std::mem::take(&mut guard.events);
        }
        Vec::new()
    }

    pub struct SpanGuard {
        name: &'static str,
        category: &'static str,
        start: Instant,
        sizes: Vec<SizeInfo>,
    }

    impl SpanGuard {
        pub fn new(name: &'static str, category: &'static str, sizes: Vec<SizeInfo>) -> Self {
            Self {
                name,
                category,
                start: Instant::now(),
                sizes,
            }
        }
    }

    impl Drop for SpanGuard {
        fn drop(&mut self) {
            let sizes = std::mem::take(&mut self.sizes);
            record(self.name, self.category, self.start.elapsed(), sizes);
        }
    }
}
