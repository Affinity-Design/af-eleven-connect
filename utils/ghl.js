import fetch from "node-fetch";
import Client from "../client.js";

/**
 * Checks if a token is expired or about to expire
 * @param {Date} tokenExpiresAt - Token expiration date
 * @param {number} [bufferTimeMS=300000] - Buffer time in milliseconds (default: 5 minutes)
 * @returns {boolean} - True if token is valid, false if expired or about to expire
 */
function isTokenValid(tokenExpiresAt, bufferTimeMS = 5 * 60 * 1000) {
  if (!tokenExpiresAt) return false;

  const now = new Date();
  const expiryDate = new Date(tokenExpiresAt);

  return expiryDate > new Date(now.getTime() + bufferTimeMS);
}

/**
 * Checks and refreshes a GHL access token if needed
 * @param {string} clientId - Client ID in our system
 * @returns {Promise<{accessToken: string, locationId: string}>} - Valid access token and location ID
 */
async function checkAndRefreshToken(clientId) {
  console.log(`[GHL] Starting token check for client: ${clientId}`);

  let client = await Client.findOne({ clientId });

  if (!client) {
    // Try alternative search patterns if direct clientId fails
    console.log(
      `[GHL] Client not found by clientId, trying alternative lookups...`
    );

    // Try finding by various fields that might match
    const alternativeClients = await Client.find({
      $or: [
        { clientId: clientId },
        { calId: clientId },
        { "clientMeta.email": clientId },
        { agentId: clientId },
      ],
    });

    if (alternativeClients.length > 0) {
      client = alternativeClients[0];
      console.log(
        `[GHL] Found client using alternative lookup: ${client.clientId}`
      );
    } else {
      console.error(`[GHL] No client found with ID: ${clientId}`);
      throw new Error(`Client not found: ${clientId}`);
    }
  }

  console.log(`[GHL] Found client: ${client.clientId}`);
  console.log(`[GHL] Client status: ${client.status}`);
  console.log(`[GHL] Has refresh token: ${!!client.refreshToken}`);
  console.log(`[GHL] Has access token: ${!!client.accessToken}`);
  console.log(`[GHL] Token expires at: ${client.tokenExpiresAt}`);
  console.log(`[GHL] Current time: ${new Date().toISOString()}`);

  if (!client.refreshToken) {
    console.error(
      `[GHL] No refresh token available for client: ${client.clientId}`
    );
    throw new Error(
      `No refresh token available for client: ${client.clientId}. Client may need to re-authorize with GHL.`
    );
  }

  // Check if token is expired or near expiry
  const isValid = isTokenValid(client.tokenExpiresAt);
  console.log(`[GHL] Token valid: ${isValid}`);

  if (!client.accessToken || !isValid) {
    console.log(
      `[GHL] Token expired or missing for client ${client.clientId}, refreshing...`
    );

    try {
      const newAccessToken = await refreshGhlToken(client.clientId);
      console.log(`[GHL] Token refresh successful`);

      // Reload client to get the updated token
      client = await Client.findOne({ clientId: client.clientId });

      if (!client.accessToken) {
        console.error(
          `[GHL] Failed to update access token for client ${client.clientId}`
        );
        throw new Error(
          "Token refresh failed: access token not updated in database"
        );
      }
    } catch (refreshError) {
      console.error(`[GHL] Token refresh failed:`, refreshError);
      throw new Error(`Token refresh failed: ${refreshError.message}`);
    }
  }

  console.log(
    `[GHL] Using access token for client ${
      client.clientId
    }: ${client.accessToken.substring(0, 20)}...`
  );

  return {
    accessToken: client.accessToken,
    locationId: client.clientId, // Using clientId as locationId
    clientData: client,
  };
}

/**
 * Refreshes a GHL access token using the refresh token
 * @param {string} clientId - Client ID in our system
 * @returns {Promise<string>} - New access token
 */
