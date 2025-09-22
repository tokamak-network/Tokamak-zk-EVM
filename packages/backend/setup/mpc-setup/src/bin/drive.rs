use clap::{Parser, ValueEnum};
use drive_v3::objects::{File, Permission, UploadType};
use drive_v3::{Credentials, Drive};
use google_drive3::hyper::Client;
use google_drive3::{oauth2, DriveHub};
use hyper::body::HttpBody;
use hyper_rustls::HttpsConnectorBuilder;
use mpc_setup::utils::prompt_user_input;
use oauth2::ServiceAccountAuthenticator;
use std::env;
use std::fs::File as StdFile;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use zip::write::{ExtendedFileOptions, FileOptions};
use zip::ZipArchive;

#[derive(Debug, Clone, ValueEnum)]
enum Mode {
    Upload,
    Download,
}
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Output folder path (must exist and be writeable)
    #[arg(long, value_name = "OUTFOLDER")]
    outfolder: String,

    #[arg(long, value_name = "PHASE_TYPE")]
    phase_type: u32,

    /// Operation mode: upload or download
    #[arg(long, value_enum, value_name = "MODE")]
    mode: Mode,
}

//cargo run --release --bin drive -- --outfolder ./setup/mpc-setup/output --mode upload --phase-type 1
//cargo run --release --bin drive -- --outfolder ./setup/mpc-setup/output --mode download --phase-type 1

#[tokio::main]
async fn main() {
    let shared_folder_id = std::env::var("SHARED_FOLDER_ID").unwrap();
    //println!("shared folder id: {}", shared_folder_id);

    let config = Config::parse();
    let contributor_index = prompt_user_input("enter your contributor index (uint >= 0) :")
        .parse::<u32>()
        .expect("Please enter a valid number");
    let base_path = std::env::current_dir().unwrap();
    let append = if base_path.ends_with("setup/mpc-setup/") {
        "output/"
    } else {
        "setup/mpc-setup/output/"
    };
    let fpath = base_path.join(append);
    match config.mode {
        Mode::Upload => {
            upload_contributor_file(config.phase_type, fpath.as_path().to_str().unwrap(), contributor_index, shared_folder_id.as_str()).await;
            println!("contributor files uploaded");
        }
        Mode::Download => {
            use_service_account_download(
                config.phase_type,
                fpath.as_path().to_str().unwrap(),
                contributor_index,
                shared_folder_id.as_str(),
            )
                .await
                .unwrap();
            println!("latest files downloaded");
        }
    }
}
async fn upload_contributor_file(phase_type: u32,
                                 dest_folder: &str, contributor_index: u32, shared_folder_id: &str) {
    let mail = env::var("MAIL_NOTIFICATION").unwrap();

    let archive_path = format!(
        "{}phase{}_contributor_{}.zip",
        dest_folder, phase_type, contributor_index
    );

    let contributor_file = build_file_path(
        phase_type,
        &dest_folder,
        "contributor",
        contributor_index,
    );
    let acc_file = build_file_path(
        phase_type,
        &dest_folder,
        "acc",
        contributor_index,
    );
    let proof_file = build_file_path(
        phase_type,
        &dest_folder,
        "proof",
        contributor_index,
    );

    let files = if contributor_index == 0 {
        vec![&contributor_file, &acc_file]
    } else {
        vec![&contributor_file, &acc_file, &proof_file]
    }
        .iter()
        .map(|s| s.as_str())
        .collect::<Vec<&str>>();

    println!("all files ({:?}) are zipping into {:?}", files, archive_path);
    zip_files(&archive_path, &files).expect("Failed to zip files");
    println!("all files are zipped");

    let base_path = std::env::current_dir().unwrap();

    // The OAuth scopes you need
    let scopes: [&'static str; 2] = [
        "https://www.googleapis.com/auth/drive.metadata.readonly",
        "https://www.googleapis.com/auth/drive.file",
    ];
    let client_scr_path = write_env_to_temp_file("CLIENT_ACCOUNT_JSON").unwrap();

    let credentials = Credentials::from_client_secrets_file(&client_scr_path, &scopes)
        .expect("Failed to read credentials");

    let drive = Drive::new(&credentials);
    //check file exists
    {
        let names_query = format!(
            "name = '{}'",
            format!(
                "phase{}_contributor_{}.zip",
                phase_type, contributor_index
            )
        );
        let query = format!("'{}' in parents and ({})", shared_folder_id, names_query);
        let result = drive.files.list().q(&query).execute().expect("there is already a file with this name");

        let files = result.files.unwrap_or_default();
        // Extract all file IDs
        let file_ids: Vec<String> = files.iter().filter_map(|file| file.id.clone()).collect();
        if !file_ids.is_empty() {
            panic!("you cannot upload this contribution because it is already uploaded with file IDs: {:?}", file_ids);
        }
    }
    // Set what information the uploaded file will have
    let metadata = File {
        name: Some(format!(
            "phase{}_contributor_{}.zip",
            phase_type, contributor_index
        )),
        mime_type: Some("application/zip".to_string()),
        parents: Some(vec![shared_folder_id.to_string()]),
        ..Default::default()
    };

    // You can set a callback that will be called when a resumable upload progresses
    fn progress_callback(total_bytes: usize, uploaded_bytes: usize) {
        println!(
            "Uploaded {} bytes, out of a total of {}.",
            uploaded_bytes, total_bytes
        );
    }

    let fpath = base_path.join(archive_path);

    println!("uploading file: {:?}", fpath);

    let mut my_new_file = File::default();
    let mut last_err = None;

    for attempt in 1..=50 {
        println!("Attempt {} to upload contributor file...", attempt);
        match drive
            .files
            .create()
            .upload_type(UploadType::Resumable)
            .callback(progress_callback)
            .metadata(&metadata)
            .content_source(&fpath)
            .execute()
        {
            Ok(file) => {
                println!("✅ File uploaded successfully on attempt {}", attempt);
                my_new_file = file; // this will be used after loop
                break;
            }
            Err(e) => {
                eprintln!("⚠️ Upload failed on attempt {}: {:?}", attempt, e);
                last_err = Some(e);
                tokio::time::sleep(std::time::Duration::from_secs(attempt * 5)).await;
                continue;
            }
        }
    }

    let permission = Permission {
        role: Some("writer".to_string()), //owner
        permission_type: Some("user".to_string()),
        email_address: Some(mail.to_string()),
        ..Default::default()
    };
    let file_id = my_new_file.id.unwrap();

    drive
        .permissions
        .create(&file_id)
        .permission(permission)
        // .transfer_ownership(true)
        .send_notification_email(true)
        .execute()
        .expect("Failed to execute request");
}

