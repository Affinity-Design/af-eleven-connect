// utils/metrics.js
/**
 * Utility functions for managing agent metrics
 */

import Client from "../client.js";

/**
 * Update call metrics for an agent
 * @param {string} clientId - The client ID
 * @param {string} agentId - The agent ID
 * @param {string} direction - Call direction ("inbound" or "outbound")
 * @param {number} duration - Call duration in seconds
 * @param {boolean} isBookingSuccessful - Whether a booking was made
 * @returns {Promise<boolean>} - Success status
 */
export async function updateCallMetrics(
  clientId,
  agentId,
  direction,
  duration = 0,
  isBookingSuccessful = false
) {
  try {
    const client = await Client.findOne({ clientId });
    if (!client) {
      console.error(`Client not found: ${clientId}`);
      return false;
    }

    // Update metrics using the helper method
    client.incrementCallMetrics(
      agentId,
      direction,
      duration,
      isBookingSuccessful
    );

    await client.save();
    console.log(
      `Metrics updated for agent ${agentId}, direction: ${direction}, booking: ${isBookingSuccessful}`
    );
    return true;
  } catch (error) {
    console.error("Error updating call metrics:", error);
    return false;
  }
}

/**
 * Get agent metrics for a specific period
 * @param {string} clientId - The client ID
 * @param {string} agentId - The agent ID
 * @param {number} year - The year
 * @param {number} month - The month (1-12)
 * @returns {Promise<Object|null>} - Metrics object or null
 */
export async function getAgentMetrics(clientId, agentId, year, month) {
  try {
    const client = await Client.findOne({ clientId });
    if (!client) {
      console.error(`Client not found: ${clientId}`);
      return null;
    }

    return client.getAgentMetrics(agentId, year, month);
  } catch (error) {
    console.error("Error getting agent metrics:", error);
    return null;
  }
}

/**
 * Get all metrics for all agents of a client for a specific period
 * @param {string} clientId - The client ID
 * @param {number} year - The year
 * @param {number} month - The month (1-12)
 * @returns {Promise<Array>} - Array of metrics objects
 */
export async function getAllAgentMetrics(clientId, year, month) {
  try {
    const client = await Client.findOne({ clientId });
    if (!client) {
      console.error(`Client not found: ${clientId}`);
      return [];
    }

    const period = `${year}-${String(month).padStart(2, "0")}`;
    const allAgents = client.getAllAgents();
    const metrics = [];

    for (const agent of allAgents) {
      const agentMetrics = client.getAgentMetrics(agent.agentId, year, month);

      if (agentMetrics) {
        metrics.push({
          agentId: agent.agentId,
          agentName: agent.agentName,
          twilioPhoneNumber: agent.twilioPhoneNumber,
          isPrimary: agent.isPrimary,
          metrics: agentMetrics.metrics,
        });
      } else {
        // Return empty metrics for agents with no data
        metrics.push({
          agentId: agent.agentId,
          agentName: agent.agentName,
          twilioPhoneNumber: agent.twilioPhoneNumber,
          isPrimary: agent.isPrimary,
          metrics: {
            agentId: agent.agentId,
            year,
            month,
            inboundCalls: 0,
            outboundCalls: 0,
            totalCalls: 0,
            successfulBookings: 0,
            totalDuration: 0,
            averageDuration: 0,
            callsFromElevenlabs: 0,
            elevenlabsSuccessRate: 0,
            lastUpdated: new Date(),
          },
        });
      }
    }

    return metrics;
  } catch (error) {
    console.error("Error getting all agent metrics:", error);
    return [];
  }
}

/**
 * Get metrics comparison between two periods
 * @param {string} clientId - The client ID
 * @param {string} agentId - The agent ID
 * @param {string} startPeriod - Start period in "YYYY-MM" format
 * @param {string} endPeriod - End period in "YYYY-MM" format
 * @returns {Promise<Object>} - Comparison object
 */
