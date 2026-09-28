//! Google Drive v3 transport. Only the MPC upload operation calls it.
use crate::publication::{Drive, Entry, Payload};
use reqwest::{
    blocking::{Client, RequestBuilder, Response},
    Method, StatusCode,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    env,
    io::{Read, Seek, SeekFrom},
    path::PathBuf,
    time::Duration,
};

const API: &str = "https://www.googleapis.com/drive/v3/files";
const UPLOAD: &str = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER: &str = "application/vnd.google-apps.folder";
const FIELDS: &str = "id,name,mimeType,size,sha256Checksum";
const CHUNK: usize = 8 * 1024 * 1024; // A multiple of Drive's 256-KiB upload quantum.

pub(crate) struct GoogleDrive {
    client: Client,
    runtime: tokio::runtime::Runtime,
    auth: yup_oauth2::authenticator::DefaultAuthenticator,
    pub root: String,
}

impl GoogleDrive {
    pub fn connect() -> Result<Self, String> {
        // Preserve the established local operator flow by loading the ignored
        // backend .env before resolving Drive configuration.
        let _ = dotenvy::dotenv();
        let required = |name| env::var(name).map_err(|_| format!("missing {name}"));
        let root = required("TOKAMAK_MPC_DRIVE_FOLDER_ID")?;
        valid_id(&root)?;
        let secret = PathBuf::from(required("TOKAMAK_MPC_DRIVE_OAUTH_CLIENT_JSON_PATH")?);
        let token = PathBuf::from(required("TOKAMAK_MPC_DRIVE_OAUTH_TOKEN_PATH")?);
        // Create the token cache with owner-only permissions before the OAuth
        // library writes it. No credential or session URL enters log output.
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        match options.open(&token) {
            Ok(mut file) => {
                use std::io::Write;
                file.write_all(b"[]")
                    .map_err(|_| "cannot initialize OAuth token cache")?;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err("cannot create OAuth token cache".into()),
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let metadata = std::fs::symlink_metadata(&token)
                .map_err(|_| "cannot inspect OAuth token cache")?;
            if !metadata.is_file() || metadata.permissions().mode() & 0o077 != 0 {
                return Err(
                    "OAuth token cache must be a regular owner-only file (chmod 600)".into(),
                );
            }
        }
        let runtime = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
        let auth = runtime.block_on(async {
            let secret = yup_oauth2::read_application_secret(secret)
                .await
                .map_err(|_| "cannot read installed OAuth client configuration")?;
            yup_oauth2::InstalledFlowAuthenticator::builder(
                secret,
                yup_oauth2::InstalledFlowReturnMethod::HTTPRedirect,
            )
            .persist_tokens_to_disk(token)
            .build()
            .await
            .map_err(|_| "cannot initialize installed OAuth flow")
        })?;
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|e| e.to_string())?;
        let mut drive = Self {
            client,
            runtime,
            auth,
            root,
        };
        let root = drive.root.clone();
        let value = drive
            .request(Method::GET, &format!("{API}/{root}"))?
            .query(&[("fields", "id,mimeType,capabilities(canAddChildren)")]);
        let value = json_response(value.send())?;
        if value["mimeType"] != FOLDER || value["capabilities"]["canAddChildren"] != true {
            return Err("Drive destination is not a writable folder".into());
        }
        // The installed consumer lists the configured root anonymously. Do not
        // broaden root permissions; require the operator to provision it.
        anonymous_read(&Entry {
            id: root,
            name: "CRS root".into(),
            folder: true,
            size: 0,
            digest: None,
        })?;
        Ok(drive)
    }

    fn request(&mut self, method: Method, url: &str) -> Result<RequestBuilder, String> {
        let token = self
            .runtime
            .block_on(self.auth.token(&["https://www.googleapis.com/auth/drive"]))
            .map_err(|_| "Drive OAuth authorization failed")?;
        let resumable_put = method == Method::PUT;
        let request = self
            .client
            .request(method, url)
            .bearer_auth(token.token().ok_or("OAuth returned no access token")?);
        Ok(if resumable_put {
            request
        } else {
            request.query(&[("supportsAllDrives", "true")])
        })
    }

    fn get(&mut self, id: &str) -> Result<Entry, String> {
        valid_id(id)?;
        let request = self
            .request(Method::GET, &format!("{API}/{id}"))?
            .query(&[("fields", FIELDS)]);
        entry(json_response(request.send())?)
    }

