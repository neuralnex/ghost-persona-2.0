/**
 * Tech Stack Detector
 * 
 * Auto-detects project technology stack by scanning configuration files.
 * Supports: Node.js, Python, TypeScript, Java, Go, Rust, PHP, Ruby, .NET
 * Framework detection: React, Vue, Angular, Next.js, Express, Fastify, etc.
 * Database detection: PostgreSQL, MySQL, MongoDB, Redis, etc.
 * Tool detection: ESLint, Prettier, Jest, Vitest, Docker, etc.
 */

import fs from 'fs/promises';
import path from 'path';

export interface TechStack {
  languages: string[];
  frameworks: string[];
  databases: string[];
  tools: string[];
  packageManagers: string[];
  cloudProviders: string[];
  hosting: string[];
  testing: string[];
  linting: string[];
  formatting: string[];
  ciCd: string[];
  containers: string[];
  monitoring: string[];
}

export interface DetectedDependency {
  name: string;
  version: string;
  category: string;
}

export interface DetectionResult {
  techStack: TechStack;
  dependencies: DetectedDependency[];
  rawData: {
    packageJson?: Record<string, unknown>;
    pyprojectToml?: Record<string, unknown>;
    requirementsTxt?: string[];
    goMod?: string[];
    cargoToml?: Record<string, unknown>;
    composerJson?: Record<string, unknown>;
    gemfile?: string[];
    csproj?: string[];
    dockerfile?: string[];
    dockerCompose?: Record<string, unknown>;
  };
}

// ─── Language Detection ──────────────────────────────────────────────────────

