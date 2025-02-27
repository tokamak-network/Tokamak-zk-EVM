<<<<<<< HEAD
import { bytesToHex, computeVersionedHash, getBlobs } from "@ethereumjs/util/index.js"

const blobs = getBlobs('test input')

console.log('Created the following blobs:')
console.log(blobs)

const commitment = bytesToHex(new Uint8Array([1, 2, 3]))
const blobCommitmentVersion = 0x01
const versionedHash = computeVersionedHash(commitment, blobCommitmentVersion)

console.log(`Versioned hash ${versionedHash} computed`)
=======
import { bytesToHex, computeVersionedHash, getBlobs } from "@synthesizer-libs/util"

const blobs = getBlobs('test input')

console.log('Created the following blobs:')
console.log(blobs)

const commitment = bytesToHex(new Uint8Array([1, 2, 3]))
const blobCommitmentVersion = 0x01
const versionedHash = computeVersionedHash(commitment, blobCommitmentVersion)

console.log(`Versioned hash ${versionedHash} computed`)
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
