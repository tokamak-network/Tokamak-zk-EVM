use tokamak_groth16_trusted_setup::{ProvingKey, VerificationKey};
use std::env;
use std::process;

fn main() {
    let args: Vec<String> = env::args().collect();
    
    if args.len() < 2 {
        print_usage(&args[0]);
        process::exit(1);
    }
    
    let command = &args[1];
    match command.as_str() {
        "proving-key" => {
            if args.len() != 4 {
                println!("Usage: {} proving-key <input.bin> <output.json>", args[0]);
                process::exit(1);
            }
            convert_proving_key(&args[2], &args[3]);
        }
        "verification-key" => {
            if args.len() != 4 {
                println!("Usage: {} verification-key <input.bin> <output.json>", args[0]);
                process::exit(1);
            }
            convert_verification_key(&args[2], &args[3]);
        }
        "both" => {
            if args.len() != 3 {
                println!("Usage: {} both <ceremony_output_dir>", args[0]);
                process::exit(1);
            }
            convert_both(&args[2]);
        }
        _ => {
            print_usage(&args[0]);
            process::exit(1);
        }
    }
}

fn print_usage(program_name: &str) {
    println!("Binary to JSON Converter for Tokamak Trusted Setup");
    println!("Usage: {} <command> [args...]", program_name);
    println!();
    println!("Commands:");
    println!("  proving-key <input.bin> <output.json>    Convert proving key");
    println!("  verification-key <input.bin> <output.json>    Convert verification key");
    println!("  both <ceremony_output_dir>               Convert both keys in directory");
    println!();
    println!("Examples:");
    println!("  {} proving-key proving_key.bin proving_key.json", program_name);
    println!("  {} verification-key verification_key.bin verification_key.json", program_name);
    println!("  {} both ./ceremony_output", program_name);
}

fn convert_proving_key(input_path: &str, output_path: &str) {
    println!("📂 Converting proving key: {} -> {}", input_path, output_path);
    
    match ProvingKey::load_from_file(input_path) {
        Ok(proving_key) => {
            match proving_key.save_to_json(output_path) {
                Ok(()) => {
                    println!("✅ Proving key converted successfully!");
                    
                    // Print file sizes
                    if let Ok(input_metadata) = std::fs::metadata(input_path) {
                        if let Ok(output_metadata) = std::fs::metadata(output_path) {
                            println!("   Binary size: {} bytes", input_metadata.len());
                            println!("   JSON size: {} bytes", output_metadata.len());
                            let ratio = output_metadata.len() as f64 / input_metadata.len() as f64;
                            println!("   Size ratio: {:.2}x", ratio);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("❌ Failed to save JSON: {}", e);
                    process::exit(1);
                }
            }
        }
        Err(e) => {
            eprintln!("❌ Failed to load proving key: {}", e);
            process::exit(1);
        }
    }
}

fn convert_verification_key(input_path: &str, output_path: &str) {
    println!("📂 Converting verification key: {} -> {}", input_path, output_path);
    
    match VerificationKey::load_from_file(input_path) {
        Ok(verification_key) => {
            match verification_key.save_to_json(output_path) {
                Ok(()) => {
                    println!("✅ Verification key converted successfully!");
                    
                    // Print file sizes
                    if let Ok(input_metadata) = std::fs::metadata(input_path) {
                        if let Ok(output_metadata) = std::fs::metadata(output_path) {
                            println!("   Binary size: {} bytes", input_metadata.len());
                            println!("   JSON size: {} bytes", output_metadata.len());
                            let ratio = output_metadata.len() as f64 / input_metadata.len() as f64;
                            println!("   Size ratio: {:.2}x", ratio);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("❌ Failed to save JSON: {}", e);
                    process::exit(1);
                }
            }
        }
        Err(e) => {
            eprintln!("❌ Failed to load verification key: {}", e);
            process::exit(1);
        }
    }
}

fn convert_both(ceremony_dir: &str) {
    println!("🔄 Converting both keys in directory: {}", ceremony_dir);
    
    let proving_key_bin = format!("{}/proving_key.bin", ceremony_dir);
    let proving_key_json = format!("{}/proving_key.json", ceremony_dir);
    let verification_key_bin = format!("{}/verification_key.bin", ceremony_dir);
    let verification_key_json = format!("{}/verification_key.json", ceremony_dir);
    
    println!("\n1. Converting Proving Key:");
    convert_proving_key(&proving_key_bin, &proving_key_json);
    
    println!("\n2. Converting Verification Key:");
    convert_verification_key(&verification_key_bin, &verification_key_json);
    
    println!("\n🎉 Both keys converted successfully!");
    println!("📁 Output files:");
    println!("   {}", proving_key_json);
    println!("   {}", verification_key_json);
}