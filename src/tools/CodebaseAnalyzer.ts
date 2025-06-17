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

interface ArchitecturalPattern {
  name: string;
  confidence: number;
  evidence: string[];
  description: string;
}

interface DesignPattern {
  name: string;
  location: string;
  confidence: number;
  description: string;
}

interface CodeQuality {
  complexity: number;
  maintainabilityScore: number;
  codeSmells: string[];
  recommendations: string[];
}

interface FunctionInfo {
  name: string;
  location: string;
  complexity: number;
  parameters: string[];
  returnType?: string;
}

interface ClassInfo {
  name: string;
  location: string;
  methods: string[];
  properties: string[];
  extends?: string;
  implements?: string[];
}

interface CodebaseIndex {
  files: FileInfo[];
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
  structure: any;
  architecturalPatterns: ArchitecturalPattern[];
  designPatterns: DesignPattern[];
  codeQuality: CodeQuality;
  functions: FunctionInfo[];
  classes: ClassInfo[];
  crossReferences: Record<string, string[]>;
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
        'find_class', 'dependencies', 'files', 'content', 'summary',
        'architecture', 'design_patterns', 'code_quality', 'complexity',
        'functionality', 'cross_references', 'call_graph'
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

        case 'architecture':
          return new StringToolOutput(this.analyzeArchitecture());

        case 'design_patterns':
          return new StringToolOutput(this.analyzeDesignPatterns());

        case 'code_quality':
          return new StringToolOutput(this.analyzeCodeQuality());

        case 'complexity':
          return new StringToolOutput(this.analyzeComplexity());

        case 'functionality':
          return new StringToolOutput(this.analyzeFunctionality());

        case 'cross_references':
          return new StringToolOutput(this.analyzeCrossReferences());

