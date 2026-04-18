import { PlacementVariables } from '../../synthesizer/types/placements.ts';

export type PublicInstance = {
    a_pub_user: `0x${string}`[]
    a_pub_block: `0x${string}`[]
    a_pub_function: `0x${string}`[]
}

export type PublicInstanceDescription = {
    a_pub_user_description: string[]
    a_pub_block_description: string[]
    a_pub_function_description: string[]
}

export type Permutation = { row: number; col: number; X: number; Y: number }[];

export interface CircuitArtifacts {
    placementVariables: PlacementVariables
    publicInstance: PublicInstance
    publicInstanceDescription: PublicInstanceDescription
    permutation: Permutation
}
