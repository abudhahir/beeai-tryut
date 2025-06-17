# Bee AI CLI Agent

A powerful TypeScript CLI application that creates an intelligent AI agent using the Bee AI framework with OpenAI integration, advanced error handling, and comprehensive tool integration.

## ✨ Features

### Core Functionality
- 🐝 **BeeAI Framework Integration** - Full integration with BeeAI framework for intelligent agent orchestration
- 🤖 **OpenAI Integration** - Connected to OpenAI GPT-4 API with configurable models
- 💾 **Session Memory** - Persistent conversation history with context awareness (up to 100 entries)
- 🎨 **Beautiful Terminal UI** - Styled interface with colored boxes and professional formatting
- ⌨️ **Interactive Prompts** - User-friendly CLI with intelligent input validation
- ⚡ **Real-time Streaming** - Step-by-step agent execution process with live updates
- 📝 **TypeScript** - Full type safety and modern JavaScript features

### Advanced Error Handling System 🚨
- **Enhanced Error Display** - Styled red error boxes with clear formatting and professional presentation
- **Smart Error Categorization** - Automatic classification of errors (Runtime, API, Network, Tool, Initialization)
- **Immediate Stack Traces** - Automatic stack trace display for runtime and connectivity errors
- **Contextual Recovery Suggestions** - Intelligent suggestions based on error type and content
- **Interactive Help Commands** - Comprehensive help system with specialized troubleshooting guides
- **Error Command Shortcuts** - Quick access to detailed error information and solutions

### Integrated AI Tools 🛠️
- **Calculator Tool** - Advanced mathematical calculations and complex expressions
- **Wikipedia Tool** - Real-time information retrieval, research, and knowledge queries
- **Git Tool** - Complete git repository operations, status checking, and version control integration

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

The AI agent comes with built-in tools that are automatically selected based on your requests:

- **Calculator Tool** - Perform mathematical calculations, complex expressions, and numerical operations
- **Wikipedia Tool** - Search and retrieve information from Wikipedia, research topics, and answer knowledge questions
- **Git Tool** - Execute git commands, check repository status, view commit history, and manage version control

## Commands & Help System

### Basic Commands
- Type any message to interact with the AI agent
- Type `quit` to exit the application
- Use Ctrl+C as an alternative exit method

### Error Handling & Help Commands 🆘
- `help` - Display comprehensive help and available commands
- `error` - Show detailed information about the last error with full stack trace
- `init-help` - Troubleshooting guide for initialization issues
- `api-help` - Help with OpenAI API-related problems (rate limits, quotas, etc.)
- `tool-help` - Guide for using available tools effectively
- `network-help` - Network connectivity troubleshooting

## Examples

### Basic Interactions
```
You: What is 25 * 47 + 100?
🤖 Agent Execution Process:
🤔 [10:30:15] Thinking: Analyzing your request and planning response...
🛠️ [10:30:15] Tool Call: Using Calculator: Processing mathematical expression...
✅ [10:30:16] Tool Result: Analysis completed successfully
┌─ Assistant Response: ──────────────────────────────────────────┐
│ Let me calculate that for you. 25 * 47 = 1,175, and 1,175 +   │
│ 100 = 1,275.                                                   │
└────────────────────────────────────────────────────────────────┘

You: Tell me about machine learning
🤖 Agent Execution Process:
🤔 [10:31:20] Thinking: Analyzing your request and planning response...
🛠️ [10:31:20] Tool Call: Using Wikipedia: Searching for relevant information...
✅ [10:31:22] Tool Result: Analysis completed successfully
┌─ Assistant Response: ──────────────────────────────────────────┐
│ Machine learning is a subset of artificial intelligence that   │
│ enables computers to learn and improve from experience...      │
└────────────────────────────────────────────────────────────────┘

You: git status
🤖 Agent Execution Process:
🛠️ [10:32:10] Tool Call: Using Git: Performing version control operations...
┌─ Assistant Response: ──────────────────────────────────────────┐
│ Current branch: main                                           │
│ Your branch is up to date with 'origin/main'.                 │
│ Working tree clean - no changes to commit.                    │
└────────────────────────────────────────────────────────────────┘
```

