# Playground README

## What is the Playground?

The Playground is a developer-friendly environment designed to interact with and visualize the functionality of the **Tokamak zk-EVM** ecosystem. It provides a frontend interface for developers to test, debug, and experiment with **placements**, **permutations**, and other functionalities related to Zero-Knowledge Proof (ZKP) circuits.

---

## How to Initialize the Playground

### **Prerequisite**

Ensure you have the following installed on your system:

- **Node.js** (v18 or later)
- **npm** (package manager)

Ensure you have the Tokamak zk-EVM repository cloned on your system:
   ```bash
   git clone <repository-url>
   cd <repository-folder>
   ```
Ensure you have installed [Synthesizer](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/dev/packages/frontend/synthesizer).

### 1. **Package install and setup**

1. Install dependencies:

   ```bash
   npm install
   ```
2. Get your Etherscan API key from [Etherscan](https://etherscan.io/) -> My profile -> API Keys.

3. Add an `.env` file with the following content:

   ```plaintext
   VITE_ETHERSCAN_API_KEY=<Your Etherscan API Key>
   ```
   
### 2. **Start the Backend Server**

1. Open a new terminal for running your backend server. The backend handles operations like file reading, witness generation, and ZKP calculations.
2. Start the server:
   ```bash
   npm run server
   ```
   By default, the server may run on `http://localhost:3000`.
---

### 4. **Start the Frontend server**
1. Open a new terminal for running your frontend server. The frontend serves the Playground interface.
2. Start the server:
   ```bash
   npm run dev
   ```
3. Open your browser and visit:
   ```
   http://localhost:5173
   ```
---

### 5. **Using the Playground**

1. **Provide a Transaction**:

   - Enter a transaction hash in the input field.
   - Click "Process" to start the generation.

2. **Generate Outputs**:

   - The backend will compute outputs such as wire assignments and permutations.
   - Once completed, download buttons for "Permutation" and "Placement Instance" files will appear.

3. **Download Results**:

   - Click the respective buttons to download the generated files.

---

