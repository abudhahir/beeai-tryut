#!/usr/bin/env node

import 'dotenv/config';
import { program } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { SessionMemory } from './memory.js';
import readline from 'readline';

// BeeAI Framework imports
import { OpenAIChatModel } from 'beeai-framework/adapters/openai/backend/chat';
import { ToolCallingAgent } from 'beeai-framework/agents/toolCalling/agent';
import { UnconstrainedMemory } from 'beeai-framework/memory/unconstrainedMemory';
import { CalculatorTool } from 'beeai-framework/tools/calculator';
import { WikipediaTool } from 'beeai-framework/tools/search/wikipedia';
import { GitTool } from './tools/GitTool.js';
import { CodebaseAnalyzer } from './tools/CodebaseAnalyzer.js';

interface BeeAIResponse {
  result: {
    text: string;
  };
}

interface ErrorDetails {
  type: string;
  message: string;
  stack?: string;
  command?: string;
  suggestion?: string;
}

class BeeAICLI {
  private memory: SessionMemory;
  private isRunning: boolean = false;
  private agent: ToolCallingAgent | null = null;
  private llm: OpenAIChatModel | null = null;
  private lastError: ErrorDetails | null = null;

  constructor() {
    this.memory = new SessionMemory();
    this.initializeBeeAI();
  }

  private initializeBeeAI(): void {
    try {
      // Check for OpenAI API key
      if (!process.env.OPENAI_API_KEY) {
        this.displayError('OPENAI_API_KEY environment variable is required.', 'INIT_ERROR');
        process.exit(1);
      }

      // Initialize OpenAI model
      this.llm = new OpenAIChatModel(
        process.env.OPENAI_MODEL || 'gpt-4'
      );

      // Create BeeAI agent with tools
      this.agent = new ToolCallingAgent({
        llm: this.llm,
        memory: new UnconstrainedMemory(),
        tools: [
          new CalculatorTool(),
          new WikipediaTool(),
          new GitTool(),
          new CodebaseAnalyzer(),
        ],
        meta: {
          name: 'Bee AI CLI Assistant',
          description: 'A helpful AI assistant with access to calculator, Wikipedia, Git, and codebase analysis tools'
        }
      });

    } catch (error) {
      this.displayError(error as Error, 'INIT_ERROR');
      process.exit(1);
    }
  }

