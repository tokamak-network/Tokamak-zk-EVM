
pub struct SetupInputPaths<'a> {
    pub qap_path: &'a str,
    pub output_path: &'a str,
    #[cfg(feature = "testing-mode")]
    pub synthesizer_path: &'a str,
}
