import { Tool, StringToolOutput, ToolEmitter, ToolInput, BaseToolOptions, BaseToolRunOptions } from 'beeai-framework/tools/base';
import { z } from 'zod';
import { Emitter } from 'beeai-framework/emitter/emitter';
import * as fs from 'fs';
import * as path from 'path';

interface CodebaseAnalyzerOptions extends BaseToolOptions {}

interface FileInfo {
  path: string;
  content: string;
  lines: number;
  extension: string;
  size: number;
}

interface CodebaseIndex {
  files: FileInfo[];
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
  structure: any;
}

export class CodebaseAnalyzer extends Tool<StringToolOutput, CodebaseAnalyzerOptions> {
  name = 'codebase-analyzer';
  description = 'Analyze and understand codebases - read files, extract structure, answer questions about code';
  
  readonly emitter: ToolEmitter<ToolInput<this>, StringToolOutput>;
  private codebaseIndex: CodebaseIndex | null = null;
  private currentPath: string | null = null;

  constructor(options?: CodebaseAnalyzerOptions) {
    super(options);
    this.emitter = new Emitter();
  }

  inputSchema() {
    return z.object({
      operation: z.enum([
        'analyze', 'search', 'explain', 'structure', 'stats', 'find_function', 
        'find_class', 'dependencies', 'files', 'content', 'summary'
      ]).describe('The codebase analysis operation to perform'),
      path: z.string().optional().describe('Path to the codebase directory'),
      query: z.string().optional().describe('Search query or question about the codebase'),
      fileName: z.string().optional().describe('Specific file name to analyze'),
      functionName: z.string().optional().describe('Function name to find'),
      className: z.string().optional().describe('Class name to find'),
      language: z.string().optional().describe('Filter by programming language'),
      includeExtensions: z.array(z.string()).optional().describe('File extensions to include (e.g., [".js", ".ts"])'),
      excludeExtensions: z.array(z.string()).optional().describe('File extensions to exclude'),
      maxDepth: z.number().optional().describe('Maximum directory depth to analyze (default: 10)')
    });
  }

  protected async _run(
    input: ToolInput<this>, 
    options: Partial<BaseToolRunOptions>
  ): Promise<StringToolOutput> {
    const { 
      operation, 
      path: targetPath, 
      query, 
      fileName, 
      functionName, 
      className, 
      language,
      includeExtensions,
      excludeExtensions,
      maxDepth = 10
    } = input;

    try {
      // If path is provided, analyze the codebase
      if (targetPath && (operation === 'analyze' || this.currentPath !== targetPath)) {
        await this.analyzeCodebase(targetPath, { includeExtensions, excludeExtensions, maxDepth });
      }

      switch (operation) {
        case 'analyze':
          if (!targetPath) {
            return new StringToolOutput('Error: Path is required for analyze operation');
          }
          return new StringToolOutput(this.formatAnalysisResult());

        case 'search':
          if (!query) {
            return new StringToolOutput('Error: Search query is required');
          }
          return new StringToolOutput(await this.searchCodebase(query));

        case 'explain':
          if (!query) {
            return new StringToolOutput('Error: Question is required for explain operation');
          }
          return new StringToolOutput(await this.explainCodebase(query));

        case 'structure':
          return new StringToolOutput(this.getCodebaseStructure());

        case 'stats':
          return new StringToolOutput(this.getCodebaseStats());

        case 'find_function':
          if (!functionName) {
            return new StringToolOutput('Error: Function name is required');
          }
          return new StringToolOutput(this.findFunction(functionName));

        case 'find_class':
          if (!className) {
            return new StringToolOutput('Error: Class name is required');
          }
          return new StringToolOutput(this.findClass(className));

        case 'dependencies':
          return new StringToolOutput(this.analyzeDependencies());

        case 'files':
          return new StringToolOutput(this.listFiles(language));

        case 'content':
          if (!fileName) {
            return new StringToolOutput('Error: File name is required');
          }
          return new StringToolOutput(this.getFileContent(fileName));

        case 'summary':
          return new StringToolOutput(this.getCodebaseSummary());

        default:
          return new StringToolOutput(`Error: Unknown operation: ${operation}`);
      }
    } catch (error) {
      throw this.toError(error as Error, { input, options });
    }
  }