const LANGUAGE_PATTERNS: Array<{ files: string[]; language: string; }> = [
  { files: ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'], language: 'JavaScript/TypeScript' },
  { files: ['tsconfig.json'], language: 'TypeScript' },
  { files: ['pyproject.toml', 'requirements.txt', 'Pipfile', 'setup.py'], language: 'Python' },
  { files: ['pom.xml', 'build.gradle', 'settings.gradle'], language: 'Java' },
  { files: ['go.mod', 'go.sum'], language: 'Go' },
  { files: ['Cargo.toml'], language: 'Rust' },
  { files: ['composer.json', 'composer.lock'], language: 'PHP' },
  { files: ['Gemfile', 'Gemfile.lock'], language: 'Ruby' },
  { files: ['*.csproj', '*.sln'], language: 'C#' },
  { files: ['*.fsproj'], language: 'F#' },
  { files: ['Makefile'], language: 'C/C++' },
  { files: ['*.swift'], language: 'Swift' },
  { files: ['*.kt', '*.kts'], language: 'Kotlin' },
];

// ─── Framework Detection ───────────────────────────────────────────────────────

const FRAMEWORK_PATTERNS: Array<{ 
  files?: string[]; 
  packagePatterns?: string[]; 
  contentPatterns?: RegExp[];
  framework: string;
  category: 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'desktop';
}> = [
  // Frontend Frameworks
  { files: ['next.config.js', 'next.config.mjs'], framework: 'Next.js', category: 'fullstack' },
  { files: ['nuxt.config.js', 'nuxt.config.ts'], framework: 'Nuxt.js', category: 'fullstack' },
  { files: ['angular.json', '.angular.json'], framework: 'Angular', category: 'frontend' },
  { files: ['vue.config.js', 'vite.config.vue.ts'], framework: 'Vue.js', category: 'frontend' },
  { files: ['svelte.config.js'], framework: 'Svelte', category: 'frontend' },
  { files: ['vite.config.ts', 'vite.config.js'], framework: 'Vite', category: 'frontend' },
  { packagePatterns: ['react', 'react-dom', '@react-native-community'], framework: 'React', category: 'frontend' },
  { packagePatterns: ['@angular/core'], framework: 'Angular', category: 'frontend' },
  { packagePatterns: ['vue'], framework: 'Vue.js', category: 'frontend' },
  { packagePatterns: ['svelte'], framework: 'Svelte', category: 'frontend' },
  { packagePatterns: ['next'], framework: 'Next.js', category: 'fullstack' },
  { packagePatterns: ['nuxt3', 'nuxt'], framework: 'Nuxt.js', category: 'fullstack' },
  { packagePatterns: ['@remix-run/react', '@remix-run/node'], framework: 'Remix', category: 'fullstack' },
  { packagePatterns: ['gatsby'], framework: 'Gatsby', category: 'frontend' },
  { packagePatterns: ['expo', 'react-native'], framework: 'React Native', category: 'mobile' },
  { packagePatterns: ['electron'], framework: 'Electron', category: 'desktop' },
  { packagePatterns: ['tauri'], framework: 'Tauri', category: 'desktop' },
  
  // Backend Frameworks
  { packagePatterns: ['express'], framework: 'Express', category: 'backend' },
  { packagePatterns: ['fastify'], framework: 'Fastify', category: 'backend' },
  { packagePatterns: ['@nestjs/core'], framework: 'NestJS', category: 'backend' },
  { packagePatterns: ['koajs', 'koa'], framework: 'Koa', category: 'backend' },
  { packagePatterns: ['hono'], framework: 'Hono', category: 'backend' },
  { packagePatterns: ['@fastify/fastify'], framework: 'Fastify', category: 'backend' },
  
  // Python Frameworks
  { files: ['manage.py'], contentPatterns: [/Django/], framework: 'Django', category: 'backend' },
  { packagePatterns: ['flask'], framework: 'Flask', category: 'backend' },
  { packagePatterns: ['fastapi'], framework: 'FastAPI', category: 'backend' },
  { packagePatterns: ['starlette'], framework: 'Starlette', category: 'backend' },
  { packagePatterns: ['django'], framework: 'Django', category: 'backend' },
  
  // Fullstack Python
  { files: ['manage.py'], contentPatterns: [/Django/], framework: 'Django', category: 'fullstack' },
  
  // Go Frameworks
  { packagePatterns: ['github.com/gin-gonic/gin'], framework: 'Gin', category: 'backend' },
  { packagePatterns: ['github.com/labstack/echo'], framework: 'Echo', category: 'backend' },
  { packagePatterns: ['github.com/gofiber/fiber'], framework: 'Fiber', category: 'backend' },
  
  // Rust Frameworks
  { packagePatterns: ['actix-web'], framework: 'Actix Web', category: 'backend' },
  { packagePatterns: ['axum'], framework: 'Axum', category: 'backend' },
  { packagePatterns: ['rocket'], framework: 'Rocket', category: 'backend' },
  
  // PHP Frameworks
  { packagePatterns: ['laravel/framework'], framework: 'Laravel', category: 'fullstack' },
  { packagePatterns: ['symfony/symfony'], framework: 'Symfony', category: 'fullstack' },
  
  // Ruby Frameworks
  { packagePatterns: ['rails'], framework: 'Ruby on Rails', category: 'fullstack' },
  { packagePatterns: ['sinatra'], framework: 'Sinatra', category: 'backend' },
];

// ─── Database Detection ───────────────────────────────────────────────────────

const DATABASE_PATTERNS: Array<{ 
  files?: string[];
  packagePatterns?: string[];
  contentPatterns?: RegExp[];
  database: string;
}> = [
  // SQL Databases
  { packagePatterns: ['pg', 'postgres', 'postgresql'], database: 'PostgreSQL' },
  { packagePatterns: ['mysql', 'mysql2'], database: 'MySQL' },
  { packagePatterns: ['sqlite3'], database: 'SQLite' },
  { packagePatterns: ['mssql'], database: 'Microsoft SQL Server' },
  { packagePatterns: ['oracledb'], database: 'Oracle' },
  
  // NoSQL Databases
  { packagePatterns: ['mongodb'], database: 'MongoDB' },
  { packagePatterns: ['@redis/client', 'redis', 'ioredis'], database: 'Redis' },
  { packagePatterns: ['@aws-sdk/client-dynamodb'], database: 'DynamoDB' },
  { packagePatterns: ['cassandra-driver'], database: 'Cassandra' },
  { packagePatterns: ['neo4j-driver'], database: 'Neo4j' },
  { packagePatterns: ['elasticsearch'], database: 'Elasticsearch' },
  { packagePatterns: ['firebase', '@firebase/app'], database: 'Firebase' },
  { packagePatterns: ['supabase'], database: 'Supabase' },
  
  // ORMs
  { packagePatterns: ['sequelize'], database: 'Sequelize ORM' },
  { packagePatterns: ['typeorm'], database: 'TypeORM' },
  { packagePatterns: ['prisma'], database: 'Prisma' },
  { packagePatterns: ['drizzle-orm'], database: 'Drizzle ORM' },
  { packagePatterns: ['knex'], database: 'Knex.js' },
  { packagePatterns: ['mongoose'], database: 'Mongoose' },
  { packagePatterns: ['sqlalchemy'], database: 'SQLAlchemy' },
  { packagePatterns: ['django-orm'], database: 'Django ORM' },
];

// ─── Tool Detection ─────────────────────────────────────────────────────────

const TOOL_PATTERNS: Array<{ 
  files?: string[];
  packagePatterns?: string[];
  tool: string;
  category: keyof Pick<TechStack, 'tools' | 'packageManagers' | 'cloudProviders' | 'hosting' | 'testing' | 'linting' | 'formatting' | 'ciCd' | 'containers' | 'monitoring'>;
}> = [
  // Package Managers
  { files: ['package.json'], packagePatterns: ['npm'], tool: 'npm', category: 'packageManagers' },
  { files: ['yarn.lock'], tool: 'Yarn', category: 'packageManagers' },
  { files: ['pnpm-lock.yaml'], tool: 'pnpm', category: 'packageManagers' },
  { files: ['pyproject.toml'], tool: 'pip', category: 'packageManagers' },
  { files: ['requirements.txt'], tool: 'pip', category: 'packageManagers' },
  { files: ['Pipfile'], tool: 'pipenv', category: 'packageManagers' },
  { files: ['go.mod'], tool: 'go modules', category: 'packageManagers' },
  { files: ['Cargo.toml'], tool: 'cargo', category: 'packageManagers' },
  { files: ['composer.json'], tool: 'Composer', category: 'packageManagers' },
  { files: ['Gemfile'], tool: 'Bundler', category: 'packageManagers' },
  
  // Testing
  { packagePatterns: ['jest'], tool: 'Jest', category: 'testing' },
  { packagePatterns: ['vitest'], tool: 'Vitest', category: 'testing' },
  { packagePatterns: ['mocha'], tool: 'Mocha', category: 'testing' },
  { packagePatterns: ['@testing-library/react'], tool: 'React Testing Library', category: 'testing' },
  { packagePatterns: ['@testing-library/jest-dom'], tool: 'Jest DOM', category: 'testing' },
  { packagePatterns: ['pytest'], tool: 'pytest', category: 'testing' },
  { packagePatterns: ['unittest'], tool: 'unittest', category: 'testing' },
  { packagePatterns: ['rspec'], tool: 'RSpec', category: 'testing' },
  { packagePatterns: ['phpunit'], tool: 'PHPUnit', category: 'testing' },
  { files: ['pytest.ini', 'setup.cfg'], tool: 'pytest', category: 'testing' },
  
  // Linting
  { packagePatterns: ['eslint'], tool: 'ESLint', category: 'linting' },
  { packagePatterns: ['@typescript-eslint/eslint-plugin'], tool: 'TypeScript ESLint', category: 'linting' },
  { packagePatterns: ['prettier'], tool: 'Prettier', category: 'formatting' },
  { packagePatterns: ['stylelint'], tool: 'Stylelint', category: 'linting' },
  { packagePatterns: ['ruff'], tool: 'Ruff', category: 'linting' },
  { packagePatterns: ['flake8'], tool: 'Flake8', category: 'linting' },
  { packagePatterns: ['black'], tool: 'Black', category: 'formatting' },
  
  // Cloud Providers
  { packagePatterns: ['@aws-sdk/', 'aws-sdk'], tool: 'AWS', category: 'cloudProviders' },
  { packagePatterns: ['@google-cloud/', 'google-cloud'], tool: 'Google Cloud', category: 'cloudProviders' },
  { packagePatterns: ['@azure/', 'azure-'], tool: 'Azure', category: 'cloudProviders' },
  { packagePatterns: ['@vercel/', 'vercel'], tool: 'Vercel', category: 'cloudProviders' },
  { packagePatterns: ['@netlify/'], tool: 'Netlify', category: 'cloudProviders' },
  { packagePatterns: ['firebase'], tool: 'Firebase', category: 'cloudProviders' },
  
  // Hosting
  { packagePatterns: ['@vercel/'], tool: 'Vercel', category: 'hosting' },
  { packagePatterns: ['@netlify/'], tool: 'Netlify', category: 'hosting' },
  { files: ['netlify.toml'], tool: 'Netlify', category: 'hosting' },
  { files: ['vercel.json'], tool: 'Vercel', category: 'hosting' },
  { files: ['.platform/app.yaml'], tool: 'Platform.sh', category: 'hosting' },
  
  // CI/CD
  { files: ['.github/workflows/'], tool: 'GitHub Actions', category: 'ciCd' },
  { files: ['.gitlab-ci.yml'], tool: 'GitLab CI', category: 'ciCd' },
  { files: ['Jenkinsfile'], tool: 'Jenkins', category: 'ciCd' },
  { files: ['circle.yml', '.circleci/config.yml'], tool: 'CircleCI', category: 'ciCd' },
  { files: ['.travis.yml'], tool: 'Travis CI', category: 'ciCd' },
  
  // Containers
  { files: ['Dockerfile'], tool: 'Docker', category: 'containers' },
  { files: ['docker-compose.yml', 'docker-compose.yaml'], tool: 'Docker Compose', category: 'containers' },
  { files: ['.dockerignore'], tool: 'Docker', category: 'containers' },
  { packagePatterns: ['@podman/'], tool: 'Podman', category: 'containers' },
  
  // Monitoring
  { packagePatterns: ['@sentry/', 'sentry'], tool: 'Sentry', category: 'monitoring' },
  { packagePatterns: ['@datadog/'], tool: 'Datadog', category: 'monitoring' },
  { packagePatterns: ['prom-client'], tool: 'Prometheus', category: 'monitoring' },
  { packagePatterns: ['@newrelic/'], tool: 'New Relic', category: 'monitoring' },
];

// ─── Known Dependency Categories ────────────────────────────────────────────────

const DEPENDENCY_CATEGORIES: Array<{ 
  patterns: string[];
  category: string;
}> = [
  // Authentication
  { patterns: ['clerk', 'auth0', 'supabase', 'next-auth', 'passport', 'passport-', 'bcrypt', 'jsonwebtoken', 'jwt'], category: 'Authentication' },
  { patterns: ['oauth', 'openid-client'], category: 'Authentication' },
  
  // Database Clients
  { patterns: ['pg', 'mysql', 'mysql2', 'sqlite3', 'mongodb', 'redis', 'ioredis'], category: 'Database' },
  { patterns: ['@prisma/client', 'prisma'], category: 'ORM' },
  { patterns: ['sequelize', 'typeorm', 'drizzle-orm', 'knex'], category: 'ORM' },
  
  // State Management
  { patterns: ['zustand', 'jotai', 'recoil', 'mobx', 'redux', '@reduxjs/toolkit'], category: 'State Management' },
  { patterns: ['react-query', '@tanstack/react-query'], category: 'Data Fetching' },
  { patterns: ['swr'], category: 'Data Fetching' },
  
  // UI Libraries
  { patterns: ['@mui/', 'material-ui', '@chakra-ui/', 'antd', '@ant-design/'], category: 'UI Framework' },
  { patterns: ['tailwindcss', '@tailwindcss/', 'twin.macro'], category: 'Styling' },
  { patterns: ['styled-components', '@emotion/', 'emotion'], category: 'CSS-in-JS' },
  { patterns: ['framer-motion'], category: 'Animation' },
  
  // Build Tools
  { patterns: ['webpack', 'vite', '@vitejs/', 'esbuild', 'turbopack'], category: 'Build Tool' },
  { patterns: ['babel', '@babel/'], category: 'Transpiler' },
  { patterns: ['typescript', 'ts-node', '@types/'], category: 'TypeScript' },
  
  // API Clients
  { patterns: ['axios', 'ky', 'got', 'superagent'], category: 'HTTP Client' },
  { patterns: ['@tanstack/react-query'], category: 'Data Fetching' },
  { patterns: ['react-query'], category: 'Data Fetching' },
  
  // File System
  { patterns: ['fs-extra', 'glob', 'chokidar'], category: 'File System' },
  
  // Date/Time
  { patterns: ['date-fns', 'dayjs', 'moment', 'luxon'], category: 'Date/Time' },
  
  // Validation
  { patterns: ['zod', 'joi', 'yup', 'ajv'], category: 'Validation' },
  
  // Internationalization
  { patterns: ['i18next', 'react-i18next', 'formatjs'], category: 'i18n' },
];

// ─── Categorize Dependency ────────────────────────────────────────────────────

function categorizeDependency(name: string): string {
  for (const { patterns, category } of DEPENDENCY_CATEGORIES) {
    for (const pattern of patterns) {
      if (name.toLowerCase().includes(pattern.toLowerCase())) {
        return category;
      }
    }
  }
  return 'Other';
}

// ─── Detect from File System ──────────────────────────────────────────────────

async function detectFiles(projectRoot: string): Promise<{
  files: Record<string, boolean>;
  content: Record<string, string>;
}> {
  const files: Record<string, boolean> = {};
  const content: Record<string, string> = {};

  const checkFiles = [
    'package.json',
    'tsconfig.json',
    'pyproject.toml',
    'requirements.txt',
    'Pipfile',
    'setup.py',
    'pom.xml',
    'build.gradle',
    'go.mod',
    'go.sum',
    'Cargo.toml',
    'composer.json',
    'Gemfile',
    'Gemfile.lock',
    'manage.py',
    'Dockerfile',
    'docker-compose.yml',
    'docker-compose.yaml',
    '.dockerignore',
    'vercel.json',
    'netlify.toml',
    '.github/workflows/',
    '.gitlab-ci.yml',
    'Jenkinsfile',
    'circle.yml',
    '.circleci/config.yml',
    '.travis.yml',
    'next.config.js',
    'next.config.mjs',
    'nuxt.config.js',
    'nuxt.config.ts',
    'angular.json',
    '.angular.json',
    'vue.config.js',
    'vite.config.ts',
    'vite.config.js',
    'svelte.config.js',
    'svelte.config.ts',
    'tailwind.config.js',
    'tailwind.config.ts',
    'postcss.config.js',
    '.eslintrc',
    '.eslintrc.json',
    '.eslintrc.js',
    '.prettierrc',
    '.stylelintrc',
    'jest.config.js',
    'jest.config.ts',
    'vitest.config.js',
    'vitest.config.ts',
  ];

  for (const file of checkFiles) {
    try {
      const fullPath = path.join(projectRoot, file);
      const stat = await fs.stat(fullPath);
      files[file] = stat.isFile();
      
      if (stat.isFile() && file.endsWith('.json') || file.endsWith('.toml') || file.endsWith('.yml') || file.endsWith('.yaml')) {
        try {
          content[file] = await fs.readFile(fullPath, 'utf-8');
        } catch {
          // Skip binary files
        }
      } else if (stat.isFile() && (file.endsWith('.txt') || file.endsWith('.py') || file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.mjs'))) {
        try {
          content[file] = await fs.readFile(fullPath, 'utf-8');
        } catch {
          // Skip binary files
        }
      }
    } catch {
      files[file] = false;
    }
  }

  return { files, content };
}

// ─── Parse Configuration Files ───────────────────────────────────────────────

function parsePackageJson(content: string): Record<string, unknown> | null {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function parsePyProjectToml(content: string): Record<string, unknown> | null {
  try {
    // Simple TOML parsing for basic structure
    const result: Record<string, unknown> = {};
    const lines = content.split('\n');
    let currentSection = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1);
        result[currentSection] = {};
      } else if (trimmed && currentSection) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          const value = trimmed.slice(eqIndex + 1).trim();
          (result[currentSection] as Record<string, unknown>)[key] = value.replace(/^['"]|['"]$/g, '');
        }
      }
    }
    return result;
  } catch {
    return null;
  }
}

