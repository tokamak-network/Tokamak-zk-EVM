use crate::accumulator::{Accumulator, AccumulatorRkyv};
use crate::conversions::{deserialize_g1_affine, deserialize_g2_affine};
use crate::utils::{icicle_g1_generator, icicle_g2_generator};
use ark_serialize::Compress;
use icicle_bls12_381::curve::{G1Affine, G2Affine};
use libs::group_structures::{G1serde, G2serde};
use memmap::{Mmap, MmapOptions};
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, USER_AGENT};
use serde::Deserialize;
use std::cmp::max;
use std::env;
use std::fs::File;
use std::io;
use std::io::Read;
use std::io::Write;
use std::path::Path;
use tempfile::NamedTempFile;

pub trait Phase1SrsSource {
    fn g1(&self) -> G1serde;
    fn g2(&self) -> G2serde;
    fn alpha_g2(&self, exp_alpha: usize) -> G2serde;
    fn x_g2(&self, exp_x: usize) -> G2serde;
    fn y_g2(&self, exp_y: usize) -> G2serde;
    fn x_g1_range(&self, exp_min: usize, exp_max: usize) -> Vec<G1Affine>;
    fn alphaxy_g1_range(
        &self,
        exp_alpha: usize,
        exp_x_max: usize,
        exp_y_max: usize,
    ) -> Vec<G1Affine>;
    fn alphaxy_g1_chunk(
        &self,
        exp_alpha: usize,
        exp_x_start: usize,
        exp_x_len: usize,
        exp_y_max: usize,
    ) -> Vec<G1Affine> {
        let mut out = Vec::new();
        self.fill_alphaxy_g1_chunk(exp_alpha, exp_x_start, exp_x_len, exp_y_max, &mut out);
        out
    }
    fn fill_alphaxy_g1_chunk(
        &self,
        exp_alpha: usize,
        exp_x_start: usize,
        exp_x_len: usize,
        exp_y_max: usize,
        out: &mut Vec<G1Affine>,
    );
    fn xy_powers(&self) -> Box<[G1serde]> {
        let mut out = Vec::new();
        self.fill_xy_powers(&mut out);
        out.into_boxed_slice()
    }
    fn fill_xy_powers(&self, out: &mut Vec<G1serde>);
    fn alphax_g1(&self, exp_alpha: usize, exp_x: usize) -> G1serde;
    fn alphay_g1(&self, exp_alpha: usize, exp_y: usize) -> G1serde;
    fn xy_g1(&self, exp_x: usize, exp_y: usize) -> G1serde;
}

struct AccumulatorZeroCopy {
    mmap: Mmap,
}

impl AccumulatorZeroCopy {
    fn load(path: &Path) -> io::Result<Self> {
        let file = File::open(path)?;
        let mmap = unsafe { MmapOptions::new().map(&file)? };
        rkyv::check_archived_root::<AccumulatorRkyv>(&mmap).map_err(|err| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("Invalid accumulator archive: {err:?}"),
            )
        })?;
        Ok(Self { mmap })
    }

    fn accumulator(&self) -> &rkyv::Archived<AccumulatorRkyv> {
        unsafe { rkyv::archived_root::<AccumulatorRkyv>(&self.mmap) }
    }
}

enum AccumulatorSourceInner {
    Owned(Accumulator),
    Mapped(AccumulatorZeroCopy),
}

pub struct AccumulatorSource {
    inner: AccumulatorSourceInner,
}

impl AccumulatorSource {
    pub fn read_from_json(path: &str) -> io::Result<Self> {
        let abs_json_path = env::current_dir()?.join(path);
        let rkyv_path = Accumulator::rkyv_path_for_json_path(&abs_json_path);
        if cache_is_fresh(&rkyv_path, &abs_json_path) {
            if let Ok(mapped) = AccumulatorZeroCopy::load(&rkyv_path) {
                return Ok(Self {
                    inner: AccumulatorSourceInner::Mapped(mapped),
                });
            }
        }

        let accumulator = Accumulator::read_from_json(path)?;
        let _ = accumulator.write_rkyv_sidecar_for_json_path(path);
        if let Ok(mapped) = AccumulatorZeroCopy::load(&rkyv_path) {
            return Ok(Self {
                inner: AccumulatorSourceInner::Mapped(mapped),
            });
        }

        Ok(Self {
            inner: AccumulatorSourceInner::Owned(accumulator),
        })
    }
}

