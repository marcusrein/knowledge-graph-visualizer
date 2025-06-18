# 🛰 Geo Genesis + GRC-20 Starter Kit (based on Scaffold-ETH 2)

This monorepo is a full-stack starter kit that lets you **upload knowledge to The Graph's GRC-20 standard on the Geo Genesis testnet** and compete on a fully on-chain contribution leaderboard.

It provides a hands-on-template for developers looking to build applications using the GRC-20 SDK.

## How it Works

The main page (`/`) provides an interactive demo:
1.  **Create Knowledge**: A user enters a name and description for a new knowledge "entity".
2.  **Publish to IPFS**: The app uses the `@graphprotocol/grc-20` SDK to format the data, then sends it to a lightweight backend server which pins the content to IPFS.
3.  **Log Contribution On-Chain**: After the data is on IPFS, the user is prompted to send a transaction to the `ContributionTracker` smart contract. This awards them 1 point for their contribution.
4.  **View Leaderboard**: The `/leaderboard` page reads events directly from the `ContributionTracker` contract to display a real-time, on-chain leaderboard of top contributors.

## Key Components

*   **Frontend** (Next.js – `packages/nextjs`)
    *   **`/` (Home Page)**: An interactive demo and tutorial for publishing knowledge.
    *   **`/leaderboard`**: A fully on-chain leaderboard that reads contract events.
*   **Backend** (Express – `packages/backend`)
    *   **`POST /api/upload`**: A simple endpoint that takes GRC-20 `ops` and uses the SDK to publish them to IPFS.
*   **Smart Contracts** (Hardhat – `packages/hardhat`)
    *   **`ContributionTracker.sol`**: A simple contract to log contribution points for each user via a `reportContribution()` function and `ContributionReported` event.
    *   **Hardhat-Deploy script**: Deploys `ContributionTracker` to the target network.
*   **Custom Chain Config**: Includes the Geo Genesis testnet (chainId **19411**) in `packages/nextjs/scaffold.config.ts`.

---

## Quickstart

To get started with this starter kit, follow the steps below:

1.  **Clone and Install Dependencies**:
    ```bash
    git clone <repo-url>
    cd <repo-name>
    yarn install
    ```

2.  **Run the Local Blockchain**:
    Open a terminal and run:
    ```bash
    yarn chain
    ```
    This starts a local Hardhat network.

3.  **Deploy Smart Contracts**:
    In a second terminal, deploy the `ContributionTracker` contract:
    ```bash
    yarn deploy
    ```

4.  **Start the Backend Server**:
    In a third terminal, start the backend server for IPFS uploads:
    ```bash
    cd packages/backend
    yarn dev
    ```

5.  **Start the Frontend App**:
    In a fourth terminal, start the Next.js frontend:
    ```bash
    yarn start
    ```

Now, visit your app at `http://localhost:3000`. You can test the full flow of creating knowledge and seeing your address appear on the on-chain leaderboard.

## Resetting / Cleaning Local Data

Need a fresh start for a demo or testing? The repository ships with helper scripts for different levels of reset:

### Option 1: Quick Local Reset (keeps existing space)

Wipes the local SQLite database **and nothing else**:

```bash
# Stop the backend if it's running first
yarn reset           # removes packages/backend/data/leaderboard.db
```

To fully reset the app, also clear the UI's cached space id in your browser console and reload the page:

```js
localStorage.removeItem('personalSpaceId');
location.reload();
```

The backend will recreate an empty database automatically on the next boot, and you'll continue using your existing personal space.

### Option 2: Complete Fresh Start (new space + clean local data)

For a completely clean slate with a brand-new personal space on The Graph:

```bash
yarn fresh-start 0xYourWalletAddress [Optional Space Name] [TESTNET|MAINNET]
```

This script will:
1. Delete the local SQLite database
2. Create a new personal space on Geo Genesis 
3. Write the new space ID to `.env.local` for future reference
4. Output the new space ID to console

