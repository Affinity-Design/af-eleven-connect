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

    // Try multiple endpoints to find actual call/conversation data
    const endpoints = [
      {
        url: `https://api.elevenlabs.io/v1/convai/conversations?${params.toString()}`,
        name: "convai conversations",
      },
      {
        url: `https://api.elevenlabs.io/v1/conversation-history?${params.toString()}`,
        name: "conversation history",
      },
      {
        url: `https://api.elevenlabs.io/v1/convai/agents/conversations?${params.toString()}`,
        name: "agent conversations",
      },
      {
        url: `https://api.elevenlabs.io/v1/call-logs?${params.toString()}`,
        name: "call logs",
      },
      {
        url: `https://api.elevenlabs.io/v1/calls?${params.toString()}`,
        name: "calls",
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
      // If no conversation endpoints work, log the issue and return empty result
      console.warn(
        `[ElevenLabs] No conversation/call endpoints available. This suggests:`
      );
      console.warn(
        `[ElevenLabs] 1. Account may not have conversational AI features enabled`
      );
      console.warn(
        `[ElevenLabs] 2. API key may not have conversation permissions`
      );
      console.warn(
        `[ElevenLabs] 3. No actual calls/conversations in this date range`
      );

      // Return empty structure to avoid breaking the sync
      return {
        history: [],
        conversations: [],
        next_page_token: null,
      };
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

/**
 * NEW METRICS FUNCTIONS FOR AGENT REPORTING
 */

/**
 * Iterate through all conversations for an agent with pagination
 * @param {string} agentId - The ElevenLabs agent ID
 * @param {string} apiKey - The ElevenLabs API key
 * @returns {AsyncGenerator} - Async generator yielding conversations
 */
export async function* iterateConversations(agentId, apiKey) {
  let cursor;

  do {
    try {
      const url = new URL("https://api.elevenlabs.io/v1/convai/conversations");
      url.searchParams.set("agent_id", agentId);
      if (cursor) url.searchParams.set("cursor", cursor);

      const response = await fetch(url, {
        headers: { "xi-api-key": apiKey },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Yield each conversation
      for (const conversation of data.conversations || []) {
        yield conversation;
      }

      cursor = data.next_cursor || null;
    } catch (error) {
      console.error("Error fetching conversations from ElevenLabs:", error);
      throw error;
    }
  } while (cursor);
}

/**
 * Convert Unix timestamp to month key
 * @param {number} unixSecs - Unix timestamp in seconds
 * @returns {string} - Month key in "YYYY-MM" format
 */
export function monthKey(unixSecs) {
  const date = new Date(unixSecs * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

/**
 * Fetch and calculate monthly metrics from ElevenLabs for a specific agent
 * @param {string} agentId - The ElevenLabs agent ID
 * @param {string} apiKey - The ElevenLabs API key
 * @param {string} targetPeriod - Target period in "YYYY-MM" format (optional)
 * @returns {Promise<Object>} - Monthly metrics grouped by period
 */
export async function getMonthlyMetricsFromElevenLabs(
  agentId,
  apiKey,
  targetPeriod = null
) {
  try {
    const byMonth = {};

    for await (const conversation of iterateConversations(agentId, apiKey)) {
      const period = monthKey(conversation.start_time_unix_secs);

      // If target period is specified, only process that period
      if (targetPeriod && period !== targetPeriod) {
        continue;
      }

      // Initialize month data if not exists
      if (!byMonth[period]) {
        byMonth[period] = {
          period,
          agentId,
          totalCalls: 0,
          totalMinutes: 0,
          averageDuration: 0,
          successfulCalls: 0,
          failedCalls: 0,
          unknownStatusCalls: 0,
          successRate: 0,
          conversations: [],
        };
      }

      const monthData = byMonth[period];
      monthData.totalCalls += 1;
      monthData.totalMinutes += (conversation.call_duration_secs || 0) / 60;

      // Track call success status
      const callStatus = (
        conversation.call_successful || "unknown"
      ).toLowerCase();
      switch (callStatus) {
        case "success":
          monthData.successfulCalls += 1;
          break;
        case "failure":
          monthData.failedCalls += 1;
          break;
        default:
          monthData.unknownStatusCalls += 1;
          break;
      }

      // Store conversation for potential correlation
      monthData.conversations.push({
        id: conversation.conversation_id,
        startTime: conversation.start_time_unix_secs,
        duration: conversation.call_duration_secs || 0,
        status: callStatus,
        phone: conversation.phone_number || null,
      });
    }

    // Calculate derived metrics for each month
    Object.keys(byMonth).forEach((period) => {
      const month = byMonth[period];

      // Calculate average duration
      if (month.totalCalls > 0) {
        month.averageDuration = Math.round(
          (month.totalMinutes * 60) / month.totalCalls
        );
      }

      // Calculate success rate
      if (month.totalCalls > 0) {
        month.successRate = Math.round(
          (month.successfulCalls / month.totalCalls) * 100
        );
      }
    });

    return byMonth;
  } catch (error) {
    console.error("Error getting monthly metrics from ElevenLabs:", error);
    throw error;
  }
}

/**
 * Sync ElevenLabs metrics to database for a specific agent and period
 * @param {string} clientId - The client ID
 * @param {string} agentId - The agent ID
 * @param {number} year - The year
 * @param {number} month - The month (1-12)
 * @param {string} apiKey - The ElevenLabs API key
 * @returns {Promise<Object>} - Sync result
 */
export async function syncElevenLabsMetrics(
  clientId,
  agentId,
  year,
  month,
  apiKey
) {
  try {
    const { findClientById } = await import("../crud.js");
    const Client = (await import("../client.js")).default;

    const client = await findClientById(clientId);
    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    const targetPeriod = `${year}-${String(month).padStart(2, "0")}`;
    const elevenLabsData = await getMonthlyMetricsFromElevenLabs(
      agentId,
      apiKey,
      targetPeriod
    );

    if (!elevenLabsData[targetPeriod]) {
      return {
        success: true,
        message: `No ElevenLabs data found for agent ${agentId} in period ${targetPeriod}`,
        period: targetPeriod,
        agentId,
        metrics: null,
      };
    }

    const elevenLabsMetrics = elevenLabsData[targetPeriod];

    // Get existing metrics or create new ones
    let existingMetrics = client.getAgentMetrics(agentId, year, month);

    // Prepare updates with ElevenLabs data
    const updates = {
      callsFromElevenlabs: elevenLabsMetrics.totalCalls,
      elevenlabsSuccessRate: elevenLabsMetrics.successRate,
      lastUpdated: new Date(),
    };

    // If no existing internal metrics, use ElevenLabs data as base
    if (!existingMetrics) {
      updates.agentId = agentId;
      updates.year = year;
      updates.month = month;
      updates.totalCalls = elevenLabsMetrics.totalCalls;
      updates.totalDuration = Math.round(elevenLabsMetrics.totalMinutes * 60);
      updates.averageDuration = elevenLabsMetrics.averageDuration;
      // Don't set inbound/outbound counts from ElevenLabs since we can't determine direction
      updates.inboundCalls = 0;
      updates.outboundCalls = 0;
      updates.successfulBookings = 0; // This needs to be determined from appointments
    }

    // Update client metrics
    client.updateAgentMetrics(agentId, year, month, updates);

    // Mark the metrics entry as ElevenLabs sourced
    const metricsEntry = client.getAgentMetrics(agentId, year, month);
    if (metricsEntry) {
      metricsEntry.source = existingMetrics ? "combined" : "elevenlabs";
    }

    await client.save();

    return {
      success: true,
      message: `ElevenLabs metrics synced for agent ${agentId} in period ${targetPeriod}`,
      period: targetPeriod,
      agentId,
      metrics: client.getAgentMetrics(agentId, year, month)?.metrics,
      elevenLabsData: {
        totalCalls: elevenLabsMetrics.totalCalls,
        totalMinutes: elevenLabsMetrics.totalMinutes,
        averageDuration: elevenLabsMetrics.averageDuration,
        successRate: elevenLabsMetrics.successRate,
        conversationCount: elevenLabsMetrics.conversations.length,
      },
    };
  } catch (error) {
    console.error("Error syncing ElevenLabs metrics:", error);
    return {
      success: false,
      error: error.message,
      period: `${year}-${String(month).padStart(2, "0")}`,
      agentId,
    };
  }
}

/**
 * Sync ElevenLabs metrics for a client and specific period (client-level function)
 * This function finds the primary agent and syncs their ElevenLabs data
 * @param {string} clientId - The client ID
 * @param {number} year - The year
 * @param {number} month - The month (1-12)
 * @returns {Promise<Object>} - Sync result
 */
export async function syncElevenLabsMetricsForClient(clientId, year, month) {
  try {
    const { findClientById } = await import("../crud.js");

    const client = await findClientById(clientId);
    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    // Get the primary agent's ElevenLabs agent ID
    const agents = client.getAllAgents();
    const primaryAgent = agents.find((agent) => agent.isPrimary);

    if (!primaryAgent || !primaryAgent.elevenLabsAgentId) {
      return {
        success: false,
        error: "No primary agent with ElevenLabs agent ID found",
        period: `${year}-${String(month).padStart(2, "0")}`,
        clientId,
      };
    }

    // Use environment API key
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: "ElevenLabs API key not configured",
        period: `${year}-${String(month).padStart(2, "0")}`,
        clientId,
      };
    }

    console.log(
      `[ElevenLabs-Client-Sync] Syncing metrics for client ${clientId}, agent ${primaryAgent.elevenLabsAgentId}, period ${year}-${month}`
    );

    // Call the existing agent-specific function
    return await syncElevenLabsMetrics(
      clientId,
      primaryAgent.elevenLabsAgentId,
      year,
      month,
      apiKey
    );
  } catch (error) {
    console.error("[ElevenLabs-Client-Sync] Error syncing metrics:", error);
    return {
      success: false,
      error: error.message,
      period: `${year}-${String(month).padStart(2, "0")}`,
      clientId,
    };
  }
}