const DUSK_HASH_BYTES: usize = 64;
const DUSK_TAU_POWERS_LENGTH: usize = 1 << 21;
const DUSK_TAU_POWERS_G1_LENGTH: usize = (DUSK_TAU_POWERS_LENGTH << 1) - 1;
const DUSK_G1_UNCOMPRESSED_BYTES: usize = 96;
const DUSK_G2_UNCOMPRESSED_BYTES: usize = 192;
const DUSK_G1_COMPRESSED_BYTES: usize = 48;
const DUSK_G2_COMPRESSED_BYTES: usize = 96;
const DUSK_PUBLIC_KEY_BYTES: usize =
    (3 * DUSK_G2_UNCOMPRESSED_BYTES) + (6 * DUSK_G1_UNCOMPRESSED_BYTES);
const DUSK_CHALLENGE_BYTES: usize = DUSK_HASH_BYTES
    + (DUSK_TAU_POWERS_G1_LENGTH * DUSK_G1_UNCOMPRESSED_BYTES)
    + (DUSK_TAU_POWERS_LENGTH * DUSK_G2_UNCOMPRESSED_BYTES)
    + (DUSK_TAU_POWERS_LENGTH * DUSK_G1_UNCOMPRESSED_BYTES)
    + (DUSK_TAU_POWERS_LENGTH * DUSK_G1_UNCOMPRESSED_BYTES)
    + DUSK_G2_UNCOMPRESSED_BYTES;
const DUSK_RESPONSE_BYTES: usize = DUSK_HASH_BYTES
    + (DUSK_TAU_POWERS_G1_LENGTH * DUSK_G1_COMPRESSED_BYTES)
    + (DUSK_TAU_POWERS_LENGTH * DUSK_G2_COMPRESSED_BYTES)
    + (DUSK_TAU_POWERS_LENGTH * DUSK_G1_COMPRESSED_BYTES)
    + (DUSK_TAU_POWERS_LENGTH * DUSK_G1_COMPRESSED_BYTES)
    + DUSK_G2_COMPRESSED_BYTES
    + DUSK_PUBLIC_KEY_BYTES;
const DUSK_GITHUB_CONTRIBUTIONS_API: &str =
    "https://api.github.com/repos/dusk-network/trusted-setup/contents/contributions";
const DUSK_TRUSTED_SETUP_REPO: &str = "dusk-network/trusted-setup";
const DUSK_GITHUB_RAW_PREFIX: &str =
    "https://raw.githubusercontent.com/dusk-network/trusted-setup/main/contributions";
const DUSK_DRIVE_ID_PREFIX: &str = "https://drive.google.com/file/d/";
const DUSK_KNOWN_CONTRIBUTION_FALLBACKS: &[&str] = &["0015"];
const DUSK_DOWNLOAD_PROGRESS_STEP_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Deserialize)]
struct GithubContentEntry {
    name: String,
    #[serde(rename = "type")]
    entry_type: String,
}

struct DuskResponseDownload {
    contribution: String,
    readme_url: String,
    drive_file_id: String,
}

#[derive(Clone, Copy)]
enum DuskRawEncoding {
    Compressed,
    Uncompressed,
}

pub struct DuskGroth16Source {
    g1: G1serde,
    g2: G2serde,
    tau_powers_g1: Vec<G1Affine>,
    tau_powers_g2: Vec<G2Affine>,
    tokamak_n: usize,
}