function extractDependencies(pkg: Record<string, unknown>): string[] {
  const deps: string[] = [];
  
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const depsObj = pkg[key] as Record<string, unknown>;
    if (depsObj && typeof depsObj === 'object') {
      deps.push(...Object.keys(depsObj));
    }
  }
  
  return deps;
}

// ─── Main Detector ───────────────────────────────────────────────────────────

export class TechStackDetector {
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async detect(): Promise<DetectionResult> {
    const result: DetectionResult = {
      techStack: {
        languages: [],
        frameworks: [],
        databases: [],
        tools: [],
        packageManagers: [],
        cloudProviders: [],
        hosting: [],
        testing: [],
        linting: [],
        formatting: [],
        ciCd: [],
        containers: [],
        monitoring: [],
      },
      dependencies: [],
      rawData: {},
    };

    const { files, content } = await detectFiles(this.projectRoot);

    // Detect languages
    result.techStack.languages = this.detectLanguages(files);

    // Parse package.json if exists
    if (content['package.json']) {
      const pkg = parsePackageJson(content['package.json']);
      if (pkg) {
        result.rawData.packageJson = pkg;
        const deps = extractDependencies(pkg);
        
        // Detect frameworks from dependencies
        this.detectFrameworksFromDeps(deps, result);
        
        // Detect databases from dependencies
        this.detectDatabasesFromDeps(deps, result);
        
        // Detect tools from dependencies
        this.detectToolsFromDeps(deps, result);
        
        // Categorize all dependencies
        result.dependencies = deps.map((name: string) => ({
          name,
          version: (pkg.dependencies as Record<string, string>)?.[name] ?? 
                   (pkg.devDependencies as Record<string, string>)?.[name] ?? 
                   (pkg.peerDependencies as Record<string, string>)?.[name] ?? 
                   'unknown',
          category: categorizeDependency(name),
        }));
      }
    }

    // Parse pyproject.toml if exists
    if (content['pyproject.toml']) {
      const pyproject = parsePyProjectToml(content['pyproject.toml']);
      if (pyproject) {
        result.rawData.pyprojectToml = pyproject;
        
        // Extract Python dependencies
        const toolPoetry = pyproject['tool.poetry'] as Record<string, unknown>;
        if (toolPoetry) {
          const deps = [
            ...Object.keys((toolPoetry.dependencies as Record<string, unknown>) ?? {}),
            ...Object.keys((toolPoetry.devDependencies as Record<string, unknown>) ?? {}),
          ];
          
          this.detectFrameworksFromDeps(deps, result, 'python');
          this.detectDatabasesFromDeps(deps, result, 'python');
          this.detectToolsFromDeps(deps, result, 'python');
          
          result.dependencies.push(...deps.map((name: string) => ({
            name,
            version: 'unknown',
            category: categorizeDependency(name),
          })));
        }
      }
    }

    // Parse requirements.txt if exists
    if (content['requirements.txt']) {
      const deps = content['requirements.txt']
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line && !line.startsWith('#'))
        .map((line: string) => line.split('==')[0].split('>=')[0].split('<')[0].trim());
      
      result.rawData.requirementsTxt = deps;
      
      this.detectFrameworksFromDeps(deps, result, 'python');
      this.detectDatabasesFromDeps(deps, result, 'python');
      this.detectToolsFromDeps(deps, result, 'python');
      
      result.dependencies.push(...deps.map((name: string) => ({
        name,
        version: 'unknown',
        category: categorizeDependency(name),
      })));
    }

