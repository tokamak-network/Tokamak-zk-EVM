fn main() -> std::process::ExitCode {
    let result = {
        #[cfg(feature = "timing")]
        let _command = libs::timing::SpanGuard::new("mpc.command", "mpc", vec![]);
        mpc_setup::run()
    };
    #[cfg(feature = "timing")]
    for event in libs::timing::take_events() {
        eprintln!(
            "[mpc-timing] {}",
            serde_json::to_string(&event).expect("timing event")
        );
    }
    match result {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("MPC failed: {error}");
            std::process::ExitCode::FAILURE
        }
    }
}
