pragma circom 2.1.6;
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../128bit/arithmetic.circom";
include "mux.circom";

template FindShiftingTwosPower256(N) {
    signal input shift;
    signal output twos_power[2], is_shift_gt_255;

    // case 1
    is_shift_gt_255 <== GreaterThan(N)([shift, 255]);
    // case 2
    signal is_shift_gt_127 <== GreaterThan(N)([shift, 127]);
    // case 3: !is_shift_gt_127

    signal shift_up_inter <== (shift - 128) * is_shift_gt_127;
    signal shift_up <== (1 - is_shift_gt_255) * shift_up_inter;
    signal shift_masked <== shift * (1 - is_shift_gt_127);

    // case 2 and 3
    signal (exp_shift_case2, exp_shift_case3) <== TwosExp128TwoInput()(shift_up, shift_masked);
    signal case23_out[2] <== Mux256()(is_shift_gt_127, [0, exp_shift_case2], [exp_shift_case3, 0]);
    twos_power <== Mux256()(is_shift_gt_255, [0, 0], case23_out);
}

template FindShiftingTwosPower256TwoInput(N1, N2) {
    signal input shift1, shift2;
    signal output twos_power1[2], is_shift1_gt_255, twos_power2[2], is_shift2_gt_255;

    // case 1
    is_shift1_gt_255 <== GreaterThan(N1)([shift1, 255]);
    is_shift2_gt_255 <== GreaterThan(N2)([shift2, 255]);
    // case 2
    signal is_shift1_gt_127 <== GreaterThan(N1)([shift1, 127]);
    signal is_shift2_gt_127 <== GreaterThan(N2)([shift2, 127]);
    // case 3: !is_shift_gt_127

    signal shift1_up_inter <== (shift1 - 128) * is_shift1_gt_127;
    signal shift1_up <== (1 - is_shift1_gt_255) * shift1_up_inter;
    signal shift1_masked <== shift1 * (1 - is_shift1_gt_127);

    signal shift2_up_inter <== (shift2 - 128) * is_shift2_gt_127;
    signal shift2_up <== (1 - is_shift2_gt_255) * shift2_up_inter;
    signal shift2_masked <== shift2 * (1 - is_shift2_gt_127);

    // case 2 and 3
    signal (exp_shift1_case2, exp_shift1_case3, exp_shift2_case2, exp_shift2_case3) <== TwosExp128FourInput()(shift1_up, shift1_masked, shift2_up, shift2_masked);
    signal case23_out1[2] <== Mux256()(is_shift1_gt_127, [0, exp_shift1_case2], [exp_shift1_case3, 0]);
    signal case23_out2[2] <== Mux256()(is_shift2_gt_127, [0, exp_shift2_case2], [exp_shift2_case3, 0]);
    twos_power1 <== Mux256()(is_shift1_gt_255, [0, 0], case23_out1);
    twos_power2 <== Mux256()(is_shift2_gt_255, [0, 0], case23_out2);
}