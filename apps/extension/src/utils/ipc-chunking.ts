/**
 * IPC Chunked Streaming Utility
 * 
 * VS Code extension IPC has an 8MB message size limit.
 * This utility splits large memory snapshots into 1MB chunks with sequence numbers and checksums.
 * 
 * Usage:
 *   // To send large data
 *   const chunks = chunkData(largeSnapshot, 1024 * 1024); // 1MB chunks
 *   for (const chunk of chunks) {
 *     await sendChunk(chunk);
 *   }
 * 
 *   // To receive and reassemble
 *   const reassembled = reassembleChunks(receivedChunks);
 */

import * as vscode from 'vscode';
import { createHash } from 'crypto';

// Default chunk size: 1MB to stay well under the 8MB limit
// This allows for metadata overhead and multiple concurrent messages
const DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1MB

// Maximum single message size for VS Code IPC
const MAX_IPC_MESSAGE_SIZE = 8 * 1024 * 1024; // 8MB

interface DataChunk {
  /** Unique identifier for this data transfer */
  transferId: string;
  /** Sequence number (0-indexed) */
  sequence: number;
  /** Total number of chunks */
  totalChunks: number;
  /** The actual data chunk */
  data: Uint8Array;
  /** SHA-256 checksum of the original complete data */
  checksum: string;
  /** Optional metadata */
  metadata?: Record<string, string>;
}

interface ChunkAck {
  transferId: string;
  sequence: number;
  received: boolean;
}

/**
 * Generate a unique transfer ID
 */