async function refreshGhlToken(clientId) {
  const client = await Client.findOne({ clientId });
  if (!client || !client.refreshToken) {
    throw new Error(
      `Client or refresh token not found for client: ${clientId}`
    );
  }

  try {
    console.log(`Refreshing GHL token for client ${clientId}`);

    const response = await fetch(
      "https://services.leadconnectorhq.com/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: client.refreshToken,
          client_id: process.env.GHL_CLIENT_ID,
          client_secret: process.env.GHL_CLIENT_SECRET,
          redirect_uri: process.env.GHL_REDIRECT_URI,
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error(`Token refresh failed for client ${clientId}:`, data);
      console.error(
        `Response status: ${response.status} ${response.statusText}`
      );
      throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
    }

    console.log(`Token refresh successful for client ${clientId}`);
    const { access_token, refresh_token, expires_in } = data;
    console.log(`New token expires in: ${expires_in} seconds`);
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Update the client document
    const updateData = {
      accessToken: access_token,
      tokenExpiresAt: expiresAt,
    };

    // Only update refresh token if a new one was provided
    if (refresh_token) {
      updateData.refreshToken = refresh_token;
    }

    const updatedClient = await Client.findOneAndUpdate(
      { clientId },
      { $set: updateData },
      { new: true }
    );

    if (!updatedClient) {
      throw new Error(`Failed to update client record for ${clientId}`);
    }

    console.log(`GHL token refreshed successfully for client ${clientId}`);
    return access_token;
  } catch (error) {
    console.error(`Error refreshing GHL token for client ${clientId}:`, error);
    throw error;
  }
}

/**
 * Makes an authenticated API call to the GHL API
 * @param {string} clientId - Client ID in our system
 * @param {string} endpoint - API endpoint path
 * @param {string} method - HTTP method
 * @param {Object} body - Request body (for POST/PUT)
 * @returns {Promise<Object>} - API response
 */
async function makeGhlApiCall(clientId, endpoint, method = "GET", body = null) {
  const { accessToken } = await checkAndRefreshToken(clientId);

  const url = `https://services.leadconnectorhq.com${endpoint}`;
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `GHL API call failed: ${response.status} ${response.statusText}`,
      errorText
    );
    throw new Error(`GHL API call failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Search for a contact in GoHighLevel by phone number
 * @param {string} accessToken - GHL access token (will be validated)
 * @param {string} phoneNumber - Phone number to search
 * @param {string} locationId - GHL location ID (optional, defaults to client ID)
 * @param {number} pageLimit - Maximum number of results per page
 * @returns {Promise<Object|null>} - First matching contact or null if not found
 */
async function searchGhlContactByPhone(
  accessToken,
  phoneNumber,
  locationId = null,
  pageLimit = 10
) {
  try {
    // If locationId is not provided, we'll assume it's stored along with the token
    // We need to extract the client ID from the database based on the access token
    if (!locationId) {
      // Find the client with this access token
      const client = await Client.findOne({
        $or: [
          { accessToken: accessToken },
          { clientSecret: accessToken }, // For backward compatibility
        ],
      });

      if (!client) {
        console.error("No client found with the provided access token");
        return null;
      }

      locationId = client.clientId;
    }

    // Validate token if needed - if locationId is provided, we can check
    if (locationId) {
      // This is a clientId in our system, so we can check and refresh the token
      const { accessToken: validToken } = await checkAndRefreshToken(
        locationId
      );
      accessToken = validToken; // Use the valid token
    }

    if (!accessToken || !phoneNumber) {
      console.error("Missing required parameters for GHL contact search");
      return null;
    }

    // Normalize phone number format - remove any non-digit characters
    const normalizedPhone = phoneNumber.replace(/\D/g, "");

    // Construct request body according to API specifications
    const requestBody = {
      locationId: locationId,
      page: 1,
      pageLimit: pageLimit,
      filters: [
        {
          field: "phone",
          operator: "contains",
          value: normalizedPhone,
        },
      ],
      sort: [
        {
          field: "dateAdded",
          direction: "desc",
        },
      ],
    };

    // Make the API request
    const response = await fetch(
      "https://services.leadconnectorhq.com/contacts/search",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Version: "2021-07-28",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      console.error(`GHL API error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`Error details: ${errorText}`);
      return null;
    }

    const data = await response.json();

    // Return first matching contact or null
    return data.contacts && data.contacts.length > 0 ? data.contacts[0] : null;
  } catch (error) {
    console.error("Error searching GHL contact:", error);
    return null;
  }
}

// Data migration helper function to ensure all clients have proper token structure
async function migrateClientTokens() {
  try {
    console.log("Starting client token migration...");
    // Find clients with potential token issues
    const clients = await Client.find({
      $or: [
        // Clients who might have tokens stored in clientSecret
        { refreshToken: { $exists: true }, accessToken: { $exists: false } },
        // Clients with accessToken in wrong field
        {
          refreshToken: { $exists: true },
          clientSecret: { $exists: true },
          accessToken: { $exists: false },
        },
      ],
    });

    console.log(`Found ${clients.length} clients that may need migration`);

    let migratedCount = 0;

    for (const client of clients) {
      // Skip clients without refreshToken
      if (!client.refreshToken) continue;

      try {
        // Refresh the token to get a new access token
        await refreshGhlToken(client.clientId);
        migratedCount++;
        console.log(
          `Successfully migrated tokens for client ${client.clientId}`
        );
      } catch (error) {
        console.error(
          `Failed to migrate tokens for client ${client.clientId}:`,
          error
        );
      }
    }

    console.log(
      `Migration complete. Successfully migrated ${migratedCount} out of ${clients.length} clients`
    );
    return { total: clients.length, migrated: migratedCount };
  } catch (error) {
    console.error("Error during client token migration:", error);
    throw error;
  }
}

