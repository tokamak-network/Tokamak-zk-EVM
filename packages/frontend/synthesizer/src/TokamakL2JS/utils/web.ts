import { utf8ToBytes } from "ethereum-cryptography/utils";
import { poseidon } from "../crypto/index.ts";
import { jubjub } from "@noble/curves/misc.js";
import { bigIntToBytes, bytesToBigInt, bytesToHex, setLengthLeft } from "@ethereumjs/util";
import { fromEdwardsToAddress, getUserStorageKey } from "./utils.ts";

export const L2_PRV_KEY_MESSAGE='Tokamak-Private-App-Channel-'

type L2KeyPair = {
  privateKey: Uint8Array
  publicKey: Uint8Array
}

// ##Usage##
// import { useSignMessage } from 'wagmi';
// const { signMessageAsync } = useSignMessage();

export const deriveSignatureFromMetaMask = async (signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>, channelId: `0x${string}`): Promise<`0x${string}`> => {
  const messageToSign = `Tokamak-Private-App-Channel-${channelId}`;
  return await signMessageAsync({ message: messageToSign })
};

export const deriveL2KeysFromSignature = (signature: `0x${string}`):  L2KeyPair => {
  const rngStringRaw = jubjub.utils.randomPrivateKey(poseidon(utf8ToBytes(signature)));
  const privateKey = setLengthLeft(bigIntToBytes(bytesToBigInt(rngStringRaw) % jubjub.Point.Fn.ORDER), 32);
  const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();
  return {privateKey, publicKey};
};

export const deriveL2AddressFromKeys = (keys: L2KeyPair): `0x${string}` => {
  const address = fromEdwardsToAddress(keys.publicKey);
  return address.toString()
};

export const deriveL2MptKeyFromAddress = (address: `0x${string}`, slotIndex: number): `0x${string}` => {
  const mptKey = getUserStorageKey([address, slotIndex], 'TokamakL2');
  return bytesToHex(mptKey)
};


