#!/usr/bin/env python3
"""
Fetch Random Transactions from Etherscan
Fetches a specified number of random transaction hashes from recent Ethereum blocks.
Usage: python3 fetch_random_txs.py [--count COUNT] [--output OUTPUT] [--api-key KEY]
"""

import argparse
import json
import random
import time
import sys
from typing import List, Dict, Optional
import requests


class EtherscanFetcher:
    def __init__(self, api_key: Optional[str] = None, chainid: str = "1"):
        self.api_key = api_key
        self.chainid = chainid  # 1 = Ethereum Mainnet, 11155111 = Sepolia
        # Use v2 API endpoint
        self.base_url = "https://api.etherscan.io/v2/api"
        self.session = requests.Session()

    def get_latest_block_number(self) -> int:
        """Get the latest block number from Etherscan."""
        params = {
            "chainid": self.chainid,
            "module": "proxy",
            "action": "eth_blockNumber",
        }

        if self.api_key:
            params["apikey"] = self.api_key

        response = self.session.get(self.base_url, params=params)
        response.raise_for_status()
        data = response.json()

        result = data.get("result")

        # Check if result is an error message
        if isinstance(result, str):
            result_lower = result.lower()

            # Check for specific error types
            if "invalid api key" in result_lower or "#err2" in result_lower:
                raise Exception(
                    f"Invalid API Key: {result}\n\nPlease verify your Etherscan API key is correct.\nGet a free API key at: https://etherscan.io/apis"
                )
            elif "deprecated" in result_lower or "migration" in result_lower:
                raise Exception(f"API deprecation error: {result}")
            elif "missing chainid" in result_lower:
                raise Exception(f"Missing chainid parameter: {result}")

            # Try to parse as hex
            try:
                return int(result, 16)
            except (ValueError, TypeError) as e:
                raise Exception(
                    f"Unexpected API response: '{result}'\n\nThis doesn't look like a valid block number. Please check:\n  - Your API key is valid\n  - The chainid parameter is correct\n  - You have internet connectivity"
                )
        elif result:
            return int(result, 16)
        else:
            raise Exception(f"Failed to get latest block: {data}")

    def get_block_by_number(self, block_number: int) -> Dict:
        """Get block data by block number."""
        params = {
            "chainid": self.chainid,
            "module": "proxy",
            "action": "eth_getBlockByNumber",
            "tag": hex(block_number),
            "boolean": "true",
        }

        if self.api_key:
            params["apikey"] = self.api_key

        response = self.session.get(self.base_url, params=params)
        response.raise_for_status()
        data = response.json()

        result = data.get("result")

        # Check if result is an error message
        if isinstance(result, str):
            result_lower = result.lower()
            if "invalid api key" in result_lower or "#err2" in result_lower:
                raise Exception(f"Invalid API Key: {result}")
            elif "deprecated" in result_lower or "migration" in result_lower:
                raise Exception(f"API deprecation error: {result}")
            elif "missing chainid" in result_lower:
                raise Exception(f"Missing chainid parameter: {result}")

        if result:
            return result
        else:
            raise Exception(f"Failed to get block {block_number}: {data}")

    def fetch_random_transactions(
        self, count: int = 500, max_blocks: int = 1000
    ) -> List[str]:
        """
        Fetch random transaction hashes from recent blocks.

        Args:
            count: Number of transactions to fetch
            max_blocks: Number of recent blocks to sample from

        Returns:
            List of transaction hashes
        """
        print(f"Fetching latest block number...")
        latest_block = self.get_latest_block_number()
        print(f"Latest block: {latest_block}")

        # Calculate block range
        start_block = max(0, latest_block - max_blocks)
        block_range = list(range(start_block, latest_block))

        print(
            f"Sampling from blocks {start_block} to {latest_block} ({len(block_range)} blocks)"
        )

        transactions = []
        blocks_checked = 0
        blocks_with_txs = 0

        # Randomly sample blocks until we have enough transactions
        random.shuffle(block_range)

        for block_num in block_range:
            if len(transactions) >= count:
                break

            try:
                print(
                    f"Fetching block {block_num}... ({len(transactions)}/{count} txs collected)",
                    end="\r",
                )

                block = self.get_block_by_number(block_num)
                blocks_checked += 1

                if block and block.get("transactions"):
                    block_txs = block["transactions"]

                    if block_txs:
                        blocks_with_txs += 1

                        # Filter out transactions without a 'to' address (contract creation)
                        # These are typically more complex
                        valid_txs = [
                            tx["hash"]
                            for tx in block_txs
                            if isinstance(tx, dict) and tx.get("to") is not None
                        ]

                        if valid_txs:
                            # Randomly select transactions from this block
                            needed = count - len(transactions)
                            to_add = min(len(valid_txs), needed)

                            if to_add < len(valid_txs):
                                selected = random.sample(valid_txs, to_add)
                            else:
                                selected = valid_txs

                            transactions.extend(selected)

                # Rate limiting - Etherscan free tier allows 5 calls/second
                time.sleep(0.25 if self.api_key else 0.5)

            except Exception as e:
                print(f"\nWarning: Error fetching block {block_num}: {e}")
                continue

        print(
            f"\nFetched {len(transactions)} transactions from {blocks_checked} blocks ({blocks_with_txs} had txs)"
        )

        # Shuffle to randomize the order
        random.shuffle(transactions)

        return transactions[:count]


