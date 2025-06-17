use std::fmt;
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Serialize, Deserialize, Debug)]
pub struct ContributorInfo {
    pub contributor_no: u32,
    pub date: String,
    pub name: String,
    pub location: String,
    pub devices: String,
    pub prev_acc_hash: String,
    pub prev_proof_hash: String,
    pub current_acc_hash: String,
    pub current_proof_hash: String,
    pub time_taken_seconds: f64,
}


impl fmt::Display for ContributorInfo {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f,
               "### Contributor No: {:02}\n\n\
            **Date:** {}\n\n\
            Name: {}\n\n\
            Location: {}\n\n\
            Device(s): {}\n\n\
            Previous accumulator hash:\n    Blake2b: {}\n\
            Previous proof hash:\n    Blake2b: {}\n\n\
            Response accumulator hash:\n    Blake2b: {}\n\
            Response proof hash:\n    Blake2b: {}\n\n\
            Time taken: ~{} seconds",
               self.contributor_no,
               self.date,
               self.name,
               self.location,
               self.devices,
               self.prev_acc_hash,
               self.prev_proof_hash,
               self.current_acc_hash,
               self.current_proof_hash,
               self.time_taken_seconds,
        )
    }
}


#[derive(Debug)]
pub struct DeviceInfo {
    pub manufacturer: String,
    pub model: String,
    pub architecture: String,
    pub processor: String,
}

impl DeviceInfo {
    pub fn to_string(&self) -> String {
        format!("Manufacturer: {}\nModel: {}\nArchitecture: {}\nProcessor: {}", self.manufacturer, self.model, self.architecture, self.processor)
    }
}

pub fn get_device_info() -> DeviceInfo {
    let architecture = std::env::consts::ARCH.to_string();

    #[cfg(target_os = "windows")]
    {
        let manufacturer_model_output = Command::new("wmic")
            .args(["computersystem", "get", "manufacturer,model"])
            .output()
            .expect("Failed to execute WMIC command");
        let manufacturer_model = String::from_utf8_lossy(&manufacturer_model_output.stdout).lines().nth(1).unwrap_or("").split_whitespace().collect::<Vec<&str>>();

        let cpu_output = Command::new("wmic")
            .args(["cpu", "get", "name"])
            .output()
            .expect("Failed to execute WMIC CPU command");
        let processor = String::from_utf8_lossy(&cpu_output.stdout).lines().nth(1).unwrap_or("").trim().to_string();

        DeviceInfo {
            manufacturer: manufacturer_model.get(0).unwrap_or(&"").to_string(),
            model: manufacturer_model.get(1).unwrap_or(&"").to_string(),
            architecture,
            processor,
        }
    }

    #[cfg(target_os = "linux")]
    {
        let manufacturer_output = Command::new("cat")
            .arg("/sys/devices/virtual/dmi/id/sys_vendor")
            .output()
            .expect("Failed to read manufacturer");
        let manufacturer = String::from_utf8_lossy(&manufacturer_output.stdout).trim().to_string();

        let model_output = Command::new("cat")
            .arg("/sys/devices/virtual/dmi/id/product_name")
            .output()
            .expect("Failed to read model");
        let model = String::from_utf8_lossy(&model_output.stdout).trim().to_string();

        let processor_output = Command::new("lscpu")
            .output()
            .expect("Failed to execute lscpu command");
        let processor_info = String::from_utf8_lossy(&processor_output.stdout).lines().find(|line| line.contains("Model name:")).unwrap_or("").split(':').nth(1).unwrap_or("").trim().to_string();

        DeviceInfo {
            manufacturer,
            model,
            architecture,
            processor: processor_info,
        }
    }

    #[cfg(target_os = "macos")]
    {
        let manufacturer = "Apple Inc.".to_string();

        let model_output = Command::new("sysctl")
            .args(["-n", "hw.model"])
            .output()
            .expect("Failed to get model");
        let model = String::from_utf8_lossy(&model_output.stdout).trim().to_string();

        let cpu_output = Command::new("sysctl")
            .args(["-n", "machdep.cpu.brand_string"])
            .output()
            .expect("Failed to get CPU info");
        let processor = String::from_utf8_lossy(&cpu_output.stdout).trim().to_string();

        DeviceInfo {
            manufacturer,
            model,
            architecture,
            processor,
        }
    }
}