pub async fn use_service_account_download(
    phase_type: u32,
    dest_folder: &str,
    contributor_index: u32,
    shared_folder_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    if contributor_index == 0 {
        panic!("contributor index must be greater than 0");
    }
    let file_names = vec![
        format!(
            "phase{}_contributor_{}.zip",
            phase_type,
            contributor_index - 1
        ),
        format!(
            "phase{}_contributor_{}.zip",
            phase_type,
            contributor_index - 2
        ),
    ];

    let service_path = write_env_to_temp_file("SERVICE_ACCOUNT_JSON").unwrap();
    // let base_path = std::env::current_dir()?;
    //let fpath = base_path.join("setup/mpc-setup/service-account.json");

    let service_account_json = fs::read_to_string(service_path).await?;
    //println!("service account json: {:?}", service_account_json);
    let service_account_key: oauth2::ServiceAccountKey =
        serde_json::from_str(&service_account_json)?;

    let auth = ServiceAccountAuthenticator::builder(service_account_key)
        .build()
        .await?;

    let https = HttpsConnectorBuilder::new()
        .with_native_roots()
        .https_or_http()
        .enable_http1()
        .build();

    let hyper_client = Client::builder().build(https);
    let hub = DriveHub::new(hyper_client, auth);

    //file id query
    // Create a query string to match the file names exactly
    let names_query = file_names
        .iter()
        .map(|name| format!("name = '{}'", name))
        .collect::<Vec<_>>()
        .join(" or ");

    // Combine the folder and filenames in the query
    let query = format!("'{}' in parents and ({})", shared_folder_id, names_query);

    let result = hub
        .files()
        .list()
        .q(&query)
        .add_scope(google_drive3::api::Scope::Full)
        .doit()
        .await?;

    let files = result.1.files.unwrap_or_default();
    // Extract all file IDs
    let file_ids: Vec<String> = files.iter().filter_map(|file| file.id.clone()).collect();
    if file_ids.is_empty() {
        panic!("No files found in folder '{}'", shared_folder_id);
    } else {
        println!("Found file IDs: {:?}", file_ids);
    }

    for file_id in file_ids {
        // Prepare output path
        let output_path: PathBuf = [dest_folder, &format!("{}.zip", file_id)].iter().collect();
        println!("Downloading file to {:?}", output_path);
        let mut file = fs::File::create(&output_path)
            .await
            .expect("Failed to create file");

        let (_response, body) = hub
            .files()
            .get(file_id.as_str())
            .param("alt", "media")
            .add_scope(google_drive3::api::Scope::Full)
            .doit()
            .await?;

        // Convert Body into a byte stream
        let mut body_stream = _response;

        // Process the stream and write to file
        while let Some(chunk) = body_stream.data().await {
            let data = chunk?;
            file.write_all(&data).await?;
        }
        file.sync_all().await.expect("Failed to sync file");
        unzip_flat(output_path.as_path().to_str().unwrap(), dest_folder)
            .expect("zip file is corrupted");
        println!("File downloaded successfully to {:?}", output_path);
    }

    Ok(())
}