    fn upload_bytes(&mut self, id: &str, payload: &mut Payload) -> Result<(), String> {
        let request = self
            .request(Method::PATCH, &format!("{UPLOAD}/{id}"))?
            .query(&[("uploadType", "resumable"), ("fields", FIELDS)])
            .header("X-Upload-Content-Type", "application/octet-stream")
            .header("X-Upload-Content-Length", payload.size)
            .json(&json!({}));
        let response = response(request.send())?;
        let session = response
            .headers()
            .get("location")
            .and_then(|v| v.to_str().ok())
            .ok_or("Drive omitted resumable session")?
            .to_string();
        let url = reqwest::Url::parse(&session).map_err(|_| "invalid resumable session URL")?;
        if url.scheme() != "https" || url.host_str() != Some("www.googleapis.com") {
            return Err("unexpected resumable session host".into());
        }
        // Status probes recover an uncertain response without duplicating data.
        // The session is in-memory only; a later command restarts only its own
        // unfinished staging file, never a published payload.
        let mut offset = 0;
        let mut failures = 0;
        let mut buffer = vec![0u8; CHUNK];
        while offset < payload.size {
            let count = (payload.size - offset).min(buffer.len() as u64) as usize;
            payload
                .file
                .seek(SeekFrom::Start(offset))
                .map_err(|e| e.to_string())?;
            payload
                .file
                .read_exact(&mut buffer[..count])
                .map_err(|e| e.to_string())?;
            let request = self
                .request(Method::PUT, &session)?
                .header("Content-Type", "application/octet-stream")
                .header(
                    "Content-Range",
                    format!(
                        "bytes {}-{}/{}",
                        offset,
                        offset + count as u64 - 1,
                        payload.size
                    ),
                )
                .body(buffer[..count].to_vec());
            match request.send() {
                Ok(r) if r.status().is_success() => return Ok(()),
                Ok(r) if r.status().as_u16() == 308 => {
                    let next = resume_offset(
                        r.headers().get("range").and_then(|v| v.to_str().ok()),
                        payload.size,
                    )?;
                    if next <= offset || next > offset + count as u64 {
                        return Err("invalid Drive upload progress".into());
                    }
                    offset = next;
                    failures = 0;
                }
                Ok(r) if !retryable(r.status()) => {
                    return Err(format!("Drive upload rejected: HTTP {}", r.status()))
                }
                _ => {
                    failures += 1;
                    if failures > 5 {
                        return Err("Drive upload interrupted; rerun the upload command".into());
                    }
                    std::thread::sleep(Duration::from_secs(1 << failures));
                    let request = self
                        .request(Method::PUT, &session)?
                        .header("Content-Length", "0")
                        .header("Content-Range", format!("bytes */{}", payload.size));
                    match request.send() {
                        Ok(r) if r.status().is_success() => return Ok(()),
                        Ok(r) if r.status().as_u16() == 308 => {
                            offset = resume_offset(
                                r.headers().get("range").and_then(|v| v.to_str().ok()),
                                payload.size,
                            )?;
                        }
                        Ok(r) => {
                            return Err(format!(
                                "Drive resumable status failed: HTTP {}; rerun upload",
                                r.status()
                            ))
                        }
                        Err(_) => {
                            return Err("Drive resumable status unavailable; rerun upload".into())
                        }
                    }
                }
            }
        }
        // Completion is still confirmed through remote metadata/checksum.
        Ok(())
    }
}

fn retryable(status: StatusCode) -> bool {
    status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS
}

fn resume_offset(range: Option<&str>, size: u64) -> Result<u64, String> {
    let Some(range) = range else {
        return Ok(0);
    };
    let end = range
        .strip_prefix("bytes=0-")
        .ok_or("invalid Drive upload Range")?
        .parse::<u64>()
        .map_err(|_| "invalid Drive upload Range")?;
    end.checked_add(1)
        .filter(|n| *n <= size)
        .ok_or_else(|| "Drive upload Range exceeds payload".into())
}

fn valid_id(id: &str) -> Result<(), String> {
    // Drive IDs are opaque values. Only reject delimiters that would change
    // the request path or turn an ID into a URL rather than imposing a
    // character set that can reject IDs returned by the Drive API itself.
    if id.is_empty()
        || id
            .bytes()
            .any(|c| c.is_ascii_whitespace() || matches!(c, b'/' | b'?' | b'#'))
    {
        return Err("invalid Drive object ID".into());
    }
    Ok(())
}

