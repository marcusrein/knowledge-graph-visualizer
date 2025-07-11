# Knowledge Graph Visualizer

A collaborative, real-time knowledge graph visualization tool built with React Flow, Next.js, and blockchain integration. Create, organize, and explore interconnected information with spaces, topics, and relations.

## 🚀 Features

### Core Functionality
- **Interactive Graph Visualization** - Drag-and-drop interface powered by React Flow
- **Spaces (Containers)** - Organize related topics and relations within bounded areas
- **Topics (Entities)** - Individual knowledge nodes with custom properties
- **Relations** - Connect topics with labeled relationships
- **Real-time Collaboration** - See other users' changes and selections live
- **Blockchain Integration** - Web3 wallet connection (MetaMask, WalletConnect)

### Advanced Features
- **Public/Private Spaces** - Control visibility and access to your content
- **Real-time Edit History** - Track all changes with timestamps and user attribution
- **Property System** - Add custom key-value attributes to any entity
- **Resizable Panels** - Customizable Inspector and Debug drawer with persistence
- **Auto-layout** - Intelligent positioning for clean graph organization
- **Responsive Design** - Works seamlessly on desktop and mobile

### Developer Features
- **Debug Console** - Monitor real-time events, logs, and system state
- **Dev/Normie Mode** - Switch between technical and user-friendly terminology
- **Error Handling** - Comprehensive error logging and user feedback
- **SQLite Database** - Local persistence with edit history tracking

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Visualization**: React Flow
- **Styling**: Tailwind CSS, DaisyUI
- **Database**: SQLite with Better-SQLite3
- **Real-time**: PartyKit WebSockets
- **Blockchain**: Wagmi, Viem
- **State Management**: TanStack Query
- **UI Components**: Lucide React, React Hot Toast

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/[your-username]/knowledge-graph-visualizer.git
   cd knowledge-graph-visualizer
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Start the PartyKit server** (for real-time collaboration)
   ```bash
   npm run partykit:dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3001](http://localhost:3001)

## 🎮 Usage

### Getting Started
1. **Connect your wallet** - Click the wallet button to connect MetaMask or WalletConnect
2. **Create a Space** - Use the "+" button to create your first organizational container
3. **Add Topics** - Click "Add Node" to create individual knowledge entities
4. **Create Relations** - Drag between topics to establish relationships
5. **Customize Properties** - Select any item to edit details, properties, and visibility

### Key Interactions
- **Drag nodes** to reposition
- **Drag topics into spaces** to organize them
- **Click any item** to open the Inspector panel
- **Double-click relations** to edit their type/label
- **Use the debug drawer** (bottom) to monitor system activity

### Collaborative Features
- **Real-time updates** - See changes from other users instantly
- **User avatars** - View who's currently online and what they're selecting
- **Edit history** - Track all changes with full audit trail
- **Private spaces** - Create private areas only you can access

## 🔧 Configuration

### Environment Variables
Create a `.env.local` file in the root directory:

```env
# PartyKit Configuration
NEXT_PUBLIC_PARTY_HOST=your-partykit-host.partykit.dev

# Database (auto-configured, no setup needed)
DATABASE_URL=./data/graph.sqlite
```

### Wallet Configuration
The app supports:
- **MetaMask** - Browser extension wallet
- **WalletConnect** - Mobile and hardware wallet support
- **Other Injected Wallets** - Most Ethereum-compatible wallets

## 🏗️ Architecture

### Data Models
- **Entities** - Topics and Spaces with properties, positions, and ownership
- **Relations** - Connections between entities with custom types
- **Edit History** - Audit trail of all changes with timestamps
- **User Sessions** - Real-time collaboration state

### Key Components
- **GraphPage** - Main visualization canvas
- **Inspector** - Property editor and history viewer
- **SpaceNode** - Container component for organizing content
- **TopicNode** - Individual knowledge entity display
- **RelationNode** - Connection visualization
- **DebugDrawer** - Development and monitoring interface

## 🚀 Deployment

### Deploy to Vercel
1. **Connect your repository** to Vercel
2. **Configure environment variables** in Vercel dashboard
3. **Deploy** - Vercel will automatically build and deploy

### Deploy PartyKit
1. **Deploy to PartyKit**
   ```bash
   npx partykit deploy
   ```
2. **Update environment variables** with your PartyKit URL

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [React Flow](https://reactflow.dev/) for graph visualization
- Real-time collaboration powered by [PartyKit](https://partykit.io/)
- Web3 integration via [Wagmi](https://wagmi.sh/)
- UI components from [DaisyUI](https://daisyui.com/)

## 📞 Support

For questions, bug reports, or feature requests:
- **Issues**: [GitHub Issues](https://github.com/[your-username]/knowledge-graph-visualizer/issues)
- **Discussions**: [GitHub Discussions](https://github.com/[your-username]/knowledge-graph-visualizer/discussions)

---

**Made with ❤️ for the knowledge management community**
