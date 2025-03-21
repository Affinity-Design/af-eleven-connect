// Code for the server-side application
import Fastify from "fastify";
import WebSocket from "ws";
import dotenv from "dotenv";
import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";
import Twilio from "twilio";
import fetch from "node-fetch";
import mongoose from "mongoose";
import Client from "./client.js";
import {
  createClient,
  findClientById,
  findClientByPhone,
  updateClient,
  addCallToHistory,
  updateCallDetails,
  deleteClient,
} from "./crud.js";

import {
  generateToken,
  generateAdminToken,
  verifyToken,
  authenticateClient,
  authenticateAdmin,
  handleClientLogin,
  verifyClientToken,
} from "./auth.js";

import { checkAndRefreshToken, searchGhlContactByPhone } from "./utils/ghl.js";

// Import route modules
import clientRoutes from "./routes/client.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import integrationsRoutes from "./routes/integrations.js";

// Load environment variables from .env file
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/clientsDB"
    );
    console.log("MongoDB connected successfully");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
};

// Initialize config store with required API keys
const configStore = {
  // Environment variables for API keys
  REDIRECT_URL: process.env.REDIRECT_URL,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  SERVER_SECRET: process.env.SERVER_SECRET,
  GHL_API_KEY: process.env.GHL_API_KEY,

  // Active connections
  activeConnections: new Map(), // Map of streamSid to connection info
};

// Validate required environment variables
if (!configStore.TWILIO_ACCOUNT_SID || !configStore.TWILIO_AUTH_TOKEN) {
  console.error("Missing required Twilio credentials in environment variables");
  process.exit(1);
}
if (!configStore.ELEVENLABS_API_KEY) {
  console.error("Missing required ElevenLabs API key in environment variables");
  process.exit(1);
}
if (!configStore.TWILIO_ACCOUNT_SID || !configStore.TWILIO_AUTH_TOKEN) {
  console.error("Missing required Twilio credentials in environment variables");
  process.exit(1);
}

// Initialize Fastify server
const fastify = Fastify({ logger: true });
// Register route groups
fastify.register(fastifyWs);
fastify.register(authRoutes, { prefix: "/auth" });
fastify.register(clientRoutes, {
  prefix: "/secure",
  preHandler: authenticateClient,
});
fastify.register(adminRoutes, {
  prefix: "/admin",
  preHandler: authenticateAdmin,
});
fastify.register(integrationsRoutes, { prefix: "/integrations" });

// Initialize Twilio client
const twilioClient = new Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const PORT = process.env.PORT || 8000;

// Helper function to get signed URL for authenticated ElevenLabs conversations
async function getSignedUrl(agentId) {
  // If no agentId is provided, use the first one from the config store
  const effectiveAgentId = agentId || configStore.ELEVENLABS_AGENT_IDS[0];

  if (!effectiveAgentId) {
    throw new Error("No agent ID available");
  }

  try {
    console.log(
      `[ElevenLabs] Getting signed URL for agent: ${effectiveAgentId}`
    );
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${effectiveAgentId}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": configStore.ELEVENLABS_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get signed URL: ${response.statusText}`);
    }

    const data = await response.json();
    return data.signed_url;
  } catch (error) {
    console.error("Error getting signed URL:", error);
    throw error;
  }
}

// Config routes ///////////////////////////////////////

// Root route for health check
fastify.get("/", async (_, reply) => {
  reply.send({ message: "Server is running" });
});

// API to get server status and configuration
fastify.get("/status", async (request, reply) => {
  try {
    // Get count of active clients in database
    const clientCount = await Client.countDocuments();

    reply.send({
      status: "online",
      mongoDbConnected: mongoose.connection.readyState === 1,
      activeConnections: Array.from(configStore.activeConnections.keys())
        .length,
      clientCount,
    });
  } catch (error) {
    console.error("Error fetching status:", error);
    reply.code(500).send({
      status: "error",
      message: "Failed to fetch server status",
      error: error.message,
    });
  }
});

// WebSocket routes ///////////////////////////////////////