impl DuskGroth16Source {
    pub fn read_from_file(path: &str, tokamak_n: usize) -> io::Result<Self> {
        ensure_dusk_raw_response_available(Path::new(path))?;
        let bytes = std::fs::read(path)?;
        let encoding = match bytes.len() {
            DUSK_CHALLENGE_BYTES => DuskRawEncoding::Uncompressed,
            DUSK_RESPONSE_BYTES => DuskRawEncoding::Compressed,
            len => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!(
                        "unsupported Dusk raw PoT file size {len}; expected challenge size {DUSK_CHALLENGE_BYTES} or response size {DUSK_RESPONSE_BYTES}"
                    ),
                ))
            }
        };

        let max_g1_exp = 10usize
            .checked_mul(tokamak_n)
            .expect("Tokamak n overflow while sizing Dusk G1 powers");
        let max_g2_exp = 8usize
            .checked_mul(tokamak_n)
            .expect("Tokamak n overflow while sizing Dusk G2 powers");

        if max_g1_exp >= DUSK_TAU_POWERS_G1_LENGTH || max_g2_exp >= DUSK_TAU_POWERS_LENGTH {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!(
                    "Tokamak n={} requires tau powers beyond the Dusk raw PoT bounds",
                    tokamak_n
                ),
            ));
        }

        let (g1_point_bytes, g2_point_bytes, compression) = match encoding {
            DuskRawEncoding::Compressed => (
                DUSK_G1_COMPRESSED_BYTES,
                DUSK_G2_COMPRESSED_BYTES,
                Compress::Yes,
            ),
            DuskRawEncoding::Uncompressed => (
                DUSK_G1_UNCOMPRESSED_BYTES,
                DUSK_G2_UNCOMPRESSED_BYTES,
                Compress::No,
            ),
        };

        let tau_g1_offset = DUSK_HASH_BYTES;
        let tau_g2_offset = tau_g1_offset + (DUSK_TAU_POWERS_G1_LENGTH * g1_point_bytes);

        let mut tau_powers_g1 = Vec::with_capacity(max_g1_exp + 1);
        for exp in 0..=max_g1_exp {
            let start = tau_g1_offset + (exp * g1_point_bytes);
            let end = start + g1_point_bytes;
            tau_powers_g1.push(deserialize_g1_affine(
                &bytes[start..end].to_vec().into_boxed_slice(),
                compression,
            ));
        }

        let mut tau_powers_g2 = Vec::with_capacity(max_g2_exp + 1);
        for exp in 0..=max_g2_exp {
            let start = tau_g2_offset + (exp * g2_point_bytes);
            let end = start + g2_point_bytes;
            tau_powers_g2.push(deserialize_g2_affine(
                &bytes[start..end].to_vec().into_boxed_slice(),
                compression,
            ));
        }

        let g1 = G1serde(tau_powers_g1[0]);
        let g2 = G2serde(tau_powers_g2[0]);
        if g1 != icicle_g1_generator() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "invalid Dusk raw PoT file: tau^0 in G1 is not the canonical generator",
            ));
        }
        if g2 != icicle_g2_generator() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "invalid Dusk raw PoT file: tau^0 in G2 is not the canonical generator",
            ));
        }

        Ok(Self {
            g1,
            g2,
            tau_powers_g1,
            tau_powers_g2,
            tokamak_n,
        })
    }

    fn omega_exp(&self, exp_alpha: usize) -> usize {
        2 * self.tokamak_n * exp_alpha
    }

    fn tau_g1(&self, exp: usize) -> G1serde {
        G1serde(self.tau_powers_g1[exp])
    }

    fn tau_g2(&self, exp: usize) -> G2serde {
        G2serde(self.tau_powers_g2[exp])
    }
}

fn dusk_http_client() -> io::Result<Client> {
    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static("tokamak-zkevm-mpc-setup/1.0"),
    );
    headers.insert(
        ACCEPT,
        HeaderValue::from_static(
            "application/vnd.github+json, text/plain, application/octet-stream",
        ),
    );
    Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|err| io::Error::other(format!("failed to build HTTP client: {err}")))
}

fn readme_url_for_contribution(name: &str) -> String {
    format!("{DUSK_GITHUB_RAW_PREFIX}/{name}/README.md")
}

fn parse_drive_file_id(readme: &str) -> Option<String> {
    let start = readme.find(DUSK_DRIVE_ID_PREFIX)?;
    let suffix = &readme[start + DUSK_DRIVE_ID_PREFIX.len()..];
    let end = suffix.find('/')?;
    Some(suffix[..end].to_string())
}

fn candidate_contributions(client: &Client) -> io::Result<Vec<String>> {
    let response = client
        .get(DUSK_GITHUB_CONTRIBUTIONS_API)
        .send()
        .map_err(|err| {
            io::Error::other(format!("failed to fetch Dusk contribution list: {err}"))
        })?;
    if !response.status().is_success() {
        return Err(io::Error::other(format!(
            "failed to fetch Dusk contribution list: HTTP {}",
            response.status()
        )));
    }
    let entries: Vec<GithubContentEntry> = response.json().map_err(|err| {
        io::Error::other(format!("failed to parse Dusk contribution list: {err}"))
    })?;
    let mut names = entries
        .into_iter()
        .filter(|entry| entry.entry_type == "dir" && entry.name.chars().all(|c| c.is_ascii_digit()))
        .map(|entry| entry.name)
        .collect::<Vec<_>>();
    names.sort_unstable_by(|lhs, rhs| rhs.cmp(lhs));
    Ok(names)
}

