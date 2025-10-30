use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::process;

/// Raw JSON format with byte arrays (current format)
#[derive(Debug, Clone, Deserialize)]
struct RawG1Point {
    x_bytes: Vec<u8>,
    y_bytes: Vec<u8>,
}

#[derive(Debug, Clone, Deserialize)]
struct RawG2Point {
    x_bytes: Vec<u8>,
    y_bytes: Vec<u8>,
}

#[derive(Debug, Clone, Deserialize)]
struct RawVerificationKey {
    alpha_g1: RawG1Point,
    beta_g2: RawG2Point,
    gamma_g2: RawG2Point,
    delta_g2: RawG2Point,
    ic: Vec<RawG1Point>,
}

#[derive(Debug, Clone, Deserialize)]
struct RawProvingKey {
    verification_key: RawVerificationKey,
    alpha_g1: RawG1Point,
    beta_g1: RawG1Point,
    beta_g2: RawG2Point,
    delta_g1: RawG1Point,
    delta_g2: RawG2Point,
    a_query: Vec<RawG1Point>,
    b_g1_query: Vec<RawG1Point>,
    b_g2_query: Vec<RawG2Point>,
    h_query: Vec<RawG1Point>,
    l_query: Vec<RawG1Point>,
}

/// Clean JSON format with hex strings (target format)
#[derive(Debug, Clone, Serialize)]
struct CleanG1Point {
    x: String,
    y: String,
}

#[derive(Debug, Clone, Serialize)]
struct CleanG2Point {
    x: String,
    y: String,
}

#[derive(Debug, Clone, Serialize)]
struct CleanVerificationKey {
    alpha_g1: CleanG1Point,
    beta_g2: CleanG2Point,
    gamma_g2: CleanG2Point,
    delta_g2: CleanG2Point,
    ic: Vec<CleanG1Point>,
}

#[derive(Debug, Clone, Serialize)]
struct CleanProvingKey {
    verification_key: CleanVerificationKey,
    alpha_g1: CleanG1Point,
    beta_g1: CleanG1Point,
    beta_g2: CleanG2Point,
    delta_g1: CleanG1Point,
    delta_g2: CleanG2Point,
    a_query: Vec<CleanG1Point>,
    b_g1_query: Vec<CleanG1Point>,
    b_g2_query: Vec<CleanG2Point>,
    h_query: Vec<CleanG1Point>,
    l_query: Vec<CleanG1Point>,
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    format!("0x{}", hex::encode(bytes))
}

fn convert_g1_point(raw: &RawG1Point) -> CleanG1Point {
    CleanG1Point {
        x: bytes_to_hex(&raw.x_bytes),
        y: bytes_to_hex(&raw.y_bytes),
    }
}

fn convert_g2_point(raw: &RawG2Point) -> CleanG2Point {
    CleanG2Point {
        x: bytes_to_hex(&raw.x_bytes),
        y: bytes_to_hex(&raw.y_bytes),
    }
}

fn convert_verification_key(raw: &RawVerificationKey) -> CleanVerificationKey {
    CleanVerificationKey {
        alpha_g1: convert_g1_point(&raw.alpha_g1),
        beta_g2: convert_g2_point(&raw.beta_g2),
        gamma_g2: convert_g2_point(&raw.gamma_g2),
        delta_g2: convert_g2_point(&raw.delta_g2),
        ic: raw.ic.iter().map(convert_g1_point).collect(),
    }
}