Example usage:
```bash
yarn fresh-start 0x1234567890123456789012345678901234567890
yarn fresh-start 0x1234567890123456789012345678901234567890 "My Demo Space"
yarn fresh-start 0x1234567890123456789012345678901234567890 "Production Space" MAINNET
```

After running either script, restart your backend and frontend to see the changes take effect.

---

# 🏗 Scaffold-ETH 2

<h4 align="center">
  <a href="https://docs.scaffoldeth.io">Documentation</a> |
  <a href="https://scaffoldeth.io">Website</a>
</h4>

🧪 An open-source, up-to-date toolkit for building decentralized applications (dapps) on the Ethereum blockchain. It's designed to make it easier for developers to create and deploy smart contracts and build user interfaces that interact with those contracts.

⚙️ Built using NextJS, RainbowKit, Hardhat, Wagmi, Viem, and Typescript.

- ✅ **Contract Hot Reload**: Your frontend auto-adapts to your smart contract as you edit it.
- 🪝 **[Custom hooks](https://docs.scaffoldeth.io/hooks/)**: Collection of React hooks wrapper around [wagmi](https://wagmi.sh/) to simplify interactions with smart contracts with typescript autocompletion.
- 🧱 [**Components**](https://docs.scaffoldeth.io/components/): Collection of common web3 components to quickly build your frontend.
- 🔥 **Burner Wallet & Local Faucet**: Quickly test your application with a burner wallet and local faucet.
- 🔐 **Integration with Wallet Providers**: Connect to different wallet providers and interact with the Ethereum network.

![Debug Contracts tab](https://github.com/scaffold-eth/scaffold-eth-2/assets/55535804/b237af0c-5027-4849-a5c1-2e31495cccb1)

## Requirements

Before you begin, you need to install the following tools:

- [Node (>= v20.18.3)](https://nodejs.org/en/download/)
- Yarn ([v1](https://classic.yarnpkg.com/en/docs/install/) or [v2+](https://yarnpkg.com/getting-started/install))
- [Git](https://git-scm.com/downloads)

## Quickstart

To get started with Scaffold-ETH 2, follow the steps below:

1. Install dependencies if it was skipped in CLI:

```
cd my-dapp-example
yarn install
```

2. Run a local network in the first terminal:

```
yarn chain
```

This command starts a local Ethereum network using Hardhat. The network runs on your local machine and can be used for testing and development. You can customize the network configuration in `packages/hardhat/hardhat.config.ts`.

3. On a second terminal, deploy the test contract:

```
yarn deploy
```

This command deploys a test smart contract to the local network. The contract is located in `packages/hardhat/contracts` and can be modified to suit your needs. The `yarn deploy` command uses the deploy script located in `packages/hardhat/deploy` to deploy the contract to the network. You can also customize the deploy script.

4. On a third terminal, start your NextJS app:

```
yarn start
```

Visit your app on: `http://localhost:3000`. You can interact with your smart contract using the `Debug Contracts` page. You can tweak the app config in `packages/nextjs/scaffold.config.ts`.

Run smart contract test with `yarn hardhat:test`

- Edit your smart contracts in `packages/hardhat/contracts`
- Edit your frontend homepage at `packages/nextjs/app/page.tsx`. For guidance on [routing](https://nextjs.org/docs/app/building-your-application/routing/defining-routes) and configuring [pages/layouts](https://nextjs.org/docs/app/building-your-application/routing/pages-and-layouts) checkout the Next.js documentation.
- Edit your deployment scripts in `packages/hardhat/deploy`


## Documentation

Visit our [docs](https://docs.scaffoldeth.io) to learn how to start building with Scaffold-ETH 2.

To know more about its features, check out our [website](https://scaffoldeth.io).

## Contributing to Scaffold-ETH 2

We welcome contributions to Scaffold-ETH 2!

Please see [CONTRIBUTING.MD](https://github.com/scaffold-eth/scaffold-eth-2/blob/main/CONTRIBUTING.md) for more information and guidelines for contributing to Scaffold-ETH 2.