// utils/elevenlabs.js
/**
 * Utility functions for ElevenLabs API integration
 * Handles fetching call history and metrics from ElevenLabs
 */

import fetch from "node-fetch";

/**
 * Fetch call history from ElevenLabs API
 * @param {string} apiKey - ElevenLabs API key
 * @param {Object} options - Query options
 * @param {Date} options.startDate - Start date for history
 * @param {Date} options.endDate - End date for history
 * @param {number} options.pageSize - Number of results per page (max 1000)
 * @param {string} options.pageToken - Token for pagination
 * @returns {Promise<Object>} - Call history data
 */
export async function fetchElevenLabsHistory(apiKey, options = {}) {
  const { startDate, endDate, pageSize = 1000, pageToken } = options;

  try {
    const params = new URLSearchParams({
      page_size: pageSize.toString(),
    });

    if (startDate) {
      params.append(
        "start_date_unix",
        Math.floor(startDate.getTime() / 1000).toString()
      );
    }

    if (endDate) {
      params.append(
        "end_date_unix",
        Math.floor(endDate.getTime() / 1000).toString()
      );
    }

    if (pageToken) {
      params.append("page_token", pageToken);
    }

    console.log(`[ElevenLabs] Fetching history with params:`, params.toString());

    const response = await fetch(
      `https://api.elevenlabs.io/v1/history?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[ElevenLabs] API Error: ${response.status} ${response.statusText}`,
        errorText
      );
      throw new Error(
        `ElevenLabs API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    console.log(`[ElevenLabs] API Response:`, {
      totalRecords: data.history?.length || 0,
      hasNextPage: !!data.next_page_token,
      sampleRecord: data.history?.[0] ? Object.keys(data.history[0]) : null,
    });

    return data;
  } catch (error) {
    console.error("Error fetching ElevenLabs history:", error);
    throw error;
  }
}

/**
 * Aggregate call metrics from ElevenLabs history data
 * @param {Array} historyData - Array of call history records
 * @param {string} agentId - Agent ID to filter by (optional)
 * @returns {Object} - Aggregated metrics
 */
export function aggregateElevenLabsMetrics(historyData, agentId = null) {
  console.log(`[ElevenLabs] Aggregating metrics for agent: ${agentId || 'all'}`);
  console.log(`[ElevenLabs] Processing ${historyData.length} records`);

  const metrics = {
    totalCalls: 0,
    inboundCalls: 0,
    outboundCalls: 0,
    totalDuration: 0,
    averageDuration: 0,
    successfulCalls: 0,
    failedCalls: 0,
  };

  historyData.forEach((call, index) => {
    // Debug first few records to see structure
    if (index < 3) {
      console.log(`[ElevenLabs] Sample call record:`, JSON.stringify(call, null, 2));
    }

    // Filter by agent if specified - try different field names
    if (agentId) {
      const callAgentId = call.agent_id || call.agentId || call.conversation_id || call.id;
      if (callAgentId !== agentId) {
        console.log(`[ElevenLabs] Skipping call - agent mismatch: ${callAgentId} !== ${agentId}`);
        return;
      }
    }

    metrics.totalCalls++;

    // Determine call direction - try different field names
    const direction = call.direction || call.call_direction || call.type;
    if (direction === "inbound" || direction === "incoming" || call.call_type === "inbound") {
      metrics.inboundCalls++;
    } else {
      metrics.outboundCalls++;
    }

    // Duration - try different field names
    const duration = call.duration || call.call_duration || call.length || 0;
    if (duration) {
      metrics.totalDuration += duration;
    }

    // Success/failure - try different field names
    const status = call.status || call.call_status || call.state;
    if (status === "completed" || status === "successful" || call.success) {
      metrics.successfulCalls++;
    } else {
      metrics.failedCalls++;
    }
  });

  // Calculate average duration
  if (metrics.totalCalls > 0) {
    metrics.averageDuration = metrics.totalDuration / metrics.totalCalls;
  }

  console.log(`[ElevenLabs] Final metrics:`, metrics);
  return metrics;
}

/**
 * Fetch all history data with pagination
 * @param {string} apiKey - ElevenLabs API key
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - All history records
 */
export async function fetchAllElevenLabsHistory(apiKey, options = {}) {
  const allRecords = [];
  let pageToken = null;

  do {
    const response = await fetchElevenLabsHistory(apiKey, {
      ...options,
      pageToken,
    });

    if (response.history && response.history.length > 0) {
      allRecords.push(...response.history);
    }

    pageToken = response.next_page_token;
  } while (pageToken);

  return allRecords;
}

/**
 * Get monthly metrics for an agent from ElevenLabs
 * @param {string} apiKey - ElevenLabs API key
 * @param {string} agentId - Agent ID
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} - Monthly metrics
 */
export async function getMonthlyAgentMetrics(apiKey, agentId, year, month) {
  console.log(`[ElevenLabs] Getting metrics for agent ${agentId} in ${year}-${month}`);

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  console.log(`[ElevenLabs] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

  const historyData = await fetchAllElevenLabsHistory(apiKey, {
    startDate,
    endDate,
  });

  console.log(`[ElevenLabs] Fetched ${historyData.length} total records for the month`);

  // For now, if we can't filter by agent, return all metrics
  // TODO: Implement proper agent matching logic
  if (historyData.length === 0) {
    console.log(`[ElevenLabs] No records found for ${year}-${month}`);
    return {
      totalCalls: 0,
      inboundCalls: 0,
      outboundCalls: 0,
      totalDuration: 0,
      averageDuration: 0,
      successfulCalls: 0,
      failedCalls: 0,
    };
  }

  // Try to filter by agent ID first
  const agentMetrics = aggregateElevenLabsMetrics(historyData, agentId);

  // If no records found for this agent, it might be that agent IDs don't match
  // In that case, we could distribute calls evenly or based on some other logic
  if (agentMetrics.totalCalls === 0) {
    console.log(`[ElevenLabs] No records found for agent ${agentId}, checking if agent IDs match...`);

    // Check what agent IDs are in the data
    const uniqueAgentIds = [...new Set(historyData.map(call =>
      call.agent_id || call.agentId || call.conversation_id || call.id
    ).filter(id => id))];

    console.log(`[ElevenLabs] Found agent IDs in data:`, uniqueAgentIds);
    console.log(`[ElevenLabs] Our agent ID: ${agentId}`);

    // If our agent ID doesn't match any in the data, we might need to distribute calls
    // For now, return empty metrics
  }

  return agentMetrics;
}