def save_transactions(transactions: List[str], output_file: str):
    """Save transactions to a JSON file."""
    data = {
        "count": len(transactions),
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "transactions": transactions,
    }

    with open(output_file, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Saved {len(transactions)} transactions to {output_file}")

    # Also save as a simple text file (one per line)
    txt_file = output_file.replace(".json", ".txt")
    with open(txt_file, "w") as f:
        for tx in transactions:
            f.write(f"{tx}\n")

    print(f"Also saved as plain text to {txt_file}")


def main():
    parser = argparse.ArgumentParser(
        description="Fetch random transactions from Etherscan"
    )
    parser.add_argument(
        "--count",
        type=int,
        default=500,
        help="Number of transactions to fetch (default: 500)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="transactions.json",
        help="Output file path (default: transactions.json)",
    )
    parser.add_argument(
        "--api-key",
        type=str,
        help="Etherscan API key (optional, but recommended for better rate limits)",
    )
    parser.add_argument(
        "--max-blocks",
        type=int,
        default=1000,
        help="Number of recent blocks to sample from (default: 1000)",
    )
    parser.add_argument(
        "--chainid",
        type=str,
        default="1",
        help="Chain ID for Etherscan API v2 (default: 1 for Ethereum Mainnet, 11155111 for Sepolia)",
    )

    args = parser.parse_args()

    print("=" * 60)
    print("Random Transaction Fetcher")
    print("=" * 60)
    print(f"Target count: {args.count}")
    print(f"Output file: {args.output}")
    print(
        f"Chain ID: {args.chainid} ({'Ethereum Mainnet' if args.chainid == '1' else 'Sepolia Testnet' if args.chainid == '11155111' else 'Other'})"
    )
    print(
        f"API key: {'Provided' if args.api_key else 'Not provided (slower rate limit)'}"
    )
    print(f"Max blocks to sample: {args.max_blocks}")
    print()

    if not args.api_key:
        print("Note: Using Etherscan without an API key has strict rate limits.")
        print("Get a free API key at: https://etherscan.io/apis")
        print()

    try:
        fetcher = EtherscanFetcher(api_key=args.api_key, chainid=args.chainid)
        transactions = fetcher.fetch_random_transactions(
            count=args.count, max_blocks=args.max_blocks
        )

        if not transactions:
            print("Error: No transactions fetched!")
            sys.exit(1)

        save_transactions(transactions, args.output)

        print()
        print("=" * 60)
        print("Summary")
        print("=" * 60)
        print(f"Total transactions fetched: {len(transactions)}")
        print(f"First transaction: {transactions[0]}")
        print(f"Last transaction: {transactions[-1]}")
        print()
        print("Next steps:")
        print(f"  Run GPU analysis: ./run_gpu_analysis_batch.sh {args.output}")

    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