/**
 * Find client by various identifiers for tool usage
 * @param {Object} params - Search parameters
 * @param {string} params.clientId - Direct client ID
 * @param {string} params.phone - Phone number (for reverse lookup)
 * @param {string} params.twilioPhone - Twilio phone number
 * @param {string} params.agentId - ElevenLabs agent ID
 * @returns {Promise<Object|null>} - Client object or null if not found
 */
async function findClientForTool(params) {
  const { clientId, phone, twilioPhone, agentId } = params;

  // Try direct client ID lookup first
  if (clientId) {
    return await Client.findOne({ clientId, status: "Active" });
  }

  // Try Twilio phone number lookup
  if (twilioPhone) {
    return await Client.findOne({
      twilioPhoneNumber: twilioPhone,
      status: "Active",
    });
  }

  // Try agent ID lookup (if client has specific agent)
  if (agentId) {
    return await Client.findOne({ agentId, status: "Active" });
  }

  // Try customer phone lookup (less reliable)
  if (phone) {
    return await Client.findOne({
      "clientMeta.phone": phone,
      status: "Active",
    });
  }

  return null;
}

/**
 * Fetch appointments from GHL for a specific date range
 * @param {string} clientId - Client ID in our system
 * @param {Date} startDate - Start date for appointments
 * @param {Date} endDate - End date for appointments
 * @returns {Promise<Array>} - Array of appointments
 */
async function fetchGhlAppointments(clientId, startDate, endDate) {
  try {
    console.log(`[GHL] Fetching appointments for client ${clientId}`);
    console.log(
      `[GHL] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`
    );

    const tokenData = await checkAndRefreshToken(clientId);
    const { accessToken, locationId, clientData } = tokenData;

    // Format dates for GHL API (YYYY-MM-DD)
    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // Try multiple endpoint variations
    const endpoints = [
      {
        url: `https://services.leadconnectorhq.com/calendars/events`,
        params: {
          startDate: startDateStr,
          endDate: endDateStr,
          locationId: locationId,
        },
        name: "events with locationId param",
      },
      {
        url: `https://services.leadconnectorhq.com/calendars/events`,
        params: {
          startDate: startDateStr,
          endDate: endDateStr,
        },
        name: "events without locationId",
      },
      {
        url: `https://services.leadconnectorhq.com/calendars/events/search`,
        params: {
          startDate: startDateStr,
          endDate: endDateStr,
          locationId: locationId,
        },
        name: "events search",
      },
    ];

    let successfulResponse = null;
    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const params = new URLSearchParams(endpoint.params);
        const fullUrl = `${endpoint.url}?${params.toString()}`;

        console.log(`[GHL] Trying ${endpoint.name}: ${fullUrl}`);

        const response = await fetch(fullUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Version: "2021-07-28",
            "Content-Type": "application/json",
          },
        });

        console.log(
          `[GHL] ${endpoint.name} response: ${response.status} ${response.statusText}`
        );

        if (response.ok) {
          const data = await response.json();
          console.log(
            `[GHL] Success with ${endpoint.name}! Found ${
              data.events?.length || 0
            } appointments`
          );
          successfulResponse = data;
          break;
        } else {
          const errorText = await response.text();
          console.log(
            `[GHL] ${endpoint.name} failed: ${response.status} - ${errorText}`
          );
          lastError = {
            status: response.status,
            text: errorText,
            endpoint: endpoint.name,
          };
        }
      } catch (fetchError) {
        console.log(`[GHL] ${endpoint.name} threw error:`, fetchError.message);
        lastError = { error: fetchError.message, endpoint: endpoint.name };
      }
    }

    if (!successfulResponse) {
      console.error(
        `[GHL] All appointment endpoints failed for client ${clientId}`
      );
      console.error(`[GHL] Last error:`, lastError);

      // Don't throw error, return empty array to allow sync to continue
      console.log(
        `[GHL] Returning empty appointments array to allow sync to continue`
      );
      return [];
    }

    const events = successfulResponse.events || [];
    console.log(`[GHL] Successfully fetched ${events.length} appointments`);

    // Log sample appointment for debugging
    if (events.length > 0) {
      console.log(`[GHL] Sample appointment:`, {
        id: events[0].id,
        title: events[0].title,
        status: events[0].status,
        startTime: events[0].startTime,
        assignedTo: events[0].assignedTo,
      });
    }

    return events;
  } catch (error) {
    console.error("Error fetching GHL appointments:", error);
    // Don't throw error, return empty array to allow sync to continue
    console.log(`[GHL] Returning empty appointments array due to error`);
    return [];
  }
}

