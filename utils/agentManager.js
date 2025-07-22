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