fn fetch_readme(client: &Client, readme_url: &str) -> io::Result<String> {
    let response = client
        .get(readme_url)
        .send()
        .map_err(|err| io::Error::other(format!("failed to fetch {readme_url}: {err}")))?;
    if !response.status().is_success() {
        return Err(io::Error::other(format!(
            "failed to fetch {readme_url}: HTTP {}",
            response.status()
        )));
    }
    response
        .text()
        .map_err(|err| io::Error::other(format!("failed to decode {readme_url}: {err}")))
}

fn discover_latest_dusk_response(client: &Client) -> io::Result<DuskResponseDownload> {
    let candidates = candidate_contributions(client)
        .ok()
        .filter(|names| !names.is_empty())
        .unwrap_or_else(|| {
            DUSK_KNOWN_CONTRIBUTION_FALLBACKS
                .iter()
                .map(|name| (*name).to_string())
                .collect()
        });

    for contribution in candidates {
        let readme_url = readme_url_for_contribution(&contribution);
        let Ok(readme) = fetch_readme(client, &readme_url) else {
            continue;
        };
        let Some(drive_file_id) = parse_drive_file_id(&readme) else {
            continue;
        };
        return Ok(DuskResponseDownload {
            contribution,
            readme_url,
            drive_file_id,
        });
    }

    Err(io::Error::new(
        io::ErrorKind::NotFound,
        format!(
            "failed to discover a downloadable Dusk Groth16 response from {DUSK_TRUSTED_SETUP_REPO}"
        ),
    ))
}

fn drive_direct_download_url(file_id: &str) -> String {
    format!("https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t")
}

fn format_progress_bytes(bytes: u64) -> String {
    const GIB: f64 = 1024.0 * 1024.0 * 1024.0;
    const MIB: f64 = 1024.0 * 1024.0;
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.2} GiB", bytes as f64 / GIB)
    } else {
        format!("{:.2} MiB", bytes as f64 / MIB)
    }
}

fn download_dusk_response(path: &Path) -> io::Result<()> {
    let client = dusk_http_client()?;
    let download = discover_latest_dusk_response(&client)?;
    let download_url = drive_direct_download_url(&download.drive_file_id);
    println!(
        "Downloading latest Dusk Groth16 response contribution {} from {}",
        download.contribution, download.readme_url
    );

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let temp_dir = path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| Path::new(".").to_path_buf());
    let mut temp_file = NamedTempFile::new_in(temp_dir)?;

    let mut response = client
        .get(&download_url)
        .send()
        .map_err(|err| io::Error::other(format!("failed to download Dusk response: {err}")))?;
    if !response.status().is_success() {
        return Err(io::Error::other(format!(
            "failed to download Dusk response: HTTP {}",
            response.status()
        )));
    }

    let total_bytes = response.content_length();
    match total_bytes {
        Some(total) => println!(
            "Starting Dusk raw response download: {} total",
            format_progress_bytes(total)
        ),
        None => println!("Starting Dusk raw response download: total size unknown"),
    }

    let report_interval = total_bytes
        .map(|total| max(total / 20, DUSK_DOWNLOAD_PROGRESS_STEP_BYTES))
        .unwrap_or(DUSK_DOWNLOAD_PROGRESS_STEP_BYTES);
    let mut next_report = report_interval;
    let mut downloaded = 0u64;
    let mut buffer = vec![0u8; 1024 * 1024];

    loop {
        let read = response
            .read(&mut buffer)
            .map_err(|err| io::Error::other(format!("failed to stream Dusk response: {err}")))?;
        if read == 0 {
            break;
        }
        temp_file
            .write_all(&buffer[..read])
            .map_err(|err| io::Error::other(format!("failed to write Dusk response: {err}")))?;
        downloaded += read as u64;

        if downloaded >= next_report {
            match total_bytes {
                Some(total) => println!(
                    "Dusk raw response download progress: {:.1}% ({}/{})",
                    (downloaded as f64 / total as f64) * 100.0,
                    format_progress_bytes(downloaded),
                    format_progress_bytes(total)
                ),
                None => println!(
                    "Dusk raw response download progress: {} downloaded",
                    format_progress_bytes(downloaded)
                ),
            }
            next_report = next_report.saturating_add(report_interval);
        }
    }

    match total_bytes {
        Some(total) => println!(
            "Completed Dusk raw response download: {}/{}",
            format_progress_bytes(downloaded),
            format_progress_bytes(total)
        ),
        None => println!(
            "Completed Dusk raw response download: {}",
            format_progress_bytes(downloaded)
        ),
    }

    temp_file
        .flush()
        .map_err(|err| io::Error::other(format!("failed to flush Dusk response: {err}")))?;
    temp_file
        .persist(path)
        .map_err(|err| io::Error::other(format!("failed to persist Dusk response: {err}")))?;
    Ok(())
}

