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

    console.log(
      `[ElevenLabs] Fetching history with params:`,
      params.toString()
    );

    // Try the conversation history endpoint instead of general history
    const conversationUrl = `https://api.elevenlabs.io/v1/convai/conversation/history?${params.toString()}`;

    console.log(
      `[ElevenLabs] Trying conversation history endpoint: ${conversationUrl}`
    );

    let response = await fetch(conversationUrl, {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    // If conversation endpoint fails, try the general history endpoint
    if (!response.ok) {
      console.log(
        `[ElevenLabs] Conversation endpoint failed (${response.status}), trying general history endpoint`
      );
      const generalUrl = `https://api.elevenlabs.io/v1/history?${params.toString()}`;

      response = await fetch(generalUrl, {
        method: "GET",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
      });
    }

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
      totalRecords: data.history?.length || data.conversations?.length || 0,
      hasNextPage: !!data.next_page_token,
      dataKeys: Object.keys(data),
      sampleRecord:
        data.history?.[0] || data.conversations?.[0]
          ? Object.keys(data.history?.[0] || data.conversations?.[0])
          : null,
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
  console.log(
    `[ElevenLabs] Aggregating metrics for agent: ${agentId || "all"}`
  );
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
      console.log(
        `[ElevenLabs] Sample record structure:`,
        JSON.stringify(call, null, 2)
      );
    }

    // For now, since we can't match by agent ID, count all records
    // TODO: Implement proper agent matching based on conversation metadata
    metrics.totalCalls++;

    // Try to determine call direction from various fields
    const direction =
      call.direction ||
      call.call_direction ||
      call.type ||
      call.conversation_type;
    if (
      direction === "inbound" ||
      direction === "incoming" ||
      direction?.toLowerCase().includes("inbound")
    ) {
      metrics.inboundCalls++;
    } else {
      metrics.outboundCalls++;
    }

    // Duration from various possible fields
    const duration =
      call.duration ||
      call.call_duration ||
      call.length ||
      call.conversation_duration ||
      0;
    if (duration) {
      metrics.totalDuration += duration;
    }

    // Success/failure from various fields
    const status =
      call.status || call.call_status || call.state || call.conversation_status;
    if (
      status === "completed" ||
      status === "successful" ||
      status === "ended" ||
      call.success
    ) {
      metrics.successfulCalls++;
    } else if (status === "failed" || status === "error") {
      metrics.failedCalls++;
    } else {
      // Assume successful if we have duration or dialogue
      if (duration > 0 || call.dialogue || call.transcript) {
        metrics.successfulCalls++;
      } else {
        metrics.failedCalls++;
      }
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

    // Handle both response formats
    const records = response.history || response.conversations || [];
    if (records.length > 0) {
      allRecords.push(...records);
    }

    pageToken = response.next_page_token;
  } while (pageToken);

  console.log(`[ElevenLabs] Total records fetched: ${allRecords.length}`);
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
  console.log(
    `[ElevenLabs] Getting metrics for agent ${agentId} in ${year}-${month}`
  );

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  console.log(
    `[ElevenLabs] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`
  );

  const historyData = await fetchAllElevenLabsHistory(apiKey, {
    startDate,
    endDate,
  });

  console.log(
    `[ElevenLabs] Fetched ${historyData.length} total records for the month`
  );

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

  // For now, return all metrics since we can't filter by agent
  // In a real implementation, you'd need to match conversations to agents
  // based on conversation metadata, timestamps, or other identifiers
  console.log(
    `[ElevenLabs] Returning metrics for all conversations (cannot filter by agent yet)`
  );
  return aggregateElevenLabsMetrics(historyData, null);
}
