# AST-Based Codebase Analyzer with Vector Embeddings

## Overview

The AST-based Codebase Analyzer is an advanced code understanding system that combines Abstract Syntax Tree (AST) parsing with semantic vector embeddings and ChromaDB storage. This creates an intelligent code analysis platform capable of semantic search, similarity detection, and AI-powered code explanations.

## Architecture

```
AST Codebase Analyzer
├── AST Parsing Engine (Babel + TypeScript Support)
├── Semantic Embedding Generator (OpenAI Embeddings)
├── Vector Database (ChromaDB)
├── Intelligent Retrieval System
└── AI-Powered Code Explanation (GPT-4)
```

## Core Technologies

### 1. **AST Parsing**
- **Babel Parser** - Primary parser supporting JavaScript, TypeScript, JSX, TSX
- **TypeScript-ESLint Parser** - Fallback for complex TypeScript syntax
- **Multi-language Support** - Handles modern JavaScript features and TypeScript

### 2. **Vector Embeddings**
- **OpenAI text-embedding-3-small** - Generates semantic embeddings for code chunks
- **Rich Context Encoding** - Includes code content, type, dependencies, and surrounding context
- **Semantic Understanding** - Enables similarity search based on meaning, not just text matching

### 3. **Vector Database**
- **ChromaDB Integration** - Persistent vector storage with cosine similarity search
- **Fallback Mode** - In-memory search when ChromaDB is unavailable
- **Efficient Indexing** - Optimized for fast semantic search and retrieval

## Implementation Details

### AST Node Extraction

The analyzer extracts multiple types of AST nodes:

```typescript
interface ASTNode {
  type: string;              // 'function', 'class', 'interface', etc.
  name?: string;             // Identifier name
  content: string;           // Source code content
  location: {
    file: string;            // Relative file path
    start: number;           // Character start position
    end: number;             // Character end position
    line: number;            // Line number
  };
  metadata: {
    complexity?: number;     // Cyclomatic complexity
    dependencies?: string[]; // Function/variable dependencies
    parameters?: string[];   // Function parameters
    returnType?: string;     // Return type (if available)
    scope?: string;          // Scope level
    category?: string;       // Code category
  };
}
```

### Supported AST Node Types

1. **Function Declarations** - Regular function declarations
2. **Arrow Functions** - ES6 arrow function expressions
3. **Class Declarations** - Class definitions with methods and properties
4. **Interface Declarations** - TypeScript interfaces
5. **Import Declarations** - Module imports and dependencies
6. **Variable Declarations** - Variable and constant declarations

### Code Chunk Structure

Each piece of code is converted into a semantic chunk:

```typescript
interface CodeChunk {
  id: string;                // Unique identifier
  content: string;           // Source code
  type: 'function' | 'class' | 'interface' | 'import' | 'variable';
  name: string;              // Code element name
  file: string;              // Source file path
  line: number;              // Line number
  context: string;           // Surrounding code context
  dependencies: string[];    // Dependencies and references
  embedding?: number[];      // Semantic vector embedding
}
```

### Complexity Analysis

The analyzer calculates cyclomatic complexity for functions:

```typescript
private calculateASTComplexity(path: NodePath): number {
  let complexity = 1; // Base complexity
  
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
```

## Operations & API

### Core Operations

| Operation | Description | Input | Output |
|-----------|-------------|-------|--------|
| `analyze_ast` | Parse codebase and generate embeddings | `path` | Analysis summary |
| `semantic_search` | Search code by semantic meaning | `query`, `threshold`, `max_results` | Relevant code chunks |
| `explain_semantic` | AI-powered code explanations | `query`, `include_context` | Detailed explanation |
| `find_similar` | Find similar code patterns | `code_snippet`, `threshold` | Similar code matches |
| `extract_patterns` | Analyze AST patterns and complexity | - | Pattern analysis |
| `dependency_graph` | Generate dependency relationships | - | Dependency visualization |
| `code_embeddings` | Analyze embedding statistics | - | Embedding insights |
| `intelligent_query` | AI-powered code analysis | `query` | Comprehensive analysis |

### Advanced Parameters

```typescript
interface SearchParameters {
  similarity_threshold: number;    // 0.0-1.0 similarity threshold
  max_results: number;            // Maximum results to return
  code_type: 'function' | 'class' | 'interface' | 'all';
  include_context: boolean;       // Include surrounding code context
}
```

## Semantic Search Engine

### Embedding Generation Process

1. **Context Creation** - Combines code content, type, file path, and dependencies
2. **OpenAI API Call** - Generates 1536-dimensional embedding vector
3. **Storage** - Stores in ChromaDB with metadata for efficient retrieval

```typescript
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
```

### Search Process

