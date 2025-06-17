import { Tool, StringToolOutput, ToolEmitter, ToolInput, BaseToolOptions, BaseToolRunOptions } from 'beeai-framework/tools/base';
import { z } from 'zod';
import { Emitter } from 'beeai-framework/emitter/emitter';
import * as fs from 'fs';
import * as path from 'path';
import { parse as babelParse } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { ChromaClient, Collection } from 'chromadb';
import { openai } from '@ai-sdk/openai';
import { generateObject, generateText } from 'ai';

interface ASTCodebaseAnalyzerOptions extends BaseToolOptions {}

interface ASTNode {
  type: string;
  name?: string;
  content: string;
  location: {
    file: string;
    start: number;
    end: number;
    line: number;
  };
  metadata: {
    complexity?: number;
    dependencies?: string[];
    parameters?: string[];
    returnType?: string;
    scope?: string;
    category?: string;
  };
}

interface CodeChunk {
  id: string;
  content: string;
  type: 'function' | 'class' | 'interface' | 'import' | 'comment' | 'variable';
  name: string;
  file: string;
  line: number;
  context: string;
  dependencies: string[];
  embedding?: number[];
}

interface SemanticSearchResult {
  chunk: CodeChunk;
  similarity: number;
  context: string;
}

interface VectorDatabase {
  collection: Collection;
  isInitialized: boolean;
}

export class ASTCodebaseAnalyzer extends Tool<StringToolOutput, ASTCodebaseAnalyzerOptions> {
  name = 'ast-codebase-analyzer';
  description = 'Advanced AST-based codebase analysis with semantic search using vector embeddings and ChromaDB';
  
  readonly emitter: ToolEmitter<ToolInput<this>, StringToolOutput>;
  private chromaClient: ChromaClient | null = null;
  private vectorDB: VectorDatabase | null = null;
  private astNodes: ASTNode[] = [];
  private codeChunks: CodeChunk[] = [];
  private currentPath: string | null = null;

  constructor(options?: ASTCodebaseAnalyzerOptions) {
    super(options);
    this.emitter = new Emitter();
  }

  inputSchema() {
    return z.object({
      operation: z.enum([
        'analyze_ast', 'semantic_search', 'explain_semantic', 'find_similar', 
        'extract_patterns', 'dependency_graph', 'code_embeddings', 'intelligent_query'
      ]).describe('The AST-based analysis operation to perform'),
      path: z.string().optional().describe('Path to the codebase directory'),
      query: z.string().optional().describe('Semantic search query or question'),
      similarity_threshold: z.number().optional().describe('Similarity threshold for search (0.0-1.0)'),
      max_results: z.number().optional().describe('Maximum number of results to return'),
      code_type: z.enum(['function', 'class', 'interface', 'all']).optional().describe('Type of code to search'),
      include_context: z.boolean().optional().describe('Include surrounding context in results')
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
      similarity_threshold = 0.7,
      max_results = 10,
      code_type = 'all',
      include_context = true
    } = input;

    try {
      // Initialize ChromaDB if needed
      if (!this.chromaClient) {
        await this.initializeVectorDatabase();
      }

      // Analyze codebase if path is provided
      if (targetPath && (operation === 'analyze_ast' || this.currentPath !== targetPath)) {
        await this.analyzeCodebaseAST(targetPath);
      }

      switch (operation) {
        case 'analyze_ast':
          if (!targetPath) {
            return new StringToolOutput('Error: Path is required for AST analysis');
          }
          return new StringToolOutput(await this.formatASTAnalysisResult());

        case 'semantic_search':
          if (!query) {
            return new StringToolOutput('Error: Query is required for semantic search');
          }
          return new StringToolOutput(await this.performSemanticSearch(
            query, similarity_threshold, max_results, code_type
          ));

        case 'explain_semantic':
          if (!query) {
            return new StringToolOutput('Error: Question is required for semantic explanation');
          }
          return new StringToolOutput(await this.explainCodeSemantically(query, include_context));

        case 'find_similar':
          if (!query) {
            return new StringToolOutput('Error: Code snippet is required to find similar code');
          }
          return new StringToolOutput(await this.findSimilarCode(query, similarity_threshold, max_results));

        case 'extract_patterns':
          return new StringToolOutput(await this.extractCodePatterns());

        case 'dependency_graph':
          return new StringToolOutput(await this.generateDependencyGraph());

        case 'code_embeddings':
          return new StringToolOutput(await this.analyzeCodeEmbeddings());

        case 'intelligent_query':
          if (!query) {
            return new StringToolOutput('Error: Query is required for intelligent analysis');
          }
          return new StringToolOutput(await this.intelligentCodeQuery(query));

        default:
          return new StringToolOutput(`Error: Unknown operation: ${operation}`);
      }
    } catch (error) {
      throw this.toError(error as Error, { input, options });
    }
  }

  private async initializeVectorDatabase(): Promise<void> {
    try {
      this.chromaClient = new ChromaClient({
        path: "http://localhost:8000" // Default ChromaDB server
      });

      // Create or get collection for code embeddings
      const collection = await this.chromaClient.getOrCreateCollection({
        name: "codebase_embeddings",
        metadata: { "hnsw:space": "cosine" }
      });

      this.vectorDB = {
        collection,
        isInitialized: true
      };

    } catch (error) {
      console.warn('ChromaDB not available, falling back to in-memory search');
      this.vectorDB = {
        collection: null as any,
        isInitialized: false
      };
    }
  }

  private async analyzeCodebaseAST(targetPath: string): Promise<void> {
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Path does not exist: ${targetPath}`);
    }

    const stats = fs.statSync(targetPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${targetPath}`);
    }

