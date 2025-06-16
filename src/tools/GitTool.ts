import { Tool, StringToolOutput, ToolEmitter, ToolInput, BaseToolOptions, BaseToolRunOptions } from 'beeai-framework/tools/base';
import { z } from 'zod';
import simpleGit, { SimpleGit } from 'simple-git';
import { Emitter } from 'beeai-framework/emitter/emitter';

interface GitToolOptions extends BaseToolOptions {}

export class GitTool extends Tool<StringToolOutput, GitToolOptions> {
  name = 'git';
  description = 'Git version control operations including status, diff, commit, branch management, and more';
  
  readonly emitter: ToolEmitter<ToolInput<this>, StringToolOutput>;

  constructor(options?: GitToolOptions) {
    super(options);
    this.emitter = new Emitter();
  }

  inputSchema() {
    return z.object({
      operation: z.enum([
        'status', 'diff', 'diff_staged', 'diff_unstaged', 'log', 
        'add', 'commit', 'init', 'show', 'create_branch', 'checkout', 'reset'
      ]).describe('The Git operation to perform'),
      repoPath: z.string().optional().describe('Path to the Git repository (defaults to current directory)'),
      files: z.array(z.string()).optional().describe('Files to operate on (for add, reset operations)'),
      message: z.string().optional().describe('Commit message (for commit operation)'),
      branch: z.string().optional().describe('Branch name (for create_branch, checkout operations)'),
      commitHash: z.string().optional().describe('Commit hash (for show operation)'),
      lines: z.number().optional().describe('Number of log entries to show (for log operation)')
    });
  }

  private getGit(repoPath?: string): SimpleGit {
    const workingDir = repoPath || process.cwd();
    return simpleGit(workingDir);
  }

  private async isGitRepo(repoPath?: string): Promise<boolean> {
    try {
      const git = this.getGit(repoPath);
      await git.status();
      return true;
    } catch {
      return false;
    }
  }

  protected async _run(
    input: ToolInput<this>, 
    options: Partial<BaseToolRunOptions>
  ): Promise<StringToolOutput> {
    const { operation, repoPath, files, message, branch, commitHash, lines } = input;
    try {
      const git = this.getGit(repoPath);

      switch (operation) {
        case 'status':
          const status = await git.status();
          return new StringToolOutput(this.formatStatus(status));

        case 'diff':
          const diff = await git.diff();
          return new StringToolOutput(diff || 'No differences found');

        case 'diff_staged':
          const diffStaged = await git.diff(['--cached']);
          return new StringToolOutput(diffStaged || 'No staged changes found');

        case 'diff_unstaged':
          const diffUnstaged = await git.diff();
          return new StringToolOutput(diffUnstaged || 'No unstaged changes found');

        case 'log':
          const logCount = lines || 10;
          const log = await git.log({ maxCount: logCount });
          return new StringToolOutput(this.formatLog(log));

        case 'add':
          if (!files || files.length === 0) {
            return new StringToolOutput('Error: No files specified for add operation');
          }
          await git.add(files);
          return new StringToolOutput(`Added files: ${files.join(', ')}`);

        case 'commit':
          if (!message) {
            return new StringToolOutput('Error: Commit message is required');
          }
          const commit = await git.commit(message);
          return new StringToolOutput(`Committed: ${commit.commit} - ${message}`);

        case 'init':
          await git.init();
          return new StringToolOutput(`Initialized empty Git repository in ${repoPath || process.cwd()}`);

        case 'show':
          const hash = commitHash || 'HEAD';
          const show = await git.show([hash]);
          return new StringToolOutput(show);

        case 'create_branch':
          if (!branch) {
            return new StringToolOutput('Error: Branch name is required');
          }
          await git.checkoutLocalBranch(branch);
          return new StringToolOutput(`Created and switched to branch: ${branch}`);

        case 'checkout':
          if (!branch) {
            return new StringToolOutput('Error: Branch name is required');
          }
          await git.checkout(branch);
          return new StringToolOutput(`Switched to branch: ${branch}`);

        case 'reset':
          if (files && files.length > 0) {
            await git.reset(['HEAD', ...files]);
            return new StringToolOutput(`Reset files: ${files.join(', ')}`);
          } else {
            await git.reset(['HEAD']);
            return new StringToolOutput('Reset all staged changes');
          }

        default:
          return new StringToolOutput(`Error: Unknown operation: ${operation}`);
      }
    } catch (error) {
      throw this.toError(error as Error, { input, options });
    }
  }

  private formatStatus(status: any): string {
    const lines = [];
    
    if (status.current) {
      lines.push(`On branch ${status.current}`);
    }
    
    if (status.ahead || status.behind) {
      lines.push(`Your branch is ${status.ahead ? `ahead by ${status.ahead}` : ''}${status.ahead && status.behind ? ' and ' : ''}${status.behind ? `behind by ${status.behind}` : ''} commits`);
    }

    if (status.staged && status.staged.length > 0) {
      lines.push('\nChanges to be committed:');
      status.staged.forEach((file: string) => lines.push(`  modified: ${file}`));
    }

    if (status.modified && status.modified.length > 0) {
      lines.push('\nChanges not staged for commit:');
      status.modified.forEach((file: string) => lines.push(`  modified: ${file}`));
    }

    if (status.not_added && status.not_added.length > 0) {
      lines.push('\nUntracked files:');
      status.not_added.forEach((file: string) => lines.push(`  ${file}`));
    }

    if (lines.length === 1) {
      lines.push('nothing to commit, working tree clean');
    }

    return lines.join('\n');
  }

  private formatLog(log: any): string {
    return log.all.map((commit: any) => {
      return `commit ${commit.hash}\nAuthor: ${commit.author_name} <${commit.author_email}>\nDate: ${commit.date}\n\n    ${commit.message}\n`;
    }).join('\n');
  }
}