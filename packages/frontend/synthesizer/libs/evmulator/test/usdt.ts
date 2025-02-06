// contract TetherToken {
//     // From Ownable
//     address public owner;                 // slot 0
    
//     // From BasicToken/StandardToken
//     mapping(address => uint) balances;    // slot 1
//     mapping(address => mapping(address => uint)) allowed;  // slot 2
//     uint public basisPointsRate;          // slot 3
//     uint public maximumFee;               // slot 4
    
//     // From Pausable
//     bool public paused;                   // slot 5
    
//     // From TetherToken
//     string public name;                   // slot 6
//     string public symbol;                 // slot 7
//     uint public decimals;                 // slot 8
//     address public upgradedAddress;       // slot 9
//     bool public deprecated;               // slot 10
    
//     // From BlackList
//     mapping(address => bool) isBlackListed;  // slot 11
// }