export async function getMetricsComparison(
  clientId,
  agentId,
  startPeriod,
  endPeriod
) {
  try {
    const client = await Client.findOne({ clientId });
    if (!client) {
      console.error(`Client not found: ${clientId}`);
      return null;
    }

    const startMetrics = client.metricsHistory?.find(
      (m) => m.agentId === agentId && m.period === startPeriod
    );
    const endMetrics = client.metricsHistory?.find(
      (m) => m.agentId === agentId && m.period === endPeriod
    );

    const getMetricsOrDefault = (metrics) =>
      metrics
        ? metrics.metrics
        : {
            inboundCalls: 0,
            outboundCalls: 0,
            totalCalls: 0,
            successfulBookings: 0,
            totalDuration: 0,
            averageDuration: 0,
            callsFromElevenlabs: 0,
            elevenlabsSuccessRate: 0,
          };

    const start = getMetricsOrDefault(startMetrics);
    const end = getMetricsOrDefault(endMetrics);

    const calculateChange = (startVal, endVal) => {
      if (startVal === 0) return endVal > 0 ? 100 : 0;
      return Math.round(((endVal - startVal) / startVal) * 100);
    };

    return {
      agentId,
      startPeriod,
      endPeriod,
      startMetrics: start,
      endMetrics: end,
      changes: {
        inboundCalls: calculateChange(start.inboundCalls, end.inboundCalls),
        outboundCalls: calculateChange(start.outboundCalls, end.outboundCalls),
        totalCalls: calculateChange(start.totalCalls, end.totalCalls),
        successfulBookings: calculateChange(
          start.successfulBookings,
          end.successfulBookings
        ),
        averageDuration: calculateChange(
          start.averageDuration,
          end.averageDuration
        ),
        elevenlabsSuccessRate: calculateChange(
          start.elevenlabsSuccessRate,
          end.elevenlabsSuccessRate
        ),
      },
    };
  } catch (error) {
    console.error("Error getting metrics comparison:", error);
    return null;
  }
}

/**
 * Calculate current month metrics from call history
 * Useful for recalculating metrics from existing data
 * @param {string} clientId - The client ID
 * @param {string} agentId - The agent ID
 * @param {number} year - The year
 * @param {number} month - The month (1-12)
 * @returns {Promise<Object>} - Calculated metrics
 */
export async function recalculateMetricsFromHistory(
  clientId,
  agentId,
  year,
  month
) {
  try {
    const client = await Client.findOne({ clientId });
    if (!client) {
      console.error(`Client not found: ${clientId}`);
      return null;
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const relevantCalls =
      client.callHistory?.filter((call) => {
        return (
          call.callData.agentId === agentId &&
          call.callData.startTime >= startDate &&
          call.callData.startTime <= endDate
        );
      }) || [];

    const metrics = {
      agentId,
      year,
      month,
      inboundCalls: 0,
      outboundCalls: 0,
      totalCalls: 0,
      successfulBookings: 0,
      totalDuration: 0,
      averageDuration: 0,
      callsFromElevenlabs: 0,
      elevenlabsSuccessRate: 0,
    };

    for (const call of relevantCalls) {
      const callData = call.callData;

      metrics.totalCalls++;

      if (callData.direction === "inbound") {
        metrics.inboundCalls++;
      } else if (callData.direction === "outbound") {
        metrics.outboundCalls++;
      }

      if (callData.isBookingSuccessful) {
        metrics.successfulBookings++;
      }

      if (callData.duration) {
        metrics.totalDuration += callData.duration;
      }

      if (callData.elevenLabsConversationId) {
        metrics.callsFromElevenlabs++;
      }
    }

    if (metrics.totalCalls > 0) {
      metrics.averageDuration = Math.round(
        metrics.totalDuration / metrics.totalCalls
      );
    }

    if (metrics.callsFromElevenlabs > 0) {
      // Calculate success rate based on successful bookings vs total calls
      metrics.elevenlabsSuccessRate = Math.round(
        (metrics.successfulBookings / metrics.totalCalls) * 100
      );
    }

    // Update the client's metrics
    client.updateAgentMetrics(agentId, year, month, metrics);
    await client.save();

    return metrics;
  } catch (error) {
    console.error("Error recalculating metrics from history:", error);
    return null;
  }
}
