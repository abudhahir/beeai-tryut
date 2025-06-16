# Bee AI CLI Agent

A TypeScript CLI application that creates an AI agent using the Bee AI framework with OpenAI integration and session memory capabilities.

## Features

- 🐝 **BeeAI Framework Integration** - Full integration with BeeAI framework
- 🤖 **OpenAI Integration** - Connected to OpenAI GPT-4 API
- 🛠️ **Built-in Tools** - Calculator and Wikipedia search tools
- 💾 **Session Memory** - Persists conversation history during session
- 🎨 **Colorful Interface** - Beautiful terminal output using Chalk
- ⌨️ **Interactive Prompts** - User-friendly CLI with Inquirer
- 🚪 **Clean Exit** - Type "quit" to exit gracefully
- 📝 **TypeScript** - Full type safety and modern JavaScript features

## Prerequisites

- Node.js 18+ 
- OpenAI API Key

## Installation

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Set up your OpenAI API key:**
```bash
cp .env.example .env
# Edit .env and add your OpenAI API key
```

3. **Build the project:**
```bash
npm run build
```

## Configuration

Create a `.env` file with your OpenAI configuration:

```env
# Required
OPENAI_API_KEY=your_openai_api_key_here

# Optional customization
OPENAI_MODEL=gpt-4
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.7
```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

### Global Installation
```bash
npm link
bee-ai
```

## Available Tools

The AI agent comes with built-in tools:

- **Calculator** - Perform mathematical calculations
- **Wikipedia** - Search and retrieve information from Wikipedia

## Commands

- Type any message to interact with the AI agent
- Type `quit` to exit the application
- Use Ctrl+C as an alternative exit method

## Examples

```
You: What is 25 * 47 + 100?
Assistant: Let me calculate that for you. 25 * 47 = 1,175, and 1,175 + 100 = 1,275.

You: Tell me about artificial intelligence
Assistant: [Searches Wikipedia and provides information about AI]

You: quit
👋 Thanks for using Bee AI CLI!
```

## Architecture

- **`src/index.ts`** - Main CLI application with BeeAI and OpenAI integration
- **`src/memory.ts`** - Session memory management system
- **Built with:**
  - BeeAI Framework for agent orchestration
  - OpenAI API for language model
  - Commander.js for CLI framework
  - Inquirer for interactive prompts
  - Chalk for terminal styling

## BeeAI Framework Features

- **ToolCallingAgent** - Intelligent tool selection and execution
- **UnconstrainedMemory** - Conversation history management
- **Built-in Tools** - Calculator and Wikipedia integration
- **Error Handling** - Robust error management and recovery

## Memory Management

The session memory system:
- Stores up to 100 conversation entries by default
- Maintains timestamp, role, and content for each entry
- Provides conversation context to the AI agent
- Persists during the session only (not saved to disk)

## Development

```bash
# Install dependencies
npm install

# Run in development mode (with hot reload)
npm run dev

# Build for production
npm run build

# Run built version
npm start

# Run tests (when available)
npm test
```

## Troubleshooting

### Common Issues

1. **"OPENAI_API_KEY environment variable is required"**
   - Make sure you have created a `.env` file with your OpenAI API key

2. **Network/API errors**
   - Check your internet connection
   - Verify your OpenAI API key is valid and has sufficient credits

3. **Build errors**
   - Make sure you're using Node.js 18 or higher
   - Try deleting `node_modules` and running `npm install` again

## License

MIT