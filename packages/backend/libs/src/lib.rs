#![allow(non_snake_case)]
pub mod bivariate_polynomial;
pub mod field_structures;
pub mod group_structures;
pub mod iotools;
pub mod polynomial_structures;
pub mod subcircuit_library;
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
        pub name: &'static str,
        pub category: &'static str,
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

#[cfg(test)]
mod tests;