    // Parse go.mod if exists
    if (content['go.mod']) {
      const deps: string[] = [];
      const lines = content['go.mod'].split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('require')) {
          const parts = line.split(/\s+/);
          for (let i = 1; i < parts.length; i++) {
            const dep = parts[i].trim();
            if (dep && !dep.startsWith('//') && !dep.startsWith('(')) {
              deps.push(dep.split('/')[0]);
            }
          }
        }
      }
      result.rawData.goMod = deps;
      
      this.detectFrameworksFromDeps(deps, result, 'go');
      this.detectDatabasesFromDeps(deps, result, 'go');
      this.detectToolsFromDeps(deps, result, 'go');
    }

    // Parse Docker files
    if (content['Dockerfile']) {
      result.rawData.dockerfile = [content['Dockerfile']];
      
      // Detect from Dockerfile
      this.detectFromDockerfile(content['Dockerfile'], result);
    }

    // Parse docker-compose
    if (content['docker-compose.yml'] || content['docker-compose.yaml']) {
      const composeContent = content['docker-compose.yml'] ?? content['docker-compose.yaml'];
      try {
        // Simple YAML parsing
        result.rawData.dockerCompose = this.simpleYamlParse(composeContent);
      } catch {
        // Ignore parse errors
      }
    }

    // Detect from file patterns (framework configs, etc.)
    this.detectFromFilePatterns(files, result);

    // Deduplicate all arrays
    this.deduplicateTechStack(result);

    return result;
  }

  private detectLanguages(files: Record<string, boolean>): string[] {
    const languages: string[] = [];
    
    for (const { files: patterns, language } of LANGUAGE_PATTERNS) {
      if (patterns.some((f: string) => files[f])) {
        languages.push(language);
      }
    }
    
    return languages;
  }

  private detectFrameworksFromDeps(deps: string[], result: DetectionResult, language = 'javascript'): void {
    const lowerDeps = deps.map((d: string) => d.toLowerCase());
    
    for (const { packagePatterns, framework, category } of FRAMEWORK_PATTERNS) {
      if (packagePatterns && packagePatterns.some((p) => lowerDeps.includes(p.toLowerCase()))) {
        if (!result.techStack.frameworks.includes(framework)) {
          result.techStack.frameworks.push(framework);
        }
      }
    }
  }

  private detectDatabasesFromDeps(deps: string[], result: DetectionResult, language = 'javascript'): void {
    const lowerDeps = deps.map((d: string) => d.toLowerCase());
    
    for (const { packagePatterns, database } of DATABASE_PATTERNS) {
      if (packagePatterns && packagePatterns.some((p: string) => lowerDeps.includes(p.toLowerCase()))) {
        if (!result.techStack.databases.includes(database)) {
          result.techStack.databases.push(database);
        }
      }
    }
  }

  private detectToolsFromDeps(deps: string[], result: DetectionResult, language = 'javascript'): void {
    const lowerDeps = deps.map((d) => d.toLowerCase());
    
    for (const { packagePatterns, tool, category } of TOOL_PATTERNS) {
      if (packagePatterns && packagePatterns.some((p: string) => lowerDeps.includes(p.toLowerCase()))) {
        const categoryKey = category as keyof TechStack;
        if (!result.techStack[categoryKey].includes(tool)) {
          result.techStack[categoryKey].push(tool);
        }
      }
    }
  }

  private detectFromFilePatterns(files: Record<string, boolean>, result: DetectionResult): void {
    for (const { files: patterns, framework, category } of FRAMEWORK_PATTERNS) {
      if (patterns && patterns.some((f: string) => files[f])) {
        if (!result.techStack.frameworks.includes(framework)) {
          result.techStack.frameworks.push(framework);
        }
      }
    }

    for (const { files: patterns, tool, category } of TOOL_PATTERNS) {
      if (patterns && patterns.some((f: string) => {
        // Handle directory patterns
        if (f.endsWith('/')) {
          const dir = f.slice(0, -1);
          return Object.keys(files).some((file: string) => file.startsWith(`${dir}/`));
        }
        return files[f];
      })) {
        const categoryKey = category as keyof TechStack;
        if (!result.techStack[categoryKey].includes(tool)) {
          result.techStack[categoryKey].push(tool);
        }
      }
    }
  }

  private detectFromDockerfile(content: string, result: DetectionResult): void {
    const lines = content.toLowerCase().split('\n');
    
    for (const line of lines) {
      // Detect base images
      if (line.trim().startsWith('from ')) {
        const image = line.replace('from ', '').split(' ')[0].split(':')[0];
        
        // Detect Node.js
        if (image.includes('node')) {
          if (!result.techStack.languages.includes('JavaScript/TypeScript')) {
            result.techStack.languages.push('JavaScript/TypeScript');
          }
        }
        
        // Detect Python
        if (image.includes('python')) {
          if (!result.techStack.languages.includes('Python')) {
            result.techStack.languages.push('Python');
          }
        }
        
        // Detect Go
        if (image.includes('golang') || image.includes('alpine') && line.includes('go')) {
          if (!result.techStack.languages.includes('Go')) {
            result.techStack.languages.push('Go');
          }
        }
        
        // Detect PostgreSQL
        if (image.includes('postgres') || image.includes('postgresql')) {
          if (!result.techStack.databases.includes('PostgreSQL')) {
            result.techStack.databases.push('PostgreSQL');
          }
        }
        
        // Detect Redis
        if (image.includes('redis')) {
          if (!result.techStack.databases.includes('Redis')) {
            result.techStack.databases.push('Redis');
          }
        }
      }
    }
  }

  private simpleYamlParse(content: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = content.split('\n');
    let currentKey: string | null = null;
    let depth = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('#')) continue;
      
      if (trimmed === '') continue;
      
      const indent = line.search(/\S/);
      const newDepth = indent >= 0 ? Math.floor(indent / 2) : 0;
      
      if (newDepth <= depth) {
        currentKey = null;
        depth = 0;
      }
      
      if (trimmed.endsWith(':')) {
        const key = trimmed.slice(0, -1);
        if (newDepth === 0) {
          result[key] = {};
          currentKey = key;
        } else if (currentKey) {
          const parent = result[currentKey] as Record<string, unknown>;
          const parts = key.split(':');
          let current = parent;
          for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i].trim();
            if (!current[part]) {
              current[part] = {};
            }
            current = current[part] as Record<string, unknown>;
          }
          const lastPart = parts[parts.length - 1].trim();
          current[lastPart] = {};
          currentKey = key;
        }
        depth = newDepth + 1;
      } else if (currentKey && trimmed.includes(':')) {
        const [key, value] = trimmed.split(':').map((s: string) => s.trim());
        (result[currentKey] as Record<string, unknown>)[key] = value.replace(/^['"]|['"]$/g, '');
      }
    }
    
    return result;
  }

  private deduplicateTechStack(result: DetectionResult): void {
    for (const key of Object.keys(result.techStack) as (keyof TechStack)[]) {
      const unique = [...new Set(result.techStack[key])];
      result.techStack[key] = unique;
    }
    
    // Deduplicate dependencies by name
    const depMap = new Map<string, DetectedDependency>();
    for (const dep of result.dependencies) {
      if (!depMap.has(dep.name)) {
        depMap.set(dep.name, dep);
      }
    }
    result.dependencies = Array.from(depMap.values());
  }

  /**
   * Get a summary of the detected tech stack as a markdown string
   */
  formatAsMarkdown(result?: DetectionResult): string {
    if (!result) return '_No tech stack detected._';
    
    const { techStack } = result;
    const lines: string[] = [];
    
    if (techStack.languages.length > 0) {
      lines.push(`**Languages:** ${techStack.languages.join(', ')}`);
    }
    if (techStack.frameworks.length > 0) {
      lines.push(`**Frameworks:** ${techStack.frameworks.join(', ')}`);
    }
    if (techStack.databases.length > 0) {
      lines.push(`**Databases:** ${techStack.databases.join(', ')}`);
    }
    if (techStack.packageManagers.length > 0) {
      lines.push(`**Package Managers:** ${techStack.packageManagers.join(', ')}`);
    }
    if (techStack.tools.length > 0) {
      lines.push(`**Tools:** ${techStack.tools.join(', ')}`);
    }
    if (techStack.cloudProviders.length > 0) {
      lines.push(`**Cloud:** ${techStack.cloudProviders.join(', ')}`);
    }
    if (techStack.hosting.length > 0) {
      lines.push(`**Hosting:** ${techStack.hosting.join(', ')}`);
    }
    if (techStack.testing.length > 0) {
      lines.push(`**Testing:** ${techStack.testing.join(', ')}`);
    }
    if (techStack.linting.length > 0) {
      lines.push(`**Linting:** ${techStack.linting.join(', ')}`);
    }
    if (techStack.formatting.length > 0) {
      lines.push(`**Formatting:** ${techStack.formatting.join(', ')}`);
    }
    if (techStack.ciCd.length > 0) {
      lines.push(`**CI/CD:** ${techStack.ciCd.join(', ')}`);
    }
    if (techStack.containers.length > 0) {
      lines.push(`**Containers:** ${techStack.containers.join(', ')}`);
    }
    if (techStack.monitoring.length > 0) {
      lines.push(`**Monitoring:** ${techStack.monitoring.join(', ')}`);
    }
    
    if (lines.length === 0) {
      return '_No tech stack detected._';
    }
    
    return lines.join('\n\n') + '\n';
  }

  /**
   * Get a summary of the detected tech stack as a single line
   */
  formatAsSummary(result?: DetectionResult): string {
    if (!result) return 'No tech stack detected';
    
    const { techStack } = result;
    const parts: string[] = [];
    
    if (techStack.languages.length > 0) {
      parts.push(techStack.languages.join(' + '));
    }
    if (techStack.frameworks.length > 0) {
      parts.push(...techStack.frameworks.slice(0, 2));
    }
    if (techStack.databases.length > 0) {
      parts.push(...techStack.databases.slice(0, 2));
    }
    
    if (parts.length === 0) {
      return 'No tech stack detected';
    }
    
    return parts.join(' | ');
  }
}

// ─── Factory Function ─────────────────────────────────────────────────────────

export async function detectTechStack(projectRoot: string): Promise<DetectionResult> {
  const detector = new TechStackDetector(projectRoot);
  return detector.detect();
}