### Error Handling Examples
```
You: [Invalid API request occurs]
┌─ ❌ ERROR: API_ERROR ──────────────────────────────────────────┐
│ Rate limit exceeded. Please wait before making another        │
│ request.                                                       │
├────────────────────────────────────────────────────────────────┤
│ 💡 Quick help: Type "api-help" for details                    │
├────────────────────────────────────────────────────────────────┤
│ 🔌 Verify your API credentials and quota limits               │
└────────────────────────────────────────────────────────────────┘

You: api-help
┌─ 🔌 API HELP ─────────────────────────────────────────────────┐
│ Common API issues:                                            │
├───────────────────────────────────────────────────────────────┤
│ • Rate limiting                                               │
│   Solution: Wait and try again, or upgrade your plan         │
│ • Quota exceeded                                              │
│   Solution: Check your OpenAI usage dashboard                │
└───────────────────────────────────────────────────────────────┘

You: error
┌─ 🔍 DETAILED ERROR INFORMATION ──────────────────────────────┐
│ Type: API_ERROR                                               │
│ Message:                                                      │
│   Rate limit exceeded. Please wait before making another     │
│   request.                                                    │
├───────────────────────────────────────────────────────────────┤
│ Stack Trace:                                                  │
│   at OpenAIChatModel.request (openai/chat.js:45:12)         │
│   at ToolCallingAgent.run (agent.js:123:8)                  │
└───────────────────────────────────────────────────────────────┘
```

## Architecture

- **`src/index.ts`** - Main CLI application with BeeAI, OpenAI integration, and advanced error handling system
- **`src/memory.ts`** - Session memory management system with conversation context
- **`src/tools/GitTool.ts`** - Custom Git tool implementation for version control operations
- **Built with:**
  - BeeAI Framework for intelligent agent orchestration
  - OpenAI API for GPT-4 language model integration
  - Commander.js for robust CLI framework
  - Inquirer for interactive prompts and input validation
  - Chalk for beautiful terminal styling and colored output

## BeeAI Framework Features

- **ToolCallingAgent** - Intelligent tool selection and execution with context awareness
- **UnconstrainedMemory** - Advanced conversation history management with unlimited storage
- **Built-in Tools** - Calculator, Wikipedia, and Git integration with automatic tool detection
- **Advanced Error Handling** - Comprehensive error management with categorization, recovery suggestions, and interactive help
- **Real-time Streaming** - Step-by-step execution visibility with live progress updates
- **Smart Context Management** - Conversation history integration for better responses

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

The application features a comprehensive error handling system with interactive help. For immediate assistance:

### Quick Help Commands
- Type `help` for general assistance and available commands
- Type `error` to see detailed information about the last error
- Type `init-help` for initialization problems
- Type `api-help` for OpenAI API issues
- Type `tool-help` for tool usage guidance
- Type `network-help` for connectivity problems

### Common Issues

#### 1. Initialization Errors
**Error:** "OPENAI_API_KEY environment variable is required"
- **Solution:** Create a `.env` file with your OpenAI API key
- **Help Command:** `init-help`

#### 2. API Errors  
**Errors:** Rate limiting, quota exceeded, invalid requests
- **Solutions:** Check API key validity, upgrade plan, wait between requests
- **Help Command:** `api-help`

#### 3. Network Errors
**Errors:** Connection timeouts, DNS issues, firewall blocking
- **Solutions:** Check internet connection, verify firewall settings
- **Help Command:** `network-help`

#### 4. Tool Errors
**Errors:** Calculator, Wikipedia, or Git tool failures
- **Solutions:** Rephrase requests, ensure git repository for git operations
- **Help Command:** `tool-help`

#### 5. Build Errors
- Make sure you're using Node.js 18 or higher
- Try deleting `node_modules` and running `npm install` again
- Check TypeScript compilation with `npm run build`

### Advanced Debugging
All runtime and network errors automatically display stack traces for detailed debugging. The error system categorizes issues and provides contextual recovery suggestions.

## License

MIT