// routes/admin.js
import Client from "../client.js";
import {
  createClient,
  findClientById,
  updateClient,
  deleteClient,
  findClientsWithRecentCalls,
  findClientsByAgentAndOutcome,
} from "../crud.js";
import {
  migrateClientTokens,
  checkAndRefreshToken,
  refreshGhlToken,
} from "../utils/ghl.js";

import {
  handleClientLogin,
  verifyClientToken,
  generateToken,
  generateAdminToken,
  authenticateClient,
  verifyToken,
} from "../auth.js";

// Helper function to generate a unique ID
function generateUniqueId() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

/**
 * Admin routes - all require admin authentication
 * These routes are prefixed with /admin in the main app
 */
export default async function adminRoutes(fastify, options) {
  fastify.addHook("preHandler", async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("No token provided");
      }

      const token = authHeader.split(" ")[1];
      const decoded = verifyToken(token);

      if (!decoded) {
        throw new Error("Invalid token");
      }

      if (decoded.type !== "admin") {
        throw new Error("Insufficient permissions");
      }

      // Set admin info
      request.adminId = decoded.adminId;
    } catch (error) {
      reply.code(401).send({
        error: "Unauthorized",
        message: error.message,
      });
      throw error; // This ensures Fastify doesn't proceed to the route handler
    }
  });
  // Get client by ID (Admin)
  fastify.get("/clients/:clientId", async (request, reply) => {
    try {
      const { clientId } = request.params;
      const client = await findClientById(clientId);

      if (!client) {
        return reply.code(404).send({
          error: "Client not found",
        });
      }

      // Return the full client object including sensitive fields for admin users
      // Previously this would have filtered out the clientSecret
      reply.send(client);
    } catch (error) {
      fastify.log.error("Error fetching client:", error);
      reply.code(500).send({
        error: "Failed to fetch client",
        details: error.message,
      });
    }
  });

  // Get all clients (Admin)
  fastify.get("/clients", async (request, reply) => {
    try {
      const { limit, offset, status, search } = request.query;
      let query = {};

      // Apply filters if provided
      if (status) {
        query.status = status;
      }

      if (search) {
        query.$or = [
          { "clientMeta.fullName": { $regex: search, $options: "i" } },
          { "clientMeta.email": { $regex: search, $options: "i" } },
          { "clientMeta.businessName": { $regex: search, $options: "i" } },
        ];
      }

      // Create a base query that now includes all fields, including clientSecret
      let clientsQuery = Client.find(query);
      // Remove the .select("-clientSecret") if it exists

      // Apply pagination if requested
      if (offset || limit) {
        const skip = parseInt(offset) || 0;
        const take = parseInt(limit) || 10;
        clientsQuery = clientsQuery.skip(skip).limit(take);
      }

      // Apply sorting
      clientsQuery = clientsQuery.sort({ createdAt: -1 });

      // Execute the query
      const clients = await clientsQuery;
      const totalCount = await Client.countDocuments(query);

      reply.send({
        total: totalCount,
        count: clients.length,
        clients,
      });
    } catch (error) {
      fastify.log.error("Error fetching clients:", error);
      reply.code(500).send({
        error: "Failed to fetch clients",
        details: error.message,
      });
    }
  });

  // Create a new client
  fastify.post("/clients", async (request, reply) => {
    try {
      const clientData = request.body;

      // Validate required fields
      if (
        !clientData.clientMeta ||
        !clientData.clientMeta.fullName ||
        !clientData.clientMeta.email ||
        !clientData.clientMeta.phone
      ) {
        return reply.code(400).send({
          error: "Missing required client information",
          requiredFields: [
            "clientMeta.fullName",
            "clientMeta.email",
            "clientMeta.phone",
          ],
        });
      }
      // Block if agent id is not there
      if (!clientData.agentId) {
        return reply.code(400).send({
          error: "Missing required eleven labs outbound agent ID",
        });
      }
      // Block if twilio phone number is not there
      if (!clientData.twilioPhoneNumber) {
        return reply.code(400).send({
          error: "Missing required Twilio phone number",
        });
      }

      // Block if client id is not there
      if (!clientData.clientId) {
        return reply.code(400).send({
          error: "Missing client Id (same as clients GHL location id)",
        });
      }

      // Block if client id is not there
      if (!clientData.calId) {
        return reply.code(400).send({
          error: "Missing GHL calid",
        });
      }

      // Generate clientSecret if not provided
      if (!clientData.clientSecret) {
        clientData.clientSecret = generateUniqueId() + generateUniqueId();
      }

      const clientToken = generateToken(clientData.clientId);
      clientData.clientToken = clientToken;
      // Set status to Active by default
      clientData.status = clientData.status || "Active";

      const newClient = await createClient(clientData);

      reply.code(201).send({
        message: "Client created successfully",
        client: newClient,
      });
    } catch (error) {
      fastify.log.error("Error creating client:", error);

      // Handle duplicate key error
      if (error.code === 11000) {
        return reply.code(409).send({
          error: "Client already exists with this ID or email",
          details: error.message,
        });
      }

      reply.code(500).send({
        error: "Failed to create client",
        details: error.message,
      });
    }
  });

  // Update a client
  fastify.put("/clients/:clientId", async (request, reply) => {
    try {
      const { clientId } = request.params;
      const updateData = request.body;

      // Prevent changing the clientId
      if (updateData.clientId && updateData.clientId !== clientId) {
        return reply.code(400).send({
          error: "Cannot change client ID",
        });
      }

      const updatedClient = await updateClient(clientId, updateData);

      if (!updatedClient) {
        return reply.code(404).send({
          error: "Client not found",
        });
      }

      // Don't return the clientSecret in the response
      const clientResponse = updatedClient.toObject();
      delete clientResponse.clientSecret;

      reply.send({
        message: "Client updated successfully",
        client: clientResponse,
      });
    } catch (error) {
      fastify.log.error("Error updating client:", error);
      reply.code(500).send({
        error: "Failed to update client",
        details: error.message,
      });
    }
  });

  // Delete a client
  fastify.delete("/clients/:clientId", async (request, reply) => {
    try {
      const { clientId } = request.params;

      const deleted = await deleteClient(clientId);

      if (!deleted) {
        return reply.code(404).send({
          error: "Client not found",
        });
      }

      reply.send({
        message: "Client deleted successfully",
      });
    } catch (error) {
      fastify.log.error("Error deleting client:", error);
      reply.code(500).send({
        error: "Failed to delete client",
        details: error.message,
      });
    }
  });

  // Reset client secret
  // In admin.js, modify the reset client secret endpoint
  fastify.post("/clients/:clientId/reset-secret", async (request, reply) => {
    try {
      const { clientId } = request.params;

      // Generate a new client secret
      const clientSecret = generateUniqueId() + generateUniqueId();

      // Generate a new token as well
      const clientToken = generateToken(clientId);

      // Update the client with both new secret and token
      const updatedClient = await updateClient(clientId, {
        clientSecret,
        clientToken,
      });

      if (!updatedClient) {
        return reply.code(404).send({
          error: "Client not found",
        });
      }

      reply.send({
        message: "Client secret reset successfully",
        client: {
          clientId: updatedClient.clientId,
          clientSecret,
          clientToken,
        },
      });
    } catch (error) {
      // ... error handling ...
    }
  });

  // Get client call history
  fastify.get("/clients/:clientId/calls", async (request, reply) => {
    try {
      const { clientId } = request.params;
      const { limit, offset, status } = request.query;

      const client = await findClientById(clientId);

      if (!client) {
        return reply.code(404).send({
          error: "Client not found",
        });
      }

      let callHistory = client.callHistory || [];

      // Filter by status if requested
      if (status) {
        callHistory = callHistory.filter(
          (call) => call.callData && call.callData.status === status
        );
      }

      // Apply pagination if requested
      if (offset || limit) {
        const startIndex = parseInt(offset) || 0;
        const endIndex = limit ? startIndex + parseInt(limit) : undefined;
        callHistory = callHistory.slice(startIndex, endIndex);
      }

      reply.send({
        clientId: client.clientId,
        total: client.callHistory ? client.callHistory.length : 0,
        filtered: callHistory.length,
        callHistory: callHistory,
      });
    } catch (error) {
      fastify.log.error("Error fetching client call history:", error);
      reply.code(500).send({
        error: "Failed to fetch client call history",
        details: error.message,
      });
    }
  });

  // Get dashboard stats
  fastify.get("/dashboard", async (request, reply) => {
    try {
      // Get count of active clients
      const activeClientCount = await Client.countDocuments({
        status: "Active",
      });

      // Get count of inactive clients
      const inactiveClientCount = await Client.countDocuments({
        status: { $ne: "Active" },
      });

      // Get count of calls in the last 24 hours
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const recentCalls = await Client.aggregate([
        { $unwind: "$callHistory" },
        { $match: { "callHistory.callData.startTime": { $gte: oneDayAgo } } },
        { $count: "count" },
      ]);

      const recentCallCount = recentCalls.length > 0 ? recentCalls[0].count : 0;

      // Get total calls
      const totalCalls = await Client.aggregate([
        { $unwind: { path: "$callHistory", preserveNullAndEmptyArrays: true } },
        { $count: "count" },
      ]);

      const totalCallCount = totalCalls.length > 0 ? totalCalls[0].count : 0;

      // Get calls by outcome
      const callsByOutcome = await Client.aggregate([
        { $unwind: "$callHistory" },
        {
          $group: {
            _id: "$callHistory.callDetails.callOutcome",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]);

      // Get calls by status
      const callsByStatus = await Client.aggregate([
        { $unwind: "$callHistory" },
        {
          $group: {
            _id: "$callHistory.callData.status",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]);

      // Format the outcome and status data
      const formattedOutcomes = {};
      callsByOutcome.forEach((item) => {
        formattedOutcomes[item._id || "unknown"] = item.count;
      });

      const formattedStatuses = {};
      callsByStatus.forEach((item) => {
        formattedStatuses[item._id || "unknown"] = item.count;
      });

      reply.send({
        clients: {
          active: activeClientCount,
          inactive: inactiveClientCount,
          total: activeClientCount + inactiveClientCount,
        },
        calls: {
          recent: recentCallCount,
          total: totalCallCount,
          byOutcome: formattedOutcomes,
          byStatus: formattedStatuses,
        },
      });
    } catch (error) {
      fastify.log.error("Error fetching dashboard stats:", error);
      reply.code(500).send({
        error: "Failed to fetch dashboard statistics",
        details: error.message,
      });
    }
  });

  // Get recent activity
  fastify.get("/activity", async (request, reply) => {
    try {
      const { days = 7, limit = 10 } = request.query;

      // Get clients with recent calls
      const recentDays = parseInt(days);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - recentDays);

      // Find all calls within the time period
      const recentActivity = await Client.aggregate([
        { $unwind: "$callHistory" },
        { $match: { "callHistory.callData.startTime": { $gte: cutoffDate } } },
        { $sort: { "callHistory.callData.startTime": -1 } },
        { $limit: parseInt(limit) },
        {
          $project: {
            _id: 0,
            clientId: 1,
            clientName: "$clientMeta.fullName",
            businessName: "$clientMeta.businessName",
            callId: "$callHistory.callId",
            callSid: "$callHistory.callData.callSid",
            phone: "$callHistory.callData.phone",
            status: "$callHistory.callData.status",
            startTime: "$callHistory.callData.startTime",
            duration: "$callHistory.callData.duration",
            outcome: "$callHistory.callDetails.callOutcome",
          },
        },
      ]);

      reply.send({
        period: `${recentDays} days`,
        count: recentActivity.length,
        activities: recentActivity,
      });
    } catch (error) {
      fastify.log.error("Error fetching recent activity:", error);
      reply.code(500).send({
        error: "Failed to fetch recent activity",
        details: error.message,
      });
    }
  });

  // Make call on behalf of a client
  fastify.post("/clients/:clientId/make-call", async (request, reply) => {
    const { clientId } = request.params;
    const { phone } = request.body;

    // Generate a request ID for tracking
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    fastify.log.info(
      `[${requestId}] Admin initiated call for client: ${clientId}`
    );

    // Validate phone number
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phone) {
      fastify.log.warn(
        `[${requestId}] Error: Destination phone number missing`
      );
      return reply.code(400).send({
        error: "Destination phone number is required",
        requestId,
      });
    }

    if (!phoneRegex.test(phone)) {
      fastify.log.warn(
        `[${requestId}] Error: Invalid destination phone format: ${phone}`
      );
      return reply.code(400).send({
        error: "Phone number must be in E.164 format (e.g., +12125551234)",
        requestId,
      });
    }

    try {
      // Find the client
      const client = await findClientById(clientId);

      if (!client) {
        fastify.log.warn(
          `[${requestId}] Error: Client not found with ID: ${clientId}`
        );
        return reply.code(404).send({
          error: "Client not found",
          requestId,
        });
      }

      // Check if client is active
      if (client.status !== "Active") {
        fastify.log.warn(
          `[${requestId}] Error: Client is not active: ${client.status}`
        );
        return reply.code(403).send({
          error: `Client is not active (status: ${client.status})`,
          requestId,
        });
      }

      // Access the Twilio client from the parent scope
      const twilioClient = fastify.twilioClient;

      if (!twilioClient) {
        fastify.log.error(`[${requestId}] Twilio client not available`);
        return reply.code(500).send({
          error: "Twilio service unavailable",
          requestId,
        });
      }

      // Build the webhook URL with client parameters
      let webhookUrl = `https://${request.headers.host}/outbound-call-twiml?`;

      // Add parameters to the URL
      const params = {
        first_message: client.clientMeta.fullName.split(" ")[0] + "?",
        clientId: client.clientId,
        agentId: client.agentId,
        full_name: client.clientMeta.fullName,
        business_name: client.clientMeta.businessName,
        city: client.clientMeta.city,
        job_title: client.clientMeta.jobTitle,
        email: client.clientMeta.email,
        phone,
        requestId,
        admin_initiated: "true",
      };

      // Build query string
      const queryParams = [];
      for (const [key, value] of Object.entries(params)) {
        if (value) {
          queryParams.push(
            `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
          );
        }
      }

      webhookUrl += queryParams.join("&");

      // Create the call
      const call = await twilioClient.calls.create({
        url: webhookUrl,
        to: phone,
        from: client.twilioPhoneNumber,
        statusCallback: `https://${request.headers.host}/call-status?requestId=${requestId}&clientId=${client.clientId}&admin_initiated=true`,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST",
      });

      fastify.log.info(
        `[${requestId}] Outbound call initiated successfully: ${call.sid}`
      );

      // Create call data object
      const callData = {
        callData: {
          callSid: call.sid,
          requestId,
          phone,
          from: client.twilioPhoneNumber,
          agentId: client.agentId,
          startTime: new Date(),
          status: "initiated",
          callCount: 1,
          adminInitiated: true,
        },
        callDetails: {
          callOutcome: "",
          callSummary: "",
          callTranscript: "",
        },
      };

      // Add call to client's call history
      await addCallToHistory(client.clientId, callData);

      reply.send({
        success: true,
        message: "Call initiated successfully",
        callSid: call.sid,
        clientId: client.clientId,
        requestId,
      });
    } catch (error) {
      fastify.log.error(`[${requestId}] Error initiating call:`, error);

      // Handle Twilio errors
      let statusCode = 500;
      let errorMessage = "Failed to initiate call";
      let errorDetails = error.message;
      let resolution = null;

      if (error.code) {
        // Handle specific Twilio error codes
        switch (error.code) {
          case 21211:
            statusCode = 400;
            errorMessage = "Invalid 'To' phone number";
            resolution = "Check the phone number format and try again";
            break;
          case 21214:
            statusCode = 400;
            errorMessage = "Invalid 'From' phone number";
            resolution =
              "Verify the Twilio phone number is active and properly configured";
            break;
          // Add other Twilio error codes as needed
        }
      }

      reply.code(statusCode).send({
        error: errorMessage,
        details: errorDetails,
        resolution,
        requestId,
      });
    }
  });

  // one time call to upgrade clients
  fastify.post("/migrate-ghl-tokens", async (request, reply) => {
    try {
      fastify.log.info("Admin initiated GHL token migration");

      const migrationResults = await migrateClientTokens();

      fastify.log.info(
        `GHL token migration completed: ${migrationResults.migrated}/${migrationResults.total} clients migrated`
      );

      reply.send({
        success: true,
        message: "GHL token migration completed",
        migrated: migrationResults.migrated,
        total: migrationResults.total,
        skipped: migrationResults.total - migrationResults.migrated,
      });
    } catch (error) {
      fastify.log.error("Error during GHL token migration:", error);
      reply.code(500).send({
        success: false,
        error: "Failed to migrate GHL tokens",
        details: error.message,
      });
    }
  });

  // GHL Token refresh endpoint - for manual refresh by admin
  fastify.post(
    "/clients/:clientId/refresh-ghl-token",
    async (request, reply) => {
      try {
        const { clientId } = request.params;
        const { force = false } = request.body; // Optional parameter to force refresh

        // Validate clientId format
        if (!clientId || typeof clientId !== "string") {
          fastify.log.warn(`Invalid client ID format: ${clientId}`);
          return reply.code(400).send({
            error: "Invalid client ID format",
            details: "Client ID must be a non-empty string",
          });
        }

        // Find the client
        const client = await Client.findOne({ clientId });
        if (!client) {
          fastify.log.warn(`Client not found with ID: ${clientId}`);
          return reply.code(404).send({
            error: "Client not found",
            details: `No client found with ID: ${clientId}`,
          });
        }

        // Check if client has GHL integration
        if (!client.refreshToken) {
          fastify.log.warn(`Client ${clientId} has no GHL refresh token`);
          return reply.code(400).send({
            error: "No GHL integration",
            details:
              "This client does not have GHL integration set up (no refresh token)",
            clientId: client.clientId,
          });
        }

        let result;
        let message;

        if (force) {
          // Force refresh regardless of token expiration
          fastify.log.info(
            `Admin initiated forced GHL token refresh for client: ${clientId}`
          );
          const newToken = await refreshGhlToken(clientId);

          // Get updated client data
          const updatedClient = await Client.findOne({ clientId });

          message = "GHL token forcefully refreshed";
          result = {
            clientId: client.clientId,
            tokenRefreshed: true,
            accessToken: updatedClient.accessToken ? "present" : "missing",
            refreshToken: updatedClient.refreshToken ? "present" : "missing",
            tokenExpiresAt: updatedClient.tokenExpiresAt,
            message: "Token was forcefully refreshed as requested",
          };
        } else {
          // Check token and refresh only if needed
          fastify.log.info(
            `Admin initiated GHL token validation for client: ${clientId}`
          );

          // Get the updated client to check if token was refreshed
          const clientBefore = await Client.findOne({ clientId });
          const oldExpiryTime = clientBefore.tokenExpiresAt
            ? new Date(clientBefore.tokenExpiresAt).getTime()
            : 0;
          const hadAccessToken = !!clientBefore.accessToken;

          // Perform token check and refresh if needed
          const { accessToken } = await checkAndRefreshToken(clientId);

          // Get the client again to see if the token was actually refreshed
          const clientAfter = await Client.findOne({ clientId });
          const newExpiryTime = clientAfter.tokenExpiresAt
            ? new Date(clientAfter.tokenExpiresAt).getTime()
            : 0;

          const wasRefreshed = newExpiryTime > oldExpiryTime || !hadAccessToken;

          message = wasRefreshed
            ? "GHL token was refreshed"
            : "GHL token is still valid, no refresh needed";
          result = {
            clientId: client.clientId,
            tokenRefreshed: wasRefreshed,
            accessToken: clientAfter.accessToken ? "present" : "missing",
            refreshToken: clientAfter.refreshToken ? "present" : "missing",
            tokenExpiresAt: clientAfter.tokenExpiresAt,
            message: wasRefreshed
              ? "Token was expired or missing and has been refreshed"
              : "Token is still valid and was not refreshed",
          };
        }

        fastify.log.info(
          `GHL token refresh operation completed for client ${clientId}: ${message}`
        );

        reply.send({
          success: true,
          status: "success",
          ...result,
        });
      } catch (error) {
        fastify.log.error(`Error refreshing GHL token:`, error);

        // Handle specific error types
        if (error.message.includes("Token refresh failed")) {
          return reply.code(400).send({
            success: false,
            error: "GHL token refresh failed",
            details: error.message,
            recommendation:
              "The client may need to re-authorize with GHL. Check if the GHL integration is still active.",
          });
        }

        reply.code(500).send({
          success: false,
          error: "Failed to refresh GHL token",
          details: error.message,
        });
      }
    }
  );

  // GHL Token status check endpoint
  fastify.get("/clients/:clientId/ghl-token-status", async (request, reply) => {
    try {
      const { clientId } = request.params;

      // Find the client
      const client = await Client.findOne({ clientId });
      if (!client) {
        return reply.code(404).send({
          error: "Client not found",
        });
      }

      // Check if client has GHL integration
      if (!client.refreshToken) {
        return reply.code(200).send({
          clientId: client.clientId,
          status: "no_integration",
          message: "This client does not have GHL integration set up",
        });
      }

      // Calculate token expiry status
      const now = new Date();
      const tokenExpiresAt = client.tokenExpiresAt
        ? new Date(client.tokenExpiresAt)
        : null;

      let status;
      let message;

      if (!client.accessToken) {
        status = "missing_access_token";
        message = "Access token is missing but refresh token is present";
      } else if (!tokenExpiresAt) {
        status = "unknown";
        message = "Token expiration date is not available";
      } else if (tokenExpiresAt < now) {
        status = "expired";
        message = "Token is expired";
      } else {
        // Calculate time until expiration
        const timeRemaining = tokenExpiresAt.getTime() - now.getTime();
        const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutesRemaining = Math.floor(
          (timeRemaining % (1000 * 60 * 60)) / (1000 * 60)
        );

        if (timeRemaining < 1000 * 60 * 60) {
          // Less than 1 hour
          status = "expiring_soon";
          message = `Token will expire in ${minutesRemaining} minutes`;
        } else {
          status = "valid";
          message = `Token is valid for ${hoursRemaining} hours and ${minutesRemaining} minutes`;
        }
      }

      reply.send({
        clientId: client.clientId,
        hasAccessToken: !!client.accessToken,
        hasRefreshToken: !!client.refreshToken,
        tokenExpiresAt: client.tokenExpiresAt,
        status,
        message,
      });
    } catch (error) {
      fastify.log.error(`Error checking GHL token status:`, error);
      reply.code(500).send({
        error: "Failed to check GHL token status",
        details: error.message,
      });
    }
  });

  // Generate a dedicated admin token for ElevenLabs integration
  fastify.post("/elevenlabs-token", async (request, reply) => {
    try {
      const { description = "ElevenLabs Integration" } = request.body;

      // Generate a long-lived admin token specifically for ElevenLabs
      const elevenLabsToken = generateAdminToken(`elevenlabs-${Date.now()}`);

      fastify.log.info(`Generated ElevenLabs admin token: ${description}`);

      reply.send({
        message: "ElevenLabs admin token generated successfully",
        token: elevenLabsToken,
        description,
        usage: {
          baseUrl: "https://api.v1.affinitydesign.ca",
          toolEndpoints: [
            "GET /tools/get-availability/:clientId",
            "POST /tools/book-appointment/:clientId",
            "GET /tools/get-info/:clientId",
          ],
          authHeader: `Bearer ${elevenLabsToken}`,
          note: "Store this token securely in your ElevenLabs agent configuration",
        },
      });
    } catch (error) {
      fastify.log.error("Error generating ElevenLabs token:", error);
      reply.code(500).send({
        error: "Failed to generate ElevenLabs token",
        details: error.message,
      });
    }
  });

  // ===== AGENT MANAGEMENT ROUTES =====

  // Add additional agent to a client
  fastify.post("/clients/:clientId/agents", async (request, reply) => {
    const { clientId } = request.params;
    const agentData = request.body;

    try {
      // Import agent manager functions
      const { addAdditionalAgent } = await import("../utils/agentManager.js");

      const result = await addAdditionalAgent(clientId, agentData);

      if (result.success) {
        reply.send({
          success: true,
          message: result.message,
          clientId,
          agent: result.newAgent,
          totalAgents: result.client.getAllAgents().length,
        });
      } else {
        reply.code(400).send({
          error: result.error,
          clientId,
        });
      }
    } catch (error) {
      fastify.log.error("Error adding additional agent:", error);
      reply.code(500).send({
        error: "Failed to add additional agent",
        details: error.message,
      });
    }
  });

  // Get all agents for a client
  fastify.get("/clients/:clientId/agents", async (request, reply) => {
    const { clientId } = request.params;

    try {
      // Import agent manager functions
      const { getAllAgentsForClient } = await import(
        "../utils/agentManager.js"
      );

      const result = await getAllAgentsForClient(clientId);

      if (result.success) {
        reply.send({
          success: true,
          clientId,
          totalAgents: result.totalAgents,
          agents: result.agents,
        });
      } else {
        reply.code(404).send({
          error: result.error,
          clientId,
        });
      }
    } catch (error) {
      fastify.log.error("Error getting agents for client:", error);
      reply.code(500).send({
        error: "Failed to get agents",
        details: error.message,
      });
    }
  });

  // Update additional agent
  fastify.put("/clients/:clientId/agents/:agentId", async (request, reply) => {
    const { clientId, agentId } = request.params;
    const updateData = request.body;

    try {
      // Import agent manager functions
      const { updateAdditionalAgent } = await import(
        "../utils/agentManager.js"
      );

      const result = await updateAdditionalAgent(clientId, agentId, updateData);

      if (result.success) {
        reply.send({
          success: true,
          message: result.message,
          clientId,
          agentId,
          updatedAgent: result.updatedAgent,
        });
      } else {
        reply.code(400).send({
          error: result.error,
          clientId,
          agentId,
        });
      }
    } catch (error) {
      fastify.log.error("Error updating additional agent:", error);
      reply.code(500).send({
        error: "Failed to update additional agent",
        details: error.message,
      });
    }
  });

  // Remove additional agent
  fastify.delete(
    "/clients/:clientId/agents/:agentId",
    async (request, reply) => {
      const { clientId, agentId } = request.params;

      try {
        // Import agent manager functions
        const { removeAdditionalAgent } = await import(
          "../utils/agentManager.js"
        );

        const result = await removeAdditionalAgent(clientId, agentId);

        if (result.success) {
          reply.send({
            success: true,
            message: result.message,
            clientId,
            agentId,
            removedAgent: result.removedAgent,
          });
        } else {
          reply.code(400).send({
            error: result.error,
            clientId,
            agentId,
          });
        }
      } catch (error) {
        fastify.log.error("Error removing additional agent:", error);
        reply.code(500).send({
          error: "Failed to remove additional agent",
          details: error.message,
        });
      }
    }
  );

  // METRICS AND REPORTING ENDPOINTS

  /**
   * Sync ElevenLabs metrics for a specific agent and period
   * POST /admin/metrics/sync-elevenlabs
   */
  fastify.post("/metrics/sync-elevenlabs", async (request, reply) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    try {
      const { clientId, agentId, year, month } = request.body;
      
      if (!clientId || !agentId || !year || !month) {
        return reply.code(400).send({
          error: "Missing required fields",
          required: ["clientId", "agentId", "year", "month"],
          requestId
        });
      }

      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        return reply.code(500).send({
          error: "ElevenLabs API key not configured",
          requestId
        });
      }

      console.log(`[${requestId}] Syncing ElevenLabs metrics for agent ${agentId}, period ${year}-${month}`);

      const { syncElevenLabsMetrics } = await import('../utils/elevenlabs.js');
      const result = await syncElevenLabsMetrics(clientId, agentId, year, month, apiKey);
      
      return reply.send({
        requestId,
        ...result
      });
    } catch (error) {
      console.error(`[${requestId}] Error syncing ElevenLabs metrics:`, error);
      return reply.code(500).send({
        error: "Failed to sync ElevenLabs metrics",
        details: error.message,
        requestId
      });
    }
  });

  /**
   * Get agent metrics for a specific agent and period
   * GET /admin/reports/agent-metrics/:agentId?clientId=xxx&year=2025&month=3
   */
  fastify.get("/reports/agent-metrics/:agentId", async (request, reply) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    try {
      const { agentId } = request.params;
      const { clientId, year, month } = request.query;
      
      if (!clientId || !year || !month) {
        return reply.code(400).send({
          error: "Missing required query parameters",
          required: ["clientId", "year", "month"],
          requestId
        });
      }

      console.log(`[${requestId}] Getting metrics for agent ${agentId}, period ${year}-${month}`);

      const { getAgentMetrics } = await import('../utils/metrics.js');
      const metrics = await getAgentMetrics(clientId, agentId, parseInt(year), parseInt(month));
      
      if (!metrics) {
        return reply.send({
          requestId,
          agentId,
          period: `${year}-${String(month).padStart(2, '0')}`,
          metrics: null,
          message: "No metrics found for this agent and period"
        });
      }

      return reply.send({
        requestId,
        agentId,
        period: `${year}-${String(month).padStart(2, '0')}`,
        metrics: metrics.metrics,
        source: metrics.source,
        lastUpdated: metrics.createdAt
      });
    } catch (error) {
      console.error(`[${requestId}] Error getting agent metrics:`, error);
      return reply.code(500).send({
        error: "Failed to get agent metrics",
        details: error.message,
        requestId
      });
    }
  });

  /**
   * Get combined metrics for all agents of a client
   * GET /admin/reports/combined-metrics?clientId=xxx&year=2025&month=3
   */
  fastify.get("/reports/combined-metrics", async (request, reply) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    try {
      const { clientId, year, month } = request.query;
      
      if (!clientId || !year || !month) {
        return reply.code(400).send({
          error: "Missing required query parameters",
          required: ["clientId", "year", "month"],
          requestId
        });
      }

      console.log(`[${requestId}] Getting combined metrics for client ${clientId}, period ${year}-${month}`);

      const { getAllAgentMetrics } = await import('../utils/metrics.js');
      const allMetrics = await getAllAgentMetrics(clientId, parseInt(year), parseInt(month));
      
      // Calculate totals
      const totals = allMetrics.reduce((acc, agent) => {
        const metrics = agent.metrics;
        return {
          totalInboundCalls: acc.totalInboundCalls + (metrics.inboundCalls || 0),
          totalOutboundCalls: acc.totalOutboundCalls + (metrics.outboundCalls || 0),
          totalCalls: acc.totalCalls + (metrics.totalCalls || 0),
          totalSuccessfulBookings: acc.totalSuccessfulBookings + (metrics.successfulBookings || 0),
          totalDuration: acc.totalDuration + (metrics.totalDuration || 0),
          totalCallsFromElevenlabs: acc.totalCallsFromElevenlabs + (metrics.callsFromElevenlabs || 0)
        };
      }, {
        totalInboundCalls: 0,
        totalOutboundCalls: 0,
        totalCalls: 0,
        totalSuccessfulBookings: 0,
        totalDuration: 0,
        totalCallsFromElevenlabs: 0
      });

      // Calculate overall average duration
      totals.averageDuration = totals.totalCalls > 0 ? Math.round(totals.totalDuration / totals.totalCalls) : 0;
      
      // Calculate overall success rate
      totals.overallSuccessRate = totals.totalCalls > 0 ? Math.round((totals.totalSuccessfulBookings / totals.totalCalls) * 100) : 0;

      return reply.send({
        requestId,
        clientId,
        period: `${year}-${String(month).padStart(2, '0')}`,
        agentCount: allMetrics.length,
        agents: allMetrics,
        totals
      });
    } catch (error) {
      console.error(`[${requestId}] Error getting combined metrics:`, error);
      return reply.code(500).send({
        error: "Failed to get combined metrics",
        details: error.message,
        requestId
      });
    }
  });

  /**
   * Get period comparison for an agent
   * GET /admin/reports/period-comparison?clientId=xxx&agentId=xxx&startPeriod=2025-02&endPeriod=2025-03
   */
  fastify.get("/reports/period-comparison", async (request, reply) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    try {
      const { clientId, agentId, startPeriod, endPeriod } = request.query;
      
      if (!clientId || !agentId || !startPeriod || !endPeriod) {
        return reply.code(400).send({
          error: "Missing required query parameters",
          required: ["clientId", "agentId", "startPeriod", "endPeriod"],
          requestId
        });
      }

      console.log(`[${requestId}] Getting period comparison for agent ${agentId}, periods ${startPeriod} vs ${endPeriod}`);

      const { getMetricsComparison } = await import('../utils/metrics.js');
      const comparison = await getMetricsComparison(clientId, agentId, startPeriod, endPeriod);
      
      if (!comparison) {
        return reply.code(404).send({
          error: "Unable to generate comparison",
          message: "Agent or client not found",
          requestId
        });
      }

      return reply.send({
        requestId,
        ...comparison
      });
    } catch (error) {
      console.error(`[${requestId}] Error getting period comparison:`, error);
      return reply.code(500).send({
        error: "Failed to get period comparison",
        details: error.message,
        requestId
      });
    }
  });

  /**
   * Recalculate metrics from call history
   * POST /admin/metrics/recalculate
   */
  fastify.post("/metrics/recalculate", async (request, reply) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    try {
      const { clientId, agentId, year, month } = request.body;
      
      if (!clientId || !agentId || !year || !month) {
        return reply.code(400).send({
          error: "Missing required fields",
          required: ["clientId", "agentId", "year", "month"],
          requestId
        });
      }

      console.log(`[${requestId}] Recalculating metrics for agent ${agentId}, period ${year}-${month}`);

      const { recalculateMetricsFromHistory } = await import('../utils/metrics.js');
      const metrics = await recalculateMetricsFromHistory(clientId, agentId, parseInt(year), parseInt(month));
      
      if (!metrics) {
        return reply.code(404).send({
          error: "Unable to recalculate metrics",
          message: "Client or agent not found",
          requestId
        });
      }

      return reply.send({
        requestId,
        agentId,
        period: `${year}-${String(month).padStart(2, '0')}`,
        metrics,
        message: "Metrics recalculated successfully"
      });
    } catch (error) {
      console.error(`[${requestId}] Error recalculating metrics:`, error);
      return reply.code(500).send({
        error: "Failed to recalculate metrics",
        details: error.message,
        requestId
      });
    }
  });

  /**
   * Dashboard summary - quick overview of current month metrics
   * GET /admin/reports/dashboard-summary?clientId=xxx
   */
  fastify.get("/reports/dashboard-summary", async (request, reply) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    try {
      const { clientId } = request.query;
      
      if (!clientId) {
        return reply.code(400).send({
          error: "Missing required query parameter: clientId",
          requestId
        });
      }

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;

      console.log(`[${requestId}] Getting dashboard summary for client ${clientId}`);

      const { getAllAgentMetrics } = await import('../utils/metrics.js');
      
      // Get current month and last month metrics
      const currentMetrics = await getAllAgentMetrics(clientId, currentYear, currentMonth);
      const lastMonthMetrics = await getAllAgentMetrics(clientId, lastMonthYear, lastMonth);

      const calculateTotals = (metrics) => {
        return metrics.reduce((acc, agent) => {
          const m = agent.metrics;
          return {
            inboundCalls: acc.inboundCalls + (m.inboundCalls || 0),
            outboundCalls: acc.outboundCalls + (m.outboundCalls || 0),
            totalCalls: acc.totalCalls + (m.totalCalls || 0),
            successfulBookings: acc.successfulBookings + (m.successfulBookings || 0),
            totalDuration: acc.totalDuration + (m.totalDuration || 0)
          };
        }, { inboundCalls: 0, outboundCalls: 0, totalCalls: 0, successfulBookings: 0, totalDuration: 0 });
      };

      const currentTotals = calculateTotals(currentMetrics);
      const lastMonthTotals = calculateTotals(lastMonthMetrics);

      const calculateChange = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
      };

      return reply.send({
        requestId,
        clientId,
        currentPeriod: `${currentYear}-${String(currentMonth).padStart(2, '0')}`,
        lastPeriod: `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}`,
        agentCount: currentMetrics.length,
        currentMonth: {
          ...currentTotals,
          averageDuration: currentTotals.totalCalls > 0 ? Math.round(currentTotals.totalDuration / currentTotals.totalCalls) : 0,
          successRate: currentTotals.totalCalls > 0 ? Math.round((currentTotals.successfulBookings / currentTotals.totalCalls) * 100) : 0
        },
        lastMonth: {
          ...lastMonthTotals,
          averageDuration: lastMonthTotals.totalCalls > 0 ? Math.round(lastMonthTotals.totalDuration / lastMonthTotals.totalCalls) : 0,
          successRate: lastMonthTotals.totalCalls > 0 ? Math.round((lastMonthTotals.successfulBookings / lastMonthTotals.totalCalls) * 100) : 0
        },
        changes: {
          inboundCalls: calculateChange(currentTotals.inboundCalls, lastMonthTotals.inboundCalls),
          outboundCalls: calculateChange(currentTotals.outboundCalls, lastMonthTotals.outboundCalls),
          totalCalls: calculateChange(currentTotals.totalCalls, lastMonthTotals.totalCalls),
          successfulBookings: calculateChange(currentTotals.successfulBookings, lastMonthTotals.successfulBookings)
        },
        agents: currentMetrics
      });
    } catch (error) {
      console.error(`[${requestId}] Error getting dashboard summary:`, error);
      return reply.code(500).send({
        error: "Failed to get dashboard summary",
        details: error.message,
        requestId
      });
    }
  });

  // ================================
  // HISTORICAL DATA BOOTSTRAP ENDPOINTS (Phase 5)
  // ================================

  /**
   * GET /admin/bootstrap/appointments/counts
   * Get appointment counts for a specific month from GoHighLevel
   */
  fastify.get('/bootstrap/appointments/counts', {
    preHandler: fastify.authenticate,
    schema: {
      querystring: {
        type: 'object',
        required: ['clientId', 'year', 'month'],
        properties: {
          clientId: { type: 'string' },
          year: { type: 'integer', minimum: 2020, maximum: 2030 },
          month: { type: 'integer', minimum: 1, maximum: 12 }
        }
      }
    }
  }, async (request, reply) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[Admin-Bootstrap] GET /bootstrap/appointments/counts - Request ID: ${requestId}`);

    try {
      const { clientId, year, month } = request.query;
      
      const { getMonthlyBookingCounts } = await import('../utils/ghl-appointments.js');
      const result = await getMonthlyBookingCounts(clientId, year, month);
      
      console.log(`[Admin-Bootstrap] Appointment counts retrieved for ${clientId}, ${year}-${month} - Request ID: ${requestId}`);
      
      return reply.code(200).send({
        success: true,
        message: 'Appointment counts retrieved successfully',
        data: result,
        requestId
      });
    } catch (error) {
      console.error(`[Admin-Bootstrap] Error getting appointment counts - Request ID: ${requestId}:`, error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get appointment counts',
        details: error.message,
        requestId
      });
    }
  });

  /**
   * POST /admin/bootstrap/appointments/sync
   * Sync appointment data to agent metrics for a specific period
   */
  fastify.post('/bootstrap/appointments/sync', {
    preHandler: fastify.authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['clientId', 'year', 'month'],
        properties: {
          clientId: { type: 'string' },
          year: { type: 'integer', minimum: 2020, maximum: 2030 },
          month: { type: 'integer', minimum: 1, maximum: 12 }
        }
      }
    }
  }, async (request, reply) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[Admin-Bootstrap] POST /bootstrap/appointments/sync - Request ID: ${requestId}`);

    try {
      const { clientId, year, month } = request.body;
      
      const { syncAppointmentMetrics } = await import('../utils/ghl-appointments.js');
      const result = await syncAppointmentMetrics(clientId, year, month);
      
      if (result.success) {
        console.log(`[Admin-Bootstrap] Appointment metrics synced for ${clientId}, ${year}-${month} - Request ID: ${requestId}`);
        return reply.code(200).send({
          success: true,
          message: result.message,
          data: result,
          requestId
        });
      } else {
        console.warn(`[Admin-Bootstrap] Appointment sync failed for ${clientId}, ${year}-${month} - Request ID: ${requestId}:`, result.error);
        return reply.code(400).send({
          success: false,
          error: result.error,
          data: result,
          requestId
        });
      }
    } catch (error) {
      console.error(`[Admin-Bootstrap] Error syncing appointment metrics - Request ID: ${requestId}:`, error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to sync appointment metrics',
        details: error.message,
        requestId
      });
    }
  });

  /**
   * GET /admin/bootstrap/appointments/historical
   * Get historical appointment data for a date range
   */
  fastify.get('/bootstrap/appointments/historical', {
    preHandler: fastify.authenticate,
    schema: {
      querystring: {
        type: 'object',
        required: ['clientId', 'startDate', 'endDate'],
        properties: {
          clientId: { type: 'string' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request, reply) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[Admin-Bootstrap] GET /bootstrap/appointments/historical - Request ID: ${requestId}`);

    try {
      const { clientId, startDate, endDate } = request.query;
      
      const { getHistoricalAppointmentData } = await import('../utils/ghl-appointments.js');
      const result = await getHistoricalAppointmentData(
        clientId, 
        new Date(startDate), 
        new Date(endDate)
      );
      
      console.log(`[Admin-Bootstrap] Historical appointment data retrieved for ${clientId} - Request ID: ${requestId}`);
      
      return reply.code(200).send({
        success: true,
        message: 'Historical appointment data retrieved successfully',
        data: result,
        requestId
      });
    } catch (error) {
      console.error(`[Admin-Bootstrap] Error getting historical appointment data - Request ID: ${requestId}:`, error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get historical appointment data',
        details: error.message,
        requestId
      });
    }
  });

  /**
   * POST /admin/bootstrap/bulk-sync
   * Perform bulk historical data sync for a client
   */
  fastify.post('/bootstrap/bulk-sync', {
    preHandler: fastify.authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['clientId', 'startDate', 'endDate'],
        properties: {
          clientId: { type: 'string' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
          syncElevenLabs: { type: 'boolean', default: true },
          syncAppointments: { type: 'boolean', default: true }
        }
      }
    }
  }, async (request, reply) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[Admin-Bootstrap] POST /bootstrap/bulk-sync - Request ID: ${requestId}`);

    try {
      const { 
        clientId, 
        startDate, 
        endDate, 
        syncElevenLabs = true, 
        syncAppointments = true 
      } = request.body;
      
      const start = new Date(startDate);
      const end = new Date(endDate);
      const results = {
        clientId,
        dateRange: { startDate, endDate },
        elevenLabsSync: { enabled: syncElevenLabs, results: [] },
        appointmentsSync: { enabled: syncAppointments, results: [] },
        summary: { totalMonths: 0, successfulSyncs: 0, errors: 0 }
      };
      
      console.log(`[Admin-Bootstrap] Starting bulk sync for ${clientId} from ${startDate} to ${endDate}`);
      
      // Generate list of months to sync
      const months = [];
      const current = new Date(start.getFullYear(), start.getMonth(), 1);
      const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
      
      while (current <= endMonth) {
        months.push({
          year: current.getFullYear(),
          month: current.getMonth() + 1
        });
        current.setMonth(current.getMonth() + 1);
      }
      
      results.summary.totalMonths = months.length;
      console.log(`[Admin-Bootstrap] Will sync ${months.length} months of data`);
      
      // Sync ElevenLabs data for each month
      if (syncElevenLabs) {
        console.log(`[Admin-Bootstrap] Syncing ElevenLabs data...`);
        const { syncElevenLabsMetrics } = await import('../utils/elevenlabs.js');
        
        for (const { year, month } of months) {
          try {
            const result = await syncElevenLabsMetrics(clientId, year, month);
            results.elevenLabsSync.results.push({
              period: `${year}-${month.toString().padStart(2, '0')}`,
              success: result.success,
              data: result
            });
            if (result.success) results.summary.successfulSyncs++;
            else results.summary.errors++;
          } catch (error) {
            console.error(`[Admin-Bootstrap] ElevenLabs sync error for ${year}-${month}:`, error);
            results.elevenLabsSync.results.push({
              period: `${year}-${month.toString().padStart(2, '0')}`,
              success: false,
              error: error.message
            });
            results.summary.errors++;
          }
        }
      }
      
      // Sync appointments data for each month
      if (syncAppointments) {
        console.log(`[Admin-Bootstrap] Syncing appointments data...`);
        const { syncAppointmentMetrics } = await import('../utils/ghl-appointments.js');
        
        for (const { year, month } of months) {
          try {
            const result = await syncAppointmentMetrics(clientId, year, month);
            results.appointmentsSync.results.push({
              period: `${year}-${month.toString().padStart(2, '0')}`,
              success: result.success,
              data: result
            });
            if (result.success) results.summary.successfulSyncs++;
            else results.summary.errors++;
          } catch (error) {
            console.error(`[Admin-Bootstrap] Appointments sync error for ${year}-${month}:`, error);
            results.appointmentsSync.results.push({
              period: `${year}-${month.toString().padStart(2, '0')}`,
              success: false,
              error: error.message
            });
            results.summary.errors++;
          }
        }
      }
      
      console.log(`[Admin-Bootstrap] Bulk sync completed for ${clientId}. Success: ${results.summary.successfulSyncs}, Errors: ${results.summary.errors} - Request ID: ${requestId}`);
      
      return reply.code(200).send({
        success: true,
        message: `Bulk sync completed. ${results.summary.successfulSyncs} successful syncs, ${results.summary.errors} errors.`,
        data: results,
        requestId
      });
    } catch (error) {
      console.error(`[Admin-Bootstrap] Error during bulk sync - Request ID: ${requestId}:`, error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to perform bulk sync',
        details: error.message,
        requestId
      });
    }
  });

  /**
   * POST /admin/bootstrap/import-historical
   * Comprehensive historical data import with advanced options
   */
  fastify.post('/bootstrap/import-historical', {
    preHandler: fastify.authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['clientId', 'startDate', 'endDate'],
        properties: {
          clientId: { type: 'string' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
          includeElevenLabs: { type: 'boolean', default: true },
          includeAppointments: { type: 'boolean', default: true },
          skipExisting: { type: 'boolean', default: false },
          batchSize: { type: 'integer', minimum: 1, maximum: 12, default: 3 }
        }
      }
    }
  }, async (request, reply) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[Admin-Bootstrap] POST /bootstrap/import-historical - Request ID: ${requestId}`);

    try {
      const { 
        clientId, 
        startDate, 
        endDate,
        includeElevenLabs = true,
        includeAppointments = true,
        skipExisting = false,
        batchSize = 3
      } = request.body;
      
      const { importHistoricalData } = await import('../utils/historical-import.js');
      
      const result = await importHistoricalData(
        clientId,
        new Date(startDate),
        new Date(endDate),
        {
          includeElevenLabs,
          includeAppointments,
          skipExisting,
          batchSize
        }
      );
      
      if (result.success) {
        console.log(`[Admin-Bootstrap] Historical import completed for ${clientId} - Request ID: ${requestId}`);
        return reply.code(200).send({
          success: true,
          message: result.message,
          data: result.data,
          requestId
        });
      } else {
        console.warn(`[Admin-Bootstrap] Historical import failed for ${clientId} - Request ID: ${requestId}:`, result.error);
        return reply.code(400).send({
          success: false,
          error: result.error,
          data: result.data,
          requestId
        });
      }
    } catch (error) {
      console.error(`[Admin-Bootstrap] Error during historical import - Request ID: ${requestId}:`, error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to import historical data',
        details: error.message,
        requestId
      });
    }
  });

  /**
   * GET /admin/bootstrap/validate
   * Validate historical data integrity
   */
  fastify.get('/bootstrap/validate', {
    preHandler: fastify.authenticate,
    schema: {
      querystring: {
        type: 'object',
        required: ['clientId', 'startDate', 'endDate'],
        properties: {
          clientId: { type: 'string' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request, reply) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[Admin-Bootstrap] GET /bootstrap/validate - Request ID: ${requestId}`);

    try {
      const { clientId, startDate, endDate } = request.query;
      
      const { validateHistoricalData } = await import('../utils/historical-import.js');
      const result = await validateHistoricalData(
        clientId,
        new Date(startDate),
        new Date(endDate)
      );
      
      console.log(`[Admin-Bootstrap] Data validation completed for ${clientId} - Request ID: ${requestId}`);
      
      return reply.code(200).send({
        success: true,
        message: result.message,
        data: result.data,
        requestId
      });
    } catch (error) {
      console.error(`[Admin-Bootstrap] Error during data validation - Request ID: ${requestId}:`, error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to validate historical data',
        details: error.message,
        requestId
      });
    }
  });
}
