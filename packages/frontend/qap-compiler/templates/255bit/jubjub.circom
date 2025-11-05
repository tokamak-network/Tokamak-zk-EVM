pragma circom 2.1.6;
include "../../node_modules/poseidon-bls12381-circom/circuits/poseidon255.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

function jubjubconst() {
    // Constants for Jubjub over BLS12-381 Fr
    // a = -1 (mod q), d = -(10240/10241) (mod q)
    var A = 52435875175126190479447740508185965837690552500527637822603658699938581184512;
    var D = 19257038036680949359750312669786877991949435402254120286184196891950884077233;
    var n = 6554484396890773809930967563523245729705921265872317281365359162392183254199;
    return [A, D, n];
}

template splitJubjubInto128() {
    signal input point[2];
    signal output split_point[2][2];

    var FIELD_SIZE = 1<<128;
    split_point[0] <-- [
        point[0] % FIELD_SIZE,
        point[0] \ FIELD_SIZE
    ];
    split_point[1] <-- [
        point[1] % FIELD_SIZE,
        point[1] \ FIELD_SIZE
    ];

    point[0] === split_point[0][0] + split_point[0][1] * FIELD_SIZE;
    point[1] === split_point[1][0] + split_point[1][1] * FIELD_SIZE;
}

template mergeJubjubInto255() {
    signal input split_point[2][2];
    signal output point[2];

    var FIELD_SIZE = 1<<128;
    point[0] <== split_point[0][0] + split_point[0][1] * FIELD_SIZE;
    point[1] <== split_point[1][0] + split_point[1][1] * FIELD_SIZE;
}


// Affine coordinate system
template jubjubCheck() {
    signal input in[2];
    signal x_sq;
    x_sq <== in[0] * in[0];
    signal y_sq; 
    y_sq <== in[1] * in[1];
    var CONST[3] = jubjubconst();
    var A = CONST[0];
    var D = CONST[1];
    // A*in[0]^2 + in[1]^2 == 1 + D*in[0]^2*in[1]^2
    (A * x_sq + y_sq) === (1 + D * x_sq * y_sq);
}

template jubjubAdd() {
    // Input points in Affine (X, Y)
    signal input in1[2], in2[2];
    // Output point P3 = P1 + P2
    signal output out[2];

    var CONST[3] = jubjubconst();
    var A = CONST[0];
    var D = CONST[1];

    // t = d * in1[0]*in2[0]*in1[1]*in2[1]
    // denX = 1 + t;
    // denY = 1 - t;
    signal denX, denY;
    signal inter1, inter2, inter3;
    inter1 <== D * in1[0];
    inter2 <== inter1 * in2[0];
    inter3 <== inter2 * in1[1];
    denX <== 1 + inter3 * in2[1];
    denY <== 1 - inter3 * in2[1];

    // Numerators
    signal numX;
    signal term1 <== in1[0]*in2[1];
    numX <== term1 + in1[1]*in2[0];
    // in[1] numerator = in1[1]*in2[1] - a*in1[0]*in2[0]; with a = -1 => in1[1]*in2[1] + in1[0]*in2[0]
    signal numY;
    signal term2 <== in1[1]*in2[1];
    numY <== term2 + in1[0]*in2[0];

    // Enforce out[0] = numX / denX  and  out[1] = numY / denY
    // (division by multiplying both sides by denominators)
    out[0] <-- numX / denX;
    out[1] <-- numY / denY;
    numX === out[0] * denX;
    numY === out[1] * denY;
}

template jubjubSubExp() {
    // b is the i-th bit of input scalar s.
    signal input P_prev[2], G_prev[2], b;
    signal output P_next[2], G_next[2];

    b * (1 - b) === 0;

    // P_next <== P_prev + ( b ? G_prev : O )
    signal accP[2];
    accP <== jubjubAdd()(P_prev, G_prev);
    signal inter[2];
    inter[0] <== b * accP[0];
    inter[1] <== b * accP[1];
    P_next[0] <== (1 - b) * P_prev[0] + inter[0];
    P_next[1] <== (1 - b) * P_prev[1] + inter[1];

    // G_next <== G_prev + G_prev
    G_next <== jubjubAdd()(G_prev, G_prev);
}