fn ensure_dusk_raw_response_available(path: &Path) -> io::Result<()> {
    if path.exists() {
        return Ok(());
    }
    println!(
        "Dusk raw response file {} is missing locally; downloading it from the web.",
        path.display()
    );
    download_dusk_response(path)
}

pub enum Phase1Source {
    Accumulator(AccumulatorSource),
    DuskGroth16(DuskGroth16Source),
}

fn cache_is_fresh(cache_path: &Path, source_path: &Path) -> bool {
    let Ok(cache_meta) = std::fs::metadata(cache_path) else {
        return false;
    };
    let Ok(cache_modified) = cache_meta.modified() else {
        return false;
    };
    let Ok(source_meta) = std::fs::metadata(source_path) else {
        return true;
    };
    let Ok(source_modified) = source_meta.modified() else {
        return true;
    };
    cache_modified >= source_modified
}

fn archived_x_g1_range(
    archived: &rkyv::Archived<AccumulatorRkyv>,
    exp_min: usize,
    exp_max: usize,
) -> Vec<G1Affine> {
    if exp_min > 0 {
        return archived.x.g1[exp_min - 1..exp_max]
            .iter()
            .map(|value| value.to_g1_affine())
            .collect();
    }

    let mut out = Vec::with_capacity(exp_max + 1);
    out.push(icicle_g1_generator().0);
    out.extend(
        archived.x.g1[..exp_max]
            .iter()
            .map(|value| value.to_g1_affine()),
    );
    out
}

fn archived_fill_alphaxy_g1_chunk(
    archived: &rkyv::Archived<AccumulatorRkyv>,
    exp_alpha: usize,
    exp_x_start: usize,
    exp_x_len: usize,
    exp_y_max: usize,
) -> Vec<G1Affine> {
    let mut out = Vec::new();
    fill_archived_alphaxy_g1_chunk(
        archived,
        exp_alpha,
        exp_x_start,
        exp_x_len,
        exp_y_max,
        &mut out,
    );
    out
}

fn fill_archived_alphaxy_g1_chunk(
    archived: &rkyv::Archived<AccumulatorRkyv>,
    exp_alpha: usize,
    exp_x_start: usize,
    exp_x_len: usize,
    exp_y_max: usize,
    out: &mut Vec<G1Affine>,
) {
    let y_len = archived.y.g1.len();
    let alpha_xy_stride = archived.x.g1.len() * y_len;
    let expected_len = exp_x_len * exp_y_max;
    if out.len() != expected_len {
        out.resize(expected_len, G1Affine::zero());
    }

    if exp_alpha > 0 {
        for local_x in 0..exp_x_len {
            let exp_x = exp_x_start + local_x;
            let row = &mut out[local_x * exp_y_max..(local_x + 1) * exp_y_max];
            if exp_x == 0 {
                if !row.is_empty() {
                    row[0] = archived.alpha[exp_alpha - 1].g1.to_g1_affine();
                }
                for exp_y in 1..exp_y_max {
                    row[exp_y] =
                        archived.alpha_y[(exp_alpha - 1) * y_len + exp_y - 1].to_g1_affine();
                }
                continue;
            }

            if !row.is_empty() {
                row[0] = archived.alpha_x[(exp_alpha - 1) * archived.x.g1.len() + exp_x - 1]
                    .to_g1_affine();
            }
            let xy_start = (exp_alpha - 1) * alpha_xy_stride + (exp_x - 1) * y_len;
            let xy_take = exp_y_max.saturating_sub(1).min(y_len);
            for (offset, value) in archived.alpha_xy[xy_start..xy_start + xy_take]
                .iter()
                .enumerate()
            {
                row[offset + 1] = value.to_g1_affine();
            }
        }
        return;
    }

    for local_x in 0..exp_x_len {
        let exp_x = exp_x_start + local_x;
        let row = &mut out[local_x * exp_y_max..(local_x + 1) * exp_y_max];
        if exp_x == 0 {
            if !row.is_empty() {
                row[0] = icicle_g1_generator().0;
            }
            for exp_y in 1..exp_y_max {
                row[exp_y] = archived.y.g1[exp_y - 1].to_g1_affine();
            }
            continue;
        }

        if !row.is_empty() {
            row[0] = archived.x.g1[exp_x - 1].to_g1_affine();
        }
        let xy_start = (exp_x - 1) * y_len;
        let xy_take = exp_y_max.saturating_sub(1).min(y_len);
        for (offset, value) in archived.xy[xy_start..xy_start + xy_take].iter().enumerate() {
            row[offset + 1] = value.to_g1_affine();
        }
    }
}

