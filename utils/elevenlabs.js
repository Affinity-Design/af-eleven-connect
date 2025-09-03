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
      throw new Error(
        `ElevenLabs API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
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
  const metrics = {
    totalCalls: 0,
    inboundCalls: 0,
    outboundCalls: 0,
    totalDuration: 0,
    averageDuration: 0,
    successfulCalls: 0,
    failedCalls: 0,
  };

  historyData.forEach((call) => {
    // Filter by agent if specified
    if (agentId && call.agent_id !== agentId) {
      return;
    }

    metrics.totalCalls++;

    // Determine call direction (this might need adjustment based on actual API response)
    if (call.direction === "inbound" || call.call_type === "inbound") {
      metrics.inboundCalls++;
    } else {
      metrics.outboundCalls++;
    }

    // Duration
    if (call.duration) {
      metrics.totalDuration += call.duration;
    }

    // Success/failure (adjust based on actual API response structure)
    if (call.status === "completed" || call.success) {
      metrics.successfulCalls++;
    } else {
      metrics.failedCalls++;
    }
  });

  // Calculate average duration
  if (metrics.totalCalls > 0) {
    metrics.averageDuration = metrics.totalDuration / metrics.totalCalls;
  }

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
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const historyData = await fetchAllElevenLabsHistory(apiKey, {
    startDate,
    endDate,
  });

  return aggregateElevenLabsMetrics(historyData, agentId);
}
