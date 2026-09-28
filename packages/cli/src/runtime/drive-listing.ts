const DRIVE_LISTING_ASSIGNMENT = "window['_DRIVE_ivd']";
const MAX_DRIVE_LISTING_CHARACTERS = 8 * 1024 * 1024;

function decodeHexQuad(value: string): string {
  if (!/^[0-9a-f]{4}$/iu.test(value)) {
    throw new Error('Google Drive listing uses an invalid Unicode escape.');
  }
  return String.fromCharCode(Number.parseInt(value, 16));
}

/**
 * Decodes only the single-quoted JavaScript string used by the Drive listing.
 * It deliberately accepts a small escape subset rather than
 * evaluating server-provided JavaScript.
 */
export function decodeDriveListingLiteral(html: string): string {
  if (html.length > MAX_DRIVE_LISTING_CHARACTERS) {
    throw new Error('Google Drive listing is larger than the supported decoder limit.');
  }
  const assignmentStart = html.indexOf(DRIVE_LISTING_ASSIGNMENT);
  if (assignmentStart < 0) {
    throw new Error('Unable to locate Google Drive listing payload.');
  }
  let index = assignmentStart + DRIVE_LISTING_ASSIGNMENT.length;
  while (/\s/u.test(html[index] ?? '')) index += 1;
  if (html[index] !== '=') {
    throw new Error('Google Drive listing payload assignment is malformed.');
  }
  index += 1;
  while (/\s/u.test(html[index] ?? '')) index += 1;
  if (html[index] !== "'") {
    throw new Error('Google Drive listing payload must use a single-quoted literal.');
  }
  index += 1;

  let decoded = '';
  while (index < html.length) {
    const character = html[index];
    index += 1;
    if (character === "'") {
      return decoded;
    }
    if (character === '\\') {
      const escape = html[index];
      index += 1;
      switch (escape) {
        case "'":
        case '"':
        case '\\':
        case '/':
          decoded += escape;
          break;
        case 'b':
          decoded += '\b';
          break;
        case 'f':
          decoded += '\f';
          break;
        case 'n':
          decoded += '\n';
          break;
        case 'r':
          decoded += '\r';
          break;
        case 't':
          decoded += '\t';
          break;
        case 'x': {
          const hex = html.slice(index, index + 2);
          if (!/^[0-9a-f]{2}$/iu.test(hex)) {
            throw new Error('Google Drive listing uses an invalid hex escape.');
          }
          decoded += String.fromCharCode(Number.parseInt(hex, 16));
          index += 2;
          break;
        }
        case 'u':
          decoded += decodeHexQuad(html.slice(index, index + 4));
          index += 4;
          break;
        default:
          throw new Error(`Google Drive listing uses unsupported escape ${JSON.stringify(`\\${escape ?? ''}`)}.`);
      }
      continue;
    }
    if (character === '\n' || character === '\r') {
      throw new Error('Google Drive listing payload contains an unescaped line break.');
    }
    decoded += character;
  }
  throw new Error('Google Drive listing payload string is not terminated.');
}

function parseListingPayload(html: string): unknown {
  const decoded = decodeDriveListingLiteral(html);
  try {
    return JSON.parse(decoded) as unknown;
  } catch (error) {
    throw new Error(`Google Drive listing payload is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}


export interface DriveEntry {
  readonly fileId: string;
  readonly name: string;
  readonly sizeBytes: number;
}

/** Resolve one exact child; folders and files never substitute for each other. */
export function selectDriveEntry(html: string, name: string, kind: 'file' | 'folder'): DriveEntry {
  const entries: DriveEntry[] = [];
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'string' && node[2] === name && typeof node[3] === 'string') {
      const isFolder = node[3] === 'application/vnd.google-apps.folder';
      if (isFolder !== (kind === 'folder')) {
        throw new Error(`Google Drive entry ${JSON.stringify(name)} must be a ${kind}.`);
      }
      if (!/^[a-zA-Z0-9_-]+$/u.test(node[0])) throw new Error('Invalid Google Drive file ID.');
      const sizeBytes = kind === 'folder' ? 0 : node[13];
      if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || (kind === 'file' && sizeBytes === 0)) {
        throw new Error(`Google Drive file ${JSON.stringify(name)} has an invalid size.`);
      }
      entries.push({ fileId: node[0], name, sizeBytes });
    }
    for (const child of node) walk(child);
  };
  walk(parseListingPayload(html));
  if (entries.length !== 1) {
    throw new Error(`Expected exactly one Google Drive ${kind} ${JSON.stringify(name)}, found ${entries.length}.`);
  }
  return entries[0];
}