fn response(result: reqwest::Result<Response>) -> Result<Response, String> {
    let r = result.map_err(|_| "Drive request failed (transport error)")?;
    if !r.status().is_success() {
        return Err(format!("Drive request failed: HTTP {}", r.status()));
    }
    Ok(r)
}
fn json_response(result: reqwest::Result<Response>) -> Result<Value, String> {
    response(result)?
        .json()
        .map_err(|_| "invalid Drive response".into())
}
fn entry(v: Value) -> Result<Entry, String> {
    let id = v["id"]
        .as_str()
        .ok_or("Drive object missing ID")?
        .to_string();
    valid_id(&id)?;
    let folder = v["mimeType"] == FOLDER;
    Ok(Entry {
        id,
        name: v["name"]
            .as_str()
            .ok_or("Drive object missing name")?
            .into(),
        folder,
        size: if folder {
            0
        } else {
            v["size"]
                .as_str()
                .ok_or("Drive file missing size")?
                .parse()
                .map_err(|_| "invalid Drive file size")?
        },
        digest: v["sha256Checksum"].as_str().map(str::to_string),
    })
}

impl Drive for GoogleDrive {
    fn children(&mut self, parent: &str) -> Result<Vec<Entry>, String> {
        valid_id(parent)?;
        let mut page = String::new();
        let mut entries = Vec::new();
        loop {
            let mut request = self.request(Method::GET, API)?.query(&[
                ("q", format!("'{parent}' in parents and trashed = false")),
                (
                    "fields",
                    format!("nextPageToken,incompleteSearch,files({FIELDS})"),
                ),
                ("pageSize", "1000".into()),
                ("includeItemsFromAllDrives", "true".into()),
            ]);
            if !page.is_empty() {
                request = request.query(&[("pageToken", &page)]);
            }
            let v = json_response(request.send())?;
            if v["incompleteSearch"] == true {
                return Err("Drive listing is incomplete".into());
            }
            for file in v["files"].as_array().ok_or("Drive listing missing files")? {
                entries.push(entry(file.clone())?);
            }
            let Some(next) = v["nextPageToken"].as_str() else {
                break;
            };
            if next == page {
                return Err("Drive pagination repeated a token".into());
            }
            page = next.into();
        }
        Ok(entries)
    }
    fn folder(&mut self, parent: &str, name: &str) -> Result<Entry, String> {
        valid_id(parent)?;
        let request = self
            .request(Method::POST, API)?
            .query(&[("fields", FIELDS)])
            .json(&json!({"name": name, "mimeType": FOLDER, "parents": [parent]}));
        entry(json_response(request.send())?)
    }
    fn upload(&mut self, parent: &str, name: &str, payload: &mut Payload) -> Result<Entry, String> {
        valid_id(parent)?;
        let temporary = format!(".upload-{name}-{}", payload.digest);
        let matches: Vec<_> = self
            .children(parent)?
            .into_iter()
            .filter(|e| e.name == temporary)
            .collect();
        if matches.len() > 1 || matches.first().is_some_and(|e| e.folder) {
            return Err("ambiguous upload staging object".into());
        }
        let id = if let Some(e) = matches.first() {
            e.id.clone()
        } else {
            let request = self.request(Method::POST, API)?.query(&[("fields", "id")])
                .json(&json!({"name": temporary, "mimeType": "application/octet-stream", "parents": [parent]}));
            let v = json_response(request.send())?;
            let id = v["id"]
                .as_str()
                .ok_or("Drive upload missing ID")?
                .to_string();
            valid_id(&id)?;
            id
        };
        let result = (|| {
            self.upload_bytes(&id, payload)?;
            let uploaded = self.get(&id)?;
            self.verify_file(&uploaded, payload)?;
            if self.children(parent)?.iter().any(|e| e.name == name) {
                return Err("upload destination appeared concurrently".into());
            }
            self.rename(&uploaded, name)
        })();
        result.map_err(|e: String| format!("staged Drive file {id}: {e}"))
    }
    fn verify_file(&mut self, candidate: &Entry, payload: &Payload) -> Result<(), String> {
        let actual = self.get(&candidate.id)?;
        if actual.folder || actual.size != payload.size {
            return Err(format!("Drive size mismatch: {}", candidate.name));
        }
        if let Some(digest) = actual.digest {
            if digest != payload.digest {
                return Err(format!("Drive SHA-256 mismatch: {}", candidate.name));
            }
        } else {
            // Drive documents SHA-256 as optional. Verify actual bytes instead
            // of accepting a caller-written appProperty claiming their digest.
            let request = self
                .request(Method::GET, &format!("{API}/{}", candidate.id))?
                .query(&[("alt", "media")]);
            let mut r = response(request.send())?;
            let mut hash = Sha256::new();
            let mut buffer = vec![0u8; 1024 * 1024];
            let mut size = 0;
            loop {
                let n = r
                    .read(&mut buffer)
                    .map_err(|_| "Drive checksum download failed")?;
                if n == 0 {
                    break;
                }
                size += n as u64;
                if size > payload.size {
                    return Err("Drive checksum download too large".into());
                }
                hash.update(&buffer[..n]);
            }
            if size != payload.size || format!("{:x}", hash.finalize()) != payload.digest {
                return Err("Drive downloaded bytes mismatch".into());
            }
        }
        Ok(())
    }
    fn public_read(&mut self, object: &Entry) -> Result<(), String> {
        let url = format!("{API}/{}/permissions", object.id);
        let mut page = String::new();
        let mut public = false;
        loop {
            let mut request = self
                .request(Method::GET, &url)?
                .query(&[("fields", "permissions(id,type,role),nextPageToken")]);
            if !page.is_empty() {
                request = request.query(&[("pageToken", &page)]);
            }
            let v = json_response(request.send())?;
            public |= v["permissions"]
                .as_array()
                .ok_or("Drive permission list missing")?
                .iter()
                .any(|p| p["type"] == "anyone" && p["role"] == "reader");
            let Some(next) = v["nextPageToken"].as_str() else {
                break;
            };
            if next == page {
                return Err("Drive permission pagination repeated a token".into());
            }
            page = next.into();
        }
        if !public {
            let request = self
                .request(Method::POST, &url)?
                .json(&json!({"type":"anyone","role":"reader","allowFileDiscovery":false}));
            response(request.send())?;
        }
        anonymous_read(object)
    }
    fn rename(&mut self, object: &Entry, name: &str) -> Result<Entry, String> {
        let request = self
            .request(Method::PATCH, &format!("{API}/{}", object.id))?
            .query(&[("fields", FIELDS)])
            .json(&json!({"name":name}));
        entry(json_response(request.send())?)
    }
}