fn convert_proving_key(raw: &RawProvingKey) -> CleanProvingKey {
    CleanProvingKey {
        verification_key: convert_verification_key(&raw.verification_key),
        alpha_g1: convert_g1_point(&raw.alpha_g1),
        beta_g1: convert_g1_point(&raw.beta_g1),
        beta_g2: convert_g2_point(&raw.beta_g2),
        delta_g1: convert_g1_point(&raw.delta_g1),
        delta_g2: convert_g2_point(&raw.delta_g2),
        a_query: raw.a_query.iter().map(convert_g1_point).collect(),
        b_g1_query: raw.b_g1_query.iter().map(convert_g1_point).collect(),
        b_g2_query: raw.b_g2_query.iter().map(convert_g2_point).collect(),
        h_query: raw.h_query.iter().map(convert_g1_point).collect(),
        l_query: raw.l_query.iter().map(convert_g1_point).collect(),
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    
    if args.len() < 2 {
        print_usage(&args[0]);
        process::exit(1);
    }
    
    let command = &args[1];
    match command.as_str() {
        "verification-key" => {
            if args.len() != 4 {
                println!("Usage: {} verification-key <input.json> <output.json>", args[0]);
                process::exit(1);
            }
            convert_verification_key_file(&args[2], &args[3]);
        }
        "proving-key" => {
            if args.len() != 4 {
                println!("Usage: {} proving-key <input.json> <output.json>", args[0]);
                process::exit(1);
            }
            convert_proving_key_file(&args[2], &args[3]);
        }
        "both" => {
            if args.len() != 3 {
                println!("Usage: {} both <ceremony_output_dir>", args[0]);
                process::exit(1);
            }
            convert_both_files(&args[2]);
        }
        _ => {
            print_usage(&args[0]);
            process::exit(1);
        }
    }
}

fn print_usage(program_name: &str) {
    println!("Raw JSON to Hex JSON Converter for Tokamak Trusted Setup");
    println!("Usage: {} <command> [args...]", program_name);
    println!();
    println!("Commands:");
    println!("  verification-key <input.json> <output.json>  Convert verification key");
    println!("  proving-key <input.json> <output.json>       Convert proving key");
    println!("  both <ceremony_output_dir>                   Convert both keys in directory");
    println!();
    println!("Examples:");
    println!("  {} verification-key verification_key.json verification_key_hex.json", program_name);
    println!("  {} proving-key proving_key.json proving_key_hex.json", program_name);
    println!("  {} both ./ceremony_output", program_name);
}

fn convert_verification_key_file(input_path: &str, output_path: &str) {
    println!("🔄 Converting verification key: {} -> {}", input_path, output_path);
    
    // Read and parse raw JSON
    let raw_json = match fs::read_to_string(input_path) {
        Ok(content) => content,
        Err(e) => {
            eprintln!("❌ Failed to read input file: {}", e);
            process::exit(1);
        }
    };
    
    let raw_vk: RawVerificationKey = match serde_json::from_str(&raw_json) {
        Ok(vk) => vk,
        Err(e) => {
            eprintln!("❌ Failed to parse raw JSON: {}", e);
            process::exit(1);
        }
    };
    
    // Convert to hex format
    let clean_vk = convert_verification_key(&raw_vk);
    
    // Write clean JSON
    let clean_json = match serde_json::to_string_pretty(&clean_vk) {
        Ok(json) => json,
        Err(e) => {
            eprintln!("❌ Failed to serialize clean JSON: {}", e);
            process::exit(1);
        }
    };
    
    if let Err(e) = fs::write(output_path, clean_json) {
        eprintln!("❌ Failed to write output file: {}", e);
        process::exit(1);
    }
    
    println!("✅ Verification key converted successfully!");
    
    // Print file sizes
    if let (Ok(input_meta), Ok(output_meta)) = (fs::metadata(input_path), fs::metadata(output_path)) {
        println!("   Raw JSON size: {} bytes", input_meta.len());
        println!("   Hex JSON size: {} bytes", output_meta.len());
        let ratio = output_meta.len() as f64 / input_meta.len() as f64;
        println!("   Size ratio: {:.2}x", ratio);
    }
}

fn convert_proving_key_file(input_path: &str, output_path: &str) {
    println!("🔄 Converting proving key: {} -> {}", input_path, output_path);
    println!("⚠️  This may take a while due to large file size...");
    
    // Read and parse raw JSON
    let raw_json = match fs::read_to_string(input_path) {
        Ok(content) => content,
        Err(e) => {
            eprintln!("❌ Failed to read input file: {}", e);
            process::exit(1);
        }
    };
    
    println!("📖 Parsing raw JSON...");
    let raw_pk: RawProvingKey = match serde_json::from_str(&raw_json) {
        Ok(pk) => pk,
        Err(e) => {
            eprintln!("❌ Failed to parse raw JSON: {}", e);
            process::exit(1);
        }
    };
    
    println!("🔧 Converting to hex format...");
    let clean_pk = convert_proving_key(&raw_pk);
    
    println!("💾 Writing clean JSON...");
    let clean_json = match serde_json::to_string_pretty(&clean_pk) {
        Ok(json) => json,
        Err(e) => {
            eprintln!("❌ Failed to serialize clean JSON: {}", e);
            process::exit(1);
        }
    };
    
    if let Err(e) = fs::write(output_path, clean_json) {
        eprintln!("❌ Failed to write output file: {}", e);
        process::exit(1);
    }
    
    println!("✅ Proving key converted successfully!");
    
    // Print file sizes
    if let (Ok(input_meta), Ok(output_meta)) = (fs::metadata(input_path), fs::metadata(output_path)) {
        println!("   Raw JSON size: {} bytes", input_meta.len());
        println!("   Hex JSON size: {} bytes", output_meta.len());
        let ratio = output_meta.len() as f64 / input_meta.len() as f64;
        println!("   Size ratio: {:.2}x", ratio);
    }
}

fn convert_both_files(ceremony_dir: &str) {
    println!("🔄 Converting both keys in directory: {}", ceremony_dir);
    
    let vk_input = format!("{}/verification_key.json", ceremony_dir);
    let vk_output = format!("{}/verification_key_hex.json", ceremony_dir);
    let pk_input = format!("{}/proving_key.json", ceremony_dir);
    let pk_output = format!("{}/proving_key_hex.json", ceremony_dir);
    
    println!("\n1. Converting Verification Key:");
    convert_verification_key_file(&vk_input, &vk_output);
    
    println!("\n2. Converting Proving Key:");
    convert_proving_key_file(&pk_input, &pk_output);
    
    println!("\n🎉 Both keys converted successfully!");
    println!("📁 Output files:");
    println!("   {}", vk_output);
    println!("   {}", pk_output);
}