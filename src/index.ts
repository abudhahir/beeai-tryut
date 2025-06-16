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

interface BeeAIResponse {
  result: {
    text: string;
  };
}

class BeeAICLI {
  private memory: SessionMemory;
  private isRunning: boolean = false;
  private agent: ToolCallingAgent | null = null;
  private llm: OpenAIChatModel | null = null;

  constructor() {
    this.memory = new SessionMemory();
    this.initializeBeeAI();
  }

  private initializeBeeAI(): void {
    try {
      // Check for OpenAI API key
      if (!process.env.OPENAI_API_KEY) {
        console.error(chalk.red('Error: OPENAI_API_KEY environment variable is required.'));
        console.log(chalk.yellow('Please create a .env file with your OpenAI API key:'));
        console.log(chalk.gray('OPENAI_API_KEY=your_api_key_here'));
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
        ],
        meta: {
          name: 'Bee AI CLI Assistant',
          description: 'A helpful AI assistant with access to calculator, Wikipedia, and Git tools'
        }
      });

    } catch (error) {
      console.error(chalk.red('Failed to initialize BeeAI:'), error);
      process.exit(1);
    }
  }

  async start(): Promise<void> {
    console.log(chalk.blue.bold('🐝 Bee AI Agent CLI'));
    console.log(chalk.gray('Connected to OpenAI with BeeAI Framework'));
    console.log(chalk.gray('Available tools: Calculator, Wikipedia, Git'));
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

        await this.processInput(userInput, boxWidth);
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('User force closed')) {
          this.handleQuit();
          break;
        }
        console.error(chalk.red('Error:'), error);
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