// TODO WebSocket inbound route for handling media streams from Twilio
fastify.register(async (fastifyInstance) => {
  fastifyInstance.get(
    "/media-stream",
    { websocket: true },
    (connection, req) => {
      console.info("[Server] Twilio connected to media stream.");

      let streamSid = null;

      // Connect to ElevenLabs Conversational AI WebSocket
      const elevenLabsWs = new WebSocket(
        `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${configStore.ELEVENLABS_AGENT_IDS[0]}`
      );

      elevenLabsWs.on("open", () => {
        console.log("[II] Connected to Conversational AI.");
      });

      elevenLabsWs.on("message", (data) => {
        try {
          const message = JSON.parse(data);
          handleElevenLabsMessage(message, connection);
        } catch (error) {
          console.error("[II] Error parsing message:", error);
        }
      });

      elevenLabsWs.on("error", (error) => {
        console.error("[II] WebSocket error:", error);
      });

      elevenLabsWs.on("close", () => {
        console.log("[II] Disconnected.");
      });

      const handleElevenLabsMessage = (message, connection) => {
        switch (message.type) {
          case "conversation_initiation_metadata":
            console.info("[II] Received conversation initiation metadata.");
            break;
          case "audio":
            if (message.audio_event?.audio_base_64) {
              const audioData = {
                event: "media",
                streamSid,
                media: {
                  payload: message.audio_event.audio_base_64,
                },
              };
              connection.send(JSON.stringify(audioData));
            }
            break;
          case "interruption":
            connection.send(JSON.stringify({ event: "clear", streamSid }));
            break;
          case "ping":
            if (message.ping_event?.event_id) {
              const pongResponse = {
                type: "pong",
                event_id: message.ping_event.event_id,
              };
              elevenLabsWs.send(JSON.stringify(pongResponse));
            }
            break;
        }
      };

      connection.on("message", async (message) => {
        try {
          const data = JSON.parse(message);
          switch (data.event) {
            case "start":
              streamSid = data.start.streamSid;
              console.log(`[Twilio] Stream started with ID: ${streamSid}`);
              break;
            case "media":
              if (elevenLabsWs.readyState === WebSocket.OPEN) {
                const audioMessage = {
                  user_audio_chunk: Buffer.from(
                    data.media.payload,
                    "base64"
                  ).toString("base64"),
                };
                elevenLabsWs.send(JSON.stringify(audioMessage));
              }
              break;
            case "stop":
              elevenLabsWs.close();
              break;
            default:
              console.log(`[Twilio] Received unhandled event: ${data.event}`);
          }
        } catch (error) {
          console.error("[Twilio] Error processing message:", error);
        }
      });

      connection.on("close", () => {
        elevenLabsWs.close();
        console.log("[Twilio] Client disconnected");
      });

      connection.on("error", (error) => {
        console.error("[Twilio] WebSocket error:", error);
        elevenLabsWs.close();
      });
    }
  );
});