/**
 * Get monthly appointment metrics from GHL
 * @param {string} clientId - Client ID in our system
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} - Appointment metrics
 */
async function getMonthlyGhlAppointments(clientId, year, month) {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1); // First day of next month

    const appointments = await fetchGhlAppointments(
      clientId,
      startDate,
      endDate
    );

    const metrics = {
      totalAppointments: appointments.length,
      successfulAppointments: 0,
      cancelledAppointments: 0,
      noShowAppointments: 0,
      completedAppointments: 0,
    };

    appointments.forEach((appointment) => {
      switch (appointment.status?.toLowerCase()) {
        case "confirmed":
        case "completed":
          metrics.successfulAppointments++;
          if (appointment.status?.toLowerCase() === "completed") {
            metrics.completedAppointments++;
          }
          break;
        case "cancelled":
          metrics.cancelledAppointments++;
          break;
        case "no_show":
          metrics.noShowAppointments++;
          break;
      }
    });

    return {
      year,
      month,
      period: `${year}-${month.toString().padStart(2, "0")}`,
      ...metrics,
      appointments,
    };
  } catch (error) {
    console.error("Error getting monthly GHL appointments:", error);
    throw error;
  }
}

/**
 * Aggregate appointment metrics by agent from GHL data
 * @param {Array} appointments - Array of GHL appointments
 * @param {Array} agents - Array of agent objects with agentId and other details
 * @returns {Object} - Metrics aggregated by agent
 */
function aggregateAppointmentsByAgent(appointments, agents) {
  const agentMetrics = {};

  // Initialize metrics for all agents
  agents.forEach((agent) => {
    agentMetrics[agent.agentId] = {
      agentId: agent.agentId,
      agentName: agent.agentName || `Agent ${agent.agentId}`,
      totalAppointments: 0,
      successfulAppointments: 0,
      cancelledAppointments: 0,
      noShowAppointments: 0,
      completedAppointments: 0,
    };
  });

  // Aggregate appointments
  appointments.forEach((appointment) => {
    // Try to match appointment to agent (this might need customization based on GHL data structure)
    let matchedAgentId = null;

    // Look for agent identifier in appointment data
    // This is a placeholder - adjust based on actual GHL appointment structure
    if (appointment.agentId) {
      matchedAgentId = appointment.agentId;
    } else if (appointment.assignedTo) {
      // Try to match by assigned user
      const matchedAgent = agents.find(
        (agent) =>
          agent.agentName
            ?.toLowerCase()
            .includes(appointment.assignedTo?.toLowerCase()) ||
          appointment.assignedTo
            ?.toLowerCase()
            .includes(agent.agentName?.toLowerCase())
      );
      if (matchedAgent) {
        matchedAgentId = matchedAgent.agentId;
      }
    }

    // If no specific agent matched, distribute evenly or use primary agent
    if (!matchedAgentId && agents.length > 0) {
      matchedAgentId = agents[0].agentId; // Default to first agent
    }

    if (matchedAgentId && agentMetrics[matchedAgentId]) {
      agentMetrics[matchedAgentId].totalAppointments++;

      switch (appointment.status?.toLowerCase()) {
        case "confirmed":
        case "completed":
          agentMetrics[matchedAgentId].successfulAppointments++;
          if (appointment.status?.toLowerCase() === "completed") {
            agentMetrics[matchedAgentId].completedAppointments++;
          }
          break;
        case "cancelled":
          agentMetrics[matchedAgentId].cancelledAppointments++;
          break;
        case "no_show":
          agentMetrics[matchedAgentId].noShowAppointments++;
          break;
      }
    }
  });

  return agentMetrics;
}

export {
  refreshGhlToken,
  makeGhlApiCall,
  searchGhlContactByPhone,
  checkAndRefreshToken,
  isTokenValid,
  migrateClientTokens,
  findClientForTool,
  fetchGhlAppointments,
  getMonthlyGhlAppointments,
  aggregateAppointmentsByAgent,
};