fn zip_files(output_zip: &str, files: &[&str]) -> io::Result<()> {
    let zip_file = StdFile::create(output_zip)?;
    let mut zip = zip::ZipWriter::new(zip_file);

    let options = FileOptions::<ExtendedFileOptions>::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    let base_path = std::env::current_dir().unwrap();
    for &next in files {
        let file_name = Path::new(next)
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Invalid file name"))?;

        let path = base_path.join(next);
        println!("adding file: {:?}", path);

        if !Path::new(path.to_str().unwrap()).exists() {
            panic!("❌ Required file not found {}", path.to_str().unwrap());
        }

        let mut file = StdFile::open(path)?;

        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;

        zip.start_file(file_name, options.clone())?;
        zip.write_all(&buffer)?;
    }

    zip.finish().expect("Failed to finish zip");
    Ok(())
}
fn unzip_flat(zip_file: &str, output_dir: &str) -> io::Result<()> {
    let file = StdFile::open(zip_file)?;
    let mut archive = ZipArchive::new(file)?;

    for i in 0..archive.len() {
        let mut file_in_zip = archive.by_index(i)?;

        // Skip directories explicitly
        if file_in_zip.is_dir() {
            continue;
        }
        // Extract only file name to flatten structure
        let filename = Path::new(file_in_zip.name())
            .file_name()
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "Invalid file name"))?;

        let outpath = PathBuf::from(output_dir).join(filename);

        let mut outfile = StdFile::create(&outpath)?;
        io::copy(&mut file_in_zip, &mut outfile)?;
        outfile.sync_all().expect("Failed to sync file");
        println!("Extracted {:?}", outpath);
    }

    Ok(())
}
fn build_file_path(phase_type: u32, base_path: &str, file_type: &str, index: u32) -> String {
    format!(
        "{}phase{}_{}_{}.{}",
        base_path,
        phase_type,
        file_type,
        index,
        match file_type {
            "contributor" => "txt",
            "acc" => "json",
            "proof" => "json",
            _ => panic!("Unexpected file type"),
        }
    )
}

fn write_env_to_temp_file(env_var: &str) -> std::io::Result<String> {
    // Fetch environment variable
    let content = env::var(env_var).expect("Environment variable not set");

    // Create a named temporary file
    let mut tmpfile = NamedTempFile::new()?;
    write!(tmpfile, "{}", content)?;

    // Get absolute path of the temporary file
    let abs_path = tmpfile.path().canonicalize()?.to_str().unwrap().to_owned();

    // Keep the temporary file from being deleted
    tmpfile.persist(&abs_path)?;

    Ok(abs_path)
}
