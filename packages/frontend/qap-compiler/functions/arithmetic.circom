pragma circom 2.1.6;
function _add256 (a, b) {
    var FIELD_SIZE = 1 << 128;
    var c[2];
    c[0] = (a[0] + b[0]) % FIELD_SIZE;
    var carry_low = (a[0] + b[0]) \ FIELD_SIZE;
    c[1] = (a[1] + b[1] + carry_low) % FIELD_SIZE;
    var carry = (a[1] + b[1] + carry_low) \ FIELD_SIZE;
    return [c[0], c[1], carry];
}


function _sub256 (a, b) {
    var FIELD_SIZE = 1 << 128;
    // var borrow_low;
    // var c[2] = [0, 0];
    // if (a[0] < b[0]) {
    //     borrow_low = 1;
    //     var minusb0 = FIELD_SIZE - b[0];
    //     c[0] = a[0] + minusb0; 
    // } else {
    //     borrow_low = 0;
    //     c[0] = a[0] - b[0];
    // }
    // var upper_a_new;
    // if (a[1] < borrow_low) {
    //     var minusBorrow = FIELD_SIZE - borrow_low;
    //     upper_a_new = a[1] + minusBorrow;
    // } else {
    //     upper_a_new = a[1] - borrow_low;
    // }

    // if (upper_a_new < b[1]) {
    //     var minusb1 = FIELD_SIZE - b[1];
    //     c[1] = upper_a_new + minusb1;
    // } else {    
    //     c[1] = upper_a_new - b[1];
    // }

    var c_unwrapped[2];
    var borrow = 0;
    if (a[0] < b[0]) {
        borrow = 1;
    }
    c_unwrapped[0] = FIELD_SIZE + a[0] - b[0];
    c_unwrapped[1] = FIELD_SIZE + a[1] - borrow - b[1];
    var c[2] = [
        c_unwrapped[0] % FIELD_SIZE,
        c_unwrapped[1] % FIELD_SIZE
    ];

    return c;
}

function euclidean_div (a, b) {
    var r = a % b;
    var q = a \ b; 
    return [q, r];
}

function _div1 (a, b) {
    // assume b[1] is not zero
    var r[2] = a;
    var q = r[1] \ b[1]; //integer division

    var high_q[2];
    var temp;

    var result;
    var left = 0;
    var right = q;
    var mid;

    while(left <= right){
        if(right == 1){
            mid = right;
        }
        else {
            mid = (left + right) \ 2;
        }
        high_q = mul128(mid, b[0]);
        temp = mid*b[1] + high_q[1];

        if (r[1] > temp || ((r[1] == temp) && (r[0] >= high_q[0]))){
            result = mid;
            left = mid + 1;
        }
        else {
            right = mid - 1;
        }
    }

    high_q = mul128(result, b[0]);
    temp = result*b[1] + high_q[1];

    if(r[1] > temp && r[0] < high_q[0]){
        r[1] = r[1] - 1;
        r[0] = r[0] + 2**128;
    }

    return [
        [result, 0], // quotient
        [r[0] - high_q[0], r[1] - temp] // remainder
    ];
}

function _div2 (a, b) {
    // refer to https://pleiadexdev.notion.site/Division-81a1f13f3b604eba9255008446f77e6d?pvs=4
    var c[5], d[5];
    var temp[2];

    // c0, d0
    temp = euclidean_div(a[0], b[0]);
    c[0] = temp[0];
    d[0] = temp[1];

    // c1, d1
    temp = euclidean_div(a[1], b[0]);
    c[1] = temp[0];
    d[1] = temp[1];

    // c2, d2
    temp = euclidean_div(2**128, b[0]);
    c[2] = temp[0];
    d[2] = temp[1];

    // c3, d3
    temp = euclidean_div(d[1] * d[2] + d[0], b[0]);
    c[3] = temp[0];
    d[3] = temp[1];

    // c4, d4
    temp = euclidean_div(c[0] + d[1] * c[2] + c[3], 2**128);
    c[4] = temp[0];
    d[4] = temp[1];
    
    return [
        [d[4], c[1] + c[4]],    // quotient
        [d[3], 0]               // remainder    
    ];
}

