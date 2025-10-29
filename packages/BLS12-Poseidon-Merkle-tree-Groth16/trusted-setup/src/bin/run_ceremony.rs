use tokamak_groth16_trusted_setup::{
    TrustedSetupCeremony, CeremonyConfig, TrustedSetupError,
};
use std::env;
use std::process;

fn main() {
    println!("🎭 Tokamak Groth16 Trusted Setup Ceremony");
    println!("==========================================");
    
    // Parse command line arguments
    let args: Vec<String> = env::args().collect();
    let config = parse_args(&args).unwrap_or_else(|err| {
        eprintln!("Error parsing arguments: {}", err);
        print_usage(&args[0]);
        process::exit(1);
    });
    
    // Run the ceremony
    match run_ceremony_with_config(config) {
        Ok(()) => {
            println!("\n🎉 Ceremony completed successfully!");
            process::exit(0);
        }
        Err(e) => {
            eprintln!("\n❌ Ceremony failed: {}", e);
            process::exit(1);
        }
    }
}

fn parse_args(args: &[String]) -> Result<CeremonyConfig, String> {
    let mut config = CeremonyConfig::default();
    let mut i = 1;
    
    while i < args.len() {
        match args[i].as_str() {
            "--name" | "-n" => {
                if i + 1 >= args.len() {
                    return Err("Missing value for --name".to_string());
                }
                config.ceremony_name = args[i + 1].clone();
                i += 2;
            }
            "--circuit" | "-c" => {
                if i + 1 >= args.len() {
                    return Err("Missing value for --circuit".to_string());
                }
                config.circuit_name = args[i + 1].clone();
                i += 2;
            }
            "--constraints" => {
                if i + 1 >= args.len() {
                    return Err("Missing value for --constraints".to_string());
                }
                config.expected_constraints = args[i + 1].parse()
                    .map_err(|_| "Invalid constraints value".to_string())?;
                i += 2;
            }
            "--output" | "-o" => {
                if i + 1 >= args.len() {
                    return Err("Missing value for --output".to_string());
                }
                config.output_directory = args[i + 1].clone();
                i += 2;
            }
            "--no-validate" => {
                config.validate_outputs = false;
                i += 1;
            }
            "--no-intermediate" => {
                config.save_intermediate = false;
                i += 1;
            }
            "--help" | "-h" => {
                print_usage(&args[0]);
                process::exit(0);
            }
            _ => {
                return Err(format!("Unknown argument: {}", args[i]));
            }
        }
    }
    
    Ok(config)
}

fn print_usage(program_name: &str) {
    println!("Usage: {} [OPTIONS]", program_name);
    println!();
    println!("Options:");
    println!("  -n, --name <NAME>         Ceremony name (default: tokamak-trusted-setup)");
    println!("  -c, --circuit <NAME>      Circuit name (default: TokamakStorageMerkleProofOptimized)");
    println!("      --constraints <NUM>   Expected number of constraints (default: 66735)");
    println!("  -o, --output <DIR>        Output directory (default: ./ceremony_output)");
    println!("      --no-validate         Skip validation phase");
    println!("      --no-intermediate     Don't save intermediate files");
    println!("  -h, --help                Show this help message");
    println!();
    println!("Examples:");
    println!("  {}                                    # Run with defaults", program_name);
    println!("  {} --name my-ceremony --output ./keys  # Custom name and output", program_name);
    println!("  {} --constraints 100000 --no-validate  # Large circuit, skip validation", program_name);
}

fn run_ceremony_with_config(config: CeremonyConfig) -> Result<(), TrustedSetupError> {
    println!("🔧 Configuration:");
    println!("   Ceremony name: {}", config.ceremony_name);
    println!("   Circuit name: {}", config.circuit_name);
    println!("   Expected constraints: {}", config.expected_constraints);
    println!("   Output directory: {}", config.output_directory);
    println!("   Validate outputs: {}", config.validate_outputs);
    println!("   Save intermediate: {}", config.save_intermediate);
    println!();
    
    // Create ceremony
    let ceremony = TrustedSetupCeremony::with_config(config);
    
    // Run ceremony
    let result = ceremony.run_ceremony()?;
    
    // Print results
    println!("\n{}", result);
    
    // Print file locations
    println!("📁 Generated files:");
    println!("   Proving key: {}/proving_key.bin", result.ceremony_info.ceremony_name);
    println!("   Verification key: {}/verification_key.bin", result.ceremony_info.ceremony_name);
    println!("   Ceremony info: {}/ceremony_info.json", result.ceremony_info.ceremony_name);
    
    if result.validation_report.failed_checks.is_empty() {
        println!("\n✅ All validation checks passed. Setup is ready for production use.");
    } else {
        println!("\n⚠️  Some validation checks failed. Review before production use:");
        for check in &result.validation_report.failed_checks {
            println!("   - {}", check);
        }
    }
    
    Ok(())
}