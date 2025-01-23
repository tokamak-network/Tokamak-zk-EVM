import type { EVM } from '../evm.js';
import type { EOFContainer } from './container.js';
/**
 * Note for reviewers regarding these flags: these only reside inside `verify.ts` (this file)
 * and `container.ts`. For `container.ts`, the only behavior which ever changes is in the `DeploymentCode` mode
 * This `DeploymentCode` mode means that the subcontainer is flagged in such way that this container is launched
 * in a "deployment" mode. This means, that the data section of the body is actually allowed to contain
 * less data than is written in the header. However, once the target container (by the container in deployment)
 * mode is returned by RETURNCONTRACT it should have at least the header amount of data.
 * See also "data section lifecycle"
 * Note: the subcontainers of a container can be marked "InitCode" or "DeploymentCode".
 * InitCode cannot contain the instructions RETURN / STOP
 * InitCode is the only container type which can contain RETURNCONTRACT
 * A container can also be marked DeploymentCode, this is a subcontainer targeted by RETURNCONTRACT
 * A container cannot be marked both InitCode and DeploymentCode
 * This flag is thus to distinguish between subcontainers, and also thus also allows for data section sizes
 * lower than the size in the header in case of `InitCode`
 */
export declare enum ContainerSectionType {
    InitCode = 0,
    DeploymentCode = 1,
    RuntimeCode = 2
}
/**
 * This method validates an EOF container deeply. It will validate the opcodes, validate the stack, and performs
 * various checks such as checking for forbidden opcodes in certain modes, jumps to invalid places, etc.
 * For more information, see "Code validation" of https://github.com/ipsilon/eof/blob/main/spec/eof.md
 * This is a compilation of all the extra validation rules introduced by the various EIPs
 * In particular, the stack validation EIP https://eips.ethereum.org/EIPS/eip-5450 is a big part here
 * @param container EOFContainer to verify
 * @param evm The EVM to run in (pulls opcodes from here)
 * @param mode The validation mode to run in
 * @returns Returns a Map which marks what ContainerSectionType each container is
 * NOTE: this should likely not be a map, since a container section can only be of a single type, not multiple
 */
export declare function verifyCode(container: EOFContainer, evm: EVM, mode?: ContainerSectionType): Map<number, ContainerSectionType>;
//# sourceMappingURL=verify.d.ts.map