fn fill_archived_xy_powers(archived: &rkyv::Archived<AccumulatorRkyv>, out: &mut Vec<G1serde>) {
    out.clear();
    out.reserve(archived.xy.len());
    out.extend(archived.xy.iter().map(|value| value.to_g1serde()));
}

impl Phase1SrsSource for AccumulatorSource {
    fn g1(&self) -> G1serde {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.g1,
            AccumulatorSourceInner::Mapped(acc) => acc.accumulator().g1.to_g1serde(),
        }
    }

    fn g2(&self) -> G2serde {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.g2,
            AccumulatorSourceInner::Mapped(acc) => acc.accumulator().g2.to_g2serde(),
        }
    }

    fn alpha_g2(&self, exp_alpha: usize) -> G2serde {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.alpha[exp_alpha - 1].g2,
            AccumulatorSourceInner::Mapped(acc) => {
                acc.accumulator().alpha[exp_alpha - 1].g2.to_g2serde()
            }
        }
    }

    fn x_g2(&self, exp_x: usize) -> G2serde {
        assert_eq!(exp_x, 1, "only x^1 in G2 is stored in phase-1");
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.get_x_g2(exp_x),
            AccumulatorSourceInner::Mapped(acc) => acc.accumulator().x.g2.to_g2serde(),
        }
    }

    fn y_g2(&self, exp_y: usize) -> G2serde {
        assert_eq!(exp_y, 1, "only y^1 in G2 is currently required");
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.y.g2,
            AccumulatorSourceInner::Mapped(acc) => acc.accumulator().y.g2.to_g2serde(),
        }
    }

    fn x_g1_range(&self, exp_min: usize, exp_max: usize) -> Vec<G1Affine> {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.get_x_g1_range(exp_min, exp_max),
            AccumulatorSourceInner::Mapped(acc) => {
                archived_x_g1_range(acc.accumulator(), exp_min, exp_max)
            }
        }
    }

    fn alphaxy_g1_range(
        &self,
        exp_alpha: usize,
        exp_x_max: usize,
        exp_y_max: usize,
    ) -> Vec<G1Affine> {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => {
                acc.get_alphaxy_g1_range(exp_alpha, exp_x_max, exp_y_max)
            }
            AccumulatorSourceInner::Mapped(acc) => archived_fill_alphaxy_g1_chunk(
                acc.accumulator(),
                exp_alpha,
                0,
                exp_x_max,
                exp_y_max,
            ),
        }
    }

    fn fill_alphaxy_g1_chunk(
        &self,
        exp_alpha: usize,
        exp_x_start: usize,
        exp_x_len: usize,
        exp_y_max: usize,
        out: &mut Vec<G1Affine>,
    ) {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => {
                acc.fill_alphaxy_g1_chunk(exp_alpha, exp_x_start, exp_x_len, exp_y_max, out)
            }
            AccumulatorSourceInner::Mapped(acc) => fill_archived_alphaxy_g1_chunk(
                acc.accumulator(),
                exp_alpha,
                exp_x_start,
                exp_x_len,
                exp_y_max,
                out,
            ),
        }
    }

    fn fill_xy_powers(&self, out: &mut Vec<G1serde>) {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.fill_xy_powers(out),
            AccumulatorSourceInner::Mapped(acc) => fill_archived_xy_powers(acc.accumulator(), out),
        }
    }

    fn alphax_g1(&self, exp_alpha: usize, exp_x: usize) -> G1serde {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.get_alphax_g1(exp_alpha, exp_x),
            AccumulatorSourceInner::Mapped(acc) => {
                let archived = acc.accumulator();
                assert!(exp_alpha <= 4);
                assert!(exp_x <= archived.x.g1.len());
                if exp_alpha == 0 && exp_x == 0 {
                    icicle_g1_generator()
                } else if exp_alpha == 0 {
                    if exp_x == 0 {
                        icicle_g1_generator()
                    } else {
                        archived.x.g1[exp_x - 1].to_g1serde()
                    }
                } else if exp_x == 0 {
                    archived.alpha[exp_alpha - 1].g1.to_g1serde()
                } else {
                    archived.alpha_x[(exp_alpha - 1) * archived.x.g1.len() + exp_x - 1].to_g1serde()
                }
            }
        }
    }

    fn alphay_g1(&self, exp_alpha: usize, exp_y: usize) -> G1serde {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.get_alphay_g1(exp_alpha, exp_y),
            AccumulatorSourceInner::Mapped(acc) => {
                let archived = acc.accumulator();
                assert!(exp_alpha <= 4);
                assert!(exp_y <= archived.y.g1.len());
                if exp_alpha == 0 && exp_y == 0 {
                    icicle_g1_generator()
                } else if exp_alpha == 0 {
                    if exp_y == 0 {
                        icicle_g1_generator()
                    } else {
                        archived.y.g1[exp_y - 1].to_g1serde()
                    }
                } else if exp_y == 0 {
                    archived.alpha[exp_alpha - 1].g1.to_g1serde()
                } else {
                    archived.alpha_y[(exp_alpha - 1) * archived.y.g1.len() + exp_y - 1].to_g1serde()
                }
            }
        }
    }

    fn xy_g1(&self, exp_x: usize, exp_y: usize) -> G1serde {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.get_xy_g1(exp_x, exp_y),
            AccumulatorSourceInner::Mapped(acc) => {
                let archived = acc.accumulator();
                let y_len = archived.y.g1.len();
                assert!(exp_y <= y_len);
                assert!(exp_x <= archived.x.g1.len());
                if exp_x == 0 && exp_y == 0 {
                    icicle_g1_generator()
                } else if exp_x == 0 {
                    archived.y.g1[exp_y - 1].to_g1serde()
                } else if exp_y == 0 {
                    archived.x.g1[exp_x - 1].to_g1serde()
                } else {
                    archived.xy[(exp_x - 1) * y_len + exp_y - 1].to_g1serde()
                }
            }
        }
    }
}