// WebSocket outbound route for handling media streams from Twilio
fastify.register(async (fastifyInstance) => {
  fastifyInstance.get(
    "/outbound-media-stream",
    { websocket: true },
    (ws, req) => {
      console.info("[Server] Twilio connected to outbound media stream");
      console.log("[Server] Query parameters:", req.query);
      console.log("[Server] Query req body:", req.requestBody);
      console.log("[Server] Query body:", req.body);

      // Variables to track the call
      let streamSid = null;
      let callSid = null;
      let elevenLabsWs = null;
      let customParameters = null;
      let isElevenLabsReady = false;
      let messageQueue = []; // Queue to store messages until ElevenLabs is ready
      let clientInfo = null; // Store client information from get-info API

      // Handle WebSocket errors
      ws.on("error", (error) => {
        console.error("[Twilio WebSocket] Error:", error);
      });

      // Process any queued messages
      const processQueuedMessages = () => {
        if (!isElevenLabsReady || !elevenLabsWs || messageQueue.length === 0)
          return;

        console.log(
          `[ElevenLabs] Processing ${messageQueue.length} queued messages`
        );

        while (messageQueue.length > 0) {
          const msg = messageQueue.shift();
          try {
            if (elevenLabsWs.readyState === WebSocket.OPEN) {
              elevenLabsWs.send(JSON.stringify(msg));
            }
          } catch (error) {
            console.error("[ElevenLabs] Error sending queued message:", error);
          }
        }
      };

      // Set up ElevenLabs connection - but we'll call this after receiving start event
      const setupElevenLabs = async () => {
        try {
          // Use the agent ID from parameters or default
          const agentId =
            customParameters?.agentId ||
            req.query.agentId ||
            configStore.ELEVENLABS_AGENT_IDS[0];

          if (!agentId) {
            throw new Error("No agent ID available");
          }

          console.log(
            `[ElevenLabs] Setting up connection with agent ID: ${agentId}`
          );
          const signedUrl = await getSignedUrl(agentId);

          elevenLabsWs = new WebSocket(signedUrl);

          elevenLabsWs.on("error", (error) => {
            console.error("[ElevenLabs] WebSocket error:", error);
          });

          elevenLabsWs.on("open", () => {
            console.log("[ElevenLabs] Connected to Conversational AI");

            try {
              // Create the config with proper format TODO test

              // Extract dynamic variables from custom parameters
              const dynamicVariables = {};

              // Add each parameter as a dynamic variable if it exists
              if (customParameters?.full_name)
                dynamicVariables.full_name = customParameters.full_name;
              if (customParameters?.business_name)
                dynamicVariables.business_name = customParameters.business_name;
              if (customParameters?.city)
                dynamicVariables.city = customParameters.city;
              if (customParameters?.job_title)
                dynamicVariables.job_title = customParameters.job_title;
              if (customParameters?.email)
                dynamicVariables.email = customParameters.email;
              if (customParameters?.phone)
                dynamicVariables.phone = customParameters.phone;

              // Create the initialization config with dynamic variables
              const initialConfig = {
                type: "conversation_initiation_client_data",
                dynamic_variables: dynamicVariables,
                conversation_config_override: {
                  agent: {
                    first_message:
                      customParameters?.first_message ||
                      "Hello, how can I help you today?",
                  },
                },
              };

              console.log(
                "[ElevenLabs] Sending initial config with dynamic variables:",
                JSON.stringify(initialConfig)
              );

              // Send the configuration to ElevenLabs
              elevenLabsWs.send(JSON.stringify(initialConfig));

              // Mark as ready and process any queued messages
              isElevenLabsReady = true;
              processQueuedMessages();
            } catch (configError) {
              console.error(
                "[ElevenLabs] Error preparing configuration:",
                configError
              );
            }
          });

          elevenLabsWs.on("message", (data) => {
            try {
              const message = JSON.parse(data);

              switch (message.type) {
                case "conversation_initiation_metadata":
                  console.log("[ElevenLabs] Received initiation metadata");
                  break;

                case "audio":
                  if (message.audio_event?.audio_base_64) {
                    if (streamSid) {
                      console.log("[ElevenLabs] Sending audio to Twilio");
                      ws.send(
                        JSON.stringify({
                          event: "media",
                          streamSid,
                          media: {
                            payload: message.audio_event.audio_base_64,
                          },
                        })
                      );
                    } else {
                      console.log(
                        "[ElevenLabs] Have audio but no StreamSid yet"
                      );
                    }
                  }
                  break;

                case "ping":
                  if (message.ping_event?.event_id) {
                    console.log("[ElevenLabs] Received ping, sending pong");
                    elevenLabsWs.send(
                      JSON.stringify({
                        type: "pong",
                        event_id: message.ping_event.event_id,
                      })
                    );
                  }
                  break;

                case "agent_response":
                  console.log(
                    `[Twilio] Agent response: ${message.agent_response_event?.agent_response}`
                  );
                  break;

                case "user_transcript":
                  console.log(
                    `[Twilio] User transcript: ${message.user_transcription_event?.user_transcript}`
                  );
                  break;

                case "interruption":
                  if (streamSid) {
                    console.log("[ElevenLabs] Sending clear event to Twilio");
                    ws.send(
                      JSON.stringify({
                        event: "clear",
                        streamSid,
                      })
                    );
                  }
                  break;

                default:
                  console.log(
                    `[ElevenLabs] Unhandled message type: ${message.type}`
                  );
              }
            } catch (error) {
              console.error("[ElevenLabs] Error processing message:", error);
            }
          });

          elevenLabsWs.on("close", (code, reason) => {
            console.log(
              `[ElevenLabs] Disconnected: Code: ${code}, Reason: ${
                reason || "No reason provided"
              }`
            );
            isElevenLabsReady = false;
          });
        } catch (error) {
          console.error("[ElevenLabs] Setup error:", error);
        }
      };

      // Handle messages from Twilio
      ws.on("message", async (message) => {
        try {
          const msg = JSON.parse(message);

          switch (msg.event) {
            case "start":
              streamSid = msg.start.streamSid;
              callSid = msg.start.callSid;
              customParameters = msg.start.customParameters || {};

              console.log(
                `[Twilio] Stream started - StreamSid: ${streamSid}, CallSid: ${callSid}`
              );
              console.log(
                "[Twilio] Start parameters:",
                JSON.stringify(customParameters || {})
              );

              // Now that we have the parameters, set up ElevenLabs
              await setupElevenLabs();
              break;

            case "media":
              if (
                isElevenLabsReady &&
                elevenLabsWs &&
                elevenLabsWs.readyState === WebSocket.OPEN
              ) {
                // Connection is ready, send immediately
                const audioMessage = {
                  user_audio_chunk: Buffer.from(
                    msg.media.payload,
                    "base64"
                  ).toString("base64"),
                };
                elevenLabsWs.send(JSON.stringify(audioMessage));
              } else if (elevenLabsWs) {
                // Connection exists but not ready, queue the message
                console.log(
                  "[Twilio] Queueing audio message until ElevenLabs is ready"
                );
                messageQueue.push({
                  user_audio_chunk: Buffer.from(
                    msg.media.payload,
                    "base64"
                  ).toString("base64"),
                });
              } else {
                // No connection yet, just log
                console.log(
                  "[Twilio] Received audio but ElevenLabs connection not initialized yet"
                );
              }
              break;

            case "stop":
              console.log(`[Twilio] Stream ${streamSid} ended`);
              if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
                elevenLabsWs.close(1000, "Call completed");
              }
              break;

            default:
              console.log(`[Twilio] Unhandled event: ${msg.event}`);
          }
        } catch (error) {
          console.error("[Twilio] Error processing message:", error);
        }
      });

      // Handle WebSocket closure
      ws.on("close", () => {
        console.log("[Twilio] Client disconnected");
        if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
          elevenLabsWs.close(1000, "Twilio disconnected");
        }
      });
    }
  );
});

