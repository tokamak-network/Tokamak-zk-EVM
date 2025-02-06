// ERC20 contract
contract ERC20 is IERC20 {
    mapping (address => uint256) private _balances;
    mapping (address => mapping (address => uint256)) private _allowances;
    uint256 private _totalSupply;
}

// TokenMintERC20Token contract (inherits ERC20)
contract TokenMintERC20Token is ERC20 {
    string private _name;
    string private _symbol;
    uint8 private _decimals;
}