impl Phase1SrsSource for DuskGroth16Source {
    fn g1(&self) -> G1serde {
        self.g1
    }

    fn g2(&self) -> G2serde {
        self.g2
    }

    fn alpha_g2(&self, exp_alpha: usize) -> G2serde {
        self.tau_g2(self.omega_exp(exp_alpha))
    }

    fn x_g2(&self, exp_x: usize) -> G2serde {
        assert_eq!(exp_x, 1, "Dusk-backed source stores only x^1 in G2");
        self.tau_g2(1)
    }

    fn y_g2(&self, _exp_y: usize) -> G2serde {
        panic!("Dusk-backed source does not provide y powers in G2")
    }

    fn x_g1_range(&self, exp_min: usize, exp_max: usize) -> Vec<G1Affine> {
        self.tau_powers_g1[exp_min..=exp_max].to_vec()
    }

    fn alphaxy_g1_range(
        &self,
        _exp_alpha: usize,
        _exp_x_max: usize,
        _exp_y_max: usize,
    ) -> Vec<G1Affine> {
        panic!("Dusk-backed source does not provide XY-expanded G1 powers")
    }

    fn fill_alphaxy_g1_chunk(
        &self,
        _exp_alpha: usize,
        _exp_x_start: usize,
        _exp_x_len: usize,
        _exp_y_max: usize,
        _out: &mut Vec<G1Affine>,
    ) {
        panic!("Dusk-backed source does not provide XY-expanded G1 powers")
    }

    fn fill_xy_powers(&self, _out: &mut Vec<G1serde>) {
        panic!("Dusk-backed source does not provide XY-expanded G1 powers")
    }

    fn alphax_g1(&self, exp_alpha: usize, exp_x: usize) -> G1serde {
        if exp_alpha == 0 {
            return self.tau_g1(exp_x);
        }
        self.tau_g1(self.omega_exp(exp_alpha) + exp_x)
    }