1. **Query Embedding** - Generate embedding for user query
2. **Vector Search** - ChromaDB cosine similarity search
3. **Filtering** - Apply similarity threshold and type filters
4. **Ranking** - Sort by relevance and return top results

### Fallback Mechanisms

- **In-Memory Search** - When ChromaDB is unavailable
- **Text-Based Matching** - Fallback to keyword matching
- **Error Resilience** - Graceful degradation with informative messages

## AI-Powered Analysis

### Intelligent Code Explanation

The system uses GPT-4 to provide detailed code explanations:

```typescript
private async explainCodeSemantically(query: string): Promise<string> {
  // 1. Perform semantic search for relevant code
  const searchResults = await this.performSemanticSearch(query, 0.6, 5, 'all');
  
  // 2. Use AI to generate comprehensive explanation
  const { text } = await generateText({
    model: openai('gpt-4'),
    prompt: `Based on these search results, explain: "${query}"
    
    Search Results: ${searchResults}
    
    Provide:
    1. Clear explanation of what the code does
    2. How it relates to the user's query
    3. Key technical details and patterns
    4. Suggestions for usage or improvement`
  });
  
  return text;
}
```

### Intelligent Query Processing

Combines multiple analysis techniques:

1. **Semantic Search** - Find relevant code chunks
2. **Pattern Analysis** - Extract structural patterns
3. **AI Synthesis** - Generate comprehensive insights
4. **Contextual Recommendations** - Provide actionable suggestions

## ChromaDB Integration

### Setup and Configuration

```typescript
private async initializeVectorDatabase(): Promise<void> {
  this.chromaClient = new ChromaClient({
    path: "http://localhost:8000" // Default ChromaDB server
  });

  const collection = await this.chromaClient.getOrCreateCollection({
    name: "codebase_embeddings",
    metadata: { "hnsw:space": "cosine" }
  });

  this.vectorDB = { collection, isInitialized: true };
}
```

### Data Storage Schema

```typescript
// Embeddings: 1536-dimensional vectors from OpenAI
// Metadata: Type, name, file, line, dependencies
// Documents: Rich text context for human readability
// IDs: Unique identifiers (file:line:name format)

await collection.add({
  ids: ['src/utils.ts:45:validateEmail'],
  embeddings: [[0.1, -0.3, 0.7, ...]],
  metadatas: [{
    type: 'function',
    name: 'validateEmail',
    file: 'src/utils.ts',
    line: 45,
    dependencies: JSON.stringify(['email', 'regex'])
  }],
  documents: ['Type: function\nName: validateEmail\n...']
});
```

## Performance Optimization

### Memory Management

- **Chunk Limits** - Processes files up to 100KB to prevent memory issues
- **Batch Processing** - Handles embeddings in batches for efficiency
- **Lazy Loading** - Loads embeddings only when needed
- **Cleanup** - Automatic cleanup when switching between codebases

### Processing Efficiency

- **AST Caching** - Caches parsed AST nodes for reuse
- **Parallel Processing** - Could be enhanced with worker threads
- **Incremental Updates** - Future enhancement for changed files only
- **Smart Filtering** - Early filtering to reduce processing overhead

### Scalability Considerations

- **File Size Limits** - 100KB per file, 10-level directory depth
- **Memory Usage** - ~50-200MB for medium projects
- **Processing Time** - 30 seconds to 5 minutes depending on codebase size
- **Vector Storage** - Persistent storage in ChromaDB for large projects

## Error Handling & Resilience

### Parsing Errors

```typescript
private async parseFileAST(filePath: string): Promise<void> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    await this.parseJavaScriptAST(content, relativePath);
  } catch (error) {
    console.warn(`Failed to parse ${filePath}:`, (error as Error).message);
    // Continue processing other files
  }
}
```

### API Failures

- **OpenAI API** - Graceful fallback to text-based search
- **ChromaDB** - Automatic fallback to in-memory mode
- **Network Issues** - Retry logic and timeout handling
- **Rate Limiting** - Backoff strategies for API calls

### Data Validation

- **AST Node Validation** - Ensures required properties exist
- **Embedding Validation** - Verifies embedding format and dimensions
- **File Type Validation** - Supports only analyzable file types
- **Content Validation** - Handles edge cases and malformed code

## Usage Examples

### 1. **Basic AST Analysis**

```
User: "Analyze the AST of /path/to/project"
Response: 
🌳 AST-Based Codebase Analysis Complete
📍 Path: /path/to/project
🔍 AST Nodes Extracted: 1,247
📦 Code Chunks Created: 892
🧮 Embeddings Generated: 856
💾 Vector DB Status: Connected
```

### 2. **Semantic Code Search**

