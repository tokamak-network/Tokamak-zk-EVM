pub mod prove0_batch;
pub mod prove_init_batch;

/// Macro for linear combination of polynomials
#[macro_export]
macro_rules! poly_comb {
    (($c:expr, $p:expr), $(($rest_c:expr, $rest_p:expr)),+ $(,)?) => {{
        let mut acc = &$p * &$c;
        $(
            acc += &(&$rest_p * &$rest_c);
        )+
        acc
    }};
}
