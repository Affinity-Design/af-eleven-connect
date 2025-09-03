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

      // Track call discovery as potential call start (inbound call tracking)
      try {
        // Only track if we have a matched agent and this looks like a call discovery
        if (matchedAgent && (twilioPhone || agentId)) {
          const { updateCallMetrics } = await import('../utils/metrics.js');
          
          console.log(`[${requestId}] Tracking inbound call discovery for agent: ${matchedAgent.agentId}`);
          
          // Track as inbound call with no duration yet and no booking yet
          await updateCallMetrics(
            client.clientId,
            matchedAgent.agentId,
            "inbound",
            0, // Duration not available at discovery time
            false // No booking yet
          );
          
          console.log(`[${requestId}] Inbound call metrics updated successfully`);
        }
      } catch (metricsError) {
        console.error(`[${requestId}] Failed to update call discovery metrics:`, metricsError);
        // Don't fail the discovery if metrics update fails
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
    console.log(
      `[${requestId}] Request payload:`,
      JSON.stringify(request.body, null, 2)
    );

    const {
      twilioPhone,
      clientId,
      agentId,
      startTime,
      endTime,
      phone,
      meetingTitle,
      meetingLocation,
      name, // New parameter for caller's name
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

      if (!phone || phone === "unknown" || phone.trim() === "") {
        return reply.code(400).send({
          error: "A valid phone number is required to find the contact",
          requestId,
          received: phone,
        });
      }

      // Normalize phone number (remove spaces, ensure + prefix)
      let normalizedPhone = phone.trim();
      if (!normalizedPhone.startsWith("+")) {
        normalizedPhone = "+" + normalizedPhone;
      }

      console.log(
        `[${requestId}] Original phone: "${phone}", normalized: "${normalizedPhone}"`
      );

      if (name && name.trim()) {
        console.log(`[${requestId}] Caller name provided: "${name}"`);
      } else {
        console.log(
          `[${requestId}] No caller name provided, will use defaults if creating contact`
        );
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
      console.log(
        `[${requestId}] Appointment details: ${startTime} to ${endTime}, phone: ${phone}`
      );

      // Get or refresh GHL access token
      const { accessToken } = await checkAndRefreshToken(client.clientId);

      console.log(
        `[${requestId}] Searching for contact with phone: ${normalizedPhone}`
      );

      // Search for contact
      let contactSearchResult = await searchGhlContactByPhone(
        accessToken,
        normalizedPhone,
        client.clientId
      );

      // If not found, try without country code for North American numbers
      if (!contactSearchResult && normalizedPhone.startsWith("+1")) {
        const withoutCountryCode = normalizedPhone.substring(2); // Remove +1
        console.log(
          `[${requestId}] Retrying search without country code: ${withoutCountryCode}`
        );
        contactSearchResult = await searchGhlContactByPhone(
          accessToken,
          withoutCountryCode,
          client.clientId
        );
      }

      // If still not found, try the original format
      if (!contactSearchResult && phone !== normalizedPhone) {
        console.log(
          `[${requestId}] Retrying search with original format: ${phone}`
        );
        contactSearchResult = await searchGhlContactByPhone(
          accessToken,
          phone,
          client.clientId
        );
      }

      if (!contactSearchResult) {
        console.log(
          `[${requestId}] Contact not found for phone: ${normalizedPhone} (tried multiple formats) in location: ${client.clientId}`
        );
        console.log(
          `[${requestId}] Creating new contact with phone: ${normalizedPhone}`
        );

        // Create new contact in GoHighLevel
        // Parse name if provided, otherwise use defaults
        let firstName = "New";
        let lastName = "Contact";

        if (name && name.trim()) {
          const nameParts = name.trim().split(" ");
          firstName = nameParts[0] || "New";
          lastName = nameParts.slice(1).join(" ") || "Contact";
        }

        const newContactData = {
          firstName: firstName,
          lastName: lastName,
          phone: normalizedPhone,
          locationId: client.clientId,
          source: "ElevenLabs AI Call", // Track the source
        };

        console.log(
          `[${requestId}] Creating contact: ${firstName} ${lastName} (${normalizedPhone})`
        );

        try {
          const createResponse = await fetch(
            "https://services.leadconnectorhq.com/contacts/",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                Version: "2021-07-28",
              },
              body: JSON.stringify(newContactData),
            }
          );

          if (!createResponse.ok) {
            const createErrorText = await createResponse.text();
            console.error(
              `[${requestId}] Failed to create contact: ${createResponse.status} ${createResponse.statusText}`,
              createErrorText
            );
            return reply.code(500).send({
              error: "Failed to create contact in GoHighLevel",
              details: createErrorText,
              requestId,
              phone: normalizedPhone,
              clientId: client.clientId,
            });
          }

          const createdContact = await createResponse.json();
          console.log(
            `[${requestId}] Successfully created contact with ID: ${createdContact.contact.id}`
          );

          // Use the newly created contact
          contactSearchResult = createdContact.contact;
        } catch (createError) {
          console.error(`[${requestId}] Error creating contact:`, createError);
          return reply.code(500).send({
            error: "Failed to create contact in GoHighLevel",
            details: createError.message,
            requestId,
            phone: normalizedPhone,
            clientId: client.clientId,
          });
        }
      }

      const contactData = contactSearchResult;
      const contactId = contactData.id;
      const wasContactCreated =
        !contactData.dateAdded ||
        new Date(contactData.dateAdded) > new Date(Date.now() - 60000); // Created in last minute

      if (!contactId) {
        return reply.code(500).send({
          error: "Invalid contact data returned from GHL",
          requestId,
        });
      }

      console.log(
        `[${requestId}] Using contact ID: ${contactId} ${
          wasContactCreated ? "(newly created)" : "(existing)"
        }`
      );

      // Create the custom appointment title
      // Use the provided name, or fall back to contact data, or default
      let appointmentFirstName;
      if (name && name.trim()) {
        appointmentFirstName = name.trim().split(" ")[0];
      } else {
        appointmentFirstName =
          contactData.firstNameLowerCase ||
          contactData.firstName ||
          "Appointment";
      }

      // Get meeting title from matched agent or use API override
      let defaultMeetingTitle = "Consultation"; // Final fallback
      if (matchedAgent && matchedAgent.meetingTitle) {
        defaultMeetingTitle = matchedAgent.meetingTitle;
      } else if (!matchedAgent && client.meetingTitle) {
        // Fallback to primary agent meeting title when no specific agent matched
        defaultMeetingTitle = client.meetingTitle;
      }

      const finalMeetingTitle = meetingTitle || defaultMeetingTitle;

      console.log(
        `[${requestId}] Meeting title logic: API="${meetingTitle}", Agent="${matchedAgent?.meetingTitle}", Client="${client.meetingTitle}", Final="${finalMeetingTitle}"`
      );

      // Get meeting location from matched agent or use API override
      let defaultMeetingLocation = "Google Meet"; // Final fallback
      if (matchedAgent && matchedAgent.meetingLocation) {
        defaultMeetingLocation = matchedAgent.meetingLocation;
      } else if (!matchedAgent && client.meetingLocation) {
        // Fallback to primary agent meeting location when no specific agent matched
        defaultMeetingLocation = client.meetingLocation;
      }

      const finalMeetingLocation = meetingLocation || defaultMeetingLocation;

      console.log(
        `[${requestId}] Meeting location logic: API="${meetingLocation}", Agent="${matchedAgent?.meetingLocation}", Client="${client.meetingLocation}", Final="${finalMeetingLocation}"`
      );

      const title = `${appointmentFirstName} x ${
        client.clientMeta.businessName || "Business"
      } - ${finalMeetingTitle}`;

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
        address: finalMeetingLocation,
        ignoreDateRange: false,
        toNotify: true,
        ignoreFreeSlotValidation: false,
      };

      console.log(
        `[${requestId}] Sending appointment data to GHL:`,
        JSON.stringify(appointmentData, null, 2)
      );

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
        console.error(
          `[${requestId}] Failed appointment data:`,
          JSON.stringify(appointmentData, null, 2)
        );

        return reply.code(response.status).send({
          error: "Failed to book appointment with GoHighLevel",
          ghlError: errorText,
          ghlStatus: response.status,
          requestId,
          appointmentData,
        });
      }

      const appointmentResult = await response.json();

      // Update metrics for successful booking
      try {
        const { updateCallMetrics } = await import('../utils/metrics.js');
        const actualAgentId = matchedAgent ? matchedAgent.agentId : client.agentId;
        
        console.log(`[${requestId}] Updating metrics for successful booking - Agent: ${actualAgentId}`);
        
        // Track this as a successful booking (we'll assume it's inbound since it's coming through tools)
        await updateCallMetrics(
          client.clientId,
          actualAgentId,
          "inbound", // Assuming tools endpoint calls are typically inbound
          0, // Duration not available at booking time
          true // This is a successful booking
        );
        
        console.log(`[${requestId}] Metrics updated successfully for booking`);
      } catch (metricsError) {
        console.error(`[${requestId}] Failed to update metrics for booking:`, metricsError);
        // Don't fail the booking if metrics update fails
      }

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
          address: finalMeetingLocation,
          isRecurring: false,
        },
        contact: {
          id: contactId,
          name:
            contactData.firstNameLowerCase ||
            contactData.firstName ||
            "New Contact",
          phone: normalizedPhone,
          wasCreated: wasContactCreated,
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
  fastify.post("/get-client-info", async (request, reply) => {
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    console.log(`[${requestId}] Tool: Get client info request`);

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