// API routes ///////////////////////////////////////

// Route to handle incoming calls from Twilio
fastify.all("/incoming-call-eleven", async (request, reply) => {
  // Generate TwiML response to connect the call to a WebSocket stream
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Connect>
          <Stream url="wss://${request.headers.host}/media-stream" />
        </Connect>
      </Response>`;

  reply.type("text/xml").send(twimlResponse);
});

// Route to handle outbound calls from Twilio
fastify.all("/outbound-call-twiml", async (request, reply) => {
  // Extract all query parameters for dynamic variables
  const {
    first_message,
    full_name,
    business_name,
    city,
    job_title,
    email,
    phone,
    requestId,
  } = request.query;

  console.log(
    `[${requestId || "unknown"}] Generating TwiML with parameters:`,
    request.query
  );

  // Create the TwiML response that passes all variables to the WebSocket stream
  let twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Connect>
        <Stream url="wss://${request.headers.host}/outbound-media-stream">`;

  // Add each parameter to the TwiML if it exists
  if (first_message)
    twimlResponse += `\n          <Parameter name="first_message" value="${first_message}" />`;
  if (full_name)
    twimlResponse += `\n          <Parameter name="full_name" value="${full_name}" />`;
  if (business_name)
    twimlResponse += `\n          <Parameter name="business_name" value="${business_name}" />`;
  if (city)
    twimlResponse += `\n          <Parameter name="city" value="${city}" />`;
  if (job_title)
    twimlResponse += `\n          <Parameter name="job_title" value="${job_title}" />`;
  if (email)
    twimlResponse += `\n          <Parameter name="email" value="${email}" />`;
  if (phone)
    twimlResponse += `\n          <Parameter name="phone" value="${phone}" />`;
  if (requestId)
    twimlResponse += `\n          <Parameter name="requestId" value="${requestId}" />`;

  // Close the TwiML tags
  twimlResponse += `
        </Stream>
      </Connect>
    </Response>`;

  reply.type("text/xml").send(twimlResponse);
});

