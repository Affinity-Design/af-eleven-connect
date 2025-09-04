// utils/data-migration.js
/**
 * Data migration utilities for fixing database schema issues
 */

import { findClientById, getAllClients } from '../crud.js';

/**
 * Clean up corrupted metricsHistory entries
 * @param {string} clientId - The client ID (optional, if not provided will clean all clients)
 * @returns {Promise<Object>} - Migration result
 */
export async function cleanupMetricsHistory(clientId = null) {
  try {
    let clients = [];
    
    if (clientId) {
      const client = await findClientById(clientId);
      if (client) clients = [client];
    } else {
      clients = await getAllClients();
    }
    
    const results = {
      totalClientsProcessed: 0,
      totalEntriesRemoved: 0,
      totalEntriesFixed: 0,
      clientResults: {}
    };
    
    for (const client of clients) {
      console.log(`[Data-Migration] Processing client ${client.clientId}`);
      
      let removedCount = 0;
      let fixedCount = 0;
      
      if (client.metricsHistory && client.metricsHistory.length > 0) {
        // Filter out invalid entries and fix valid ones
        const validEntries = [];
        
        for (const entry of client.metricsHistory) {
          // Check if entry has required fields
          if (!entry.agentId || !entry.period || !entry.metrics) {
            console.log(`[Data-Migration] Removing invalid entry without basic fields`);
            removedCount++;
            continue;
          }
          
          // Check if metrics object has required fields
          const metrics = entry.metrics;
          if (!metrics.agentId || !metrics.year || !metrics.month) {
            console.log(`[Data-Migration] Fixing entry ${entry.agentId}:${entry.period} - adding missing fields`);
            
            // Try to extract year and month from period
            const periodMatch = entry.period.match(/^(\d{4})-(\d{2})$/);
            if (periodMatch) {
              metrics.agentId = entry.agentId;
              metrics.year = parseInt(periodMatch[1]);
              metrics.month = parseInt(periodMatch[2]);
              
              // Ensure all required numeric fields exist
              metrics.inboundCalls = metrics.inboundCalls || 0;
              metrics.outboundCalls = metrics.outboundCalls || 0;
              metrics.totalCalls = metrics.totalCalls || 0;
              metrics.successfulBookings = metrics.successfulBookings || 0;
              metrics.totalDuration = metrics.totalDuration || 0;
              metrics.averageDuration = metrics.averageDuration || 0;
              metrics.callsFromElevenlabs = metrics.callsFromElevenlabs || 0;
              metrics.elevenlabsSuccessRate = metrics.elevenlabsSuccessRate || 0;
              metrics.lastUpdated = metrics.lastUpdated || new Date();
              
              fixedCount++;
            } else {
              console.log(`[Data-Migration] Removing entry with invalid period format: ${entry.period}`);
              removedCount++;
              continue;
            }
          }
          
          // Ensure source is valid
          if (!entry.source || !['elevenlabs', 'ghl', 'internal', 'combined'].includes(entry.source)) {
            entry.source = 'internal';
            fixedCount++;
          }
          
          validEntries.push(entry);
        }
        
        // Update the client's metricsHistory
        client.metricsHistory = validEntries;
        
        try {
          await client.save();
          console.log(`[Data-Migration] Saved client ${client.clientId} - removed ${removedCount}, fixed ${fixedCount}`);
        } catch (saveError) {
          console.error(`[Data-Migration] Error saving client ${client.clientId}:`, saveError);
          results.clientResults[client.clientId] = {
            error: saveError.message,
            removedCount,
            fixedCount
          };
          continue;
        }
      }
      
      results.totalClientsProcessed++;
      results.totalEntriesRemoved += removedCount;
      results.totalEntriesFixed += fixedCount;
      results.clientResults[client.clientId] = {
        success: true,
        removedCount,
        fixedCount,
        totalEntries: client.metricsHistory ? client.metricsHistory.length : 0
      };
    }
    
    return {
      success: true,
      message: `Migration completed. Processed ${results.totalClientsProcessed} clients, removed ${results.totalEntriesRemoved} invalid entries, fixed ${results.totalEntriesFixed} entries.`,
      data: results
    };
  } catch (error) {
    console.error('[Data-Migration] Error during cleanup:', error);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

/**
 * Validate client metrics data integrity
 * @param {string} clientId - The client ID
 * @returns {Promise<Object>} - Validation result
 */
export async function validateClientMetrics(clientId) {
  try {
    const client = await findClientById(clientId);
    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }
    
    const validation = {
      clientId,
      totalEntries: client.metricsHistory ? client.metricsHistory.length : 0,
      validEntries: 0,
      invalidEntries: 0,
      issues: []
    };
    
    if (!client.metricsHistory || client.metricsHistory.length === 0) {
      return {
        success: true,
        message: 'No metrics history found - client is clean',
        data: validation
      };
    }
    
    for (const [index, entry] of client.metricsHistory.entries()) {
      const entryIssues = [];
      
      // Check basic structure
      if (!entry.agentId) entryIssues.push('Missing agentId');
      if (!entry.period) entryIssues.push('Missing period');
      if (!entry.metrics) entryIssues.push('Missing metrics object');
      
      // Check metrics structure
      if (entry.metrics) {
        if (!entry.metrics.agentId) entryIssues.push('Missing metrics.agentId');
        if (!entry.metrics.year) entryIssues.push('Missing metrics.year');
        if (!entry.metrics.month) entryIssues.push('Missing metrics.month');
      }
      
      // Check source validity
      if (entry.source && !['elevenlabs', 'ghl', 'internal', 'combined'].includes(entry.source)) {
        entryIssues.push(`Invalid source: ${entry.source}`);
      }
      
      if (entryIssues.length > 0) {
        validation.invalidEntries++;
        validation.issues.push({
          index,
          agentId: entry.agentId,
          period: entry.period,
          issues: entryIssues
        });
      } else {
        validation.validEntries++;
      }
    }
    
    return {
      success: true,
      message: `Validation completed. ${validation.validEntries} valid, ${validation.invalidEntries} invalid entries.`,
      data: validation
    };
  } catch (error) {
    console.error('[Data-Migration] Error during validation:', error);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}