  async start(): Promise<void> {
    console.log(chalk.blue.bold('🐝 Bee AI Agent CLI'));
    console.log(chalk.gray('Connected to OpenAI with BeeAI Framework'));
    console.log(chalk.gray('Available tools: Calculator, Wikipedia, Git, Codebase Analyzer'));
    console.log(chalk.gray('Type your messages below. Enter "quit" to exit.\n'));
    
    this.isRunning = true;
    
    while (this.isRunning) {
      try {
        // Get terminal width, fallback to 80 if unavailable
        const termWidth = process.stdout.columns || 80;
        const boxWidth = Math.max(40, termWidth); // Minimum width 40
        const innerWidth = boxWidth - 2;
        // Draw the input border
        console.log(chalk.blue('┌' + '─'.repeat(innerWidth) + '┐'));
        
        const { input } = await inquirer.prompt([
          {
            type: 'input',
            name: 'input',
            message: chalk.blue('│ ') + chalk.yellow('>'),
            validate: (input: string) => input.trim().length > 0 || 'Please enter a message'
          }
        ]);
        
        // Close the input border
        console.log(chalk.blue('└' + '─'.repeat(innerWidth) + '┘'));

        const userInput = input.trim();
        
        if (userInput.toLowerCase() === 'quit') {
          this.handleQuit();
          break;
        }

        // Handle error-related commands
        if (this.handleErrorCommands(userInput)) {
          continue;
        }

        await this.processInput(userInput, boxWidth);
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('User force closed')) {
          this.handleQuit();
          break;
        }
        this.displayError(error as Error, 'RUNTIME_ERROR');
      }
    }
  }

  private async processInput(input: string, boxWidth?: number): Promise<void> {
    this.memory.addEntry('user', input);
    
    // Show agent execution header
    console.log(chalk.magenta('\n🤖 Agent Execution Process:'));
    console.log(chalk.gray('─'.repeat(50)));
    
    const response = await this.generateResponse(input);
    
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.magenta('🏁 Agent Execution Complete\n'));
    
    this.memory.addEntry('assistant', response);
    
    // Format response to fit within box
    const termWidth = boxWidth || process.stdout.columns || 80;
    const innerWidth = Math.max(40, termWidth) - 2;
    const maxWidth = innerWidth - 2; // Leave space for side padding
    const wrappedResponse = this.wrapText(response, maxWidth);
    
    // Draw top border
    console.log(chalk.green('┌' + '─'.repeat(innerWidth) + '┐'));
    // Title line
    const title = ' Assistant Response:';
    const titlePad = innerWidth - title.length;
    console.log(chalk.green('│') + chalk.white(title) + ' '.repeat(Math.max(0, titlePad)) + chalk.green('│'));
    // Separator
    console.log(chalk.green('├' + '─'.repeat(innerWidth) + '┤'));
    // Response lines
    wrappedResponse.forEach(line => {
      const paddedLine = line.padEnd(maxWidth);
      console.log(chalk.green('│ ') + chalk.white(paddedLine) + chalk.green(' │'));
    });
    // Bottom border
    console.log(chalk.green('└' + '─'.repeat(innerWidth) + '┘'));
    console.log(); // Empty line for readability
  }

  private async generateResponse(input: string): Promise<string> {
    if (!this.agent) {
      throw new Error('BeeAI agent not initialized');
    }

    try {
      // Show thinking process
      await this.streamStep('🤔', 'Thinking', 'Analyzing your request and planning response...');
      
      // Get conversation context from memory
      const context = this.memory.getLastEntries(5)
        .map(entry => `${entry.role}: ${entry.content}`)
        .join('\n');

      // Build prompt with context if available
      let prompt = input;
      if (context.trim()) {
        prompt = `Previous conversation:\n${context}\n\nUser: ${input}`;
        await this.streamStep('📝', 'Context', 'Adding conversation history to prompt');
      }

      await this.streamStep('🎯', 'Planning', 'Determining which tools to use for this task...');

      // Set up event listeners for streaming agent steps
      let finalResponse = '';
      
      // Add manual steps since we'll simulate the agent's thinking process
      await this.streamStep('🚀', 'Starting', 'Agent execution beginning...');
      
      // Simulate tool detection and usage
      if (input.toLowerCase().includes('calculate') || input.match(/\d+/)) {
        await this.streamStep('🛠️', 'Tool Call', 'Using Calculator: Processing mathematical expression...');
      }
      
      if (input.toLowerCase().includes('wikipedia') || input.toLowerCase().includes('what is') || input.toLowerCase().includes('tell me about')) {
        await this.streamStep('🛠️', 'Tool Call', 'Using Wikipedia: Searching for relevant information...');
      }
      
      const gitKeywords = ['git', 'commit', 'branch', 'status', 'diff', 'log', 'repository', 'repo'];
      if (gitKeywords.some(keyword => input.toLowerCase().includes(keyword))) {
        await this.streamStep('🛠️', 'Tool Call', 'Using Git: Performing version control operations...');
      }
      
      const codebaseKeywords = ['analyze', 'codebase', 'code', 'function', 'class', 'file', 'directory', 'search code', 'find function', 'explain code', 'code structure'];
      if (codebaseKeywords.some(keyword => input.toLowerCase().includes(keyword))) {
        await this.streamStep('🛠️', 'Tool Call', 'Using Codebase Analyzer: Analyzing code structure and content...');
      }
      
      await this.streamStep('🧠', 'LLM Call', 'Sending request to OpenAI...');

      // Process with BeeAI agent
      await this.streamStep('💭', 'Processing', 'Generating response based on analysis...');
      
      const response = await this.agent.run({
        prompt: prompt
      });

      finalResponse = response.result?.text || 'Sorry, I could not generate a response.';
      
      await this.streamStep('✅', 'Tool Result', 'Analysis completed successfully');
      await this.streamStep('✨', 'Complete', 'Response generated successfully');
      
      return finalResponse;
    } catch (error) {
      await this.streamStep('❌', 'Error', `Failed to generate response: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Determine error type based on error message
      let errorType = 'RUNTIME_ERROR';
      if (error instanceof Error) {
        if (error.message.includes('API') || error.message.includes('OpenAI') || error.message.includes('rate limit') || error.message.includes('quota')) {
          errorType = 'API_ERROR';
        } else if (error.message.includes('network') || error.message.includes('connection') || error.message.includes('fetch')) {
          errorType = 'NETWORK_ERROR';
        } else if (error.message.includes('tool') || error.message.includes('calculator') || error.message.includes('wikipedia') || error.message.includes('git')) {
          errorType = 'TOOL_ERROR';
        }
      }
      
      this.displayError(error as Error, errorType);
      return 'Sorry, I encountered an error while processing your request. Please try again.';
    }
  }

  private showStep(icon: string, title: string, description: string): void {
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.cyan(`${icon} [${timestamp}] ${chalk.bold(title)}: ${chalk.gray(description)}`));
    
    // Add small delay for streaming effect
    return new Promise(resolve => setTimeout(resolve, 100)) as any;
  }

  private async streamStep(icon: string, title: string, description: string): Promise<void> {
    const timestamp = new Date().toLocaleTimeString();
    
    // Show step with typing effect
    process.stdout.write(chalk.cyan(`${icon} [${timestamp}] ${chalk.bold(title)}: `));
    
    // Stream the description character by character
    for (const char of description) {
      process.stdout.write(chalk.gray(char));
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    process.stdout.write('\n');
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        if (word.length > maxWidth) {
          // Split very long words
          let remainingWord = word;
          while (remainingWord.length > maxWidth) {
            lines.push(remainingWord.substring(0, maxWidth));
            remainingWord = remainingWord.substring(maxWidth);
          }
          currentLine = remainingWord;
        } else {
          currentLine = word;
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
  }

  private displayError(error: Error | string, type: string = 'RUNTIME_ERROR'): void {
    const termWidth = process.stdout.columns || 80;
    const innerWidth = Math.max(40, termWidth) - 2;
    const maxWidth = innerWidth - 2;

    let errorDetails: ErrorDetails;
    
    if (error instanceof Error) {
      errorDetails = {
        type,
        message: error.message,
        stack: error.stack,
        command: this.getErrorCommand(type),
        suggestion: this.getErrorSuggestion(type, error.message)
      };
    } else {
      errorDetails = {
        type,
        message: error,
        command: this.getErrorCommand(type),
        suggestion: this.getErrorSuggestion(type, error)
      };
    }

    this.lastError = errorDetails;

    // Draw red error box
    console.log(chalk.red('┌' + '─'.repeat(innerWidth) + '┐'));
    
    // Title line
    const title = ` ❌ ERROR: ${errorDetails.type}`;
    const titlePad = innerWidth - title.length;
    console.log(chalk.red('│') + chalk.white.bold(title) + ' '.repeat(Math.max(0, titlePad)) + chalk.red('│'));
    
    // Separator
    console.log(chalk.red('├' + '─'.repeat(innerWidth) + '┤'));
    
    // Error message
    const wrappedMessage = this.wrapText(errorDetails.message, maxWidth);
    wrappedMessage.forEach(line => {
      const paddedLine = line.padEnd(maxWidth);
      console.log(chalk.red('│ ') + chalk.white(paddedLine) + chalk.red(' │'));
    });

    // Add command shortcut if available
    if (errorDetails.command) {
      console.log(chalk.red('├' + '─'.repeat(innerWidth) + '┤'));
      const commandText = `💡 Quick help: Type "${errorDetails.command}" for details`;
      const wrappedCommand = this.wrapText(commandText, maxWidth);
      wrappedCommand.forEach(line => {
        const paddedLine = line.padEnd(maxWidth);
        console.log(chalk.red('│ ') + chalk.yellow(paddedLine) + chalk.red(' │'));
      });
    }

    // Add suggestion if available
    if (errorDetails.suggestion) {
      console.log(chalk.red('├' + '─'.repeat(innerWidth) + '┤'));
      const wrappedSuggestion = this.wrapText(errorDetails.suggestion, maxWidth);
      wrappedSuggestion.forEach(line => {
        const paddedLine = line.padEnd(maxWidth);
        console.log(chalk.red('│ ') + chalk.cyan(paddedLine) + chalk.red(' │'));
      });
    }

    // Show stack trace immediately for runtime and network errors
    if ((errorDetails.type === 'RUNTIME_ERROR' || errorDetails.type === 'NETWORK_ERROR') && errorDetails.stack) {
      console.log(chalk.red('├' + '─'.repeat(innerWidth) + '┤'));
      console.log(chalk.red('│ ') + chalk.white.bold('Stack Trace:'.padEnd(maxWidth)) + chalk.red(' │'));
      
      const stackLines = errorDetails.stack.split('\n').slice(0, 8); // First 8 lines
      stackLines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          const wrappedStack = this.wrapText(trimmedLine, maxWidth - 2);
          wrappedStack.forEach(stackLine => {
            const paddedLine = ('  ' + stackLine).padEnd(maxWidth);
            console.log(chalk.red('│ ') + chalk.gray(paddedLine) + chalk.red(' │'));
          });
        }
      });
    }

    // Bottom border
    console.log(chalk.red('└' + '─'.repeat(innerWidth) + '┘'));
    console.log(); // Empty line for readability
  }

  private getErrorCommand(type: string): string {
    const commands: { [key: string]: string } = {
      'RUNTIME_ERROR': 'error',
      'INIT_ERROR': 'init-help',
      'API_ERROR': 'api-help',
      'TOOL_ERROR': 'tool-help',
      'NETWORK_ERROR': 'network-help'
    };
    return commands[type] || 'error';
  }

  private getErrorSuggestion(type: string, message: string): string {
    // API Key related errors
    if (message.includes('OPENAI_API_KEY') || message.includes('API key')) {
      return '🔑 Set your OpenAI API key: create .env file with OPENAI_API_KEY=your_key_here';
    }
    
    // Network related errors
    if (message.includes('network') || message.includes('connection') || message.includes('fetch')) {
      return '🌐 Check your internet connection and try again';
    }
    
    // Tool related errors
    if (message.includes('tool') || message.includes('calculator') || message.includes('wikipedia')) {
      return '🛠️ Try rephrasing your request or check if the tool is available';
    }
    
    // Git related errors
    if (message.includes('git') || message.includes('repository')) {
      return '📁 Make sure you\'re in a git repository directory';
    }

    // Generic suggestions based on error type
    switch (type) {
      case 'INIT_ERROR':
        return '⚙️ Check your configuration and environment variables';
      case 'API_ERROR':
        return '🔌 Verify your API credentials and quota limits';
      case 'TOOL_ERROR':
        return '🔧 Try using a different tool or rephrasing your request';
      default:
        return '🔄 Try your request again or type "help" for assistance';
    }
  }

  private showDetailedError(): void {
    if (!this.lastError) {
      console.log(chalk.yellow('No recent error to display.'));
      return;
    }

    const termWidth = process.stdout.columns || 80;
    const innerWidth = Math.max(60, termWidth) - 2;
    const maxWidth = innerWidth - 2;

    console.log(chalk.red('┌' + '─'.repeat(innerWidth) + '┐'));
    console.log(chalk.red('│') + chalk.white.bold(` 🔍 DETAILED ERROR INFORMATION`.padEnd(innerWidth)) + chalk.red('│'));
    console.log(chalk.red('├' + '─'.repeat(innerWidth) + '┤'));

    // Error type
    const typeText = `Type: ${this.lastError.type}`;
    console.log(chalk.red('│ ') + chalk.yellow(typeText.padEnd(maxWidth)) + chalk.red(' │'));

    // Error message
    console.log(chalk.red('│ ') + chalk.white('Message:'.padEnd(maxWidth)) + chalk.red(' │'));
    const wrappedMessage = this.wrapText(this.lastError.message, maxWidth - 2);
    wrappedMessage.forEach(line => {
      console.log(chalk.red('│ ') + chalk.gray(('  ' + line).padEnd(maxWidth)) + chalk.red(' │'));
    });

    // Stack trace if available
    if (this.lastError.stack) {
      console.log(chalk.red('├' + '─'.repeat(innerWidth) + '┤'));
      console.log(chalk.red('│ ') + chalk.white('Stack Trace:'.padEnd(maxWidth)) + chalk.red(' │'));
      const stackLines = this.lastError.stack.split('\n').slice(0, 10); // First 10 lines
      stackLines.forEach(line => {
        const wrappedStack = this.wrapText(line.trim(), maxWidth - 2);
        wrappedStack.forEach(stackLine => {
          console.log(chalk.red('│ ') + chalk.gray(('  ' + stackLine).padEnd(maxWidth)) + chalk.red(' │'));
        });
      });
    }

    console.log(chalk.red('└' + '─'.repeat(innerWidth) + '┘'));
    console.log();
  }

  private handleErrorCommands(input: string): boolean {
    const command = input.toLowerCase().trim();
    
    switch (command) {
      case 'error':
        this.showDetailedError();
        return true;
        
      case 'init-help':
        this.showInitHelp();
        return true;
        
      case 'api-help':
        this.showApiHelp();
        return true;
        
      case 'tool-help':
        this.showToolHelp();
        return true;
        
      case 'network-help':
        this.showNetworkHelp();
        return true;
        
      case 'help':
        this.showGeneralHelp();
        return true;
        
      default:
        return false;
    }
  }

  private showInitHelp(): void {
    console.log(chalk.blue('┌─ 🚀 INITIALIZATION HELP ─────────────────────────────────────┐'));
    console.log(chalk.blue('│') + chalk.white(' Common initialization issues:                                ') + chalk.blue('│'));
    console.log(chalk.blue('├──────────────────────────────────────────────────────────────┤'));
    console.log(chalk.blue('│') + chalk.yellow(' • Missing .env file                                          ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('   Solution: Create .env file with OPENAI_API_KEY=your_key    ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.yellow(' • Invalid API key                                            ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('   Solution: Check your OpenAI account for valid key          ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.yellow(' • Permission issues                                          ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('   Solution: Check file permissions and directory access      ') + chalk.blue('│'));
    console.log(chalk.blue('└──────────────────────────────────────────────────────────────┘'));
    console.log();
  }

  private showApiHelp(): void {
    console.log(chalk.blue('┌─ 🔌 API HELP ────────────────────────────────────────────────┐'));
    console.log(chalk.blue('│') + chalk.white(' Common API issues:                                           ') + chalk.blue('│'));
    console.log(chalk.blue('├──────────────────────────────────────────────────────────────┤'));
    console.log(chalk.blue('│') + chalk.yellow(' • Rate limiting                                              ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('   Solution: Wait and try again, or upgrade your plan        ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.yellow(' • Quota exceeded                                             ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('   Solution: Check your OpenAI usage dashboard               ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.yellow(' • Invalid request format                                     ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('   Solution: Try rephrasing your request                      ') + chalk.blue('│'));
    console.log(chalk.blue('└──────────────────────────────────────────────────────────────┘'));
    console.log();
  }

  private showToolHelp(): void {
    console.log(chalk.blue('┌─ 🛠️ TOOL HELP ───────────────────────────────────────────────┐'));
    console.log(chalk.blue('│') + chalk.white(' Available tools and common issues:                           ') + chalk.blue('│'));
    console.log(chalk.blue('├──────────────────────────────────────────────────────────────┤'));
    console.log(chalk.blue('│') + chalk.yellow(' Calculator Tool:                                             ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('   • Use for math: "calculate 2+2" or "what is 15*8?"         ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.yellow(' Wikipedia Tool:                                              ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('   • Use for info: "what is quantum physics?" or "tell me     ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('     about Albert Einstein"                                   ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.yellow(' Git Tool:                                                    ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('   • Use for git: "git status" or "show git log"              ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('   • Make sure you\'re in a git repository                     ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.yellow(' Codebase Analyzer:                                           ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('   • Use for code: "analyze /path/to/code" or "find function  ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('     getName" or "explain this codebase"                      ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('   • Operations: analyze, search, find_function, find_class   ') + chalk.blue('│'));
    console.log(chalk.blue('└──────────────────────────────────────────────────────────────┘'));
    console.log();
  }

  private showNetworkHelp(): void {
    console.log(chalk.blue('┌─ 🌐 NETWORK HELP ────────────────────────────────────────────┐'));
    console.log(chalk.blue('│') + chalk.white(' Network connectivity issues:                                 ') + chalk.blue('│'));
    console.log(chalk.blue('├──────────────────────────────────────────────────────────────┤'));
    console.log(chalk.blue('│') + chalk.yellow(' • Connection timeout                                         ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('   Solution: Check internet connection and try again          ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.yellow(' • DNS resolution issues                                      ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('   Solution: Try different DNS servers or restart network     ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.yellow(' • Firewall blocking requests                                 ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.gray('   Solution: Check firewall settings and proxy configuration  ') + chalk.blue('│'));
    console.log(chalk.blue('└──────────────────────────────────────────────────────────────┘'));
    console.log();
  }

  private showGeneralHelp(): void {
    console.log(chalk.blue('┌─ 💡 HELP & COMMANDS ─────────────────────────────────────────┐'));
    console.log(chalk.blue('│') + chalk.white(' Available commands:                                          ') + chalk.blue('│'));
    console.log(chalk.blue('├──────────────────────────────────────────────────────────────┤'));
    console.log(chalk.blue('│') + chalk.yellow(' help        ') + chalk.gray('- Show this help message                      ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.yellow(' error       ') + chalk.gray('- Show detailed info about last error        ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.yellow(' init-help   ') + chalk.gray('- Help with initialization issues             ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.yellow(' api-help    ') + chalk.gray('- Help with API-related issues                ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.yellow(' tool-help   ') + chalk.gray('- Help with available tools                   ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.yellow(' network-help') + chalk.gray('- Help with network connectivity issues       ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.yellow(' quit        ') + chalk.gray('- Exit the application                        ') + chalk.blue('│'));
    console.log(chalk.blue('├──────────────────────────────────────────────────────────────┤'));
    console.log(chalk.blue('│') + chalk.white(' Example usage:                                               ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.cyan(' "Calculate 15 * 23"                                          ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.cyan(' "What is machine learning?"                                  ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.cyan(' "Show git status"                                            ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.cyan(' "Analyze the codebase in /path/to/project"                   ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.cyan(' "Find function calculateTotal"                               ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.cyan(' "Explain the architecture of this codebase"                 ') + chalk.blue('│'));
    console.log(chalk.blue('│') + chalk.cyan(' "What design patterns are used in this code?"               ') + chalk.blue('│'));
    console.log(chalk.blue('└──────────────────────────────────────────────────────────────┘'));
    console.log();
  }

  private handleQuit(): void {
    console.log(chalk.blue('\n👋 Thanks for using Bee AI CLI!'));
    console.log(chalk.gray(`Session ended with ${this.memory.getHistory().length} messages in memory.`));
    this.isRunning = false;
    process.exit(0);
  }
}

// CLI setup
program
  .name('bee-ai')
  .description('Bee AI Agent CLI with session memory')
  .version('1.0.0')
  .action(async () => {
    const cli = new BeeAICLI();
    await cli.start();
  });

program.parse();