// Secure endpoint for looking up customer ghl database, personalizing inbound call experiences TODO test
fastify.post(
  "/get-info",
  {
    preHandler: authenticateClient,
  },
  async (request, reply) => {
    const { caller_id, called_number, agent_id, call_sid } = request.body;
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    console.log(
      `[${requestId}] Processing inbound call personalization request:`,
      { caller_id, called_number }
    );

    // Validate required parameters
    if (!caller_id || !called_number) {
      console.log(`[${requestId}] Missing required parameters`);
      return reply.code(400).send({
        error: "Missing required parameters",
        requiredParams: ["caller_id", "called_number"],
      });
    }

    try {
      // Find client by matching the called number with twilioPhoneNumber in our database
      const client = await Client.findOne({ twilioPhoneNumber: called_number });

      if (!client) {
        console.log(
          `[${requestId}] No client found for called number: ${called_number}`
        );
        return reply.send({
          conversation_config_override: {
            agent: {
              first_message: "Hello!",
            },
          },
        });
      }

      console.log(
        `[${requestId}] Found client: ${client.clientId}, checking for GHL integration`
      );

      // Check if client has GHL integration (refreshToken)
      if (!client.refreshToken) {
        console.log(`[${requestId}] Client has no GHL refresh token`);
        return reply.send({
          conversation_config_override: {
            agent: {
              first_message: "Hello!",
            },
          },
        });
      }

      let contact = null;

      try {
        // Use the checkAndRefreshToken function to get a valid token
        const { accessToken } = await checkAndRefreshToken(client.clientId);

        // Search for the contact using the validated token
        contact = await searchGhlContactByPhone(
          accessToken,
          caller_id,
          client.clientId
        );
      } catch (ghlError) {
        console.error(`[${requestId}] GHL API error:`, ghlError);
        // Return default greeting if GHL API fails
        return reply.send({
          conversation_config_override: {
            agent: {
              first_message: "Hello!",
            },
          },
        });
      }

      // If no contact found in GHL, return default greeting
      if (!contact) {
        console.log(
          `[${requestId}] No contact found in GHL for caller: ${caller_id}`
        );
        return reply.send({
          conversation_config_override: {
            agent: {
              first_message: "Hello!",
            },
          },
        });
      }

      // Map GHL contact data to dynamic variables
      const dynamic_variables = {
        customer_name:
          `${contact.firstName || ""} ${contact.lastName || ""}`.trim() ||
          "there",
        email: contact.email || "",
        company: contact.companyName || "",
        jobTitle: contact.title || "",
        city: contact.city || "",
      };

      console.log(
        `[${requestId}] Successfully retrieved contact information from GHL for ${dynamic_variables.customer_name}`
      );

      // Return personalized response with dynamic variables
      return reply.send({
        dynamic_variables,
        conversation_config_override: {
          agent: {
            first_message: `Hey ${
              dynamic_variables.customer_name.split(" ")[0]
            }, how is it going?`,
          },
        },
      });
    } catch (error) {
      console.error(`[${requestId}] Error personalizing call:`, error);

      // Return default response on error
      return reply.send({
        conversation_config_override: {
          agent: {
            first_message: "Hello!",
          },
        },
      });
    }
  }
);