        case 'call_graph':
          return new StringToolOutput(this.generateCallGraph());

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
      structure: {},
      architecturalPatterns: [],
      designPatterns: [],
      codeQuality: {
        complexity: 0,
        maintainabilityScore: 0,
        codeSmells: [],
        recommendations: []
      },
      functions: [],
      classes: [],
      crossReferences: {}
    };

    await this.scanDirectory(targetPath, 0, maxDepth, includeExtensions, excludeExtensions);
    this.buildStructure();
    await this.performAdvancedAnalysis();
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

    const lines = [
      `🤔 Question: ${question}`,
      ``,
      `📊 Codebase Context:`,
      `• ${this.codebaseIndex.totalFiles} files analyzed`,
      `• ${this.codebaseIndex.totalLines.toLocaleString()} lines of code`,
      `• Primary languages: ${Object.keys(this.codebaseIndex.languages).slice(0, 3).join(', ')}`,
      `• ${this.codebaseIndex.functions.length} functions, ${this.codebaseIndex.classes.length} classes`,
      `• ${this.codebaseIndex.architecturalPatterns.length} architectural patterns detected`,
      `• ${this.codebaseIndex.designPatterns.length} design patterns found`,
      ``,
      `🔍 Intelligent Analysis:`
    ];

    const lowerQuestion = question.toLowerCase();
    
    // Architecture and design questions
    if (lowerQuestion.includes('architecture') || lowerQuestion.includes('design') || lowerQuestion.includes('structure')) {
      if (this.codebaseIndex.architecturalPatterns.length > 0) {
        lines.push(`• Architecture: Detected ${this.codebaseIndex.architecturalPatterns.map(p => p.name).join(', ')}`);
        const mainPattern = this.codebaseIndex.architecturalPatterns[0];
        lines.push(`• Primary pattern: ${mainPattern.name} (${(mainPattern.confidence * 100).toFixed(1)}% confidence)`);
        lines.push(`• Evidence: ${mainPattern.evidence[0]}`);
      } else {
        lines.push('• Architecture: No clear architectural patterns detected - may be a simple or early-stage project');
      }
    }
    
    // Code quality questions
    if (lowerQuestion.includes('quality') || lowerQuestion.includes('maintainability') || lowerQuestion.includes('complexity')) {
      const quality = this.codebaseIndex.codeQuality;
      lines.push(`• Code Quality: ${quality.maintainabilityScore.toFixed(1)}/100 maintainability score`);
      lines.push(`• Complexity: Average function complexity is ${quality.complexity.toFixed(2)}`);
      if (quality.codeSmells.length > 0) {
        lines.push(`• Issues: ${quality.codeSmells.length} code smells detected`);
        lines.push(`• Top concern: ${quality.codeSmells[0]}`);
      }
    }
    
    // Technology and language questions
    if (lowerQuestion.includes('technology') || lowerQuestion.includes('language') || lowerQuestion.includes('stack')) {
      const mainLanguage = Object.entries(this.codebaseIndex.languages)
        .sort(([,a], [,b]) => b - a)[0];
      lines.push(`• Primary Technology: ${mainLanguage[0]} (${mainLanguage[1]} files)`);
      
      if (this.codebaseIndex.designPatterns.length > 0) {
        const patterns = [...new Set(this.codebaseIndex.designPatterns.map(p => p.name))];
        lines.push(`• Design Patterns: Uses ${patterns.slice(0, 3).join(', ')}`);
      }
    }
    
    // Functionality questions
    if (lowerQuestion.includes('function') || lowerQuestion.includes('purpose') || lowerQuestion.includes('does')) {
      const functionCategories = this.categorizeFunctions();
      const topCategories = Object.entries(functionCategories)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3);
      
      if (topCategories.length > 0) {
        lines.push(`• Main Functionality: ${topCategories.map(([cat, count]) => `${cat} (${count})`).join(', ')}`);
      }
      
      if (this.codebaseIndex.classes.length > 0) {
        const hierarchies = this.analyzeClassHierarchies();
        if (hierarchies.length > 0) {
          lines.push(`• Object Model: ${hierarchies.length} inheritance/implementation relationships`);
        }
      }
    }
    
    // Size and scale questions
    if (lowerQuestion.includes('size') || lowerQuestion.includes('large') || lowerQuestion.includes('scale')) {
      const avgFileSize = this.codebaseIndex.totalLines / this.codebaseIndex.totalFiles;
      lines.push(`• Scale: ${this.codebaseIndex.totalFiles} files, average ${avgFileSize.toFixed(0)} lines per file`);
      
      const complexFunctions = this.codebaseIndex.functions.filter(f => f.complexity > 10).length;
      if (complexFunctions > 0) {
        lines.push(`• Complexity hotspots: ${complexFunctions} high-complexity functions need attention`);
      }
    }
    
    // Dependencies and modularity
    if (lowerQuestion.includes('depend') || lowerQuestion.includes('import') || lowerQuestion.includes('modular')) {
      const crossRefs = Object.values(this.codebaseIndex.crossReferences);
      const avgDependencies = crossRefs.reduce((sum, refs) => sum + refs.length, 0) / crossRefs.length;
      lines.push(`• Modularity: Average ${avgDependencies.toFixed(1)} dependencies per file`);
      
      const highDependencyFiles = crossRefs.filter(refs => refs.length > 10).length;
      if (highDependencyFiles > 0) {
        lines.push(`• Coupling: ${highDependencyFiles} files have high dependency counts (>10)`);
      }
    }

    // Add smart recommendations
    lines.push(``, `💡 Smart Recommendations:`);
    
    if (this.codebaseIndex.codeQuality.maintainabilityScore < 70) {
      lines.push(`• Consider refactoring: Maintainability score is below 70`);
    }
    
    if (this.codebaseIndex.architecturalPatterns.length === 0) {
      lines.push(`• Consider architectural patterns for better organization`);
    }
    
    if (this.codebaseIndex.designPatterns.length < 3) {
      lines.push(`• Could benefit from more design patterns for maintainability`);
    }

    lines.push(``, `🔧 For deeper analysis: architecture, design_patterns, code_quality, complexity`);

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
      '  • stats - Detailed statistics',
      '',
      '🏗️ Advanced Analysis:',
      '  • architecture - Detect architectural patterns (MVC, Microservices, etc.)',
      '  • design_patterns - Identify design patterns (Singleton, Factory, etc.)',
      '  • code_quality - Analyze code quality and maintainability',
      '  • complexity - Function complexity analysis',
      '  • functionality - Categorize functions and analyze class hierarchies',
      '  • cross_references - File dependencies and relationships',
      '  • call_graph - Function call relationships'
    ];

    return lines.join('\n');
  }

  // ==================== ADVANCED ANALYSIS METHODS ====================

  private async performAdvancedAnalysis(): Promise<void> {
    if (!this.codebaseIndex) return;

    // Perform all advanced analysis
    await this.detectArchitecturalPatterns();
    await this.detectDesignPatterns();
    await this.analyzeFunctionsAndClasses();
    await this.calculateCodeQuality();
    await this.buildCrossReferences();
  }

  private async detectArchitecturalPatterns(): Promise<void> {
    if (!this.codebaseIndex) return;

    const patterns: ArchitecturalPattern[] = [];

    // Detect MVC Pattern
    const mvcEvidence = this.detectMVCPattern();
    if (mvcEvidence.confidence > 0.5) {
      patterns.push({
        name: 'Model-View-Controller (MVC)',
        confidence: mvcEvidence.confidence,
        evidence: mvcEvidence.evidence,
        description: 'Separation of concerns with distinct Model, View, and Controller layers'
      });
    }

    // Detect Microservices Architecture
    const microservicesEvidence = this.detectMicroservicesPattern();
    if (microservicesEvidence.confidence > 0.4) {
      patterns.push({
        name: 'Microservices Architecture',
        confidence: microservicesEvidence.confidence,
        evidence: microservicesEvidence.evidence,
        description: 'Distributed architecture with independent, loosely-coupled services'
      });
    }

    // Detect Layered Architecture
    const layeredEvidence = this.detectLayeredArchitecture();
    if (layeredEvidence.confidence > 0.6) {
      patterns.push({
        name: 'Layered Architecture',
        confidence: layeredEvidence.confidence,
        evidence: layeredEvidence.evidence,
        description: 'Organized in horizontal layers (presentation, business, data access)'
      });
    }

    // Detect Component-Based Architecture
    const componentEvidence = this.detectComponentArchitecture();
    if (componentEvidence.confidence > 0.5) {
      patterns.push({
        name: 'Component-Based Architecture',
        confidence: componentEvidence.confidence,
        evidence: componentEvidence.evidence,
        description: 'Modular design with reusable, self-contained components'
      });
    }

    // Detect Event-Driven Architecture
    const eventEvidence = this.detectEventDrivenArchitecture();
    if (eventEvidence.confidence > 0.4) {
      patterns.push({
        name: 'Event-Driven Architecture',
        confidence: eventEvidence.confidence,
        evidence: eventEvidence.evidence,
        description: 'Communication through events and message passing'
      });
    }

    this.codebaseIndex.architecturalPatterns = patterns;
  }

  private detectMVCPattern(): { confidence: number; evidence: string[] } {
    const evidence: string[] = [];
    let score = 0;

    // Look for MVC directory structure
    const directories = this.getDirectoryNames();
    const mvcDirs = ['models', 'views', 'controllers', 'model', 'view', 'controller'];
    const foundMvcDirs = directories.filter(dir => 
      mvcDirs.some(mvc => dir.toLowerCase().includes(mvc))
    );

    if (foundMvcDirs.length >= 2) {
      score += 0.4;
      evidence.push(`MVC directory structure found: ${foundMvcDirs.join(', ')}`);
    }

    // Look for MVC file patterns
    const mvcFiles = this.codebaseIndex!.files.filter(file => 
      mvcDirs.some(mvc => file.path.toLowerCase().includes(mvc))
    );

    if (mvcFiles.length > 3) {
      score += 0.3;
      evidence.push(`${mvcFiles.length} files follow MVC naming conventions`);
    }

    // Look for MVC frameworks
    const frameworks = ['express', 'rails', 'django', 'spring', 'angular', 'vue', 'react'];
    const foundFrameworks = this.findFrameworkUsage(frameworks);
    if (foundFrameworks.length > 0) {
      score += 0.3;
      evidence.push(`MVC frameworks detected: ${foundFrameworks.join(', ')}`);
    }

    return { confidence: Math.min(score, 1.0), evidence };
  }

  private detectMicroservicesPattern(): { confidence: number; evidence: string[] } {
    const evidence: string[] = [];
    let score = 0;

    // Look for service-oriented directory structure
    const directories = this.getDirectoryNames();
    const serviceKeywords = ['service', 'api', 'gateway', 'auth', 'user', 'order', 'payment'];
    const serviceCount = directories.filter(dir => 
      serviceKeywords.some(keyword => dir.toLowerCase().includes(keyword))
    ).length;

    if (serviceCount >= 3) {
      score += 0.4;
      evidence.push(`${serviceCount} service-oriented directories found`);
    }

    // Look for containerization
    const containerFiles = this.codebaseIndex!.files.filter(file => 
      ['dockerfile', 'docker-compose', 'kubernetes', 'k8s'].some(tech => 
        file.path.toLowerCase().includes(tech)
      )
    );

    if (containerFiles.length > 0) {
      score += 0.3;
      evidence.push(`Containerization files found: ${containerFiles.length} files`);
    }

    // Look for API patterns
    const apiPatterns = this.findAPIPatterns();
    if (apiPatterns > 2) {
      score += 0.3;
      evidence.push(`Multiple API endpoints detected: ${apiPatterns} patterns`);
    }

    return { confidence: Math.min(score, 1.0), evidence };
  }

  private detectLayeredArchitecture(): { confidence: number; evidence: string[] } {
    const evidence: string[] = [];
    let score = 0;

    const layerKeywords = [
      'presentation', 'ui', 'frontend', 'view',
      'business', 'service', 'logic', 'domain',
      'data', 'repository', 'dao', 'persistence', 'database'
    ];

    const directories = this.getDirectoryNames();
    const foundLayers = layerKeywords.filter(layer => 
      directories.some(dir => dir.toLowerCase().includes(layer))
    );

    if (foundLayers.length >= 3) {
      score += 0.6;
      evidence.push(`Layered structure detected: ${foundLayers.join(', ')}`);
    }

    // Check for separation patterns
    const separationPatterns = this.findSeparationPatterns();
    if (separationPatterns > 0) {
      score += 0.4;
      evidence.push(`Clear separation of concerns found in ${separationPatterns} areas`);
    }

    return { confidence: Math.min(score, 1.0), evidence };
  }

  private detectComponentArchitecture(): { confidence: number; evidence: string[] } {
    const evidence: string[] = [];
    let score = 0;

    // Look for component patterns
    const componentFiles = this.codebaseIndex!.files.filter(file => 
      file.path.toLowerCase().includes('component') || file.extension === '.vue' || 
      file.extension === '.tsx' || file.extension === '.jsx'
    );

    if (componentFiles.length > 5) {
      score += 0.5;
      evidence.push(`${componentFiles.length} component files found`);
    }

    // Look for modular structure
    const modules = this.countModularStructure();
    if (modules > 3) {
      score += 0.3;
      evidence.push(`${modules} modular directories detected`);
    }

    // Check for component frameworks
    const componentFrameworks = ['react', 'vue', 'angular', 'svelte'];
    const foundFrameworks = this.findFrameworkUsage(componentFrameworks);
    if (foundFrameworks.length > 0) {
      score += 0.4;
      evidence.push(`Component frameworks: ${foundFrameworks.join(', ')}`);
    }

    return { confidence: Math.min(score, 1.0), evidence };
  }

  private detectEventDrivenArchitecture(): { confidence: number; evidence: string[] } {
    const evidence: string[] = [];
    let score = 0;

    // Look for event patterns in code
    const eventPatterns = this.findEventPatterns();
    if (eventPatterns > 3) {
      score += 0.4;
      evidence.push(`${eventPatterns} event handling patterns found`);
    }

    // Look for message queue technologies
    const messageQueues = ['kafka', 'rabbitmq', 'redis', 'eventbus', 'pubsub'];
    const foundQueues = this.findFrameworkUsage(messageQueues);
    if (foundQueues.length > 0) {
      score += 0.5;
      evidence.push(`Message queue technologies: ${foundQueues.join(', ')}`);
    }

    return { confidence: Math.min(score, 1.0), evidence };
  }

  private async detectDesignPatterns(): Promise<void> {
    if (!this.codebaseIndex) return;

    const patterns: DesignPattern[] = [];

    // Detect common design patterns
    patterns.push(...this.detectSingletonPattern());
    patterns.push(...this.detectFactoryPattern());
    patterns.push(...this.detectObserverPattern());
    patterns.push(...this.detectStrategyPattern());
    patterns.push(...this.detectDecoratorPattern());
    patterns.push(...this.detectRepositoryPattern());

    this.codebaseIndex.designPatterns = patterns;
  }

  private detectSingletonPattern(): DesignPattern[] {
    const patterns: DesignPattern[] = [];
    
    for (const file of this.codebaseIndex!.files) {
      const singletonPatterns = file.content.match(
        /class\s+\w+\s*{[\s\S]*?private\s+static\s+\w+[\s\S]*?getInstance\s*\(/gi
      );

      if (singletonPatterns) {
        patterns.push({
          name: 'Singleton Pattern',
          location: file.path,
          confidence: 0.8,
          description: 'Ensures a class has only one instance and provides global access'
        });
      }
    }

    return patterns;
  }

  private detectFactoryPattern(): DesignPattern[] {
    const patterns: DesignPattern[] = [];
    
    for (const file of this.codebaseIndex!.files) {
      const factoryPatterns = file.content.match(
        /(class\s+\w*Factory\w*|function\s+create\w+|\.create\s*\()/gi
      );

      if (factoryPatterns && factoryPatterns.length > 2) {
        patterns.push({
          name: 'Factory Pattern',
          location: file.path,
          confidence: 0.7,
          description: 'Creates objects without specifying exact classes'
        });
      }
    }

    return patterns;
  }

  private detectObserverPattern(): DesignPattern[] {
    const patterns: DesignPattern[] = [];
    
    for (const file of this.codebaseIndex!.files) {
      const observerPatterns = file.content.match(
        /(addEventListener|on\w+|subscribe|notify|observer)/gi
      );

      if (observerPatterns && observerPatterns.length > 3) {
        patterns.push({
          name: 'Observer Pattern',
          location: file.path,
          confidence: 0.6,
          description: 'Defines one-to-many dependency between objects'
        });
      }
    }

    return patterns;
  }

  private detectStrategyPattern(): DesignPattern[] {
    const patterns: DesignPattern[] = [];
    
    for (const file of this.codebaseIndex!.files) {
      const strategyPatterns = file.content.match(
        /(interface\s+\w*Strategy|class\s+\w*Strategy|strategy\s*:|setStrategy)/gi
      );

      if (strategyPatterns && strategyPatterns.length > 1) {
        patterns.push({
          name: 'Strategy Pattern',
          location: file.path,
          confidence: 0.7,
          description: 'Defines family of algorithms and makes them interchangeable'
        });
      }
    }

    return patterns;
  }

  private detectDecoratorPattern(): DesignPattern[] {
    const patterns: DesignPattern[] = [];
    
    for (const file of this.codebaseIndex!.files) {
      const decoratorPatterns = file.content.match(
        /(@\w+|decorator|wrapper|\.wrap\()/gi
      );

      if (decoratorPatterns && decoratorPatterns.length > 2) {
        patterns.push({
          name: 'Decorator Pattern',
          location: file.path,
          confidence: 0.6,
          description: 'Adds behavior to objects dynamically without altering structure'
        });
      }
    }

    return patterns;
  }

  private detectRepositoryPattern(): DesignPattern[] {
    const patterns: DesignPattern[] = [];
    
    for (const file of this.codebaseIndex!.files) {
      const repoPatterns = file.content.match(
        /(class\s+\w*Repository|interface\s+\w*Repository|\.findBy|\.save\(|\.delete\()/gi
      );

      if (repoPatterns && repoPatterns.length > 2) {
        patterns.push({
          name: 'Repository Pattern',
          location: file.path,
          confidence: 0.8,
          description: 'Encapsulates data access logic and provides centralized data access'
        });
      }
    }

    return patterns;
  }

  private async analyzeFunctionsAndClasses(): Promise<void> {
    if (!this.codebaseIndex) return;

    const functions: FunctionInfo[] = [];
    const classes: ClassInfo[] = [];

    for (const file of this.codebaseIndex.files) {
      // Extract functions
      const functionMatches = file.content.matchAll(
        /(?:function\s+(\w+)\s*\(([^)]*)\)|(\w+)\s*[:=]\s*(?:function\s*\(([^)]*)\)|(?:\([^)]*\)|\w+)\s*=>\s*))/gi
      );

      for (const match of functionMatches) {
        const functionName = match[1] || match[3];
        const parameters = (match[2] || match[4] || '').split(',').map(p => p.trim()).filter(p => p);
        
        if (functionName) {
          functions.push({
            name: functionName,
            location: file.path,
            complexity: this.calculateFunctionComplexity(file.content, functionName),
            parameters,
            returnType: this.extractReturnType(file.content, functionName)
          });
        }
      }

      // Extract classes
      const classMatches = file.content.matchAll(
        /class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?\s*{([^}]*)}/gi
      );

      for (const match of classMatches) {
        const className = match[1];
        const extendsClass = match[2];
        const implementsInterfaces = match[3] ? match[3].split(',').map(i => i.trim()) : [];
        const classBody = match[4];

        const methods = this.extractClassMethods(classBody);
        const properties = this.extractClassProperties(classBody);

        classes.push({
          name: className,
          location: file.path,
          methods,
          properties,
          extends: extendsClass,
          implements: implementsInterfaces
        });
      }
    }

    this.codebaseIndex.functions = functions;
    this.codebaseIndex.classes = classes;
  }

  private calculateCodeQuality(): void {
    if (!this.codebaseIndex) return;

    let totalComplexity = 0;
    const codeSmells: string[] = [];
    const recommendations: string[] = [];

    // Calculate overall complexity
    for (const func of this.codebaseIndex.functions) {
      totalComplexity += func.complexity;
    }

    const avgComplexity = this.codebaseIndex.functions.length > 0 
      ? totalComplexity / this.codebaseIndex.functions.length 
      : 0;

    // Detect code smells
    this.detectCodeSmells(codeSmells, recommendations);

    // Calculate maintainability score
    const maintainabilityScore = this.calculateMaintainabilityScore(avgComplexity, codeSmells.length);

    this.codebaseIndex.codeQuality = {
      complexity: avgComplexity,
      maintainabilityScore,
      codeSmells,
      recommendations
    };
  }

  private buildCrossReferences(): void {
    if (!this.codebaseIndex) return;

    const crossRefs: Record<string, string[]> = {};

    for (const file of this.codebaseIndex.files) {
      const imports = this.extractImports(file.content);
      const functionCalls = this.extractFunctionCalls(file.content);
      
      crossRefs[file.path] = [...imports, ...functionCalls];
    }

    this.codebaseIndex.crossReferences = crossRefs;
  }

  // ==================== ANALYSIS RESULT METHODS ====================

  private analyzeArchitecture(): string {
    if (!this.codebaseIndex || this.codebaseIndex.architecturalPatterns.length === 0) {
      return 'No architectural patterns detected. Run analyze operation first.';
    }

    const lines = ['🏗️ Architectural Analysis:', ''];

    for (const pattern of this.codebaseIndex.architecturalPatterns) {
      const confidence = (pattern.confidence * 100).toFixed(1);
      lines.push(`📐 ${pattern.name} (${confidence}% confidence)`);
      lines.push(`   ${pattern.description}`);
      lines.push('   Evidence:');
      pattern.evidence.forEach(evidence => lines.push(`   • ${evidence}`));
      lines.push('');
    }

    return lines.join('\n');
  }

  private analyzeDesignPatterns(): string {
    if (!this.codebaseIndex || this.codebaseIndex.designPatterns.length === 0) {
      return 'No design patterns detected. Run analyze operation first.';
    }

    const lines = ['🎨 Design Patterns Analysis:', ''];

    // Group patterns by type
    const patternGroups: Record<string, DesignPattern[]> = {};
    for (const pattern of this.codebaseIndex.designPatterns) {
      if (!patternGroups[pattern.name]) {
        patternGroups[pattern.name] = [];
      }
      patternGroups[pattern.name].push(pattern);
    }

    for (const [patternName, patterns] of Object.entries(patternGroups)) {
      lines.push(`🔧 ${patternName} (${patterns.length} instances)`);
      lines.push(`   ${patterns[0].description}`);
      lines.push('   Found in:');
      patterns.forEach(pattern => {
        const confidence = (pattern.confidence * 100).toFixed(1);
        lines.push(`   • ${pattern.location} (${confidence}% confidence)`);
      });
      lines.push('');
    }

    return lines.join('\n');
  }

  private analyzeCodeQuality(): string {
    if (!this.codebaseIndex) {
      return 'No codebase has been analyzed yet.';
    }

    const quality = this.codebaseIndex.codeQuality;
    const lines = [
      '📊 Code Quality Analysis:',
      '',
      `🧮 Average Complexity: ${quality.complexity.toFixed(2)}`,
      `🎯 Maintainability Score: ${quality.maintainabilityScore.toFixed(1)}/100`,
      ''
    ];

    if (quality.codeSmells.length > 0) {
      lines.push('⚠️ Code Smells Detected:');
      quality.codeSmells.forEach(smell => lines.push(`  • ${smell}`));
      lines.push('');
    }

    if (quality.recommendations.length > 0) {
      lines.push('💡 Recommendations:');
      quality.recommendations.forEach(rec => lines.push(`  • ${rec}`));
    }

    return lines.join('\n');
  }

  private analyzeComplexity(): string {
    if (!this.codebaseIndex || this.codebaseIndex.functions.length === 0) {
      return 'No functions analyzed yet. Run analyze operation first.';
    }

    const functions = this.codebaseIndex.functions;
    const sortedByComplexity = functions.sort((a, b) => b.complexity - a.complexity);

    const lines = [
      '🧮 Complexity Analysis:',
      '',
      `📊 Total Functions: ${functions.length}`,
      `📈 Average Complexity: ${(functions.reduce((sum, f) => sum + f.complexity, 0) / functions.length).toFixed(2)}`,
      ''
    ];

    lines.push('🔴 Most Complex Functions:');
    sortedByComplexity.slice(0, 10).forEach(func => {
      lines.push(`  • ${func.name} (${func.location}) - Complexity: ${func.complexity}`);
    });

    return lines.join('\n');
  }

  private analyzeFunctionality(): string {
    if (!this.codebaseIndex) {
      return 'No codebase has been analyzed yet.';
    }

    const lines = [
      '⚡ Functionality Analysis:',
      '',
      `📋 Functions: ${this.codebaseIndex.functions.length}`,
      `🏛️ Classes: ${this.codebaseIndex.classes.length}`,
      ''
    ];

    // Analyze function categories
    const functionCategories = this.categorizeFunctions();
    if (Object.keys(functionCategories).length > 0) {
      lines.push('🔍 Function Categories:');
      for (const [category, count] of Object.entries(functionCategories)) {
        lines.push(`  • ${category}: ${count} functions`);
      }
      lines.push('');
    }

    // Analyze class hierarchies
    const classHierarchies = this.analyzeClassHierarchies();
    if (classHierarchies.length > 0) {
      lines.push('🏗️ Class Hierarchies:');
      classHierarchies.forEach(hierarchy => lines.push(`  • ${hierarchy}`));
    }

    return lines.join('\n');
  }

  private analyzeCrossReferences(): string {
    if (!this.codebaseIndex || Object.keys(this.codebaseIndex.crossReferences).length === 0) {
      return 'No cross-references analyzed yet. Run analyze operation first.';
    }

    const lines = ['🔗 Cross-Reference Analysis:', ''];

    const sortedRefs = Object.entries(this.codebaseIndex.crossReferences)
      .sort(([,a], [,b]) => b.length - a.length);

    lines.push('📊 Files with Most Dependencies:');
    sortedRefs.slice(0, 10).forEach(([file, refs]) => {
      lines.push(`  • ${file}: ${refs.length} references`);
    });

    return lines.join('\n');
  }

  private generateCallGraph(): string {
    if (!this.codebaseIndex) {
      return 'No codebase has been analyzed yet.';
    }

    const lines = ['📈 Call Graph Analysis:', ''];

    // Simplified call graph based on cross-references
    const callGraph = this.buildSimpleCallGraph();
    
    lines.push('🔄 Function Call Relationships:');
    for (const [caller, callees] of Object.entries(callGraph)) {
      if (callees.length > 0) {
        lines.push(`  ${caller} →`);
        callees.slice(0, 5).forEach(callee => lines.push(`    • ${callee}`));
        if (callees.length > 5) {
          lines.push(`    ... and ${callees.length - 5} more`);
        }
      }
    }

    return lines.join('\n');
  }

  // ==================== HELPER METHODS ====================

  private getDirectoryNames(): string[] {
    if (!this.codebaseIndex) return [];
    
    const dirs = new Set<string>();
    for (const file of this.codebaseIndex.files) {
      const parts = file.path.split('/');
      for (let i = 0; i < parts.length - 1; i++) {
        dirs.add(parts[i]);
      }
    }
    return Array.from(dirs);
  }

  private findFrameworkUsage(frameworks: string[]): string[] {
    if (!this.codebaseIndex) return [];
    
    const found: string[] = [];
    for (const framework of frameworks) {
      const usage = this.codebaseIndex.files.some(file => 
        file.content.toLowerCase().includes(framework) ||
        file.path.toLowerCase().includes(framework)
      );
      if (usage) found.push(framework);
    }
    return found;
  }

  private findAPIPatterns(): number {
    if (!this.codebaseIndex) return 0;
    
    let count = 0;
    const apiPatterns = ['/api/', 'router', 'endpoint', 'app.get', 'app.post', '@RestController'];
    
    for (const file of this.codebaseIndex.files) {
      for (const pattern of apiPatterns) {
        if (file.content.includes(pattern)) {
          count++;
          break;
        }
      }
    }
    return count;
  }

  private findSeparationPatterns(): number {
    const separationKeywords = ['service', 'repository', 'controller', 'model', 'dao'];
    return this.getDirectoryNames().filter(dir => 
      separationKeywords.some(keyword => dir.toLowerCase().includes(keyword))
    ).length;
  }

  private countModularStructure(): number {
    const dirs = this.getDirectoryNames();
    return dirs.filter(dir => 
      !['src', 'lib', 'test', 'tests', 'node_modules'].includes(dir.toLowerCase())
    ).length;
  }

  private findEventPatterns(): number {
    if (!this.codebaseIndex) return 0;
    
    let count = 0;
    const eventKeywords = ['addEventListener', 'on(', 'emit', 'dispatch', 'subscribe', 'publish'];
    
    for (const file of this.codebaseIndex.files) {
      const matches = eventKeywords.filter(keyword => 
        file.content.includes(keyword)
      ).length;
      count += matches;
    }
    return count;
  }

  private calculateFunctionComplexity(content: string, functionName: string): number {
    // Simplified cyclomatic complexity calculation
    const functionRegex = new RegExp(`function\\s+${functionName}\\s*\\([^)]*\\)\\s*{([^}]*)}`, 'gs');
    const match = functionRegex.exec(content);
    
    if (!match) return 1;
    
    const functionBody = match[1];
    const complexityPatterns = [
      /if\s*\(/g, /else\s+if/g, /while\s*\(/g, /for\s*\(/g,
      /switch\s*\(/g, /case\s+/g, /catch\s*\(/g, /\&\&/g, /\|\|/g
    ];
    
    let complexity = 1; // Base complexity
    for (const pattern of complexityPatterns) {
      const matches = functionBody.match(pattern);
      if (matches) complexity += matches.length;
    }
    
    return complexity;
  }

  private extractReturnType(content: string, functionName: string): string | undefined {
    const typeMatch = content.match(new RegExp(`function\\s+${functionName}\\s*\\([^)]*\\)\\s*:\\s*(\\w+)`, 'i'));
    return typeMatch ? typeMatch[1] : undefined;
  }

  private extractClassMethods(classBody: string): string[] {
    const methodMatches = classBody.matchAll(/(?:public|private|protected)?\s*(\w+)\s*\(/g);
    return Array.from(methodMatches, match => match[1]);
  }

  private extractClassProperties(classBody: string): string[] {
    const propertyMatches = classBody.matchAll(/(?:public|private|protected)?\s*(\w+)\s*[:=]/g);
    return Array.from(propertyMatches, match => match[1]);
  }

  private detectCodeSmells(codeSmells: string[], recommendations: string[]): void {
    if (!this.codebaseIndex) return;

    // Long parameter lists
    const longParamFunctions = this.codebaseIndex.functions.filter(f => f.parameters.length > 5);
    if (longParamFunctions.length > 0) {
      codeSmells.push(`${longParamFunctions.length} functions with long parameter lists (>5 params)`);
      recommendations.push('Consider using parameter objects or configuration patterns');
    }

    // High complexity functions
    const complexFunctions = this.codebaseIndex.functions.filter(f => f.complexity > 10);
    if (complexFunctions.length > 0) {
      codeSmells.push(`${complexFunctions.length} functions with high complexity (>10)`);
      recommendations.push('Break down complex functions into smaller, focused functions');
    }

    // Large files
    const largeFiles = this.codebaseIndex.files.filter(f => f.lines > 500);
    if (largeFiles.length > 0) {
      codeSmells.push(`${largeFiles.length} files with more than 500 lines`);
      recommendations.push('Consider splitting large files into smaller modules');
    }

    // Duplicate code patterns
    const duplicates = this.findDuplicatePatterns();
    if (duplicates > 3) {
      codeSmells.push(`${duplicates} potential code duplication patterns found`);
      recommendations.push('Extract common functionality into reusable functions or modules');
    }
  }

  private calculateMaintainabilityScore(avgComplexity: number, codeSmellCount: number): number {
    let score = 100;
    score -= avgComplexity * 5; // Reduce by complexity
    score -= codeSmellCount * 10; // Reduce by code smells
    score += this.codebaseIndex!.designPatterns.length * 2; // Increase for good patterns
    return Math.max(0, Math.min(100, score));
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importMatches = content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
    const requireMatches = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    
    for (const match of importMatches) {
      imports.push(match[1]);
    }
    for (const match of requireMatches) {
      imports.push(match[1]);
    }
    
    return imports;
  }

  private extractFunctionCalls(content: string): string[] {
    const calls: string[] = [];
    const callMatches = content.matchAll(/(\w+)\s*\(/g);
    
    for (const match of callMatches) {
      if (!['if', 'for', 'while', 'switch', 'catch'].includes(match[1])) {
        calls.push(match[1]);
      }
    }
    
    return calls;
  }

  private categorizeFunctions(): Record<string, number> {
    const categories: Record<string, number> = {};
    
    for (const func of this.codebaseIndex!.functions) {
      const name = func.name.toLowerCase();
      let category = 'Other';
      
      if (name.includes('get') || name.includes('fetch') || name.includes('load')) {
        category = 'Data Retrieval';
      } else if (name.includes('set') || name.includes('save') || name.includes('update')) {
        category = 'Data Modification';
      } else if (name.includes('validate') || name.includes('check') || name.includes('verify')) {
        category = 'Validation';
      } else if (name.includes('render') || name.includes('display') || name.includes('show')) {
        category = 'UI/Rendering';
      } else if (name.includes('handle') || name.includes('process') || name.includes('execute')) {
        category = 'Event Handling';
      }
      
      categories[category] = (categories[category] || 0) + 1;
    }
    
    return categories;
  }

  private analyzeClassHierarchies(): string[] {
    const hierarchies: string[] = [];
    
    for (const cls of this.codebaseIndex!.classes) {
      if (cls.extends) {
        hierarchies.push(`${cls.name} extends ${cls.extends}`);
      }
      if (cls.implements && cls.implements.length > 0) {
        hierarchies.push(`${cls.name} implements ${cls.implements.join(', ')}`);
      }
    }
    
    return hierarchies;
  }

  private buildSimpleCallGraph(): Record<string, string[]> {
    const callGraph: Record<string, string[]> = {};
    
    for (const func of this.codebaseIndex!.functions) {
      const calls = this.codebaseIndex!.crossReferences[func.location] || [];
      callGraph[func.name] = calls.filter(call => 
        this.codebaseIndex!.functions.some(f => f.name === call)
      );
    }
    
    return callGraph;
  }

  private findDuplicatePatterns(): number {
    // Simplified duplicate detection
    const codeLines = new Set<string>();
    let duplicates = 0;
    
    for (const file of this.codebaseIndex!.files) {
      const lines = file.content.split('\n').map(line => line.trim()).filter(line => line.length > 10);
      
      for (const line of lines) {
        if (codeLines.has(line)) {
          duplicates++;
        } else {
          codeLines.add(line);
        }
      }
    }
    
    return duplicates;
  }
}