fn anonymous_read(object: &Entry) -> Result<(), String> {
    // Anonymous read/list capability is what the existing consumer needs.
    let url = if object.folder {
        format!(
            "https://drive.google.com/drive/mobile/folders/{}",
            object.id
        )
    } else {
        format!(
            "https://drive.usercontent.google.com/download?id={}&export=download&confirm=t",
            object.id
        )
    };
    let public_client = Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    let request = public_client.get(url);
    let request = if object.folder {
        request
    } else {
        request.header("Range", "bytes=0-0")
    };
    let r = request.send().map_err(|_| "anonymous Drive read failed")?;
    if !r.status().is_success() {
        return Err(format!("anonymous Drive read failed: HTTP {}", r.status()));
    }
    if !object.folder
        && r.headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.contains("text/html"))
    {
        return Err("anonymous Drive download returned an HTML gate".into());
    }
    if object.folder {
        let mut bytes = Vec::new();
        r.take(8 * 1024 * 1024)
            .read_to_end(&mut bytes)
            .map_err(|_| "anonymous folder listing failed")?;
        if !String::from_utf8_lossy(&bytes).contains("window['_DRIVE_ivd']") {
            return Err("anonymous folder is not listable by the consumer".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resumed_ranges_are_bounded_and_zero_based() {
        assert_eq!(resume_offset(None, 256).unwrap(), 0);
        assert_eq!(resume_offset(Some("bytes=0-255"), 256).unwrap(), 256);
        for bad in [
            "bytes=1-255",
            "bytes=0-256",
            "bytes=0-18446744073709551615",
            "nonsense",
        ] {
            assert!(resume_offset(Some(bad), 256).is_err());
        }
    }

    #[test]
    fn drive_ids_are_opaque_but_not_urls() {
        assert!(valid_id("1opaque~Drive.ID=").is_ok());
        for invalid in ["", "folder/id", "folder?id", "folder#id", "folder id"] {
            assert!(valid_id(invalid).is_err());
        }
    }
}