template jubjubExp(N) {
    // b[N] is LSB-left
    // P_prev and G_prev are Jubjub points of Affine form, each coordinate split into 128 bits
    signal input _P_prev[2][2], _G_prev[2][2], b[N];
    signal output _P_next[2][2], _G_next[2][2];

    signal P_prev[2] <== mergeJubjubInto255()(_P_prev);
    signal G_prev[2] <== mergeJubjubInto255()(_G_prev);

    signal inter_P[N+1][2];
    signal inter_G[N+1][2];
    inter_P[0] <== P_prev;
    inter_G[0] <== G_prev;
    component subExp[N];
    for(var i = 0; i < N; i++){
        subExp[i] = jubjubSubExp();
        subExp[i].P_prev <== inter_P[i];
        subExp[i].G_prev <== inter_G[i];
        subExp[i].b <== b[i];
        inter_P[i+1] <== subExp[i].P_next;
        inter_G[i+1] <== subExp[i].G_next;
    }
    signal P_next[2] <== inter_P[N];
    signal G_next[2] <== inter_G[N];

    _P_next <== splitJubjubInto128()(P_next);
    _G_next <== splitJubjubInto128()(G_next);
}

// template EdDsaInputCheck() {
//     signal input R[2], A[2], s;

//     var CONSTS[3] = jubjubconst();
//     var n = CONSTS[2];

//     jubjubCheck()(R);
//     jubjubCheck()(A);
//     // Make sure that s is 252-bit.
//     Num2Bits(252)(s);
//     // Make sure that s is less than n
//     signal lt <== LessThan(252)([s, n]);
//     lt === 1;
// }

// Input is an 255-bit integer represented by two 128-bit LE limbs; e.g.) in1[0]: lower 128 bits, in1[1]: upper 128 bits
template safeDecToJubjubBit() {
    signal input in;
    // LSB-left
    signal output out_bit_LSB[252];

    var CONSTS[3] = jubjubconst();
    var n = CONSTS[2];
    var FIELD_SIZE = 1<<128;

    signal quo <-- in \ n;
    signal rem <-- in % n;

    // Safe less than check
    out_bit_LSB <== Num2Bits(252)(rem);
    signal lt <== LessThan(252)([rem, n]);
    lt === 1;

    in === quo * n + rem;
}


template prepareEdDsaScalars() {
    // Each input is an 252-bit integer represented by two 128-bit LE limbs; e.g.) in1[0]: lower 128 bits, in1[1]: upper 128 bits
    signal input _s[2], _e[2];
    // LSB-left
    signal output s_bit_LSB[252], e_bit_LSB[252];

    var FIELD_SIZE = 1<<128;
    signal s <== _s[0] + _s[1] * FIELD_SIZE;
    signal e <== _e[0] + _e[1] * FIELD_SIZE;

    s_bit_LSB <== safeDecToJubjubBit()(s);
    e_bit_LSB <== safeDecToJubjubBit()(e);
}

// template BeginJubjubExp(){
//     signal input s, G_init[2];
//     signal output P_next[2], G_next[2];

//     signal s_safe_bit[252] <== convertToJubjubField()(s);

// }

template edDsaVerify() {
    // Each input is Jubjub point as Affine form.
    // Each 255-bit coordinate is split into 128-bits
    signal input _SG[2][2], _R[2][2], _eA[2][2];

    signal SG[2] <== mergeJubjubInto255()(_SG);
    signal R[2] <== mergeJubjubInto255()(_R);
    signal eA[2] <== mergeJubjubInto255()(_eA);

    jubjubCheck()(SG);
    jubjubCheck()(R);
    jubjubCheck()(eA);
    signal RHS[2] <== jubjubAdd()(R, eA);
    SG[0] === RHS[0];
    SG[1] === RHS[1];
}

// template Poseidon4ToJubjub() {
//     signal input in[4];
//     signal output out;
//     var CONST[3] = jubjubconst();
//     var n = CONST[2];
//     signal outFr <== Poseidon255(4)(in);
//     out <-- outFr % n;
//     signal quo <-- outFr \ n;
//     outFr === quo * n + out;
//     signal flag <== LessThan(252)([out, n]);
//     flag === 1;
// }