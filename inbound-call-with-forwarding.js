import WebSocket from "ws";
import twilio from "twilio";
import fetch from "node-fetch";
import Client from "./client.js";
import { findClientById, updateClient, addCallToHistory, updateCallDetails } from "./crud.js";

export function registerInboundRoutes(fastify) {
  // Access the Twilio client from the parent scope
  const twilioClient = fastify.twilioClient;

  if (!twilioClient) {
    console.error("Twilio client not available from fastify instance");
    throw new Error("Twilio client not configured properly");
  }

  // Active call tracking
  const activeCalls = new Map();

  // Helper function to get signed URL for authenticated conversations
  async function getSignedUrl(agentId) {
    try {
      console.log(`[ElevenLabs] Getting signed URL for agent: ${agentId}`);
      const response = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
        {
          method: "GET",
          headers: {
            "xi-api-key": process.env.ELEVENLABS_API_KEY,
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

  // Function to handle call transfer request from ElevenLabs
  async function handleCallTransfer(callSid, agentNumber = null) {
    try {
      console.log(`[Transfer] Initiating transfer for call ${callSid}`);

      // Find the client associated with this call
      const clientWithCall = await Client.findOne({
        "callHistory.callData.callSid": callSid
      });

      if (!clientWithCall) {
        console.error(`[Transfer] No client found with call SID: ${callSid}`);
        return { success: false, error: "No matching client found for this call" };
      }

      // Use the client's phone number from clientMeta instead of hardcoded value
      const transferNumber = agentNumber || clientWithCall.clientMeta.phone;
      
      if (!transferNumber) {
        console.error(`[Transfer] No transfer number available for client: ${clientWithCall.clientId}`);
        return { success: false, error: "No transfer number available" };
      }

      console.log(`[Transfer] Using transfer number: ${transferNumber} for client: ${clientWithCall.clientId}`);

      // Get call details
      const call = await twilioClient.calls(callSid).fetch();
      const conferenceName = `transfer_${callSid}`;
      const callerNumber = call.to;

      // Move caller to a conference room
      const customerTwiml = new twilio.twiml.VoiceResponse();
      customerTwiml.say("Please hold while we connect you to an agent.");
      customerTwiml.dial().conference({
        startConferenceOnEnter: false,
        endConferenceOnExit: false,
        waitUrl: "http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical",
      }, conferenceName);

      console.log(`[Transfer] Updating call ${callSid} with conference TwiML`);
      await twilioClient.calls(callSid).update({ twiml: customerTwiml.toString() });

      console.log(`[Transfer] Caller ${callerNumber} placed in conference ${conferenceName}`);

      // Call the agent and connect them to the same conference
      console.log(`[Transfer] Creating outbound call to agent ${transferNumber}`);
      const agentCall = await twilioClient.calls.create({
        to: transferNumber,
        from: call.from,
        twiml: `
          <Response>
            <Say>You are being connected to a caller who was speaking with our AI assistant.</Say>
            <Dial>
              <Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">
                ${conferenceName}
              </Conference>
            </Dial>
          </Response>
        `
      });

      console.log(`[Transfer] Outbound call to agent created: ${agentCall.sid}`);

      // Update call information in the database
      const callDetails = {
        callOutcome: "booked_appointment",
        callSummary: `Call transferred to agent at ${transferNumber}`,
        nextAction: "agent_followup",
        callSentiment: "positive"
      };

      // Find the specific call in the client's history
      const callRecord = clientWithCall.callHistory.find(call => call.callData.callSid === callSid);
      if (callRecord) {
        await updateCallDetails(clientWithCall.clientId, callRecord.callId, callDetails);
      }

      // Update active calls tracking
      activeCalls.set(callSid, {
        status: "transferring",
        conferenceName,
        agentCallSid: agentCall.sid,
        agentNumber: transferNumber,
        clientId: clientWithCall.clientId
      });

      return { 
        success: true, 
        agentCallSid: agentCall.sid,
        transferNumber: transferNumber,
        clientId: clientWithCall.clientId
      };
    } catch (error) {
      console.error("[Transfer] Error transferring call:", error);
      console.error("[Transfer] Full error details:", error.stack);
      return { success: false, error: error.message };
    }
  }

  // Route to handle incoming calls from Twilio
  fastify.all("/incoming-call-eleven", async (request, reply) => {
    const callSid = request.body.CallSid;
    const from = request.body.From;
    const to = request.body.To;
    
    console.log(`[Twilio] Incoming call received with SID: ${callSid} from ${from} to ${to}`);

    // Generate a request ID for tracking
    const requestId = `inbound_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 5)}`;

    try {
      // Try to find client based on the called number (Twilio number)
      const client = await Client.findOne({ twilioPhoneNumber: to });
      
      if (!client) {
        console.warn(`[Twilio] No client found with Twilio number: ${to}`);
      } else {
        console.log(`[Twilio] Found client: ${client.clientId} for incoming call`);
        
        // Create call data object for history
        const callData = {
          callData: {
            callSid: callSid,
            requestId: requestId,
            phone: from,
            from: to,
            agentId: client.agentId,
            startTime: new Date(),
            status: "follow_up",
            callCount: 1
          },
          callDetails: {
            callOutcome: "",
            callSummary: "Inbound call",
            callTranscript: ""
          }
        };

        // Add call to client's call history
        await addCallToHistory(client.clientId, callData);
      }

      if (callSid) {
        activeCalls.set(callSid, {
          status: "active",
          from: from,
          to: to,
          started: new Date(),
          clientId: client ? client.clientId : null,
          agentId: client ? client.agentId : null
        });
      }

      // Generate TwiML response to connect the call to a WebSocket stream
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Connect>
            <Stream url="wss://${request.headers.host}/media-stream" />
          </Connect>
        </Response>`;

      reply.type("text/xml").send(twimlResponse);
    } catch (error) {
      console.error(`[${requestId}] Error handling incoming call:`, error);
      
      // Return basic TwiML in case of error
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say>We're sorry, but we are unable to process your call at this time. Please try again later.</Say>
          <Hangup />
        </Response>`;

      reply.type("text/xml").send(twimlResponse);
    }
  });

  // WebSocket route for handling media streams from Twilio
  fastify.register(async (fastifyInstance) => {
    fastifyInstance.get("/media-stream", { websocket: true }, async (connection, req) => {
      console.info("[Server] Twilio connected to media stream.");

      let streamSid = null;
      let callSid = null;
      let elevenLabsWs = null;
      let clientId = null;
      let agentId = null;

      connection.on("message", async (message) => {
        try {
          const data = JSON.parse(message);

          switch (data.event) {
            case "start":
              streamSid = data.start.streamSid;
              callSid = data.start.callSid;
              console.log(`[Twilio] Stream started: ${streamSid} for call: ${callSid}`);

              // Get call details from activeCalls map or check database
              const activeCall = activeCalls.get(callSid);
              
              if (activeCall) {
                clientId = activeCall.clientId;
                agentId = activeCall.agentId;
                
                // Update tracked call with stream info
                activeCalls.set(callSid, { 
                  ...activeCall,
                  status: "active", 
                  streamSid 
                });
                
                console.log(`[Twilio] Found active call data: clientId=${clientId}, agentId=${agentId}`);
              } 
              
              if (!agentId) {
                // If not found in active calls, try to find in database
                const clientWithCall = await Client.findOne({
                  "callHistory.callData.callSid": callSid
                });
                
                if (clientWithCall) {
                  clientId = clientWithCall.clientId;
                  
                  // Find the specific call to get the agent ID
                  const callRecord = clientWithCall.callHistory.find(
                    call => call.callData.callSid === callSid
                  );
                  
                  if (callRecord && callRecord.callData.agentId) {
                    agentId = callRecord.callData.agentId;
                  } else {
                    // Default to the client's primary agent ID
                    agentId = clientWithCall.agentId;
                  }
                  
                  console.log(`[Twilio] Found client in database: clientId=${clientId}, agentId=${agentId}`);
                  
                  activeCalls.set(callSid, {
                    status: "active",
                    streamSid,
                    clientId,
                    agentId,
                    started: new Date()
                  });
                }
              }
              
              // If we have an agent ID, set up the ElevenLabs connection
              if (agentId) {
                try {
                  console.log(`[ElevenLabs] Setting up connection with agent ID: ${agentId}`);
                  const signedUrl = await getSignedUrl(agentId);
                  elevenLabsWs = new WebSocket(signedUrl);
                  
                  elevenLabsWs.on("open", () => {
                    console.log("[ElevenLabs] Connected to Conversational AI");
                    
                    // Send initial configuration
                    const initialConfig = {
                      type: "conversation_initiation_client_data",
                      dynamic_variables: {
                        call_sid: callSid,
                        caller_number: activeCalls.get(callSid)?.from,
                        client_id: clientId
                      }
                    };
                    
                    console.log("[ElevenLabs] Sending initial configuration");
                    elevenLabsWs.send(JSON.stringify(initialConfig));
                  });
                  
                  elevenLabsWs.on("message", async (data) => {
                    try {
                      const message = JSON.parse(data);

                      switch (message.type) {
                        case "conversation_initiation_metadata":
                          console.log("[ElevenLabs] Received initiation metadata");
                          break;

                        case "audio":
                          if (message.audio_event?.audio_base_64 && streamSid) {
                            connection.send(JSON.stringify({ 
                              event: "media", 
                              streamSid, 
                              media: { payload: message.audio_event.audio_base_64 } 
                            }));
                          }
                          break;

                        case "interruption":
                          if (streamSid) {
                            console.log("[ElevenLabs] Sending clear event to Twilio");
                            connection.send(JSON.stringify({ event: "clear", streamSid }));
                          }
                          break;

                        case "ping":
                          if (message.ping_event?.event_id) {
                            elevenLabsWs.send(JSON.stringify({ 
                              type: "pong", 
                              event_id: message.ping_event.event_id 
                            }));
                          }
                          break;

                        case "client_tool_call":
                          console.log("[ElevenLabs] *** CLIENT TOOL CALL RECEIVED ***");
                          console.log(`[ElevenLabs] Tool name: ${message.client_tool_call?.tool_name}`);
                          console.log(`[ElevenLabs] Tool call ID: ${message.client_tool_call?.tool_call_id}`);
                          
                          if (message.client_tool_call?.tool_name === "transfer_to_agent" && callSid) {
                            console.log(`[ElevenLabs] Processing transfer_to_agent request for call ${callSid}`);
                            
                            let agentNumber = null;
                            if (message.client_tool_call.parameters?.phone_number) {
                              agentNumber = message.client_tool_call.parameters.phone_number;
                            }
                            
                            const transferResult = await handleCallTransfer(callSid, agentNumber);
                            console.log(`[ElevenLabs] Transfer result: ${JSON.stringify(transferResult)}`);
                            
                            const toolResponse = {
                              type: "client_tool_response",
                              tool_call_id: message.client_tool_call.tool_call_id,
                              data: transferResult
                            };
                            
                            elevenLabsWs.send(JSON.stringify(toolResponse));
                          }
                          break;

                        case "tool_request":
                          console.log("[ElevenLabs] *** TOOL REQUEST RECEIVED ***");
                          console.log(`[ElevenLabs] Tool name: ${message.tool_request?.tool_name}`);
                          console.log(`[ElevenLabs] Event ID: ${message.tool_request?.event_id}`);
                          
                          if (message.tool_request?.tool_name === "transfer_to_agent" && callSid) {
                            console.log(`[ElevenLabs] Processing transfer_to_agent tool request for call ${callSid}`);
                            
                            let agentNumber = null;
                            if (message.tool_request.params?.agent_number) {
                              agentNumber = message.tool_request.params.agent_number;
                            }
                            
                            const transferResult = await handleCallTransfer(callSid, agentNumber);
                            console.log(`[ElevenLabs] Transfer result: ${JSON.stringify(transferResult)}`);
                            
                            const toolResponse = {
                              type: "tool_response",
                              event_id: message.tool_request.event_id,
                              tool_name: "transfer_to_agent",
                              result: transferResult
                            };
                            
                            elevenLabsWs.send(JSON.stringify(toolResponse));
                          }
                          break;

                        default:
                          console.log(`[ElevenLabs] Unhandled message type: ${message.type}`);
                      }
                    } catch (error) {
                      console.error("[ElevenLabs] Error processing message:", error);
                    }
                  });
                  
                  elevenLabsWs.on("error", (error) => {
                    console.error("[ElevenLabs] WebSocket error:", error);
                  });
                  
                  elevenLabsWs.on("close", (code, reason) => {
                    console.log(`[ElevenLabs] Connection closed. Code: ${code}, Reason: ${reason || "No reason provided"}`);
                  });
                } catch (error) {
                  console.error("[ElevenLabs] Error setting up connection:", error);
                }
              } else {
                console.error(`[Twilio] No agent ID found for call ${callSid}`);
              }
              break;

            case "media":
              if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
                const audioMessage = {
                  user_audio_chunk: Buffer.from(data.media.payload, "base64").toString("base64")
                };
                elevenLabsWs.send(JSON.stringify(audioMessage));
              }
              break;

            case "stop":
              console.log(`[Twilio] Stream ${streamSid} ended`);
              
              if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
                elevenLabsWs.close();
              }

              if (callSid) {
                const activeCall = activeCalls.get(callSid);
                activeCalls.delete(callSid);
                
                // Update call record in the database if we have a client ID
                if (activeCall && activeCall.clientId) {
                  try {
                    const client = await findClientById(activeCall.clientId);
                    if (client) {
                      // Find the call in the client's history
                      const callRecord = client.callHistory.find(
                        call => call.callData.callSid === callSid
                      );
                      
                      if (callRecord) {
                        // Update call details
                        await Client.findOneAndUpdate(
                          { 
                            clientId: activeCall.clientId,
                            "callHistory.callData.callSid": callSid 
                          },
                          {
                            $set: {
                              "callHistory.$.callData.status": "hang_up",
                              "callHistory.$.callData.endTime": new Date(),
                              "callHistory.$.callData.duration": Math.floor(
                                (new Date() - new Date(callRecord.callData.startTime)) / 1000
                              )
                            }
                          }
                        );
                        console.log(`[Twilio] Updated call record for ${callSid}`);
                      }
                    }
                  } catch (error) {
                    console.error(`[Twilio] Error updating call record:`, error);
                  }
                }
              }
              break;

            default:
              console.log(`[Twilio] Received unhandled event: ${data.event}`);
          }
        } catch (error) {
          console.error("[Twilio] Error processing message:", error);
        }
      });

      connection.on("close", () => {
        console.log("[Twilio] WebSocket connection closed");
        
        if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
          elevenLabsWs.close();
        }
      });

      connection.on("error", (error) => {
        console.error("[Twilio] WebSocket error:", error);
        
        if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
          elevenLabsWs.close();
        }
      });
    });
  });

  // Endpoint for manually triggering call transfer (for testing)
  fastify.post("/transfer-call", async (request, reply) => {
    const { callSid, agentNumber } = request.body;

    if (!callSid) {
      console.log("[API] Transfer request missing callSid");
      return reply.code(400).send({ error: "Missing callSid parameter" });
    }

    console.log(`[API] Manual transfer requested for call ${callSid}`);
    const result = await handleCallTransfer(callSid, agentNumber);
    console.log(`[API] Manual transfer result: ${JSON.stringify(result)}`);

    return reply.send(result);
  });
}