// utils/agentManager.js
/**
 * Utility functions for managing multiple agents per client
 * Provides backwards-compatible multi-agent support
 */

import Client from "../client.js";

/**
 * Add an additional agent to a client
 * @param {string} clientId - Client ID
 * @param {Object} agentData - Agent data object
 * @returns {Promise<Object>} - Updated client or error
 */
export async function addAdditionalAgent(clientId, agentData) {
  try {
    const {
      agentId,
      twilioPhoneNumber,
      agentName,
      agentType,
      meetingTitle,
      meetingLocation,
      inboundEnabled,
      outboundEnabled,
    } = agentData;

    // Validate required fields
    if (!agentId || !twilioPhoneNumber) {
      throw new Error("agentId and twilioPhoneNumber are required");
    }

    // Check if client exists
    const client = await Client.findOne({ clientId, status: "Active" });
    if (!client) {
      throw new Error("Client not found or inactive");
    }

    // Check if agent ID already exists (primary or additional)
    if (client.agentId === agentId) {
      throw new Error("Agent ID already exists as primary agent");
    }

    const existingAgent = client.additionalAgents?.find(
      (agent) => agent.agentId === agentId
    );
    if (existingAgent) {
      throw new Error("Agent ID already exists in additional agents");
    }

    // Check if Twilio phone number already exists (primary or additional)
    if (client.twilioPhoneNumber === twilioPhoneNumber) {
      throw new Error("Twilio phone number already exists as primary number");
    }

    const existingPhone = client.additionalAgents?.find(
      (agent) => agent.twilioPhoneNumber === twilioPhoneNumber
    );
    if (existingPhone) {
      throw new Error(
        "Twilio phone number already exists in additional agents"
      );
    }

    // Create new agent object
    const newAgent = {
      agentId,
      twilioPhoneNumber,
      agentName: agentName || `Agent ${agentId}`,
      agentType: agentType || "both",
      meetingTitle: meetingTitle || "Consultation",
      meetingLocation: meetingLocation || "Google Meet",
      isEnabled: true,
      inboundEnabled: inboundEnabled !== undefined ? inboundEnabled : true,
      outboundEnabled: outboundEnabled !== undefined ? outboundEnabled : true,
    };

    // Add agent to client
    const updatedClient = await Client.findOneAndUpdate(
      { clientId },
      { $push: { additionalAgents: newAgent } },
      { new: true, runValidators: true }
    );

    return {
      success: true,
      message: "Additional agent added successfully",
      client: updatedClient,
      newAgent,
    };
  } catch (error) {
    console.error("Error adding additional agent:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Update an additional agent
 * @param {string} clientId - Client ID
 * @param {string} agentId - Agent ID to update
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} - Updated client or error
 */
export async function updateAdditionalAgent(clientId, agentId, updateData) {
  try {
    const client = await Client.findOne({ clientId, status: "Active" });
    if (!client) {
      throw new Error("Client not found or inactive");
    }

    // Check if it's the primary agent
    if (client.agentId === agentId) {
      throw new Error(
        "Cannot update primary agent using this function. Use regular client update instead."
      );
    }

    // Find the additional agent
    const agentIndex = client.additionalAgents?.findIndex(
      (agent) => agent.agentId === agentId
    );
    if (agentIndex === -1 || agentIndex === undefined) {
      throw new Error("Additional agent not found");
    }

    // Validate Twilio phone number uniqueness if being updated
    if (updateData.twilioPhoneNumber) {
      if (client.twilioPhoneNumber === updateData.twilioPhoneNumber) {
        throw new Error("Twilio phone number conflicts with primary number");
      }

      const conflictingAgent = client.additionalAgents.find(
        (agent, index) =>
          agent.twilioPhoneNumber === updateData.twilioPhoneNumber &&
          index !== agentIndex
      );
      if (conflictingAgent) {
        throw new Error(
          "Twilio phone number conflicts with another additional agent"
        );
      }
    }

    // Create update object with dot notation
    const updateObj = {};
    Object.keys(updateData).forEach((key) => {
      updateObj[`additionalAgents.${agentIndex}.${key}`] = updateData[key];
    });

    const updatedClient = await Client.findOneAndUpdate(
      { clientId },
      { $set: updateObj },
      { new: true, runValidators: true }
    );

    return {
      success: true,
      message: "Additional agent updated successfully",
      client: updatedClient,
      updatedAgent: updatedClient.additionalAgents[agentIndex],
    };
  } catch (error) {
    console.error("Error updating additional agent:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Remove an additional agent
 * @param {string} clientId - Client ID
 * @param {string} agentId - Agent ID to remove
 * @returns {Promise<Object>} - Updated client or error
 */
export async function removeAdditionalAgent(clientId, agentId) {
  try {
    const client = await Client.findOne({ clientId, status: "Active" });
    if (!client) {
      throw new Error("Client not found or inactive");
    }

    // Check if it's the primary agent
    if (client.agentId === agentId) {
      throw new Error("Cannot remove primary agent using this function");
    }

    // Remove the additional agent
    const updatedClient = await Client.findOneAndUpdate(
      { clientId },
      { $pull: { additionalAgents: { agentId } } },
      { new: true }
    );

    const removedAgent = client.additionalAgents?.find(
      (agent) => agent.agentId === agentId
    );

    return {
      success: true,
      message: "Additional agent removed successfully",
      client: updatedClient,
      removedAgent,
    };
  } catch (error) {
    console.error("Error removing additional agent:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get all agents for a client (primary + additional)
 * @param {string} clientId - Client ID
 * @returns {Promise<Object>} - All agents or error
 */
export async function getAllAgentsForClient(clientId) {
  try {
    const client = await Client.findOne({ clientId, status: "Active" });
    if (!client) {
      throw new Error("Client not found or inactive");
    }

    const allAgents = client.getAllAgents();

    return {
      success: true,
      clientId,
      totalAgents: allAgents.length,
      agents: allAgents,
    };
  } catch (error) {
    console.error("Error getting agents for client:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Find client by any agent's phone number or ID
 * @param {Object} searchParams - Search parameters
 * @returns {Promise<Object>} - Client and matched agent or error
 */
export async function findClientByAnyAgent(searchParams) {
  try {
    const { twilioPhone, agentId } = searchParams;

    let client = null;
    let foundBy = null;

    if (twilioPhone) {
      // Check primary phone first
      client = await Client.findOne({
        twilioPhoneNumber: twilioPhone,
        status: "Active",
      });
      if (client) {
        foundBy = "primaryPhone";
      } else {
        // Check additional agents
        client = await Client.findOne({
          "additionalAgents.twilioPhoneNumber": twilioPhone,
          status: "Active",
        });
        if (client) foundBy = "additionalPhone";
      }
    }

    if (!client && agentId) {
      // Check primary agent ID
      client = await Client.findOne({ agentId, status: "Active" });
      if (client) {
        foundBy = "primaryAgent";
      } else {
        // Check additional agents
        client = await Client.findOne({
          "additionalAgents.agentId": agentId,
          status: "Active",
        });
        if (client) foundBy = "additionalAgent";
      }
    }

    if (!client) {
      return {
        success: false,
        error: "Client not found",
      };
    }

    // Find the matched agent
    let matchedAgent = null;
    if (twilioPhone) {
      matchedAgent = client.findAgentByPhone(twilioPhone);
    } else if (agentId) {
      matchedAgent = client.findAgentById(agentId);
    }

    return {
      success: true,
      client,
      matchedAgent,
      foundBy,
      allAgents: client.getAllAgents(),
    };
  } catch (error) {
    console.error("Error finding client by agent:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Increment call metrics for an agent
 * @param {string} clientId - Client ID
 * @param {string} agentId - Agent ID
 * @param {Object} callData - Call data
 * @param {string} callData.direction - 'inbound' or 'outbound'
 * @param {number} callData.duration - Call duration in seconds
 * @param {boolean} callData.wasSuccessful - Whether the call was successful
 * @returns {Promise<Object>} - Update result
 */
export async function incrementAgentCallMetrics(clientId, agentId, callData) {
  try {
    const { direction, duration = 0, wasSuccessful = false } = callData;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // JavaScript months are 0-indexed
    const period = `${year}-${month.toString().padStart(2, "0")}`;

    // Find the client
    const client = await Client.findOne({ clientId, status: "Active" });
    if (!client) {
      throw new Error("Client not found or inactive");
    }

    // Check if agent exists for this client
    const agent = client.getAllAgents().find((a) => a.agentId === agentId);
    if (!agent) {
      throw new Error("Agent not found for this client");
    }

    // Find existing metrics for this period and agent
    let existingMetricsIndex = client.metricsHistory.findIndex(
      (m) =>
        m.agentId === agentId && m.period === period && m.source === "internal"
    );

    if (existingMetricsIndex === -1) {
      // Create new metrics entry
      const newMetrics = {
        agentId,
        period,
        metrics: {
          agentId,
          year,
          month,
          inboundCalls: direction === "inbound" ? 1 : 0,
          outboundCalls: direction === "outbound" ? 1 : 0,
          totalCalls: 1,
          successfulBookings: 0,
          totalDuration: duration,
          averageDuration: duration,
          lastUpdated: now,
        },
        source: "internal",
        createdAt: now,
      };

      await Client.findOneAndUpdate(
        { clientId },
        { $push: { metricsHistory: newMetrics } }
      );
    } else {
      // Update existing metrics
      const updatePath = `metricsHistory.${existingMetricsIndex}.metrics`;

      const updateObj = {
        $inc: {
          [`${updatePath}.totalCalls`]: 1,
          [`${updatePath}.totalDuration`]: duration,
        },
        $set: {
          [`${updatePath}.lastUpdated`]: now,
        },
      };

      if (direction === "inbound") {
        updateObj.$inc[`${updatePath}.inboundCalls`] = 1;
      } else {
        updateObj.$inc[`${updatePath}.outboundCalls`] = 1;
      }

      await Client.findOneAndUpdate({ clientId }, updateObj);

      // Recalculate average duration
      const updatedClient = await Client.findOne({ clientId });
      const metrics =
        updatedClient.metricsHistory[existingMetricsIndex].metrics;
      if (metrics.totalCalls > 0) {
        metrics.averageDuration = metrics.totalDuration / metrics.totalCalls;
        await Client.findOneAndUpdate(
          { clientId },
          {
            $set: {
              [`${updatePath}.averageDuration`]: metrics.averageDuration,
            },
          }
        );
      }
    }

    return {
      success: true,
      message: "Call metrics updated successfully",
      agentId,
      period,
      direction,
      duration,
    };
  } catch (error) {
    console.error("Error incrementing agent call metrics:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Increment booking metrics for an agent
 * @param {string} clientId - Client ID
 * @param {string} agentId - Agent ID
 * @returns {Promise<Object>} - Update result
 */
export async function incrementAgentBookingMetrics(clientId, agentId) {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const period = `${year}-${month.toString().padStart(2, "0")}`;

    // Find the client
    const client = await Client.findOne({ clientId, status: "Active" });
    if (!client) {
      throw new Error("Client not found or inactive");
    }

    // Check if agent exists for this client
    const agent = client.getAllAgents().find((a) => a.agentId === agentId);
    if (!agent) {
      throw new Error("Agent not found for this client");
    }

    // Find existing metrics for this period and agent
    let existingMetricsIndex = client.metricsHistory.findIndex(
      (m) =>
        m.agentId === agentId && m.period === period && m.source === "internal"
    );

    if (existingMetricsIndex === -1) {
      // Create new metrics entry
      const newMetrics = {
        agentId,
        period,
        metrics: {
          agentId,
          year,
          month,
          inboundCalls: 0,
          outboundCalls: 0,
          totalCalls: 0,
          successfulBookings: 1,
          totalDuration: 0,
          averageDuration: 0,
          lastUpdated: now,
        },
        source: "internal",
        createdAt: now,
      };

      await Client.findOneAndUpdate(
        { clientId },
        { $push: { metricsHistory: newMetrics } }
      );
    } else {
      // Update existing metrics
      const updatePath = `metricsHistory.${existingMetricsIndex}.metrics`;

      await Client.findOneAndUpdate(
        { clientId },
        {
          $inc: { [`${updatePath}.successfulBookings`]: 1 },
          $set: { [`${updatePath}.lastUpdated`]: now },
        }
      );
    }

    return {
      success: true,
      message: "Booking metrics updated successfully",
      agentId,
      period,
    };
  } catch (error) {
    console.error("Error incrementing agent booking metrics:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get agent metrics for a specific period
 * @param {string} clientId - Client ID
 * @param {string} agentId - Agent ID
 * @param {string} period - Period in format "YYYY-MM"
 * @returns {Promise<Object>} - Metrics data
 */
export async function getAgentMetrics(clientId, agentId, period = null) {
  try {
    const client = await Client.findOne({ clientId, status: "Active" });
    if (!client) {
      throw new Error("Client not found or inactive");
    }

    let metrics = [];

    if (period) {
      // Get metrics for specific period
      metrics = client.metricsHistory.filter(
        (m) => m.agentId === agentId && m.period === period
      );
    } else {
      // Get all metrics for agent
      metrics = client.metricsHistory.filter((m) => m.agentId === agentId);
    }

    // Sort by period descending (most recent first)
    metrics.sort((a, b) => b.period.localeCompare(a.period));

    return {
      success: true,
      agentId,
      clientId,
      period: period || "all",
      metricsCount: metrics.length,
      metrics,
    };
  } catch (error) {
    console.error("Error getting agent metrics:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get all agent metrics for a client
 * @param {string} clientId - Client ID
 * @param {string} period - Optional period filter
 * @returns {Promise<Object>} - All agent metrics
 */
export async function getAllAgentMetrics(clientId, period = null) {
  try {
    const client = await Client.findOne({ clientId, status: "Active" });
    if (!client) {
      throw new Error("Client not found or inactive");
    }

    let metrics = [];

    if (period) {
      metrics = client.metricsHistory.filter((m) => m.period === period);
    } else {
      metrics = client.metricsHistory;
    }

    // Group by agent
    const metricsByAgent = {};
    metrics.forEach((m) => {
      if (!metricsByAgent[m.agentId]) {
        metricsByAgent[m.agentId] = [];
      }
      metricsByAgent[m.agentId].push(m);
    });

    // Sort each agent's metrics by period
    Object.keys(metricsByAgent).forEach((agentId) => {
      metricsByAgent[agentId].sort((a, b) => b.period.localeCompare(a.period));
    });

    return {
      success: true,
      clientId,
      period: period || "all",
      totalMetrics: metrics.length,
      agentsCount: Object.keys(metricsByAgent).length,
      metricsByAgent,
    };
  } catch (error) {
    console.error("Error getting all agent metrics:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}
