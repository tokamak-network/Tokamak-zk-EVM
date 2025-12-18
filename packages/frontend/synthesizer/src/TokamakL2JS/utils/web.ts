import { utf8ToBytes } from "ethereum-cryptography/utils";
import { poseidon } from "../crypto/index.ts";
import { jubjub } from "@noble/curves/misc";
import { bytesToBigInt, bytesToHex } from "@ethereumjs/util";
import { fromEdwardsToAddress, getUserStorageKey } from "./utils.ts";

type L2KeyPair = {
  privateKey: Uint8Array
  publicKey: Uint8Array
}

// ##Usage##
// import { useSignMessage } from 'wagmi';
// const { signMessageAsync } = useSignMessage();

export const deriveL2KeysFromMetaMask = async (signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>, channelId: `0x${string}`): Promise<L2KeyPair> => {
  const messageToSign = `Tokamak-Private-App-Channel-${channelId}`;
  const signature = await signMessageAsync({ message: messageToSign });
  return derive_keys_from_signature(signature)
};

export const deriveL2AddressFromMetaMask = async (signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>, channelId: `0x${string}`): Promise<`0x${string}`> => {
  const keys = await deriveL2KeysFromMetaMask(signMessageAsync, channelId);
  const address = fromEdwardsToAddress(keys.publicKey);
  return address.toString()
};

export const deriveL2MptKeyFromMetaMask = async (signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>, channelId: `0x${string}`, slotIndex: number): Promise<`0x${string}`> => {
  const address = await deriveL2AddressFromMetaMask(signMessageAsync, channelId);
  const mptKey = getUserStorageKey([address, slotIndex], 'TokamakL2');
  return bytesToHex(mptKey)
};

const derive_keys_from_signature = (signature: `0x${string}`):  L2KeyPair => {
  const privateKey = jubjub.utils.randomPrivateKey(poseidon(utf8ToBytes(signature)));
  const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey) % jubjub.Point.Fn.ORDER).toBytes();
  return {privateKey, publicKey};
};
