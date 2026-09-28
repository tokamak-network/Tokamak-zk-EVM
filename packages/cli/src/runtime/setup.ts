import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ensureDir, packageCompatibleVersion, runtimePaths } from './context.js';
import { selectDriveEntry, type DriveEntry } from './drive-listing.js';
import { downloadFileWithResume, fileExists, normalizeSha256, sha256FileHex } from './download.js';
import type { RuntimeContext } from './model.js';
import { crsProvenanceFileName, crsArchiveRootFileNames, parseCrsProvenance } from '../generated/crs-provenance-validator.generated.js';
import { BACKEND_PACKAGE_NAMES, backendBuildMetadataFileName, parseBackendBuildMetadata } from '../generated/backend-build-metadata-validator.generated.js';

type CrsProvenance = import('../generated/crs-provenance-validator.generated.js').CrsProvenance;
const SUBCIRCUIT_LIBRARY_PACKAGE_NAME = '@tokamak-zk-evm/subcircuit-library';
const CRS_PROVENANCE_FILE_NAME = crsProvenanceFileName();
const FINAL_CRS_ARTIFACT_FILES = crsArchiveRootFileNames();
const CRS_DRIVE_FOLDER_ID = '14xqCbLoyoVmUVTTlopiXtKnoHPBGL-Sv';

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}
async function listing(folderId: string): Promise<string> {
  const response = await fetch(`https://drive.google.com/drive/mobile/folders/${folderId}`);
  if (!response.ok) throw new Error(`Failed to read CRS listing: ${response.status} ${response.statusText}`);
  return response.text();
}
async function download(entry: DriveEntry, destination: string, verbose: boolean, digest?: string): Promise<void> {
  if (await fileExists(destination)) {
    if ((await fs.stat(destination)).size === entry.sizeBytes &&
        digest !== undefined && await sha256FileHex(destination) === digest) return;
    await fs.rm(destination, { force: true });
  }
  await downloadFileWithResume(destination, {
    archiveName: entry.name, contentLength: entry.sizeBytes, fileId: entry.fileId,
  }, verbose, {
    describe: 'Anonymous CRS file download',
    maxRetries: 5,
    request: (offset, end) => ({
      url: `https://drive.usercontent.google.com/download?id=${entry.fileId}&export=download&confirm=t`,
      headers: { Range: `bytes=${offset}-${end}` },
    }),
  });
  if ((await fs.stat(destination)).size !== entry.sizeBytes ||
      (digest !== undefined && await sha256FileHex(destination) !== digest)) {
    await fs.rm(destination, { force: true });
    throw new Error(`Downloaded CRS file ${entry.name} failed size or sha256 validation.`);
  }
}

export interface DownloadedVerifierSetup {
  readonly directory: string;
  readonly rootListing: string;
  readonly versionListing: string;
  readonly provenance: CrsProvenance;
}

