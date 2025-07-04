// routes/tools.js
/**
 * Tool routes for ElevenLabs integration
 * These routes use admin authentication but accept clientId as a parameter
 * This allows a single ElevenLabs agent to access all client tools
 */

import { authenticateAdmin } from "../auth.js";
import { findClientById } from "../crud.js";
import Client from "../client.js";
import {
  checkAndRefreshToken,
  searchGhlContactByPhone,
  findClientForTool,
} from "../utils/ghl.js";

export default async function toolRoutes(fastify, options) {
  // Admin authentication for all tool routes
  fastify.addHook("preHandler", authenticateAdmin);

  // Auto-discovery endpoint - finds client by various parameters
  // Priority order: twilioPhone -> clientId -> agentId -> phone (customer phone)
  fastify.post("/discover-client", async (request, reply) => {
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    console.log(`[${requestId}] Tool: Client discovery request`);

    const { clientId, phone, twilioPhone, agentId } = request.body;

    try {
      let client = null;
      let foundBy = null;

      // Priority 1: Try Twilio phone number first (most reliable for ElevenLabs)
      if (twilioPhone) {
        // First check primary twilioPhoneNumber
        client = await Client.findOne({
          twilioPhoneNumber: twilioPhone,
          status: "Active",
        });
        if (client) {
          foundBy = "primaryTwilioPhone";
        } else {
          // Then check additional agents' twilioPhoneNumbers
          client = await Client.findOne({
            "additionalAgents.twilioPhoneNumber": twilioPhone,
            status: "Active",
          });
          if (client) foundBy = "additionalTwilioPhone";
        }
      }

      // Priority 2: Try direct client ID lookup
      if (!client && clientId) {
        client = await Client.findOne({ clientId, status: "Active" });
        if (client) foundBy = "clientId";
      }

      // Priority 3: Try agent ID lookup (primary and additional agents)
      if (!client && agentId) {
        // First check primary agentId
        client = await Client.findOne({ agentId, status: "Active" });
        if (client) {
          foundBy = "primaryAgentId";
        } else {
          // Then check additional agents' agentIds
          client = await Client.findOne({
            "additionalAgents.agentId": agentId,
            status: "Active",
          });
          if (client) foundBy = "additionalAgentId";
        }
      }

      // Priority 4: Try customer phone lookup (least reliable)
      if (!client && phone) {
        client = await Client.findOne({
          "clientMeta.phone": phone,
          status: "Active",
        });
        if (client) foundBy = "customerPhone";
      }

      if (!client) {
        return reply.code(404).send({
          error: "Client not found",
          requestId,
          searchedFor: { clientId, phone, twilioPhone, agentId },
          note: "Ensure the Twilio phone number matches a client's twilioPhoneNumber field",
        });
      }

      console.log(
        `[${requestId}] Client found by: ${foundBy} -> ${client.clientId}`
      );

      // Find the specific agent that was matched
      let matchedAgent = null;
      if (foundBy.includes("twilioPhone") && twilioPhone) {
        matchedAgent = client.findAgentByPhone(twilioPhone);
      } else if (foundBy.includes("AgentId") && agentId) {
        matchedAgent = client.findAgentById(agentId);
      }

      return reply.send({
        requestId,
        clientId: client.clientId,
        clientName: client.clientMeta.fullName,
        businessName: client.clientMeta.businessName,
        twilioPhoneNumber: client.twilioPhoneNumber, // Primary phone number
        status: client.status,
        hasGhlIntegration: !!client.refreshToken,
        hasCalendar: !!client.calId,
        foundBy: foundBy,
        matchedAgent: matchedAgent, // Details of the specific agent that matched
        totalAgents: client.getAllAgents().length, // Total number of agents
        allAgents: client.getAllAgents(), // All agents for this client
      });
    } catch (error) {
      console.error(`[${requestId}] Error discovering client:`, error);
      return reply.code(500).send({
        error: "Failed to discover client",
        requestId,
      });
    }
  });

  // Get availability for any client (admin-authenticated)
  fastify.post("/get-availability", async (request, reply) => {
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    console.log(`[${requestId}] Tool: Get availability request`);

    const {
      twilioPhone,
      clientId,
      agentId,
      startDate,
      endDate,
      timezone = "America/New_York",
      enableLookBusy,
    } = request.body;

    try {
      // Find client using discovery logic
      let client = null;
      let foundBy = null;

      // Priority 1: Try Twilio phone number first (most reliable for ElevenLabs)
      if (twilioPhone) {
        client = await Client.findOne({
          twilioPhoneNumber: twilioPhone,
          status: "Active",
        });
        if (client) {
          foundBy = "primaryTwilioPhone";
        } else {
          client = await Client.findOne({
            "additionalAgents.twilioPhoneNumber": twilioPhone,
            status: "Active",
          });
          if (client) foundBy = "additionalTwilioPhone";
        }
      }

      // Priority 2: Try direct client ID lookup
      if (!client && clientId) {
        client = await Client.findOne({ clientId, status: "Active" });
        if (client) foundBy = "clientId";
      }

      // Priority 3: Try agent ID lookup
      if (!client && agentId) {
        client = await Client.findOne({ agentId, status: "Active" });
        if (client) {
          foundBy = "primaryAgentId";
        } else {
          client = await Client.findOne({
            "additionalAgents.agentId": agentId,
            status: "Active",
          });
          if (client) foundBy = "additionalAgentId";
        }
      }

      if (!client) {
        return reply.code(404).send({
          error: "Client not found",
          requestId,
          searchedFor: { twilioPhone, clientId, agentId },
          note: "Provide twilioPhone, clientId, or agentId to find the client",
        });
      }

      console.log(
        `[${requestId}] Client found by: ${foundBy} -> ${client.clientId}`
      );

      // Find the matched agent
      let matchedAgent = null;
      if (foundBy.includes("twilioPhone") && twilioPhone) {
        matchedAgent = client.findAgentByPhone(twilioPhone);
      } else if (foundBy.includes("AgentId") && agentId) {
        matchedAgent = client.findAgentById(agentId);
      }

      // Check if client is active
      if (client.status !== "Active") {
        return reply.code(403).send({
          error: `Client is not active (status: ${client.status})`,
          requestId,
        });
      }

      // Use the calId from client record as the calendarId
      const calendarId = client.calId;
      if (!calendarId) {
        return reply.code(400).send({
          error: "Client does not have a calendar ID configured",
          requestId,
        });
      }

      // Check client has GHL integration
      if (!client.refreshToken) {
        return reply.code(400).send({
          error: "Client does not have GHL integration set up",
          requestId,
        });
      }

      console.log(
        `[${requestId}] Fetching availability for calendar: ${calendarId}`
      );

      // Get or refresh GHL access token
      const { accessToken } = await checkAndRefreshToken(client.clientId);

      // Calculate date parameters
      const startTimestamp = startDate
        ? new Date(startDate).getTime()
        : new Date().getTime();

      const endTimestamp = endDate
        ? new Date(endDate).getTime()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).getTime();

      // Set enableLookBusy default
      const lookBusy = enableLookBusy === "true" || enableLookBusy === true;

      // Construct the URL with proper query parameters
      let url = `https://services.leadconnectorhq.com/calendars/${calendarId}/free-slots?startDate=${startTimestamp}&endDate=${endTimestamp}`;
      url += `&timezone=${encodeURIComponent(timezone)}`;
      if (lookBusy) url += `&enableLookBusy=true`;

      // Make the API request to GHL
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: "2021-04-15",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[${requestId}] GHL API error: ${response.status} ${response.statusText}`,
          errorText
        );
        throw new Error(
          `GHL API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const availabilityData = await response.json();

      // Return response with client context
      return reply.send({
        requestId,
        clientId: client.clientId,
        clientName: client.clientMeta.fullName,
        businessName: client.clientMeta.businessName,
        foundBy: foundBy,
        matchedAgent: matchedAgent,
        dateRange: {
          start: new Date(startTimestamp).toISOString(),
          end: new Date(endTimestamp).toISOString(),
        },
        timezone,
        availability: availabilityData,
        slots: availabilityData._dates_?.slots || [],
      });
    } catch (error) {
      console.error(`[${requestId}] Error fetching availability:`, error);
      return reply.code(500).send({
        error: "Failed to get availability",
        requestId,
      });
    }
  });

  // Book appointment for any client (admin-authenticated)
  fastify.post("/book-appointment", async (request, reply) => {
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    console.log(`[${requestId}] Tool: Book appointment request`);

    const {
      twilioPhone,
      clientId,
      agentId,
      startTime,
      endTime,
      phone,
      meeting_title,
      meeting_location,
    } = request.body;

    try {
      // Find client using discovery logic
      let client = null;
      let foundBy = null;

      // Priority 1: Try Twilio phone number first (most reliable for ElevenLabs)
      if (twilioPhone) {
        client = await Client.findOne({
          twilioPhoneNumber: twilioPhone,
          status: "Active",
        });
        if (client) {
          foundBy = "primaryTwilioPhone";
        } else {
          client = await Client.findOne({
            "additionalAgents.twilioPhoneNumber": twilioPhone,
            status: "Active",
          });
          if (client) foundBy = "additionalTwilioPhone";
        }
      }

      // Priority 2: Try direct client ID lookup
      if (!client && clientId) {
        client = await Client.findOne({ clientId, status: "Active" });
        if (client) foundBy = "clientId";
      }

      // Priority 3: Try agent ID lookup
      if (!client && agentId) {
        client = await Client.findOne({ agentId, status: "Active" });
        if (client) {
          foundBy = "primaryAgentId";
        } else {
          client = await Client.findOne({
            "additionalAgents.agentId": agentId,
            status: "Active",
          });
          if (client) foundBy = "additionalAgentId";
        }
      }

      if (!client) {
        return reply.code(404).send({
          error: "Client not found",
          requestId,
          searchedFor: { twilioPhone, clientId, agentId },
          note: "Provide twilioPhone, clientId, or agentId to find the client",
        });
      }

      console.log(
        `[${requestId}] Client found by: ${foundBy} -> ${client.clientId}`
      );

      // Find the matched agent
      let matchedAgent = null;
      if (foundBy.includes("twilioPhone") && twilioPhone) {
        matchedAgent = client.findAgentByPhone(twilioPhone);
      } else if (foundBy.includes("AgentId") && agentId) {
        matchedAgent = client.findAgentById(agentId);
      }

      // Check if client is active
      if (client.status !== "Active") {
        return reply.code(403).send({
          error: `Client is not active (status: ${client.status})`,
          requestId,
        });
      }

      // Validate required parameters
      if (!startTime || !endTime) {
        return reply.code(400).send({
          error: "Both startTime and endTime are required",
          requestId,
        });
      }

      if (!phone) {
        return reply.code(400).send({
          error: "A phone number is required to find the contact",
          requestId,
        });
      }

      // Use the calId from client record as the calendarId
      const calendarId = client.calId;
      if (!calendarId) {
        return reply.code(400).send({
          error: "Client does not have a calendar ID configured",
          requestId,
        });
      }

      // Check client has GHL integration
      if (!client.refreshToken) {
        return reply.code(400).send({
          error: "Client does not have GHL integration set up",
          requestId,
        });
      }

      console.log(
        `[${requestId}] Booking appointment for calendar: ${calendarId}`
      );

      // Get or refresh GHL access token
      const { accessToken } = await checkAndRefreshToken(client.clientId);

      // Search for contact
      const contactSearchResult = await searchGhlContactByPhone(
        accessToken,
        phone,
        client.clientId
      );

      if (!contactSearchResult) {
        return reply.code(404).send({
          error: "Contact not found in GoHighLevel",
          details: "No contact exists with the provided phone number",
          requestId,
        });
      }

      const contactData = contactSearchResult;
      const contactId = contactData.id;

      if (!contactId) {
        return reply.code(500).send({
          error: "Invalid contact data returned from GHL",
          requestId,
        });
      }

      // Create the custom appointment title
      const contactFirstName = contactData.firstNameLowerCase || "Appointment";
      const title = `${contactFirstName} x ${
        client.clientMeta.businessName || "Business"
      } - ${meeting_title || "Consultation"}`;

      // Book the appointment
      const appointmentData = {
        calendarId,
        locationId: client.clientId,
        contactId,
        startTime,
        endTime,
        title,
        meetingLocationType: "default",
        appointmentStatus: "confirmed",
        address: meeting_location || "Google Meet",
        ignoreDateRange: false,
        toNotify: true,
        ignoreFreeSlotValidation: false,
      };

      const response = await fetch(
        "https://services.leadconnectorhq.com/calendars/events/appointments",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Version: "2021-04-15",
          },
          body: JSON.stringify(appointmentData),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[${requestId}] GHL API error: ${response.status} ${response.statusText}`,
          errorText
        );
        throw new Error(
          `GHL API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const appointmentResult = await response.json();

      return reply.send({
        requestId,
        clientId: client.clientId,
        clientName: client.clientMeta.fullName,
        businessName: client.clientMeta.businessName,
        foundBy: foundBy,
        matchedAgent: matchedAgent,
        status: "success",
        message: "Appointment booked successfully",
        appointmentId: appointmentResult.id,
        details: {
          calendarId,
          locationId: client.clientId,
          contactId,
          startTime,
          endTime,
          title,
          status: "confirmed",
          address: meeting_location || "Google Meet",
          isRecurring: false,
        },
        contact: {
          id: contactId,
          name: contactData.firstNameLowerCase || "Unknown",
          phone: phone,
        },
      });
    } catch (error) {
      console.error(`[${requestId}] Error booking appointment:`, error);
      return reply.code(500).send({
        error: "Failed to book appointment",
        requestId,
      });
    }
  });

  // Get client info for any client (admin-authenticated)
  fastify.post("/get-info", async (request, reply) => {
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    console.log(`[${requestId}] Tool: Get info request`);

    const { twilioPhone, clientId, agentId, phone } = request.body;

    try {
      // Find client using discovery logic
      let client = null;
      let foundBy = null;

      // Priority 1: Try Twilio phone number first (most reliable for ElevenLabs)
      if (twilioPhone) {
        client = await Client.findOne({
          twilioPhoneNumber: twilioPhone,
          status: "Active",
        });
        if (client) {
          foundBy = "primaryTwilioPhone";
        } else {
          client = await Client.findOne({
            "additionalAgents.twilioPhoneNumber": twilioPhone,
            status: "Active",
          });
          if (client) foundBy = "additionalTwilioPhone";
        }
      }

      // Priority 2: Try direct client ID lookup
      if (!client && clientId) {
        client = await Client.findOne({ clientId, status: "Active" });
        if (client) foundBy = "clientId";
      }

      // Priority 3: Try agent ID lookup
      if (!client && agentId) {
        client = await Client.findOne({ agentId, status: "Active" });
        if (client) {
          foundBy = "primaryAgentId";
        } else {
          client = await Client.findOne({
            "additionalAgents.agentId": agentId,
            status: "Active",
          });
          if (client) foundBy = "additionalAgentId";
        }
      }

      if (!client) {
        return reply.code(404).send({
          error: "Client not found",
          requestId,
          searchedFor: { twilioPhone, clientId, agentId },
          note: "Provide twilioPhone, clientId, or agentId to find the client",
        });
      }

      console.log(
        `[${requestId}] Client found by: ${foundBy} -> ${client.clientId}`
      );

      // Find the matched agent
      let matchedAgent = null;
      if (foundBy.includes("twilioPhone") && twilioPhone) {
        matchedAgent = client.findAgentByPhone(twilioPhone);
      } else if (foundBy.includes("AgentId") && agentId) {
        matchedAgent = client.findAgentById(agentId);
      }

      // Check if client is active
      if (client.status !== "Active") {
        return reply.code(403).send({
          error: `Client is not active (status: ${client.status})`,
          requestId,
        });
      }

      // Check client has GHL integration
      if (!client.refreshToken) {
        return reply.code(400).send({
          error: "Client does not have GHL integration set up",
          requestId,
        });
      }

      // Get or refresh GHL access token
      const { accessToken } = await checkAndRefreshToken(client.clientId);

      let contactInfo = null;
      if (phone) {
        // Search for contact by phone
        try {
          contactInfo = await searchGhlContactByPhone(
            accessToken,
            phone,
            client.clientId
          );
        } catch (error) {
          console.log(`[${requestId}] Contact search failed:`, error.message);
        }
      }

      return reply.send({
        requestId,
        clientId: client.clientId,
        foundBy: foundBy,
        matchedAgent: matchedAgent,
        clientInfo: {
          name: client.clientMeta.fullName,
          businessName: client.clientMeta.businessName,
          email: client.clientMeta.email,
          phone: client.clientMeta.phone,
          city: client.clientMeta.city,
          jobTitle: client.clientMeta.jobTitle,
        },
        contactInfo,
        hasContact: !!contactInfo,
      });
    } catch (error) {
      console.error(`[${requestId}] Error getting info:`, error);
      return reply.code(500).send({
        error: "Failed to get client info",
        requestId,
      });
    }
  });

  // Get time utility function for any client (admin-authenticated)
  fastify.get("/get-time", async (request, reply) => {
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    console.log(`[${requestId}] Tool: Get time request`);

    try {
      // Get query parameters (default to 0 if not provided)
      const { day = 0, week = 0 } = request.query;

      // Convert parameters to integers
      const daysToAdd = parseInt(day);
      const weeksToAdd = parseInt(week);

      // Validate parameters are numbers
      if (isNaN(daysToAdd) || isNaN(weeksToAdd)) {
        return reply.code(400).send({
          error: "Invalid parameters: day and week must be numbers",
          requestId,
        });
      }

      // Get current date
      const currentDate = new Date();

      // Calculate total days to add (weeks * 7 + days)
      const totalDays = weeksToAdd * 7 + daysToAdd;

      // Add/subtract days from current date
      currentDate.setDate(currentDate.getDate() + totalDays);

      // Get Unix timestamp in milliseconds
      const timestamp = currentDate.getTime();

      // Format the date as "YYYY-MM-DD"
      const formattedString = currentDate.toISOString().split("T")[0];

      // Log the request
      console.log(
        `[${requestId}] Timestamp requested: ${timestamp}, days: ${daysToAdd}, weeks: ${weeksToAdd}`
      );

      // Return formatted date string (matching existing endpoint behavior)
      reply.send(formattedString);
    } catch (error) {
      console.error(`[${requestId}] Error getting time:`, error);
      return reply.code(500).send({
        error: "Failed to get time",
        requestId,
      });
    }
  });
}