```
User: "Semantic search for authentication functions"
Response:
🔍 Semantic Search Results:

📄 authenticateUser (function)
   File: src/auth/auth.ts:23
   Similarity: 94.2%
   Content: function authenticateUser(email: string, password: string)...

📄 validateToken (function)
   File: src/auth/middleware.ts:15
   Similarity: 87.8%
   Content: const validateToken = (token: string) => {...
```

### 3. **AI-Powered Code Explanation**

```
User: "Explain how user authentication works in this codebase"
Response: [GPT-4 generated explanation]

Based on the analysis of your codebase, user authentication follows a multi-layered approach:

1. **Authentication Flow**: The system uses JWT tokens for stateless authentication...
2. **Security Measures**: Password hashing with bcrypt, token validation middleware...
3. **Architecture**: Clean separation between authentication logic and business logic...
4. **Recommendations**: Consider implementing refresh tokens, rate limiting...
```

### 4. **Similar Code Detection**

```
User: "Find similar code to this function: function calculateTotal(items) { ... }"
Response:
🔍 Similar Code Patterns Found:

📄 calculateSubtotal (function)
   File: src/billing/calculator.ts:67
   Similarity: 91.5%
   Content: function calculateSubtotal(products: Product[])...

📄 computePrice (function)
   File: src/pricing/pricing.ts:34
   Similarity: 84.3%
   Content: const computePrice = (lineItems) => {...
```

## Integration with Bee AI CLI

### Tool Registration

The AST analyzer is automatically integrated with the main CLI:

```typescript
tools: [
  new CalculatorTool(),
  new WikipediaTool(),
  new GitTool(),
  new CodebaseAnalyzer(),      // Traditional analyzer
  new ASTCodebaseAnalyzer(),   // Advanced AST analyzer
]
```

### Automatic Tool Selection

The system intelligently selects the appropriate analyzer based on keywords:

```typescript
const astKeywords = [
  'ast', 'semantic', 'parse', 'embedding', 'vector', 
  'intelligent', 'similar code', 'semantic search'
];

if (astKeywords.some(keyword => input.toLowerCase().includes(keyword))) {
  // Use AST analyzer for advanced analysis
}
```

## Future Enhancements

### Planned Features

1. **Multi-Language Support** - Python, Java, C++, Go parsers
2. **Code Similarity Clusters** - Automatic grouping of similar code patterns
3. **Refactoring Suggestions** - AI-powered code improvement recommendations
4. **Real-time Analysis** - Live analysis as code is written
5. **Team Collaboration** - Shared embeddings and insights across teams

### Performance Improvements

1. **Incremental Parsing** - Only re-analyze changed files
2. **Distributed Processing** - Multi-threaded AST parsing
3. **Smart Caching** - Advanced caching strategies for embeddings
4. **Streaming Analysis** - Real-time processing for large codebases

### Advanced Analytics

1. **Code Evolution Tracking** - Track changes in code semantics over time
2. **Technical Debt Detection** - Identify complex or problematic code patterns
3. **Knowledge Graphs** - Build semantic relationships between code elements
4. **Code Documentation Generation** - Auto-generate documentation from AST analysis

## Best Practices

### For Optimal Performance

1. **Environment Setup** - Ensure ChromaDB is running for best performance
2. **API Keys** - Set OpenAI API key for semantic features
3. **Project Size** - Works best with projects under 10,000 files
4. **File Organization** - Clean directory structure improves analysis quality

### For Better Results

1. **Clear Queries** - Use descriptive queries for semantic search
2. **Type Specifications** - Specify code types when searching
3. **Context Inclusion** - Include context for better understanding
4. **Iterative Refinement** - Refine searches based on initial results

## Troubleshooting

### Common Issues

1. **ChromaDB Connection** - Ensure ChromaDB server is running on localhost:8000
2. **OpenAI API Limits** - Monitor rate limits and usage quotas
3. **Memory Usage** - Large codebases may require increased memory allocation
4. **Parsing Errors** - Some complex TypeScript may fall back to text analysis

### Performance Tips

1. **Selective Analysis** - Analyze specific directories rather than entire repositories
2. **Embedding Batching** - Process embeddings in smaller batches for stability
3. **Regular Cleanup** - Clear old embeddings when switching projects
4. **Monitoring** - Watch memory usage and processing times

## Conclusion

The AST-based Codebase Analyzer represents a significant advancement in code understanding technology. By combining abstract syntax tree parsing with semantic vector embeddings and AI-powered analysis, it provides developers with unprecedented insights into their codebases.

The system excels at semantic code search, finding similar patterns, and providing intelligent explanations that go beyond simple text matching. Whether you're exploring a new codebase, refactoring existing code, or seeking to understand complex architectural patterns, this tool provides the semantic understanding needed for effective code analysis.

With its robust error handling, scalable architecture, and integration with modern AI technologies, the AST analyzer sets a new standard for intelligent code analysis tools.