export function generateTransferId(): string {
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Calculate SHA-256 checksum of data
 */
export function calculateChecksum(data: Uint8Array | string): string {
  const input = typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data);
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Split data into chunks for IPC transfer
 */
export function chunkData(
  data: Uint8Array | string,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): DataChunk[] {
  const input = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  const checksum = calculateChecksum(input);
  const transferId = generateTransferId();
  
  const chunks: DataChunk[] = [];
  let offset = 0;
  let sequence = 0;
  
  while (offset < input.length) {
    const end = Math.min(offset + chunkSize, input.length);
    const chunkData = input.slice(offset, end);
    
    chunks.push({
      transferId,
      sequence,
      totalChunks: Math.ceil(input.length / chunkSize),
      data: chunkData,
      checksum,
    });
    
    offset = end;
    sequence++;
  }
  
  return chunks;
}

/**
 * Reassemble chunks back into original data
 */
export function reassembleChunks(chunks: DataChunk[]): Uint8Array {
  // Sort chunks by sequence number
  const sortedChunks = [...chunks].sort((a, b) => a.sequence - b.sequence);
  
  // Calculate total size
  let totalSize = 0;
  for (const chunk of sortedChunks) {
    totalSize += chunk.data.length;
  }
  
  // Concatenate all chunks
  const result = new Uint8Array(totalSize);
  let offset = 0;
  
  for (const chunk of sortedChunks) {
    result.set(chunk.data, offset);
    offset += chunk.data.length;
  }
  
  return result;
}

/**
 * Validate checksum of reassembled data
 */
export function validateChecksum(
  data: Uint8Array,
  expectedChecksum: string
): boolean {
  const actualChecksum = calculateChecksum(data);
  return actualChecksum === expectedChecksum;
}

/**
 * Check if data needs chunking (exceeds safe size)
 */
export function needsChunking(data: Uint8Array | string): boolean {
  const size = typeof data === 'string' ? Buffer.byteLength(data, 'utf-8') : data.length;
  // Use 75% of max as safety margin
  return size > (MAX_IPC_MESSAGE_SIZE * 0.75);
}

/**
 * Chunked data sender class
 * Handles sending data in chunks with retry logic
 */
export class ChunkedSender {
  private pendingAcks = new Map<string, Set<number>>();
  private retryCounts = new Map<string, number>();
  private readonly maxRetries = 3;
  
  constructor(private readonly sendFn: (chunk: DataChunk) => Promise<boolean>) {}
  
  async send(data: Uint8Array | string, metadata?: Record<string, string>): Promise<boolean> {
    const chunks = chunkData(data);
    const transferId = chunks[0].transferId;
    
    // Add metadata to first chunk
    if (metadata && chunks.length > 0) {
      chunks[0].metadata = metadata;
    }
    
    this.pendingAcks.set(transferId, new Set(chunks.map(c => c.sequence)));
    this.retryCounts.set(transferId, 0);
    
    // Send all chunks
    const sendPromises = chunks.map(chunk => 
      this.sendWithRetry(chunk, transferId)
    );
    
    const results = await Promise.all(sendPromises);
    
    // Check if all chunks were acknowledged
    const allAcked = results.every(r => r);
    
    if (allAcked) {
      this.pendingAcks.delete(transferId);
      this.retryCounts.delete(transferId);
      return true;
    }
    
    return false;
  }
  
  private async sendWithRetry(chunk: DataChunk, transferId: string): Promise<boolean> {
    const maxAttempts = this.maxRetries;
    let attempt = 0;
    
    while (attempt < maxAttempts) {
      try {
        const success = await this.sendFn(chunk);
        
        if (success) {
          // Remove from pending acks
          const pending = this.pendingAcks.get(transferId);
          if (pending) {
            pending.delete(chunk.sequence);
          }
          return true;
        }
      } catch {
        // Send failed, will retry
      }
      
      attempt++;
      
      if (attempt < maxAttempts) {
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return false;
  }
}

/**
 * Chunked data receiver class
 * Handles receiving and reassembling chunks
 */
export class ChunkedReceiver {
  private chunksMap = new Map<string, Map<number, DataChunk>>();
  private metadataMap = new Map<string, Record<string, string>>();
  
  constructor(private readonly onComplete?: (data: Uint8Array, metadata?: Record<string, string>) => void) {}
  
  addChunk(chunk: DataChunk): boolean {
    // Initialize map for this transfer if not exists
    if (!this.chunksMap.has(chunk.transferId)) {
      this.chunksMap.set(chunk.transferId, new Map());
    }
    
    const transferChunks = this.chunksMap.get(chunk.transferId)!;
    
    // Store metadata from first chunk
    if (chunk.sequence === 0 && chunk.metadata) {
      this.metadataMap.set(chunk.transferId, chunk.metadata);
    }
    
    // Store chunk
    transferChunks.set(chunk.sequence, chunk);
    
    // Check if we have all chunks
    if (transferChunks.size === chunk.totalChunks) {
      // Reassemble
      const chunks = Array.from(transferChunks.values());
      const data = reassembleChunks(chunks);
      
      // Validate checksum
      if (validateChecksum(data, chunk.checksum)) {
        const metadata = this.metadataMap.get(chunk.transferId);
        this.onComplete?.(data, metadata);
        
        // Clean up
        this.chunksMap.delete(chunk.transferId);
        this.metadataMap.delete(chunk.transferId);
        
        return true;
      } else {
        // Checksum failed - discard and clean up
        this.chunksMap.delete(chunk.transferId);
        this.metadataMap.delete(chunk.transferId);
        console.error('Chunked transfer checksum validation failed');
        return false;
      }
    }
    
    return false;
  }
  
  getTransferProgress(transferId: string): { received: number; total: number } {
    const transferChunks = this.chunksMap.get(transferId);
    if (!transferChunks) {
      return { received: 0, total: 0 };
    }
    
    // Get total from any chunk
    const firstChunk = transferChunks.get(0);
    const total = firstChunk?.totalChunks || 0;
    
    return {
      received: transferChunks.size,
      total
    };
  }
}

/**
 * Utility to safely send large strings through VS Code IPC
 * Uses chunking if the string is too large
 */
export async function safeSendToWebview(
  webview: vscode.Webview,
  data: string | Uint8Array,
  metadata?: Record<string, string>
): Promise<boolean> {
  const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  
  if (!needsChunking(dataBuffer)) {
    // Small enough to send directly
    // postMessage returns a promise that resolves when the message is posted
    return webview.postMessage({
      type: 'data',
      data: Buffer.from(dataBuffer).toString('base64'),
      metadata
    }).then(() => true, () => false);
  }
  
  // Use chunked transfer
  const chunks = chunkData(dataBuffer);
  const transferId = chunks[0].transferId;
  
  // Add metadata to first chunk
  if (metadata && chunks.length > 0) {
    chunks[0].metadata = metadata;
  }
  
  // Send all chunks
  for (const chunk of chunks) {
    try {
      await webview.postMessage({
        type: 'chunk',
        chunk: {
          ...chunk,
          data: Buffer.from(chunk.data).toString('base64')
        }
      });
    } catch {
      return false;
    }
  }
  
  // Send completion marker
  return webview.postMessage({
    type: 'chunkComplete',
    transferId
  }).then(() => true, () => false);
}

/**
 * Get safe chunk size based on current IPC conditions
 */
export function getSafeChunkSize(): number {
  // In production, this could be adjusted based on available memory
  // For now, use a conservative 1MB
  return DEFAULT_CHUNK_SIZE;
}

export {
  DEFAULT_CHUNK_SIZE,
  MAX_IPC_MESSAGE_SIZE
};
