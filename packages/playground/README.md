# Playground README

## What is Playground?

The Playground is a developer-friendly environment designed to interact with and visualize the functionality of the **Tokamak zk-EVM** ecosystem. It provides a frontend interface for developers to test, debug, and experiment with **placements**, **permutations**, and other functionalities related to Zero-Knowledge Proof (ZKP) circuits.


## How to use Playground

### **Prerequisite**

- Make sure you have the following installed on your system:

   - **Node.js** (v18 or later)
   - **npm** (package manager)

- Make sure you have the Tokamak zk-EVM repository cloned on your system:
   ```bash
   git clone <repository-url>
   cd <repository-folder>
   ```
- Make sure you have installed [Tokamak zk-EVM packages](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/dev/README.md#package-composition) of your interest.

### A. **Playground install and setup**
1. Open a new terminal and go to [the playground directory](./).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Get your Etherscan API key from [Etherscan](https://etherscan.io/) -> My profile -> API Keys.

4. Add an `.env` file with the following content:

   ```plaintext
   VITE_ETHERSCAN_API_KEY=<Your Etherscan API Key>
   ```
   
### B. **Start the Backend Server**

1. Open a new terminal for running your backend server. The backend handles operations like file reading, witness generation, and ZKP calculations.
2. Go to the package directory.
3. Start the server:
   ```bash
   npm run server
   ```
   By default, the server may run on `http://localhost:3000`.

### C. **Start the Frontend server**
1. Open a new terminal for running your frontend server. The frontend serves the Playground interface.
2. Go to the package directory.
3. Start the server:
   ```bash
   npm run dev
   ```
4. Open your browser and visit:
   ```
   http://localhost:5173
   ```
