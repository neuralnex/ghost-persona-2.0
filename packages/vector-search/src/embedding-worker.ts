/**
 * Embedding Worker for Piscina Pool
 * 
 * This worker processes embedding generation requests to prevent connection pool exhaustion.
 * Uses a worker pool with backpressure to limit concurrent embedding requests.
 */

import { parentPort, workerData } from 'worker_threads';
import { ok, err, Result } from '@ghost-persona/shared';

interface EmbeddingTask {
  text: string;
  provider: 'google-genai' | 'openai' | 'mock';
  apiKey?: string;
  model: string;
  vectorSize: number;
}

interface EmbeddingResult {
  success: boolean;
  embedding?: number[];
  error?: string;
}

// Lazy import for Google GenAI to avoid loading it when not needed
let GoogleGenAI: any = null;

async function loadGoogleGenAI() {
  if (!GoogleGenAI) {
    const { GoogleGenAI: GenAI } = await import('@google/genai');
    GoogleGenAI = GenAI;
  }
  return GoogleGenAI;
}

/**
 * Generate embedding using the configured provider
 */
async function generateEmbedding(task: EmbeddingTask): Promise<Result<number[]>> {
  const { text, provider, apiKey, model, vectorSize } = task;

  switch (provider) {
    case 'google-genai': {
      if (!apiKey) {
        return err(new Error('Google GenAI API key not configured'));
      }

      try {
        const GoogleGenAIClass = await loadGoogleGenAI();
        const ai = new GoogleGenAIClass({ apiKey });
        
        const response = await ai.models.embedContent({
          model,
          contents: text,
        });
        
        const embedding = response.embeddings[0].values;
        
        // Ensure embedding is correct size
        if (embedding.length !== vectorSize) {
          return err(new Error(
            `Embedding size ${embedding.length} doesn't match expected size ${vectorSize}`
          ));
        }
        
        return ok(embedding);
      } catch (error) {
        return err(error instanceof Error ? error : new Error(String(error)));
      }
    }

    case 'openai': {
      // OpenAI embedding implementation would go here
      return err(new Error('OpenAI embedding not yet implemented'));
    }

    case 'mock':
    default: {
      // Generate mock embedding for testing
      const embedding = generateMockEmbedding(text, vectorSize);
      return ok(embedding);
    }
  }
}

/**
 * Generate mock embedding for testing (no external API calls)
 */
function generateMockEmbedding(text: string, vectorSize: number): number[] {
  const vector = new Array(vectorSize).fill(0);

  // Simple hash-based mock embedding for deterministic testing
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }

  // Fill vector with deterministic values based on hash
  for (let i = 0; i < vectorSize; i++) {
    vector[i] = ((hash + i) % 1000) / 1000.0 - 0.5;
  }

  return vector;
}

// Handle incoming messages
if (parentPort) {
  parentPort.on('message', async (task: EmbeddingTask) => {
    try {
      const result = await generateEmbedding(task);
      
      if (result.success && result.data) {
        parentPort!.postMessage({
          success: true,
          embedding: result.data
        } as EmbeddingResult);
      } else {
        // Result is { success: false; error: E } when not successful
        const errorResult = result as { success: false; error: unknown };
        const errorMsg = errorResult.error instanceof Error ? errorResult.error.message : String(errorResult.error);
        parentPort!.postMessage({
          success: false,
          error: errorMsg
        } as EmbeddingResult);
      }
    } catch (error) {
      parentPort!.postMessage({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      } as EmbeddingResult);
    }
  });
}

export { generateEmbedding, EmbeddingTask, EmbeddingResult };