/** Keep a single selected release and its checked key alive across compilation. */
export async function withDownloadedVerifierSetup<T>(
  context: RuntimeContext, verbose: boolean,
  action: (setup: DownloadedVerifierSetup) => Promise<T>,
): Promise<T> {
  const rootListing = await listing(CRS_DRIVE_FOLDER_ID);
  const versionFolder = selectDriveEntry(rootListing, context.compatibleBackendVersion, 'folder');
  const versionListing = await listing(versionFolder.fileId);
  const provenanceEntry = selectDriveEntry(versionListing, CRS_PROVENANCE_FILE_NAME, 'file');
  if (provenanceEntry.sizeBytes > 1024 * 1024) throw new Error('CRS provenance exceeds 1 MiB.');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-crs-input-'));
  try {
    const provenancePath = path.join(directory, CRS_PROVENANCE_FILE_NAME);
    await download(provenanceEntry, provenancePath, verbose);
    const provenance = parseCrsProvenance(await readJsonFile<unknown>(provenancePath));
    if (provenance.compatibleBackendVersion !== context.compatibleBackendVersion ||
        provenance.subcircuitLibrary.origin !== 'npmSnapshot' ||
        provenance.subcircuitLibrary.packageName !== SUBCIRCUIT_LIBRARY_PACKAGE_NAME ||
        packageCompatibleVersion(provenance.subcircuitLibrary.packageVersion!, 'CRS library version') !== context.compatibleBackendVersion) {
      throw new Error('CRS provenance does not identify the selected production library version.');
    }
    const key = selectDriveEntry(versionListing, 'verifier_keys.rkyv', 'file');
    await download(key, path.join(directory, key.name), verbose, provenance.artifacts['verifier_keys.rkyv']);
    return await action({ directory, rootListing, versionListing, provenance });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

/** Complete only a full installation; verifier-only mode never lists or downloads tau. */
export async function installDownloadedSetup(
  context: RuntimeContext, backendReleaseDir: string, verbose: boolean,
  setup: DownloadedVerifierSetup, noFullSetup: boolean,
): Promise<void> {
  if (!noFullSetup) {
    for (const name of ['prover_keys.rkyv', 'preprocess_keys.rkyv'] as const) {
      await download(selectDriveEntry(setup.versionListing, name, 'file'),
        path.join(setup.directory, name), verbose, setup.provenance.artifacts[name]);
    }
    const tauFolder = selectDriveEntry(setup.rootListing, 'tau_sequence', 'folder');
    const tauDigest = setup.provenance.artifacts['tau_sequence.rkyv'];
    const tau = selectDriveEntry(await listing(tauFolder.fileId), `${tauDigest}.rkyv`, 'file');
    // Share the platform's content-addressed cache across CRS versions.
    const tauCache = path.join(context.platformDir, 'downloads', 'tau_sequence', tau.name);
    await ensureDir(path.dirname(tauCache));
    await download(tau, tauCache, verbose, tauDigest);
    await fs.copyFile(tauCache, path.join(setup.directory, 'tau_sequence.rkyv'));
  }
  const { provenancePath } = await validateDownloadedCrs(setup.directory, backendReleaseDir,
    context.compatibleBackendVersion, context.compatibleBackendVersion, context.packageVersion, noFullSetup);
  await installValidatedCrsGeneration(setup.directory, provenancePath,
    runtimePaths(context).setupOutputDir, context.compatibleBackendVersion, fs.copyFile, noFullSetup);
}

export async function validateDownloadedCrs(
  extractedDir: string,
  backendReleaseDir: string,
  releaseName: string,
  compatibleBackendVersion: string,
  expectedBackendPackageVersion: string,
  noFullSetup = false,
): Promise<{
  provenancePath: string;
}> {
  const provenancePath = path.join(extractedDir, CRS_PROVENANCE_FILE_NAME);
  const provenance = await validateCrsProvenanceContract(
    await readJsonFile<unknown>(provenancePath),
    releaseName,
  );
  if (provenance.compatibleBackendVersion !== compatibleBackendVersion) {
    throw new Error(
      `CRS release ${releaseName} has compatibleBackendVersion ${provenance.compatibleBackendVersion ?? '<missing>'}, expected ${compatibleBackendVersion}.`,
    );
  }
  await validateCrsArtifactHashes(extractedDir, releaseName, provenance, noFullSetup);

  const provenanceSubcircuitPackageName = provenance.subcircuitLibrary?.packageName;
  const provenanceSubcircuitPackageVersion = provenance.subcircuitLibrary?.packageVersion;
  const provenanceSubcircuitSourceDigest = provenance.subcircuitLibrary?.sourceDigest;
  if (!provenanceSubcircuitPackageName || !provenanceSubcircuitPackageVersion || !provenanceSubcircuitSourceDigest) {
    throw new Error(`CRS release ${releaseName} provenance is missing subcircuit-library package information.`);
  }
  if (provenanceSubcircuitPackageName !== SUBCIRCUIT_LIBRARY_PACKAGE_NAME) {
    throw new Error(
      `CRS release ${releaseName} provenance subcircuit-library package ${provenanceSubcircuitPackageName} does not match ${SUBCIRCUIT_LIBRARY_PACKAGE_NAME}.`,
    );
  }
  if (
    packageCompatibleVersion(provenanceSubcircuitPackageVersion, 'CRS provenance subcircuit-library packageVersion') !==
    compatibleBackendVersion
  ) {
    throw new Error(
      `CRS release ${releaseName} provenance subcircuit-library version ${provenanceSubcircuitPackageVersion} is not compatible with ${compatibleBackendVersion}.`,
    );
  }

  for (const backendName of BACKEND_PACKAGE_NAMES) {
    const backendMetadataPath = path.join(backendReleaseDir, backendBuildMetadataFileName(backendName));
    const backendMetadata = parseBackendBuildMetadata(
      await readJsonFile<unknown>(backendMetadataPath),
      backendName,
      `Backend package ${backendName} build metadata`,
    );
    const backendVersion = backendMetadata.packageVersion;
    const backendCompatibleVersion = backendMetadata.compatibleBackendVersion;
    const backendSubcircuitVersion = backendMetadata.dependencies.subcircuitLibrary.buildVersion;
    const backendSubcircuitPackageName = backendMetadata.dependencies.subcircuitLibrary.packageName;
    const backendSubcircuitSourceDigest = backendMetadata.dependencies.subcircuitLibrary.sourceDigest;
    if (backendCompatibleVersion !== compatibleBackendVersion) {
      throw new Error(
        `Backend package ${backendName} has compatibleBackendVersion ${backendCompatibleVersion}, but the downloaded CRS expects ${compatibleBackendVersion}.`,
      );
    }
    if (backendVersion !== expectedBackendPackageVersion) {
      throw new Error(
        `Backend package ${backendName} has version ${backendVersion}, expected current CLI package version ${expectedBackendPackageVersion}.`,
      );
    }
    if (packageCompatibleVersion(backendVersion, `${backendName} packageVersion`) !== compatibleBackendVersion) {
      throw new Error(
        `Backend package ${backendName} has version ${backendVersion}, which is not compatible with CRS version ${compatibleBackendVersion}.`,
      );
    }
    if (backendSubcircuitPackageName !== SUBCIRCUIT_LIBRARY_PACKAGE_NAME) {
      throw new Error(
        `Backend package ${backendName} records subcircuit-library package ${backendSubcircuitPackageName}, expected ${SUBCIRCUIT_LIBRARY_PACKAGE_NAME}.`,
      );
    }
    if (
      packageCompatibleVersion(backendSubcircuitVersion, `${backendName} subcircuit-library buildVersion`) !==
      compatibleBackendVersion
    ) {
      throw new Error(
        `Backend package ${backendName} embeds subcircuit-library version ${backendSubcircuitVersion}, which is not compatible with CRS version ${compatibleBackendVersion}.`,
      );
    }
    if (backendSubcircuitSourceDigest !== provenanceSubcircuitSourceDigest) {
      throw new Error(
        `Backend package ${backendName} subcircuit-library sourceDigest ${backendSubcircuitSourceDigest} does not match CRS sourceDigest ${provenanceSubcircuitSourceDigest}.`,
      );
    }
  }

  return {
    provenancePath,
  };
}

export async function validateCrsProvenanceContract(
  provenance: unknown,
  releaseName: string,
): Promise<CrsProvenance> {
  return parseCrsProvenance(provenance, `CRS release ${releaseName} provenance`);
}

async function validateCrsArtifactHashes(
  extractedDir: string,
  releaseName: string,
  provenance: CrsProvenance,
  noFullSetup = false,
): Promise<void> {
  for (const [fileName, digest] of Object.entries(provenance.artifacts)) {
    if (noFullSetup && fileName !== 'verifier_keys.rkyv') continue;
    const expected = normalizeSha256(digest);
    if (expected === null) {
      throw new Error(`CRS release ${releaseName} provenance has an invalid digest for ${fileName}.`);
    }
    const filePath = path.join(extractedDir, fileName);
    const actual = await sha256FileHex(filePath);
    if (actual !== expected) {
      throw new Error(`CRS release ${releaseName} ${fileName} sha256 mismatch: expected=${expected} actual=${actual}.`);
    }
  }
}

export async function installValidatedCrsGeneration(
  extractedDir: string,
  provenancePath: string,
  setupOutputDir: string,
  releaseName: string,
  copyFile: typeof fs.copyFile = fs.copyFile,
  noFullSetup = false,
): Promise<void> {
  const setupDirectory = path.dirname(setupOutputDir);
  const generationsDirectory = path.join(setupDirectory, 'generations');
  await ensureDir(generationsDirectory);

  const stagingDirectory = await fs.mkdtemp(path.join(generationsDirectory, '.staging-'));
  let generationDirectory: string | undefined;
  let activated = false;
  try {
    for (const fileName of noFullSetup ? [CRS_PROVENANCE_FILE_NAME, 'verifier_keys.rkyv'] : FINAL_CRS_ARTIFACT_FILES) {
      const sourcePath = fileName === CRS_PROVENANCE_FILE_NAME
        ? provenancePath
        : path.join(extractedDir, fileName);
      await copyFile(sourcePath, path.join(stagingDirectory, fileName));
    }

    const stagedProvenance = await validateCrsProvenanceContract(
      await readJsonFile<unknown>(path.join(stagingDirectory, CRS_PROVENANCE_FILE_NAME)),
      releaseName,
    );
    await validateCrsArtifactHashes(stagingDirectory, releaseName, stagedProvenance, noFullSetup);

    generationDirectory = path.join(
      generationsDirectory,
      `generation-${path.basename(stagingDirectory).replace(/^\.staging-/u, '')}`,
    );
    await fs.rename(stagingDirectory, generationDirectory);
    const previousGenerationDirectory = await activateCrsGeneration(
      setupOutputDir,
      generationsDirectory,
      generationDirectory,
    );
    activated = true;
    if (previousGenerationDirectory !== undefined && previousGenerationDirectory !== generationDirectory) {
      await fs.rm(previousGenerationDirectory, { recursive: true, force: true });
    }
  } finally {
    if (!activated && generationDirectory !== undefined) {
      await fs.rm(generationDirectory, { recursive: true, force: true });
    } else if (!activated) {
      await fs.rm(stagingDirectory, { recursive: true, force: true });
    }
  }
}

async function activateCrsGeneration(
  setupOutputDir: string,
  generationsDirectory: string,
  nextGenerationDirectory: string,
): Promise<string | undefined> {
  const outputState = await inspectSetupOutput(setupOutputDir, generationsDirectory);
  if (outputState.kind === 'unmanaged-symlink') {
    throw new Error(
      `Existing setup output symlink is not managed by this CLI installation: ${setupOutputDir} -> ${outputState.target}`,
    );
  }
  if (outputState.kind === 'directory') {
    throw new Error(
      `Existing setup output uses the retired directory layout: ${setupOutputDir}. Remove it before installing the current CRS layout.`,
    );
  }
  const temporaryLink = `${setupOutputDir}.next`;
  await removeManagedTemporarySetupLink(temporaryLink, generationsDirectory);
  await fs.symlink(path.relative(path.dirname(setupOutputDir), nextGenerationDirectory), temporaryLink, 'dir');
  let temporaryLinkCreated = true;

  try {
    await fs.rename(temporaryLink, setupOutputDir);
    temporaryLinkCreated = false;
  } catch (error) {
    if (temporaryLinkCreated) {
      await removeManagedTemporarySetupLink(temporaryLink, generationsDirectory);
    }
    throw error;
  }

  return outputState.kind === 'symlink' ? outputState.targetGenerationDirectory : undefined;
}

async function removeManagedTemporarySetupLink(
  temporaryLink: string,
  generationsDirectory: string,
): Promise<void> {
  let temporaryLinkStat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    temporaryLinkStat = await fs.lstat(temporaryLink);
  } catch (error) {
    if (isMissingPathError(error)) {
      return;
    }
    throw error;
  }
  if (!temporaryLinkStat.isSymbolicLink()) {
    throw new Error(`Existing setup activation temporary path is not managed by this CLI installation: ${temporaryLink}`);
  }
  const target = await fs.readlink(temporaryLink);
  const resolvedTarget = path.resolve(path.dirname(temporaryLink), target);
  if (!isPathInside(generationsDirectory, resolvedTarget)) {
    throw new Error(
      `Existing setup activation temporary symlink is not managed by this CLI installation: ${temporaryLink} -> ${target}`,
    );
  }
  await fs.rm(temporaryLink, { force: true });
}

type SetupOutputState =
  | { kind: 'missing' }
  | { kind: 'directory' }
  | { kind: 'symlink'; targetGenerationDirectory: string }
  | { kind: 'unmanaged-symlink'; target: string };

async function inspectSetupOutput(setupOutputDir: string, generationsDirectory: string): Promise<SetupOutputState> {
  try {
    const outputStat = await fs.lstat(setupOutputDir);
    if (outputStat.isDirectory()) {
      return { kind: 'directory' };
    }
    if (!outputStat.isSymbolicLink()) {
      throw new Error(`Existing setup output path is neither a directory nor a symbolic link: ${setupOutputDir}`);
    }
    const target = await fs.readlink(setupOutputDir);
    const resolvedTarget = path.resolve(path.dirname(setupOutputDir), target);
    if (!isPathInside(generationsDirectory, resolvedTarget)) {
      return { kind: 'unmanaged-symlink', target };
    }
    return {
      kind: 'symlink',
      targetGenerationDirectory: resolvedTarget,
    };
  } catch (error) {
    if (isMissingPathError(error)) {
      return { kind: 'missing' };
    }
    throw error;
  }
}

function isPathInside(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return (
    relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
  );
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