    this.currentPath = targetPath;
    this.astNodes = [];
    this.codeChunks = [];

    await this.parseDirectoryAST(targetPath);
    await this.generateEmbeddings();
    await this.storeInVectorDatabase();
  }

  private async parseDirectoryAST(dirPath: string, depth: number = 0): Promise<void> {
    if (depth > 10) return; // Prevent infinite recursion

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];
        if (skipDirs.includes(entry.name)) continue;
        
        await this.parseDirectoryAST(fullPath, depth + 1);
      } else if (entry.isFile()) {
        await this.parseFileAST(fullPath);
      }
    }
  }

  private async parseFileAST(filePath: string): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    const supportedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.mjs'];
    
    if (!supportedExtensions.includes(ext)) return;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.length > 100000) return; // Skip very large files

      const relativePath = path.relative(this.currentPath!, filePath);
      
      // Use Babel parser for all files (supports TypeScript)
      await this.parseJavaScriptAST(content, relativePath);
    } catch (error) {
      console.warn(`Failed to parse ${filePath}:`, (error as Error).message);
    }
  }


  private async parseJavaScriptAST(content: string, filePath: string): Promise<void> {
    try {
      const ast = babelParse(content, {
        sourceType: 'module',
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins: [
          'jsx',
          'typescript',
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'functionBind',
          'exportDefaultFrom',
          'exportNamespaceFrom',
          'dynamicImport',
          'nullishCoalescingOperator',
          'optionalChaining'
        ]
      });

      this.extractASTNodes(ast, content, filePath, 'babel');
    } catch (error) {
      console.warn(`Failed to parse ${filePath} with Babel:`, (error as Error).message);
    }
  }

  private extractASTNodes(ast: any, content: string, filePath: string, parser: string): void {
    const lines = content.split('\n');
    
    traverse(ast, {
      // Function Declarations
      FunctionDeclaration: (path: NodePath) => {
        const node = path.node as any;
        if (node.id?.name) {
          this.addASTNode({
            type: 'function',
            name: node.id.name,
            content: this.extractNodeContent(content, node),
            location: {
              file: filePath,
              start: node.start || 0,
              end: node.end || 0,
              line: node.loc?.start?.line || 1
            },
            metadata: {
              parameters: node.params?.map((p: any) => p.name || 'unknown') || [],
              complexity: this.calculateASTComplexity(path),
              scope: this.determineScope(path),
              category: 'declaration'
            }
          });

          this.addCodeChunk({
            type: 'function',
            name: node.id.name,
            content: this.extractNodeContent(content, node),
            file: filePath,
            line: node.loc?.start?.line || 1,
            context: this.extractContext(lines, node.loc?.start?.line || 1),
            dependencies: this.extractDependencies(path)
          });
        }
      },

      // Arrow Functions
      ArrowFunctionExpression: (path: NodePath) => {
        const node = path.node as any;
        const parent = path.parent as any;
        
        let name = 'anonymous';
        if (parent.type === 'VariableDeclarator' && parent.id?.name) {
          name = parent.id.name;
        } else if (parent.type === 'AssignmentExpression' && parent.left?.name) {
          name = parent.left.name;
        }

        this.addASTNode({
          type: 'arrow_function',
          name,
          content: this.extractNodeContent(content, node),
          location: {
            file: filePath,
            start: node.start || 0,
            end: node.end || 0,
            line: node.loc?.start?.line || 1
          },
          metadata: {
            parameters: node.params?.map((p: any) => p.name || 'unknown') || [],
            complexity: this.calculateASTComplexity(path),
            scope: this.determineScope(path),
            category: 'expression'
          }
        });

        this.addCodeChunk({
          type: 'function',
          name,
          content: this.extractNodeContent(content, node),
          file: filePath,
          line: node.loc?.start?.line || 1,
          context: this.extractContext(lines, node.loc?.start?.line || 1),
          dependencies: this.extractDependencies(path)
        });
      },

      // Class Declarations
      ClassDeclaration: (path: NodePath) => {
        const node = path.node as any;
        if (node.id?.name) {
          this.addASTNode({
            type: 'class',
            name: node.id.name,
            content: this.extractNodeContent(content, node),
            location: {
              file: filePath,
              start: node.start || 0,
              end: node.end || 0,
              line: node.loc?.start?.line || 1
            },
            metadata: {
              scope: this.determineScope(path),
              category: 'declaration'
            }
          });

          this.addCodeChunk({
            type: 'class',
            name: node.id.name,
            content: this.extractNodeContent(content, node),
            file: filePath,
            line: node.loc?.start?.line || 1,
            context: this.extractContext(lines, node.loc?.start?.line || 1),
            dependencies: this.extractDependencies(path)
          });
        }
      },

      // Interface Declarations (TypeScript)
      TSInterfaceDeclaration: (path: NodePath) => {
        const node = path.node as any;
        if (node.id?.name) {
          this.addASTNode({
            type: 'interface',
            name: node.id.name,
            content: this.extractNodeContent(content, node),
            location: {
              file: filePath,
              start: node.start || 0,
              end: node.end || 0,
              line: node.loc?.start?.line || 1
            },
            metadata: {
              scope: this.determineScope(path),
              category: 'type_definition'
            }
          });

          this.addCodeChunk({
            type: 'interface',
            name: node.id.name,
            content: this.extractNodeContent(content, node),
            file: filePath,
            line: node.loc?.start?.line || 1,
            context: this.extractContext(lines, node.loc?.start?.line || 1),
            dependencies: this.extractDependencies(path)
          });
        }
      },

      // Import Declarations
      ImportDeclaration: (path: NodePath) => {
        const node = path.node as any;
        const importSource = node.source?.value || 'unknown';
        
        this.addASTNode({
          type: 'import',
          name: importSource,
          content: this.extractNodeContent(content, node),
          location: {
            file: filePath,
            start: node.start || 0,
            end: node.end || 0,
            line: node.loc?.start?.line || 1
          },
          metadata: {
            dependencies: [importSource],
            scope: 'module',
            category: 'import'
          }
        });

        this.addCodeChunk({
          type: 'import',
          name: importSource,
          content: this.extractNodeContent(content, node),
          file: filePath,
          line: node.loc?.start?.line || 1,
          context: this.extractContext(lines, node.loc?.start?.line || 1),
          dependencies: [importSource]
        });
      },

      // Variable Declarations
      VariableDeclaration: (path: NodePath) => {
        const node = path.node as any;
        for (const declarator of node.declarations || []) {
          if (declarator.id?.name) {
            this.addASTNode({
              type: 'variable',
              name: declarator.id.name,
              content: this.extractNodeContent(content, node),
              location: {
                file: filePath,
                start: node.start || 0,
                end: node.end || 0,
                line: node.loc?.start?.line || 1
              },
              metadata: {
                scope: this.determineScope(path),
                category: 'declaration'
              }
            });

            this.addCodeChunk({
              type: 'variable',
              name: declarator.id.name,
              content: this.extractNodeContent(content, node),
              file: filePath,
              line: node.loc?.start?.line || 1,
              context: this.extractContext(lines, node.loc?.start?.line || 1),
              dependencies: this.extractDependencies(path)
            });
          }
        }
      }
    });
  }

  private addASTNode(node: ASTNode): void {
    this.astNodes.push(node);
  }

  private addCodeChunk(chunk: Omit<CodeChunk, 'id'>): void {
    const id = `${chunk.file}:${chunk.line}:${chunk.name}`;
    this.codeChunks.push({
      id,
      ...chunk
    });
  }

  private extractNodeContent(content: string, node: any): string {
    if (node.start !== undefined && node.end !== undefined) {
      return content.slice(node.start, node.end);
    }
    return '';
  }

  private extractContext(lines: string[], lineNumber: number, contextLines: number = 3): string {
    const start = Math.max(0, lineNumber - contextLines - 1);
    const end = Math.min(lines.length, lineNumber + contextLines);
    return lines.slice(start, end).join('\n');
  }

  private extractDependencies(path: NodePath): string[] {
    const dependencies: string[] = [];
    
    // Extract function calls and identifiers
    path.traverse({
      CallExpression: (callPath: NodePath) => {
        const node = callPath.node as any;
        if (node.callee?.name) {
          dependencies.push(node.callee.name);
        } else if (node.callee?.property?.name) {
          dependencies.push(node.callee.property.name);
        }
      },
      Identifier: (idPath: NodePath) => {
        const node = idPath.node as any;
        if (node.name && !idPath.isBindingIdentifier()) {
          dependencies.push(node.name);
        }
      }
    });

    return [...new Set(dependencies)];
  }

  private calculateASTComplexity(path: NodePath): number {
    let complexity = 1;
    
    path.traverse({
      IfStatement: () => complexity++,
      WhileStatement: () => complexity++,
      ForStatement: () => complexity++,
      SwitchCase: () => complexity++,
      CatchClause: () => complexity++,
      ConditionalExpression: () => complexity++,
      LogicalExpression: (logPath: NodePath) => {
        const node = logPath.node as any;
        if (node.operator === '&&' || node.operator === '||') {
          complexity++;
        }
      }
    });

    return complexity;
  }

  private determineScope(path: NodePath): string {
    if (path.isProgram()) return 'global';
    if (path.isFunctionDeclaration() || path.isArrowFunctionExpression()) return 'function';
    if (path.isClassDeclaration()) return 'class';
    if (path.isBlockStatement()) return 'block';
    return 'local';
  }

  private async generateEmbeddings(): Promise<void> {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OpenAI API key not found, skipping embedding generation');
      return;
    }

    for (const chunk of this.codeChunks) {
      try {
        // Create a rich context for embedding
        const embeddingText = this.createEmbeddingText(chunk);
        
        // Generate embedding using OpenAI
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: embeddingText
          })
        });

        if (response.ok) {
          const data = await response.json() as any;
          chunk.embedding = data.data[0].embedding;
        }
      } catch (error) {
        console.warn(`Failed to generate embedding for ${chunk.id}:`, (error as Error).message);
      }
    }
  }

  private createEmbeddingText(chunk: CodeChunk): string {
    return [
      `Type: ${chunk.type}`,
      `Name: ${chunk.name}`,
      `File: ${chunk.file}`,
      `Content: ${chunk.content}`,
      `Context: ${chunk.context}`,
      `Dependencies: ${chunk.dependencies.join(', ')}`
    ].join('\n');
  }

  private async storeInVectorDatabase(): Promise<void> {
    if (!this.vectorDB?.isInitialized || !this.vectorDB.collection) {
      return;
    }

    try {
      const embeddings = this.codeChunks
        .filter(chunk => chunk.embedding)
        .map(chunk => chunk.embedding!);
      
      const metadatas = this.codeChunks
        .filter(chunk => chunk.embedding)
        .map(chunk => ({
          type: chunk.type,
          name: chunk.name,
          file: chunk.file,
          line: chunk.line,
          dependencies: JSON.stringify(chunk.dependencies)
        }));

      const documents = this.codeChunks
        .filter(chunk => chunk.embedding)
        .map(chunk => this.createEmbeddingText(chunk));

      const ids = this.codeChunks
        .filter(chunk => chunk.embedding)
        .map(chunk => chunk.id);

      if (embeddings.length > 0) {
        await this.vectorDB.collection.add({
          ids,
          embeddings,
          metadatas,
          documents
        });
      }
    } catch (error) {
      console.warn('Failed to store embeddings in ChromaDB:', (error as Error).message);
    }
  }

  private async performSemanticSearch(
    query: string, 
    threshold: number, 
    maxResults: number, 
    codeType: string
  ): Promise<string> {
    if (!this.vectorDB?.isInitialized) {
      return this.performInMemorySearch(query, threshold, maxResults, codeType);
    }

    try {
      // Generate query embedding
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: query
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate query embedding');
      }

      const data = await response.json() as any;
      const queryEmbedding = data.data[0].embedding;

      // Search in ChromaDB
      const results = await this.vectorDB.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: maxResults,
        where: codeType !== 'all' ? { type: codeType } : undefined
      });

      return this.formatSearchResults(results, threshold);
    } catch (error) {
      return this.performInMemorySearch(query, threshold, maxResults, codeType);
    }
  }

  private performInMemorySearch(
    query: string, 
    threshold: number, 
    maxResults: number, 
    codeType: string
  ): string {
    const queryLower = query.toLowerCase();
    const filtered = this.codeChunks.filter(chunk => {
      const typeMatch = codeType === 'all' || chunk.type === codeType;
      const contentMatch = chunk.content.toLowerCase().includes(queryLower) ||
                          chunk.name.toLowerCase().includes(queryLower) ||
                          chunk.context.toLowerCase().includes(queryLower);
      return typeMatch && contentMatch;
    });

    const results = filtered
      .slice(0, maxResults)
      .map(chunk => ({
        chunk,
        similarity: this.calculateTextSimilarity(query, chunk),
        context: chunk.context
      }));

    return this.formatInMemorySearchResults(results, threshold);
  }

  private calculateTextSimilarity(query: string, chunk: CodeChunk): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const chunkText = `${chunk.name} ${chunk.content} ${chunk.context}`.toLowerCase();
    const matches = queryWords.filter(word => chunkText.includes(word)).length;
    return matches / queryWords.length;
  }

  private formatSearchResults(results: any, threshold: number): string {
    const lines = ['🔍 Semantic Search Results:', ''];
    
    for (let i = 0; i < results.documents[0].length; i++) {
      const distance = results.distances[0][i];
      const similarity = 1 - distance;
      
      if (similarity >= threshold) {
        const metadata = results.metadatas[0][i];
        lines.push(`📄 ${metadata.name} (${metadata.type})`);
        lines.push(`   File: ${metadata.file}:${metadata.line}`);
        lines.push(`   Similarity: ${(similarity * 100).toFixed(1)}%`);
        lines.push(`   Content: ${results.documents[0][i].slice(0, 200)}...`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private formatInMemorySearchResults(results: SemanticSearchResult[], threshold: number): string {
    const lines = ['🔍 In-Memory Search Results:', ''];
    
    for (const result of results) {
      if (result.similarity >= threshold) {
        lines.push(`📄 ${result.chunk.name} (${result.chunk.type})`);
        lines.push(`   File: ${result.chunk.file}:${result.chunk.line}`);
        lines.push(`   Similarity: ${(result.similarity * 100).toFixed(1)}%`);
        lines.push(`   Content: ${result.chunk.content.slice(0, 200)}...`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private async explainCodeSemantically(query: string, includeContext: boolean): Promise<string> {
    // Perform semantic search first
    const searchResults = await this.performSemanticSearch(query, 0.6, 5, 'all');
    
    if (!process.env.OPENAI_API_KEY) {
      return `${searchResults}\n\n💡 For detailed explanations, set up OpenAI API key.`;
    }

    try {
      // Use AI to generate explanation
      const { text } = await generateText({
        model: openai('gpt-4'),
        prompt: `Based on the following code search results, provide a detailed explanation for the query: "${query}"

Search Results:
${searchResults}

Please provide:
1. A clear explanation of what the code does
2. How it relates to the user's query
3. Key technical details and patterns
4. Suggestions for usage or improvement

Keep the explanation technical but accessible.`
      });

      return text;
    } catch (error) {
      return `${searchResults}\n\n⚠️ AI explanation failed: ${(error as Error).message}`;
    }
  }

  private async findSimilarCode(codeSnippet: string, threshold: number, maxResults: number): Promise<string> {
    // Similar to semantic search but specifically for code similarity
    return await this.performSemanticSearch(codeSnippet, threshold, maxResults, 'all');
  }

  private async extractCodePatterns(): Promise<string> {
    const patterns = {
      functions: this.astNodes.filter(node => node.type === 'function').length,
      classes: this.astNodes.filter(node => node.type === 'class').length,
      interfaces: this.astNodes.filter(node => node.type === 'interface').length,
      imports: this.astNodes.filter(node => node.type === 'import').length,
      highComplexity: this.astNodes.filter(node => (node.metadata.complexity || 0) > 10).length
    };

    const lines = [
      '🔍 AST Code Patterns Analysis:',
      '',
      `📊 Code Structure:`,
      `  • Functions: ${patterns.functions}`,
      `  • Classes: ${patterns.classes}`,
      `  • Interfaces: ${patterns.interfaces}`,
      `  • Imports: ${patterns.imports}`,
      `  • High Complexity Functions: ${patterns.highComplexity}`,
      ''
    ];

    // Add complexity distribution
    const complexityDistribution = this.getComplexityDistribution();
    lines.push('📈 Complexity Distribution:');
    for (const [range, count] of Object.entries(complexityDistribution)) {
      lines.push(`  • ${range}: ${count} functions`);
    }

    return lines.join('\n');
  }

  private getComplexityDistribution(): Record<string, number> {
    const distribution = {
      'Low (1-3)': 0,
      'Medium (4-7)': 0,
      'High (8-15)': 0,
      'Very High (15+)': 0
    };

    for (const node of this.astNodes) {
      const complexity = node.metadata.complexity || 1;
      if (complexity <= 3) distribution['Low (1-3)']++;
      else if (complexity <= 7) distribution['Medium (4-7)']++;
      else if (complexity <= 15) distribution['High (8-15)']++;
      else distribution['Very High (15+)']++;
    }

    return distribution;
  }

  private async generateDependencyGraph(): Promise<string> {
    const dependencyMap = new Map<string, Set<string>>();
    
    for (const node of this.astNodes) {
      const deps = node.metadata.dependencies || [];
      dependencyMap.set(node.name || 'unknown', new Set(deps));
    }

    const lines = ['🕸️ Dependency Graph:', ''];
    
    for (const [name, deps] of dependencyMap) {
      if (deps.size > 0) {
        lines.push(`📦 ${name}:`);
        for (const dep of Array.from(deps).slice(0, 10)) {
          lines.push(`  ├─ ${dep}`);
        }
        if (deps.size > 10) {
          lines.push(`  └─ ... and ${deps.size - 10} more`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private async analyzeCodeEmbeddings(): Promise<string> {
    const embeddedChunks = this.codeChunks.filter(chunk => chunk.embedding);
    
    const lines = [
      '🧮 Code Embeddings Analysis:',
      '',
      `📊 Embedding Statistics:`,
      `  • Total Code Chunks: ${this.codeChunks.length}`,
      `  • Embedded Chunks: ${embeddedChunks.length}`,
      `  • Embedding Coverage: ${((embeddedChunks.length / this.codeChunks.length) * 100).toFixed(1)}%`,
      ''
    ];

    // Type distribution
    const typeDistribution: Record<string, number> = {};
    for (const chunk of embeddedChunks) {
      typeDistribution[chunk.type] = (typeDistribution[chunk.type] || 0) + 1;
    }

    lines.push('📈 Embedded Code Types:');
    for (const [type, count] of Object.entries(typeDistribution)) {
      lines.push(`  • ${type}: ${count} chunks`);
    }

    return lines.join('\n');
  }

  private async intelligentCodeQuery(query: string): Promise<string> {
    // Combine semantic search with AI-powered analysis
    const searchResults = await this.performSemanticSearch(query, 0.5, 10, 'all');
    const patterns = await this.extractCodePatterns();
    
    if (!process.env.OPENAI_API_KEY) {
      return `${searchResults}\n\n${patterns}\n\n💡 For AI-powered analysis, set up OpenAI API key.`;
    }

    try {
      const { text } = await generateText({
        model: openai('gpt-4'),
        prompt: `You are an expert code analyst. Based on the following AST analysis and search results, provide an intelligent answer to the query: "${query}"

Search Results:
${searchResults}

Code Patterns:
${patterns}

AST Nodes Available: ${this.astNodes.length}
Code Chunks Available: ${this.codeChunks.length}

Please provide:
1. Direct answer to the query
2. Relevant code examples from the search results
3. Architectural insights
4. Best practices recommendations
5. Potential improvements

Be specific and technical, referencing actual code from the results.`
      });

      return text;
    } catch (error) {
      return `${searchResults}\n\n${patterns}\n\n⚠️ AI analysis failed: ${(error as Error).message}`;
    }
  }

  private async formatASTAnalysisResult(): Promise<string> {
    const lines = [
      '🌳 AST-Based Codebase Analysis Complete',
      '',
      `📍 Path: ${this.currentPath}`,
      `🔍 AST Nodes Extracted: ${this.astNodes.length}`,
      `📦 Code Chunks Created: ${this.codeChunks.length}`,
      `🧮 Embeddings Generated: ${this.codeChunks.filter(c => c.embedding).length}`,
      `💾 Vector DB Status: ${this.vectorDB?.isInitialized ? 'Connected' : 'In-Memory Mode'}`,
      ''
    ];

    // Node type distribution
    const nodeTypes: Record<string, number> = {};
    for (const node of this.astNodes) {
      nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
    }

    lines.push('📊 AST Node Distribution:');
    for (const [type, count] of Object.entries(nodeTypes)) {
      lines.push(`  • ${type}: ${count} nodes`);
    }

    lines.push('', '🚀 Available Operations:');
    lines.push('  • semantic_search - Find code by semantic meaning');
    lines.push('  • explain_semantic - Get AI-powered code explanations');
    lines.push('  • find_similar - Find similar code patterns');
    lines.push('  • extract_patterns - Analyze code patterns and complexity');
    lines.push('  • dependency_graph - Visualize code dependencies');
    lines.push('  • intelligent_query - AI-powered code analysis');

    return lines.join('\n');
  }
}