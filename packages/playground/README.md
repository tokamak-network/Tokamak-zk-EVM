# Playground README

## What is the Playground?

The Playground is a developer-friendly environment designed to interact with and visualize the functionality of the **Tokamak zk-EVM** ecosystem. It provides a frontend interface for developers to test, debug, and experiment with **placements**, **permutations**, and other functionalities related to Zero-Knowledge Proof (ZKP) circuits.

---

## How to Initialize the Playground

### 1. **System Requirements**

Ensure you have the following installed on your system:

- **Node.js** (v18 or later)
- **npm** (package manager)

### 2. **Project Setup**

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd <repository-folder>
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Ensure the Synthesizer package has been built:
   Refer to the Synthesizer documentation for building instructions: [Synthesizer Documentation](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/dev/packages/frontend/synthesizer)

4. Add an `.env` file with the following content:

   ```plaintext
   VITE_ETHERSCAN_API_KEY=<Your Etherscan API Key>
   ```

   You can generate the API key at [Etherscan](https://etherscan.io/).

### 3. **Start the Backend Server**

The backend handles operations like file reading, witness generation, and ZKP calculations.

1. Start the server:
   ```bash
   npm run server
   ```
   By default, the server runs on `http://localhost:3000`.

---

### 4. **Start the Frontend**

The frontend serves the Playground interface.

1. Start the development server:
   ```bash
   npm run dev
   ```
2. Open your browser and visit:
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

