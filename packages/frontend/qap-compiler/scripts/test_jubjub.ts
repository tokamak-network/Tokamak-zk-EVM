import {jubjub} from '@noble/curves/jubjub';
import {bls12_381} from '@noble/curves/bls12-381';

const Gx = jubjub.Point.BASE.x;
const Gy = jubjub.Point.BASE.y;
const n = jubjub.Point.Fn.ORDER;
console.log(`Gx: ${Gx}`);
console.log(`Gy: ${Gy}`);
console.log(`n: ${n}`);
console.log(`n_bit: ${jubjub.Point.Fn.BITS}`);