// Replace the existing get-availability endpoint with this improved version TODO test
fastify.get(
  "/get-availability",
  {
    preHandler: authenticateClient, // Require client authentication
  },
  async (request, reply) => {
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    console.log(`[${requestId}] Get availability request received`);

    // Extract only the needed parameters from query string
    const {
      startDate,
      endDate,
      timezone = "America/New_York", // Default to America/New_York timezone
      enableLookBusy,
    } = request.query;

    try {
      // Find client using token from authentication
      const client = await Client.findOne({ clientId: request.clientId });
      if (!client) {
        console.log(
          `[${requestId}] Error: Client not found: ${request.clientId}`
        );
        return reply.code(404).send({
          error: "Client not found",
          requestId,
        });
      }

      // Use the calId from client record as the calendarId
      const calendarId = client.calId;

      if (!calendarId) {
        console.log(
          `[${requestId}] Error: No calId found for client: ${request.clientId}`
        );
        return reply.code(400).send({
          error: "Client does not have a calendar ID configured",
          requestId,
        });
      }

      // Check client has GHL integration
      if (!client.refreshToken) {
        console.log(`[${requestId}] Error: Client has no GHL integration`);
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

      // Add optional parameters if provided
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

      // Format the response
      const formattedAvailability = {
        requestId,
        dateRange: {
          start: new Date(startTimestamp).toISOString(),
          end: new Date(endTimestamp).toISOString(),
        },
        timezone: timezone,
        availability: availabilityData,
        slots: availabilityData?._dates_?.slots || [],
      };

      console.log(
        `[${requestId}] Successfully retrieved availability: ${formattedAvailability.slots.length} slots`
      );
      return reply.send(formattedAvailability);
    } catch (error) {
      console.error(`[${requestId}] Error getting availability:`, error);

      // Handle different types of errors
      if (error.message.includes("GHL API error")) {
        // Extract status code if present in the error message
        const statusMatch = error.message.match(/GHL API error: (\d+)/);
        const status = statusMatch ? parseInt(statusMatch[1]) : 500;

        if (status === 401 || status === 403) {
          return reply.code(status).send({
            error: "GHL authentication failed",
            details: "The GHL integration may need to be re-authorized",
            requestId,
          });
        }

        return reply.code(status).send({
          error: "Failed to fetch availability from GoHighLevel",
          details: error.message,
          requestId,
        });
      }

      return reply.code(500).send({
        error: "Failed to get availability",
        details: error.message,
        requestId,
      });
    }
  }
);

// Route to book an appointment TODO test
fastify.post(
  "/book-appointment",
  {
    preHandler: authenticateClient, // Require client authentication
  },
  async (request, reply) => {
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    console.log(`[${requestId}] Book appointment request received`);

    // Extract appointment details from request body - only the required ones
    const {
      startTime,
      endTime,
      phone, // Phone parameter for contact lookup
      meeting_title,
    } = request.body;

    try {
      // Find client using token from authentication
      const client = await Client.findOne({ clientId: request.clientId });
      if (!client) {
        console.log(
          `[${requestId}] Error: Client not found: ${request.clientId}`
        );
        return reply.code(404).send({
          error: "Client not found",
          requestId,
        });
      }

      // Use the calId from client record as the calendarId
      const calendarId = client.calId;

      if (!calendarId) {
        console.log(
          `[${requestId}] Error: No calId found for client: ${request.clientId}`
        );
        return reply.code(400).send({
          error: "Client does not have a calendar ID configured",
          requestId,
        });
      }

      // Validate other required parameters
      if (!startTime || !endTime) {
        console.log(`[${requestId}] Error: Missing start or end time`);
        return reply.code(400).send({
          error: "Both startTime and endTime are required",
          requestId,
        });
      }

      if (!phone) {
        console.log(`[${requestId}] Error: Missing phone number`);
        return reply.code(400).send({
          error: "A phone number is required to find the contact",
          requestId,
        });
      }

      // Check client has GHL integration
      if (!client.refreshToken) {
        console.log(`[${requestId}] Error: Client has no GHL integration`);
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

      // Lookup the contact by phone number to get contact info and ID
      try {
        // Search for contact
        const contactSearchResult = await searchGhlContactByPhone(
          accessToken,
          phone,
          client.clientId
        );

        if (!contactSearchResult) {
          console.log(
            `[${requestId}] Error: No contact found for phone: ${phone}`
          );
          return reply.code(404).send({
            error: "Contact not found in GoHighLevel",
            details: "No contact exists with the provided phone number",
            requestId,
          });
        }

        // Extract the contact data
        const contactData = contactSearchResult;
        const contactId = contactData.id;

        if (!contactId) {
          console.log(
            `[${requestId}] Error: Invalid contact data returned: ${JSON.stringify(
              contactData
            )}`
          );
          return reply.code(500).send({
            error: "Invalid contact data returned from GHL",
            requestId,
          });
        }

        console.log(`[${requestId}] Found contact with ID: ${contactId}`);

        // Extract contact details for the title
        const contactFirstName =
          contactData.firstName ||
          (contactData.name ? contactData.name.split(" ")[0] : null) ||
          "Client";

        // Create the custom appointment title
        const title = `${contactFirstName} x ${
          client.clientMeta.businessName || "Business"
        } - ${meeting_title || "Consultation"}`;
        console.log(`[${requestId}] Generated appointment title: "${title}"`);

        // Now that we have the contactId, book the appointment
        const endpoint =
          "https://services.leadconnectorhq.com/calendars/events/appointments";

        // Set fixed parameters as specified
        const appointmentStatus = "new";
        const address = "Google Meet";
        const ignoreDateRange = false;
        const toNotify = true;
        const ignoreFreeSlotValidation = false;

        // Prepare appointment data according to the API spec
        const appointmentData = {
          calendarId,
          locationId: client.clientId, // GHL location ID is the same as our clientId
          contactId,
          startTime,
          endTime,
          title,
          meetingLocationType: "default", // Always use default as specified
          appointmentStatus,
          address,
          ignoreDateRange,
          toNotify,
          ignoreFreeSlotValidation,
        };

        console.log(`[${requestId}] Sending appointment request to GHL`);

        // Make the API request to book appointment
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Version: "2021-04-15",
          },
          body: JSON.stringify(appointmentData),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            `[${requestId}] GHL appointment API error: ${response.status}`,
            errorText
          );
          throw new Error(
            `GHL appointment API error: ${response.status} - ${errorText}`
          );
        }

        const appointmentResult = await response.json();

        // Format and return the booking data
        const bookingResponse = {
          requestId,
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
            status: appointmentResult.appointmentStatus || appointmentStatus,
            address: appointmentResult.address || address,
            isRecurring: appointmentResult.isRecurring || false,
          },
          contact: {
            id: contactId,
            name:
              contactData.name ||
              `${contactData.firstName || ""} ${
                contactData.lastName || ""
              }`.trim(),
            phone: phone,
            email: contactData.email || "",
          },
        };

        // If client has call capability, include notification option
        if (client.twilioPhoneNumber && client.agentId) {
          // Add notification info to response
          bookingResponse.notification = {
            message:
              "Contact has a phone number. You can use make-outbound-call to send a confirmation.",
            phone: phone,
          };
        }

        console.log(
          `[${requestId}] Successfully booked appointment with ID: ${appointmentResult.id}`
        );
        return reply.send(bookingResponse);
      } catch (contactError) {
        console.error(`[${requestId}] Error finding contact:`, contactError);
        return reply.code(400).send({
          error: "Failed to find contact",
          details: contactError.message,
          requestId,
        });
      }
    } catch (error) {
      console.error(`[${requestId}] Error booking appointment:`, error);

      // Handle different types of errors
      if (error.message.includes("GHL")) {
        // Extract status code if present in the error message
        const statusMatch = error.message.match(/GHL .* API error: (\d+)/);
        const status = statusMatch ? parseInt(statusMatch[1]) : 500;

        if (status === 401 || status === 403) {
          return reply.code(status).send({
            error: "GHL authentication failed",
            details: "The GHL integration may need to be re-authorized",
            requestId,
          });
        }

        // Common booking errors - check for specific error messages
        if (
          error.message.toLowerCase().includes("already booked") ||
          error.message.toLowerCase().includes("unavailable") ||
          error.message.toLowerCase().includes("not available")
        ) {
          return reply.code(409).send({
            error: "Time slot is no longer available",
            details: error.message,
            requestId,
          });
        }

        if (
          error.message.toLowerCase().includes("invalid calendar") ||
          error.message.toLowerCase().includes("not found")
        ) {
          return reply.code(404).send({
            error: "Calendar not found or invalid",
            details: error.message,
            requestId,
          });
        }

        return reply.code(status).send({
          error: "Failed to book appointment in GoHighLevel",
          details: error.message,
          requestId,
        });
      }

      return reply.code(500).send({
        error: "Failed to book appointment",
        details: error.message,
        requestId,
      });
    }
  }
);

