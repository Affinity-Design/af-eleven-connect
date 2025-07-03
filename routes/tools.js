// routes/tools.js
/**
 * Tool routes for ElevenLabs integration
 * These routes use admin authentication but accept clientId as a parameter
 * This allows a single ElevenLabs agent to access all client tools
 */

import { authenticateAdmin } from "../auth.js";
import { findClientById } from "../crud.js";
import { checkAndRefreshToken, searchGhlContactByPhone, findClientForTool } from "../utils/ghl.js";

export default async function toolRoutes(fastify, options) {
  // Admin authentication for all tool routes
  fastify.addHook("preHandler", authenticateAdmin);

  // Auto-discovery endpoint - finds client by various parameters
  fastify.post("/discover-client", async (request, reply) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    console.log(`[${requestId}] Tool: Client discovery request`);

    const { clientId, phone, twilioPhone, agentId } = request.body;

    try {
      const client = await findClientForTool({ clientId, phone, twilioPhone, agentId });
      
      if (!client) {
        return reply.code(404).send({
          error: "Client not found",
          requestId,
          searchedFor: { clientId, phone, twilioPhone, agentId }
        });
      }

      return reply.send({
        requestId,
        clientId: client.clientId,
        clientName: client.clientMeta.fullName,
        businessName: client.clientMeta.businessName,
        status: client.status,
        hasGhlIntegration: !!client.refreshToken,
        hasCalendar: !!client.calId,
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
  fastify.get("/get-availability/:clientId", async (request, reply) => {
    const { clientId } = request.params;
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    console.log(`[${requestId}] Tool: Get availability request for client: ${clientId}`);

    const {
      startDate,
      endDate,
      timezone = "America/New_York",
      enableLookBusy,
    } = request.query;

    try {
      // Find client by ID
      const client = await findClientById(clientId);
      if (!client) {
        return reply.code(404).send({
          error: "Client not found",
          requestId,
        });
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

      console.log(`[${requestId}] Fetching availability for calendar: ${calendarId}`);

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
        clientId,
        clientName: client.clientMeta.fullName,
        businessName: client.clientMeta.businessName,
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
  fastify.post("/book-appointment/:clientId", async (request, reply) => {
    const { clientId } = request.params;
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    console.log(`[${requestId}] Tool: Book appointment request for client: ${clientId}`);

    const {
      startTime,
      endTime,
      phone,
      meeting_title,
      meeting_location,
    } = request.body;

    try {
      // Find client by ID
      const client = await findClientById(clientId);
      if (!client) {
        return reply.code(404).send({
          error: "Client not found",
          requestId,
        });
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

      console.log(`[${requestId}] Booking appointment for calendar: ${calendarId}`);

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
        clientId,
        clientName: client.clientMeta.fullName,
        businessName: client.clientMeta.businessName,
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
  fastify.get("/get-info/:clientId", async (request, reply) => {
    const { clientId } = request.params;
    const { phone } = request.query;
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    console.log(`[${requestId}] Tool: Get info request for client: ${clientId}`);

    try {
      // Find client by ID
      const client = await findClientById(clientId);
      if (!client) {
        return reply.code(404).send({
          error: "Client not found",
          requestId,
        });
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
        clientId,
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
}
