# Changelog

## 2025-11-05 - API v2 Migration Fix

### Fixed
- **Etherscan API v2 Migration**: Updated to use Etherscan API v2 endpoint (`https://api.etherscan.io/v2/api`)
- **Chain ID Parameter**: Added required `chainid` parameter for API v2 compatibility
- **Error Handling**: Added proper error detection for API deprecation messages
- **Parsing**: Enhanced hex parsing with better error messages

### Details

**Issue 1**: The Etherscan API was returning a deprecation message:
```
ValueError: invalid literal for int() with base 16: 'You are using a deprecated V1 endpoint, switch to Etherscan API V2 using https://docs.etherscan.io/v2-migration'
```

**Issue 2**: After migrating to v2 endpoint, got chain ID error:
```
Exception: Failed to parse block number 'Missing chainid parameter (required for v2 api), please see https://api.etherscan.io/v2/chainlist for the list of supported chainids'
```

**Root Cause**: 
1. The script was using the old v1 API endpoint (`https://api.etherscan.io/api`)
2. API v2 requires a `chainid` parameter for all requests

**Solution**:
1. Updated base URL to v2 endpoint: `https://api.etherscan.io/v2/api`
2. Added `chainid` parameter support (default: "1" for Ethereum Mainnet)
3. Added detection for deprecation messages in API responses
4. Enhanced error handling to provide clearer error messages
5. Added try-catch for hex parsing with detailed error reporting
6. Added `--chainid` command-line argument for flexibility

### Changes Made

#### `fetch_random_txs.py`

**Lines 17-22**: Added chainid parameter and updated API endpoint
```python
def __init__(self, api_key: Optional[str] = None, chainid: str = "1"):
    self.api_key = api_key
    self.chainid = chainid  # 1 = Ethereum Mainnet, 11155111 = Sepolia
    self.base_url = "https://api.etherscan.io/v2/api"
```

**Lines 27-30**: Added chainid to API requests
```python
params = {
    "chainid": self.chainid,
    "module": "proxy",
    "action": "eth_blockNumber",
}
```

**Lines 37-47**: Enhanced `get_latest_block_number()` error handling
```python
result = data.get("result")

# Check if result is a deprecation message or error string
if isinstance(result, str):
    if "deprecated" in result.lower() or "migration" in result.lower():
        raise Exception(f"API deprecation error: {result}. Please update to use Etherscan API v2.")
    # Try to parse as hex
    try:
        return int(result, 16)
    except (ValueError, TypeError) as e:
        raise Exception(f"Failed to parse block number '{result}': {e}")
```

**Lines 74-77**: Enhanced `get_block_by_number()` error handling
```python
# Check if result is a deprecation message
if isinstance(result, str) and ("deprecated" in result.lower() or "migration" in result.lower()):
    raise Exception(f"API deprecation error: {result}. Please update to use Etherscan API v2.")
```

### Testing

The fix addresses:
- ✅ API v2 endpoint migration
- ✅ Deprecation message detection
- ✅ Proper error messages
- ✅ Backward compatibility (hex parsing still works)

### Usage

The script now includes an optional `--chainid` parameter:

```bash
# Ethereum Mainnet (default)
python3 fetch_random_txs.py --count 500 --api-key YOUR_KEY --output transactions.json

# Ethereum Mainnet (explicit)
python3 fetch_random_txs.py --count 500 --api-key YOUR_KEY --chainid 1 --output transactions.json

# Sepolia Testnet
python3 fetch_random_txs.py --count 500 --api-key YOUR_KEY --chainid 11155111 --output transactions.json
```

**Supported Chain IDs:**
- `1` - Ethereum Mainnet (default)
- `11155111` - Sepolia Testnet
- See https://api.etherscan.io/v2/chainlist for full list

### Notes

- Etherscan API v2 requires an API key for most operations
- Free tier API key available at: https://etherscan.io/apis
- The script still works without an API key but with stricter rate limits
- For more information on v2 migration: https://docs.etherscan.io/v2-migration