    fn alphay_g1(&self, _exp_alpha: usize, _exp_y: usize) -> G1serde {
        panic!("Dusk-backed source does not provide Y-expanded G1 powers")
    }

    fn xy_g1(&self, _exp_x: usize, _exp_y: usize) -> G1serde {
        panic!("Dusk-backed source does not provide XY-expanded G1 powers")
    }
}

impl Phase1SrsSource for Phase1Source {
    fn g1(&self) -> G1serde {
        match self {
            Phase1Source::Accumulator(source) => source.g1(),
            Phase1Source::DuskGroth16(source) => source.g1(),
        }
    }

    fn g2(&self) -> G2serde {
        match self {
            Phase1Source::Accumulator(source) => source.g2(),
            Phase1Source::DuskGroth16(source) => source.g2(),
        }
    }

    fn alpha_g2(&self, exp_alpha: usize) -> G2serde {
        match self {
            Phase1Source::Accumulator(source) => source.alpha_g2(exp_alpha),
            Phase1Source::DuskGroth16(source) => source.alpha_g2(exp_alpha),
        }
    }

    fn x_g2(&self, exp_x: usize) -> G2serde {
        match self {
            Phase1Source::Accumulator(source) => source.x_g2(exp_x),
            Phase1Source::DuskGroth16(source) => source.x_g2(exp_x),
        }
    }

    fn y_g2(&self, exp_y: usize) -> G2serde {
        match self {
            Phase1Source::Accumulator(source) => source.y_g2(exp_y),
            Phase1Source::DuskGroth16(source) => source.y_g2(exp_y),
        }
    }

    fn x_g1_range(&self, exp_min: usize, exp_max: usize) -> Vec<G1Affine> {
        match self {
            Phase1Source::Accumulator(source) => source.x_g1_range(exp_min, exp_max),
            Phase1Source::DuskGroth16(source) => source.x_g1_range(exp_min, exp_max),
        }
    }

    fn alphaxy_g1_range(
        &self,
        exp_alpha: usize,
        exp_x_max: usize,
        exp_y_max: usize,
    ) -> Vec<G1Affine> {
        match self {
            Phase1Source::Accumulator(source) => {
                source.alphaxy_g1_range(exp_alpha, exp_x_max, exp_y_max)
            }
            Phase1Source::DuskGroth16(source) => {
                source.alphaxy_g1_range(exp_alpha, exp_x_max, exp_y_max)
            }
        }
    }

    fn fill_alphaxy_g1_chunk(
        &self,
        exp_alpha: usize,
        exp_x_start: usize,
        exp_x_len: usize,
        exp_y_max: usize,
        out: &mut Vec<G1Affine>,
    ) {
        match self {
            Phase1Source::Accumulator(source) => {
                source.fill_alphaxy_g1_chunk(exp_alpha, exp_x_start, exp_x_len, exp_y_max, out)
            }
            Phase1Source::DuskGroth16(source) => {
                source.fill_alphaxy_g1_chunk(exp_alpha, exp_x_start, exp_x_len, exp_y_max, out)
            }
        }
    }

    fn fill_xy_powers(&self, out: &mut Vec<G1serde>) {
        match self {
            Phase1Source::Accumulator(source) => source.fill_xy_powers(out),
            Phase1Source::DuskGroth16(source) => source.fill_xy_powers(out),
        }
    }

    fn alphax_g1(&self, exp_alpha: usize, exp_x: usize) -> G1serde {
        match self {
            Phase1Source::Accumulator(source) => source.alphax_g1(exp_alpha, exp_x),
            Phase1Source::DuskGroth16(source) => source.alphax_g1(exp_alpha, exp_x),
        }
    }

    fn alphay_g1(&self, exp_alpha: usize, exp_y: usize) -> G1serde {
        match self {
            Phase1Source::Accumulator(source) => source.alphay_g1(exp_alpha, exp_y),
            Phase1Source::DuskGroth16(source) => source.alphay_g1(exp_alpha, exp_y),
        }
    }

    fn xy_g1(&self, exp_x: usize, exp_y: usize) -> G1serde {
        match self {
            Phase1Source::Accumulator(source) => source.xy_g1(exp_x, exp_y),
            Phase1Source::DuskGroth16(source) => source.xy_g1(exp_x, exp_y),
        }
    }
}