  private async analyzeCodebase(
    targetPath: string, 
    options: { includeExtensions?: string[], excludeExtensions?: string[], maxDepth?: number }
  ): Promise<void> {
    const { includeExtensions, excludeExtensions, maxDepth = 10 } = options;
    
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Path does not exist: ${targetPath}`);
    }

    const stats = fs.statSync(targetPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${targetPath}`);
    }

    this.currentPath = targetPath;
    this.codebaseIndex = {
      files: [],
      totalFiles: 0,
      totalLines: 0,
      languages: {},
      structure: {}
    };

    await this.scanDirectory(targetPath, 0, maxDepth, includeExtensions, excludeExtensions);
    this.buildStructure();
  }

  private async scanDirectory(
    dirPath: string, 
    currentDepth: number, 
    maxDepth: number,
    includeExtensions?: string[],
    excludeExtensions?: string[]
  ): Promise<void> {
    if (currentDepth > maxDepth) return;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      // Skip common directories to ignore
      if (entry.isDirectory()) {
        const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.nyc_output'];
        if (skipDirs.includes(entry.name)) continue;
        
        await this.scanDirectory(fullPath, currentDepth + 1, maxDepth, includeExtensions, excludeExtensions);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        
        // Apply extension filters
        if (includeExtensions && !includeExtensions.includes(ext)) continue;
        if (excludeExtensions && excludeExtensions.includes(ext)) continue;
        
        // Skip binary and large files
        const skipExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.pdf', '.zip', '.tar', '.gz'];
        if (skipExtensions.includes(ext)) continue;
        
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n').length;
          const size = fs.statSync(fullPath).size;
          
          // Skip very large files (> 1MB)
          if (size > 1024 * 1024) continue;
          
          const fileInfo: FileInfo = {
            path: path.relative(this.currentPath!, fullPath),
            content,
            lines,
            extension: ext,
            size
          };
          
          this.codebaseIndex!.files.push(fileInfo);
          this.codebaseIndex!.totalFiles++;
          this.codebaseIndex!.totalLines += lines;
          
          // Track language statistics
          const language = this.getLanguageFromExtension(ext);
          this.codebaseIndex!.languages[language] = (this.codebaseIndex!.languages[language] || 0) + 1;
          
        } catch (error) {
          // Skip files that can't be read (binary, permission issues, etc.)
          continue;
        }
      }
    }
  }

  private getLanguageFromExtension(ext: string): string {
    const languageMap: Record<string, string> = {
      '.js': 'JavaScript',
      '.ts': 'TypeScript',
      '.jsx': 'React JSX',
      '.tsx': 'React TSX',
      '.py': 'Python',
      '.java': 'Java',
      '.cpp': 'C++',
      '.c': 'C',
      '.cs': 'C#',
      '.php': 'PHP',
      '.rb': 'Ruby',
      '.go': 'Go',
      '.rs': 'Rust',
      '.swift': 'Swift',
      '.kt': 'Kotlin',
      '.scala': 'Scala',
      '.html': 'HTML',
      '.css': 'CSS',
      '.scss': 'SCSS',
      '.sass': 'Sass',
      '.less': 'Less',
      '.json': 'JSON',
      '.xml': 'XML',
      '.yaml': 'YAML',
      '.yml': 'YAML',
      '.md': 'Markdown',
      '.sh': 'Shell',
      '.bat': 'Batch',
      '.ps1': 'PowerShell',
      '.sql': 'SQL',
      '.r': 'R',
      '.m': 'MATLAB',
      '.pl': 'Perl',
      '.lua': 'Lua',
      '.dart': 'Dart',
      '.vue': 'Vue',
      '.svelte': 'Svelte'
    };
    
    return languageMap[ext] || 'Unknown';
  }

  private buildStructure(): void {
    const structure: any = {};
    
    for (const file of this.codebaseIndex!.files) {
      const parts = file.path.split(path.sep);
      let current = structure;
      
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      
      current[parts[parts.length - 1]] = {
        type: 'file',
        extension: file.extension,
        lines: file.lines,
        size: file.size
      };
    }
    
    this.codebaseIndex!.structure = structure;
  }

  private formatAnalysisResult(): string {
    if (!this.codebaseIndex) {
      return 'No codebase has been analyzed yet.';
    }

    const lines = [
      `📁 Codebase Analysis Complete`,
      `📍 Path: ${this.currentPath}`,
      `📊 Statistics:`,
      `  • Total Files: ${this.codebaseIndex.totalFiles}`,
      `  • Total Lines: ${this.codebaseIndex.totalLines.toLocaleString()}`,
      `  • Languages Detected: ${Object.keys(this.codebaseIndex.languages).length}`,
      ``,
      `🔤 Language Breakdown:`
    ];

    // Sort languages by file count
    const sortedLanguages = Object.entries(this.codebaseIndex.languages)
      .sort(([,a], [,b]) => b - a);

    for (const [language, count] of sortedLanguages) {
      lines.push(`  • ${language}: ${count} files`);
    }

    lines.push(``, `✅ Codebase indexed and ready for analysis!`);
    lines.push(`💡 Try: search, explain, find_function, find_class, dependencies, structure`);

    return lines.join('\n');
  }

  private async searchCodebase(query: string): Promise<string> {
    if (!this.codebaseIndex) {
      return 'No codebase has been analyzed yet. Please run analyze operation first.';
    }

    const results: Array<{file: string, matches: Array<{line: number, content: string}>}> = [];
    const searchRegex = new RegExp(query, 'gi');

    for (const file of this.codebaseIndex.files) {
      const matches: Array<{line: number, content: string}> = [];
      const lines = file.content.split('\n');

      lines.forEach((line, index) => {
        if (searchRegex.test(line)) {
          matches.push({
            line: index + 1,
            content: line.trim()
          });
        }
      });

      if (matches.length > 0) {
        results.push({
          file: file.path,
          matches: matches.slice(0, 5) // Limit to 5 matches per file
        });
      }
    }

    if (results.length === 0) {
      return `No matches found for "${query}"`;
    }

    const lines = [`🔍 Search Results for "${query}":`, ``];
    
    for (const result of results.slice(0, 10)) { // Limit to 10 files
      lines.push(`📄 ${result.file}:`);
      for (const match of result.matches) {
        lines.push(`  Line ${match.line}: ${match.content}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private async explainCodebase(question: string): Promise<string> {
    if (!this.codebaseIndex) {
      return 'No codebase has been analyzed yet. Please run analyze operation first.';
    }

    // This is a simplified explanation generator
    // In a real implementation, you'd want to use an LLM to generate explanations
    const lines = [
      `🤔 Question: ${question}`,
      ``,
      `📊 Codebase Context:`,
      `• ${this.codebaseIndex.totalFiles} files analyzed`,
      `• ${this.codebaseIndex.totalLines.toLocaleString()} lines of code`,
      `• Primary languages: ${Object.keys(this.codebaseIndex.languages).slice(0, 3).join(', ')}`,
      ``,
      `🔍 Analysis:`
    ];

    // Simple keyword-based responses
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('structure') || lowerQuestion.includes('architecture')) {
      lines.push('• This codebase follows a structured approach with organized directories');
      lines.push('• Key components are separated into logical modules');
    }
    
    if (lowerQuestion.includes('language') || lowerQuestion.includes('tech')) {
      const mainLanguage = Object.entries(this.codebaseIndex.languages)
        .sort(([,a], [,b]) => b - a)[0][0];
      lines.push(`• Primary language: ${mainLanguage}`);
    }
    
    if (lowerQuestion.includes('size') || lowerQuestion.includes('large')) {
      lines.push(`• Codebase size: ${this.codebaseIndex.totalFiles} files, ${this.codebaseIndex.totalLines.toLocaleString()} lines`);
    }

    lines.push(``, `💡 For more specific analysis, try: search, find_function, find_class, dependencies`);

    return lines.join('\n');
  }

  private getCodebaseStructure(): string {
    if (!this.codebaseIndex) {
      return 'No codebase has been analyzed yet.';
    }

    const lines = ['📂 Codebase Structure:', ''];
    
    const formatStructure = (obj: any, prefix: string = '', depth: number = 0): void => {
      if (depth > 5) return; // Limit depth to prevent overwhelming output
      
      const entries = Object.entries(obj);
      entries.forEach(([key, value], index) => {
        const isLast = index === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        
        if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'file') {
          const fileInfo = value as { type: string; lines: number; size: number; extension: string };
          lines.push(`${prefix}${connector}${key} (${fileInfo.lines} lines)`);
        } else if (typeof value === 'object' && value !== null) {
          lines.push(`${prefix}${connector}${key}/`);
          const newPrefix = prefix + (isLast ? '    ' : '│   ');
          formatStructure(value, newPrefix, depth + 1);
        }
      });
    };

    formatStructure(this.codebaseIndex.structure);
    
    return lines.join('\n');
  }

  private getCodebaseStats(): string {
    if (!this.codebaseIndex) {
      return 'No codebase has been analyzed yet.';
    }

    const lines = [
      '📊 Detailed Codebase Statistics:',
      '',
      `📁 Files: ${this.codebaseIndex.totalFiles}`,
      `📝 Lines: ${this.codebaseIndex.totalLines.toLocaleString()}`,
      `🔤 Languages: ${Object.keys(this.codebaseIndex.languages).length}`,
      '',
      '📈 Language Distribution:'
    ];

    const sortedLanguages = Object.entries(this.codebaseIndex.languages)
      .sort(([,a], [,b]) => b - a);

    for (const [language, count] of sortedLanguages) {
      const percentage = ((count / this.codebaseIndex.totalFiles) * 100).toFixed(1);
      lines.push(`  ${language}: ${count} files (${percentage}%)`);
    }

    // File size statistics
    const fileSizes = this.codebaseIndex.files.map(f => f.size);
    const totalSize = fileSizes.reduce((sum, size) => sum + size, 0);
    const avgSize = Math.round(totalSize / fileSizes.length);

    lines.push('', '💾 Size Statistics:');
    lines.push(`  Total Size: ${this.formatBytes(totalSize)}`);
    lines.push(`  Average File Size: ${this.formatBytes(avgSize)}`);

    return lines.join('\n');
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private findFunction(functionName: string): string {
    if (!this.codebaseIndex) {
      return 'No codebase has been analyzed yet.';
    }

    const results: Array<{file: string, line: number, content: string}> = [];
    const functionRegex = new RegExp(
      `(function\\s+${functionName}\\s*\\(|${functionName}\\s*[:=]\\s*function|${functionName}\\s*\\(.*\\)\\s*=>|def\\s+${functionName}\\s*\\(|${functionName}\\s*\\(.*\\)\\s*{)`,
      'gi'
    );

    for (const file of this.codebaseIndex.files) {
      const lines = file.content.split('\n');
      lines.forEach((line, index) => {
        if (functionRegex.test(line)) {
          results.push({
            file: file.path,
            line: index + 1,
            content: line.trim()
          });
        }
      });
    }

    if (results.length === 0) {
      return `No function named "${functionName}" found.`;
    }

    const lines = [`🔍 Function "${functionName}" found:`, ''];
    
    for (const result of results) {
      lines.push(`📄 ${result.file}:${result.line}`);
      lines.push(`   ${result.content}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private findClass(className: string): string {
    if (!this.codebaseIndex) {
      return 'No codebase has been analyzed yet.';
    }

    const results: Array<{file: string, line: number, content: string}> = [];
    const classRegex = new RegExp(
      `(class\\s+${className}\\s*[{(:]|interface\\s+${className}\\s*[{]|type\\s+${className}\\s*=)`,
      'gi'
    );

    for (const file of this.codebaseIndex.files) {
      const lines = file.content.split('\n');
      lines.forEach((line, index) => {
        if (classRegex.test(line)) {
          results.push({
            file: file.path,
            line: index + 1,
            content: line.trim()
          });
        }
      });
    }

    if (results.length === 0) {
      return `No class named "${className}" found.`;
    }

    const lines = [`🔍 Class "${className}" found:`, ''];
    
    for (const result of results) {
      lines.push(`📄 ${result.file}:${result.line}`);
      lines.push(`   ${result.content}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private analyzeDependencies(): string {
    if (!this.codebaseIndex) {
      return 'No codebase has been analyzed yet.';
    }

    const dependencies = new Set<string>();
    const imports = new Set<string>();

    for (const file of this.codebaseIndex.files) {
      const lines = file.content.split('\n');
      
      for (const line of lines) {
        // Find import statements
        const importMatch = line.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/);
        if (importMatch) {
          imports.add(importMatch[1]);
        }
        
        // Find require statements
        const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (requireMatch) {
          dependencies.add(requireMatch[1]);
        }
      }
    }

    const lines = ['📦 Dependencies Analysis:', ''];
    
    if (imports.size > 0) {
      lines.push('📥 Imports:');
      Array.from(imports).slice(0, 20).forEach(imp => {
        lines.push(`  • ${imp}`);
      });
      lines.push('');
    }
    
    if (dependencies.size > 0) {
      lines.push('🔗 Dependencies:');
      Array.from(dependencies).slice(0, 20).forEach(dep => {
        lines.push(`  • ${dep}`);
      });
    }

    if (imports.size === 0 && dependencies.size === 0) {
      lines.push('No dependencies found in the analyzed files.');
    }

    return lines.join('\n');
  }

  private listFiles(language?: string): string {
    if (!this.codebaseIndex) {
      return 'No codebase has been analyzed yet.';
    }

    let files = this.codebaseIndex.files;
    
    if (language) {
      const targetLang = language.toLowerCase();
      files = files.filter(file => 
        this.getLanguageFromExtension(file.extension).toLowerCase().includes(targetLang)
      );
    }

    const lines = [
      language ? `📄 ${language} Files:` : '📄 All Files:',
      ''
    ];

    files.slice(0, 50).forEach(file => {
      lines.push(`${file.path} (${file.lines} lines, ${this.formatBytes(file.size)})`);
    });

    if (files.length > 50) {
      lines.push(`... and ${files.length - 50} more files`);
    }

    return lines.join('\n');
  }

  private getFileContent(fileName: string): string {
    if (!this.codebaseIndex) {
      return 'No codebase has been analyzed yet.';
    }

    const file = this.codebaseIndex.files.find(f => 
      f.path.includes(fileName) || f.path.endsWith(fileName)
    );

    if (!file) {
      return `File "${fileName}" not found in the analyzed codebase.`;
    }

    const lines = [
      `📄 ${file.path}`,
      `📊 ${file.lines} lines, ${this.formatBytes(file.size)}`,
      '─'.repeat(50),
      file.content,
      '─'.repeat(50)
    ];

    return lines.join('\n');
  }

  private getCodebaseSummary(): string {
    if (!this.codebaseIndex) {
      return 'No codebase has been analyzed yet.';
    }

    const mainLanguage = Object.entries(this.codebaseIndex.languages)
      .sort(([,a], [,b]) => b - a)[0];

    const lines = [
      '📋 Codebase Summary:',
      '',
      `📁 Project: ${path.basename(this.currentPath!)}`,
      `📊 Scale: ${this.codebaseIndex.totalFiles} files, ${this.codebaseIndex.totalLines.toLocaleString()} lines`,
      `🔤 Primary Language: ${mainLanguage[0]} (${mainLanguage[1]} files)`,
      `🌐 Technologies: ${Object.keys(this.codebaseIndex.languages).join(', ')}`,
      '',
      '🔍 Available Operations:',
      '  • search <query> - Search for code patterns',
      '  • explain <question> - Get explanations about the code',
      '  • find_function <name> - Locate function definitions',
      '  • find_class <name> - Locate class definitions',
      '  • structure - View directory structure',
      '  • dependencies - Analyze imports and dependencies',
      '  • stats - Detailed statistics'
    ];

    return lines.join('\n');
  }
}