// Endpoint to handle Twilio status callbacks
fastify.post("/call-status", async (request, reply) => {
  const { CallSid, CallStatus, CallDuration } = request.body;
  const requestId = request.query.requestId || "unknown";
  const clientId = request.query.clientId || null;

  console.log(`[${requestId}] Call status update: ${CallSid} -> ${CallStatus}`);

  try {
    // Find the client with this call in their history
    const query = clientId
      ? { clientId, "callHistory.callData.callSid": CallSid }
      : { "callHistory.callData.callSid": CallSid };

    const updateResult = await Client.findOneAndUpdate(
      query,
      {
        $set: {
          "callHistory.$.callData.status": CallStatus,
          "callHistory.$.callData.duration": CallDuration
            ? parseInt(CallDuration)
            : undefined,
          "callHistory.$.callData.endTime":
            CallStatus === "completed" ? new Date() : undefined,
        },
      },
      { new: true }
    );

    if (!updateResult) {
      console.error(
        `[${requestId}] Failed to update call status: Record not found`
      );
    }

    reply.send({ success: true });
  } catch (error) {
    console.error(`[${requestId}] Error updating call status:`, error);
    reply.send({ success: false, error: error.message });
  }
});

// Start the Fastify server
const start = async () => {
  try {
    await connectDB();
    await fastify.listen({ port: process.env.PORT || 8000, host: "0.0.0.0" });
    console.log(`Server listening on ${fastify.server.address().port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