function _div256 (a, b) {
    if(b[0] == 0 && b[1] == 0){
        return [
            [0,0],
            a
        ];
    }
    if (b[1] != 0) {
        return _div1(a, b);
    } else {
        return _div2(a, b);
    }
}

function _div128(in1, in2) {
    if (in2 == 0) {
        return [0, in1];
    }
    return [in1 \ in2, in1 % in2];
}

function greater_or_equal_than(a, b) {
    var result = 1;
    var decided = 0;

    for (var i = 3; i >= 0; i--) {
        var gt = 0;
        var lt = 0;

        if (a[i] > b[i]) {
            gt = 1;
        } else {
            gt = 0;
        }

        if (a[i] < b[i]) {
            lt = 1;
        } else {
            lt = 0;
        }

        var neq = gt + lt;  // 1 if a[i] ≠ b[i], 0 otherwise

        // result ← keep current if already decided, else follow gt/lt
        if (decided == 0) {
            if (gt == 1) {
                result = 1;
            }
            if (lt == 1) {
                result = 0;
            }
        }

        if (decided == 0 && neq == 1) {
            decided = 1;
        }
    }

    return result;
}

function _div512by256(a, b) {
    // INPUTS:
    //   a[4] : 4 × 128-bit limbs, least-significant first  (represents a 512-bit integer)
    //   b[2] : 2 × 128-bit limbs, least-significant first  (represents a 256-bit integer)
    // OUTPUTS:
    //   q[4]   : 4 × 128-bit limbs of the quotient
    //   r[4]   : 4 × 128-bit limbs of the remainder.
    // Word base: 2^128

    // If divisor == 0, define quotient=0, remainder=low-2 limbs of in1
    if (b[0] == 0 && b[1] == 0){
        return [[0, 0, 0, 0], a];
    }

    var q[4] = [0, 0, 0, 0];
    var r[4] = [0, 0, 0, 0];

    for (var i = 3; i >= 0; i--) {
        for (var j = 127; j >= 0; j--) {
            // 1. Shift r left by 1 bit
            var carry = 0;
            for (var k = 0; k < 4; k++) {
                var new_carry = r[k] >> 127;
                r[k] = ((r[k] << 1) & ((1 << 128) - 1)) | carry;
                carry = new_carry;
            }

            // 2. Bring down 1 bit from a[i]
            var a_bit = (a[i] >> j) & 1;
            r[0] = r[0] | a_bit;

            // 3. Compare r >= b
            // Pad b to 4 limbs
            var b_pad[4] = [b[0], b[1], 0, 0];
            var greater_or_equal = greater_or_equal_than(r, b_pad);

            // 4. If r >= b: subtract and set quotient bit
            if (greater_or_equal == 1) {
                var borrow = 0;
                for (var k = 0; k < 4; k++) {
                    var tmp = r[k] - b_pad[k] - borrow;
                    if (tmp < 0) {
                        tmp += 1 << 128;
                        borrow = 1;
                    } else {
                        borrow = 0;
                    }
                    r[k] = tmp;
                }

                // Set bit in quotient
                var bit_pos = i * 128 + j;
                var q_limb = bit_pos \ 128;
                var q_bit = bit_pos % 128;
                q[q_limb] = q[q_limb] | (1 << q_bit);
            }
        }
    }

    return [q, r];
}


function mul128 (a, b) {
    var c[2] = euclidean_div(a, 2**64);
    var d[2] = euclidean_div(b, 2**64);

    var carry1 = c[1]*d[1] \ 2**64;
    var remainder1 = c[1]*d[1] % 2**64;
    var carry2 = (c[0]*d[1]+c[1]*d[0] + carry1) \ 2**64;
    var remainder2 = (c[0]*d[1]+c[1]*d[0] + carry1) % 2**64;

    return [remainder2*(2**64) + remainder1, c[0]*d[0] + carry2];
}