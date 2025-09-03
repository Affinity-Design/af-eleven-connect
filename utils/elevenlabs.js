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

    // Try multiple endpoints to find conversation data
    const endpoints = [
      {
        url: `https://api.elevenlabs.io/v1/convai/conversation/history?${params.toString()}`,
        name: "conversation history",
      },
      {
        url: `https://api.elevenlabs.io/v1/convai/conversations?${params.toString()}`,
        name: "conversations",
      },
      {
        url: `https://api.elevenlabs.io/v1/history?${params.toString()}`,
        name: "general history",
      },
    ];

    let response = null;
    let endpointUsed = null;

    for (const endpoint of endpoints) {
      console.log(
        `[ElevenLabs] Trying ${endpoint.name} endpoint: ${endpoint.url}`
      );

      try {
        response = await fetch(endpoint.url, {
          method: "GET",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          endpointUsed = endpoint.name;
          console.log(`[ElevenLabs] Success with ${endpoint.name} endpoint`);
          break;
        } else {
          console.log(
            `[ElevenLabs] ${endpoint.name} failed with status ${response.status}`
          );
        }
      } catch (error) {
        console.log(
          `[ElevenLabs] ${endpoint.name} failed with error:`,
          error.message
        );
      }
    }

    if (!response || !response.ok) {
      const errorText = response
        ? await response.text()
        : "No successful response";
      console.error(
        `[ElevenLabs] All endpoints failed. Last status: ${response?.status} ${response?.statusText}`,
        errorText
      );
      throw new Error(
        `ElevenLabs API error: All endpoints failed. Last: ${response?.status} ${response?.statusText}`
      );
    }

    if (!response || !response.ok) {
      const errorText = response
        ? await response.text()
        : "No successful response";
      console.error(
        `[ElevenLabs] All endpoints failed. Last status: ${response?.status} ${response?.statusText}`,
        errorText
      );
      throw new Error(
        `ElevenLabs API error: All endpoints failed. Last: ${response?.status} ${response?.statusText}`
      );
    }

    const data = await response.json();

    // Normalize the response structure to handle different endpoint formats
    let records = [];
    let nextPageToken = null;

    if (data.conversations) {
      records = data.conversations;
      nextPageToken = data.next_page_token || data.nextPageToken;
    } else if (data.history) {
      records = data.history;
      nextPageToken = data.next_page_token || data.nextPageToken;
    } else if (Array.isArray(data)) {
      records = data;
    } else {
      console.warn(
        `[ElevenLabs] Unexpected response structure from ${endpointUsed}:`,
        Object.keys(data)
      );
      records = [];
    }

    console.log(`[ElevenLabs] API Response from ${endpointUsed}:`, {
      totalRecords: records.length,
      hasNextPage: !!nextPageToken,
      dataKeys: Object.keys(data),
      sampleRecord: records[0] ? Object.keys(records[0]) : null,
      recordStructure: records[0] ? records[0] : null,
    });

    return {
      ...data,
      history: records, // Normalize to 'history' for backward compatibility
      conversations: records, // Keep original structure
      next_page_token: nextPageToken,
    };
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
    if (index < 5) {
      console.log(
        `[ElevenLabs] Sample record ${index + 1} structure:`,
        JSON.stringify(call, null, 2)
      );
    }

    // Skip invalid records
    if (!call || typeof call !== "object") {
      console.warn(
        `[ElevenLabs] Skipping invalid record at index ${index}:`,
        call
      );
      return;
    }

    // Count all valid records as calls
    metrics.totalCalls++;

    // Enhanced call direction detection
    let direction = null;

    // Check multiple possible direction fields
    const directionFields = [
      call.direction,
      call.call_direction,
      call.type,
      call.conversation_type,
      call.call_type,
      call.mode,
    ];

    for (const field of directionFields) {
      if (field) {
        direction = field.toString().toLowerCase();
        break;
      }
    }

    // Determine call direction with better logic
    if (direction) {
      if (
        direction.includes("inbound") ||
        direction.includes("incoming") ||
        direction.includes("in")
      ) {
        metrics.inboundCalls++;
      } else if (
        direction.includes("outbound") ||
        direction.includes("outgoing") ||
        direction.includes("out")
      ) {
        metrics.outboundCalls++;
      } else {
        // Default to outbound for unknown directions in conversational AI
        metrics.outboundCalls++;
      }
    } else {
      // No direction specified - check for other indicators
      const phoneFields = [call.phone, call.to, call.caller_id, call.recipient];
      const hasPhoneInfo = phoneFields.some(
        (field) => field && field.toString().startsWith("+")
      );

      if (hasPhoneInfo) {
        // If we have phone info, assume it's an outbound call (typical for AI agents)
        metrics.outboundCalls++;
      } else {
        // Default fallback
        metrics.outboundCalls++;
      }
    }

    // Enhanced duration calculation
    let duration = 0;
    const durationFields = [
      call.duration,
      call.call_duration,
      call.length,
      call.conversation_duration,
      call.duration_seconds,
      call.call_length,
    ];

    for (const field of durationFields) {
      if (field && !isNaN(field)) {
        duration = Number(field);
        break;
      }
    }

    if (duration > 0) {
      metrics.totalDuration += duration;
    }

    // Enhanced success/failure detection
    let isSuccessful = false;

    const statusFields = [
      call.status,
      call.call_status,
      call.state,
      call.conversation_status,
      call.completion_status,
    ];

    for (const field of statusFields) {
      if (field) {
        const status = field.toString().toLowerCase();
        if (
          status === "completed" ||
          status === "successful" ||
          status === "ended" ||
          status === "finished" ||
          status === "done" ||
          call.success === true
        ) {
          isSuccessful = true;
          break;
        } else if (
          status === "failed" ||
          status === "error" ||
          status === "cancelled" ||
          status === "timeout" ||
          call.success === false
        ) {
          isSuccessful = false;
          break;
        }
      }
    }

    // If no explicit status, use other indicators
    if (statusFields.every((field) => !field)) {
      // Check for content or duration as success indicators
      const hasContent =
        call.dialogue || call.transcript || call.content || call.messages;
      const hasReasonableDuration = duration > 10; // At least 10 seconds

      isSuccessful = hasContent || hasReasonableDuration;
    }

    if (isSuccessful) {
      metrics.successfulCalls++;
    } else {
      metrics.failedCalls++;
    }

    // Log details for first few calls
    if (index < 3) {
      console.log(`[ElevenLabs] Call ${index + 1} analysis:`, {
        direction: direction || "unknown",
        duration,
        isSuccessful,
        hasDialogue: !!(call.dialogue || call.transcript),
      });
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
    `[ElevenLabs] Getting metrics for agent ${
      agentId || "all"
    } in ${year}-${month}`
  );

  // Create proper date range for the month
  const startDate = new Date(year, month - 1, 1); // First day of the month
  const endDate = new Date(year, month, 0, 23, 59, 59, 999); // Last day of the month

  console.log(
    `[ElevenLabs] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`
  );

  // Additional logging for debugging August 2025
  if (year === 2025 && month === 8) {
    console.log(
      `[ElevenLabs] Special handling for August 2025 - checking date range carefully`
    );
    console.log(
      `[ElevenLabs] Start date Unix: ${Math.floor(startDate.getTime() / 1000)}`
    );
    console.log(
      `[ElevenLabs] End date Unix: ${Math.floor(endDate.getTime() / 1000)}`
    );
  }

  const historyData = await fetchAllElevenLabsHistory(apiKey, {
    startDate,
    endDate,
  });

  console.log(
    `[ElevenLabs] Fetched ${historyData.length} total records for ${year}-${month}`
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

  // For debugging August 2025, log some sample records
  if (year === 2025 && month === 8 && historyData.length > 0) {
    console.log(`[ElevenLabs] Sample records for August 2025:`);
    historyData.slice(0, 3).forEach((record, index) => {
      console.log(`Record ${index + 1}:`, {
        id: record.id,
        created_at: record.created_at,
        date_unix: record.date_unix,
        direction: record.direction || record.call_direction,
        duration: record.duration || record.call_duration,
      });
    });
  }

  // For now, return all metrics since we can't filter by agent
  // In a real implementation, you'd need to match conversations to agents
  // based on conversation metadata, timestamps, or other identifiers
  console.log(
    `[ElevenLabs] Returning metrics for all conversations (cannot filter by agent yet)`
  );
  return aggregateElevenLabsMetrics(historyData, agentId);
}
