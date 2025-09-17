// Mongoose Schema Definition
import mongoose from "mongoose";

// Define the nested schemas first
const clientMetaSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    businessName: { type: String },
    city: { type: String },
    jobTitle: { type: String },
    email: { type: String, required: true },
    notes: { type: String },
  },
  { _id: false }
); // Prevents creating an _id for this subdocument

// Agent Metrics Schema for tracking call and appointment statistics
const agentMetricsSchema = new mongoose.Schema(
  {
    agentId: { type: String, required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    inboundCalls: { type: Number, default: 0 },
    outboundCalls: { type: Number, default: 0 },
    totalCalls: { type: Number, default: 0 },
    successfulBookings: { type: Number, default: 0 },
    totalDuration: { type: Number, default: 0 }, // in seconds
    averageDuration: { type: Number, default: 0 }, // in seconds
    callsFromElevenlabs: { type: Number, default: 0 }, // For tracking ElevenLabs data integration
    elevenlabsSuccessRate: { type: Number, default: 0 }, // Success rate from ElevenLabs (0-100)
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Agent Metrics History Schema for storing monthly historical data
const agentMetricsHistorySchema = new mongoose.Schema(
  {
    agentId: { type: String, required: true },
    period: { type: String, required: true }, // Format: "YYYY-MM"
    metrics: agentMetricsSchema,
    source: {
      type: String,
      enum: ["elevenlabs", "ghl", "internal", "combined"],
      default: "internal",
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const callDataSchema = new mongoose.Schema(
  {
    callSid: { type: String, required: true },
    requestId: { type: String },
    phone: { type: String, required: true },
    from: { type: String, required: true },
    agentId: { type: String, required: true },
    startTime: { type: Date },
    endTime: { type: Date },
    duration: { type: Number }, // in seconds
    callCount: { type: Number, default: 1 },
    status: {
      type: String,
      enum: [
        "booked_appointment",
        "follow_up",
        "hang_up",
        "dnc",
        "no_call_match",
      ],
    },
    recordingUrl: { type: String },
    // New fields for metrics tracking
    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true,
    },
    isBookingSuccessful: { type: Boolean, default: false },
    elevenLabsConversationId: { type: String }, // For correlation with ElevenLabs data
  },
  { _id: false }
);

const callDetailsSchema = new mongoose.Schema(
  {
    callSummary: { type: String },
    callTranscript: { type: String },
    callSentiment: {
      type: String,
      enum: ["positive", "neutral", "negative"],
    },
    nextAction: { type: String },
    nextActionDate: { type: Date },
    agentNotes: { type: String },
  },
  { _id: false }
);

const callHistorySchema = new mongoose.Schema({
  callId: {
    type: String,
    required: true,
    default: () => `call_${new mongoose.Types.ObjectId().toString()}`,
  },
  callData: callDataSchema,
  callDetails: callDetailsSchema,
}); // Adds createdAt and updatedAt fields

// Additional Agent Schema for multi-agent support
const additionalAgentSchema = new mongoose.Schema(
  {
    agentId: { type: String, required: true },
    twilioPhoneNumber: { type: String, required: true },
    agentName: { type: String }, // Optional: friendly name for this agent
    agentType: {
      type: String,
      enum: ["inbound", "outbound", "both"],
      default: "both",
    },
    meetingTitle: { type: String, default: "Consultation" }, // Default meeting title for this agent
    meetingLocation: { type: String, default: "Google Meet" }, // Default meeting location for this agent
    isEnabled: { type: Boolean, default: true },
    inboundEnabled: { type: Boolean, default: true },
    outboundEnabled: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true } // Allow _id for each additional agent
);

// Main Client Schema
const clientSchema = new mongoose.Schema(
  {
    clientId: {
      type: String,
      required: true,
      unique: true,
      index: true, // Creates an index for faster lookups
    },
    calId: { type: String, required: true },
    clientToken: { type: String }, // Internal client token used as bearer token for all client restricted access points
    clientSecret: { type: String }, // Internal client secret used to verify/generate jwt client token
    accessToken: { type: String }, // GHL access token (separate from clientSecret)
    refreshToken: { type: String }, // GHL refresh token
    tokenExpiresAt: { type: Date }, // When the access token expires
    agentId: { type: String, required: true }, // Primary agent (backwards compatibility)
    twilioPhoneNumber: { type: String, required: true }, // Primary Twilio number (backwards compatibility)
    meetingTitle: { type: String, default: "Consultation" }, // Default meeting title for primary agent
    meetingLocation: { type: String, default: "Google Meet" }, // Default meeting location for primary agent
    additionalAgents: [additionalAgentSchema], // New: Array of additional agents
    status: {
      type: String,
      enum: ["Active", "Inactive", "Suspended"],
      default: "Active",
    },
    clientMeta: clientMetaSchema,
    callHistory: [callHistorySchema],
    metricsHistory: [agentMetricsHistorySchema], // New: Historical metrics for all agents
  },
  {
    timestamps: true, // Adds and manages createdAt and updatedAt automatically
    collection: "clients", // Explicitly name the collection
  }
);

// Create additional indexes for common query patterns
clientSchema.index({ "clientMeta.phone": 1 });
clientSchema.index({ "clientMeta.email": 1 });
clientSchema.index({ agentId: 1 });
clientSchema.index({ "callHistory.callData.callSid": 1 });
clientSchema.index({ twilioPhoneNumber: 1 });
clientSchema.index({ "additionalAgents.twilioPhoneNumber": 1 }); // Index for additional agent lookups
clientSchema.index({ "additionalAgents.agentId": 1 }); // Index for additional agent lookups
clientSchema.index({ accessToken: 1 }); // Index for accessToken lookups

// New indexes for metrics queries
clientSchema.index({ "metricsHistory.agentId": 1 }); // Index for agent metrics lookups
clientSchema.index({ "metricsHistory.period": 1 }); // Index for period-based queries
clientSchema.index({ "metricsHistory.agentId": 1, "metricsHistory.period": 1 }); // Compound index for agent + period queries
clientSchema.index({ "callHistory.callData.direction": 1 }); // Index for call direction queries
clientSchema.index({ "callHistory.callData.isBookingSuccessful": 1 }); // Index for booking success queries

// Helper methods for multi-agent support
clientSchema.methods.getAllAgents = function () {
  const agents = [
    {
      agentId: this.agentId,
      twilioPhoneNumber: this.twilioPhoneNumber,
      agentName: "Primary Agent",
      agentType: "both",
      meetingTitle: this.meetingTitle || "Consultation",
      meetingLocation: this.meetingLocation || "Google Meet",
      isEnabled: this.status === "Active",
      inboundEnabled: true,
      outboundEnabled: true,
      isPrimary: true,
    },
  ];

  // Add additional agents
  if (this.additionalAgents && this.additionalAgents.length > 0) {
    this.additionalAgents.forEach((agent) => {
      agents.push({
        ...agent.toObject(),
        isPrimary: false,
      });
    });
  }

  return agents;
};

clientSchema.methods.findAgentByPhone = function (phoneNumber) {
  // Check primary agent first
  if (this.twilioPhoneNumber === phoneNumber) {
    return {
      agentId: this.agentId,
      twilioPhoneNumber: this.twilioPhoneNumber,
      agentName: "Primary Agent",
      agentType: "both",
      meetingTitle: this.meetingTitle || "Consultation",
      meetingLocation: this.meetingLocation || "Google Meet",
      isEnabled: this.status === "Active",
      inboundEnabled: true,
      outboundEnabled: true,
      isPrimary: true,
    };
  }

  // Check additional agents
  if (this.additionalAgents && this.additionalAgents.length > 0) {
    const additionalAgent = this.additionalAgents.find(
      (agent) => agent.twilioPhoneNumber === phoneNumber && agent.isEnabled
    );
    if (additionalAgent) {
      return {
        ...additionalAgent.toObject(),
        isPrimary: false,
      };
    }
  }

  return null;
};

clientSchema.methods.findAgentById = function (agentId) {
  // Check primary agent first
  if (this.agentId === agentId) {
    return {
      agentId: this.agentId,
      twilioPhoneNumber: this.twilioPhoneNumber,
      agentName: "Primary Agent",
      agentType: "both",
      meetingTitle: this.meetingTitle || "Consultation",
      meetingLocation: this.meetingLocation || "Google Meet",
      isEnabled: this.status === "Active",
      inboundEnabled: true,
      outboundEnabled: true,
      isPrimary: true,
    };
  }

  // Check additional agents
  if (this.additionalAgents && this.additionalAgents.length > 0) {
    const additionalAgent = this.additionalAgents.find(
      (agent) => agent.agentId === agentId && agent.isEnabled
    );
    if (additionalAgent) {
      return {
        ...additionalAgent.toObject(),
        isPrimary: false,
      };
    }
  }

  return null;
};

// Helper methods for metrics management
clientSchema.methods.getAgentMetrics = function (agentId, year, month) {
  if (!this.metricsHistory) return null;

  const period = `${year}-${String(month).padStart(2, "0")}`;
  return this.metricsHistory.find(
    (m) => m.agentId === agentId && m.period === period
  );
};

clientSchema.methods.updateAgentMetrics = function (
  agentId,
  year,
  month,
  updates,
  source = "internal"
) {
  if (!this.metricsHistory) this.metricsHistory = [];

  const period = `${year}-${String(month).padStart(2, "0")}`;
  let existingMetrics = this.metricsHistory.find(
    (m) => m.agentId === agentId && m.period === period
  );

  if (existingMetrics) {
    // Update existing metrics
    Object.assign(existingMetrics.metrics, updates);
    existingMetrics.metrics.lastUpdated = new Date();
    // Update source if it's more specific (e.g., elevenlabs or ghl over internal)
    if (source !== "internal" && existingMetrics.source === "internal") {
      existingMetrics.source = source;
    }
  } else {
    // Create new metrics entry
    this.metricsHistory.push({
      agentId,
      period,
      metrics: {
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
        ...updates,
        lastUpdated: new Date(),
      },
      source: source,
    });
  }

  return this;
};

clientSchema.methods.incrementCallMetrics = function (
  agentId,
  direction,
  duration = 0,
  isBookingSuccessful = false
) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const updates = {
    totalCalls: 1,
    totalDuration: duration,
  };

  if (direction === "inbound") {
    updates.inboundCalls = 1;
  } else if (direction === "outbound") {
    updates.outboundCalls = 1;
  }

  if (isBookingSuccessful) {
    updates.successfulBookings = 1;
  }

  // Get existing metrics to calculate incremental updates
  const existing = this.getAgentMetrics(agentId, year, month);
  if (existing) {
    updates.inboundCalls =
      (existing.metrics.inboundCalls || 0) + (updates.inboundCalls || 0);
    updates.outboundCalls =
      (existing.metrics.outboundCalls || 0) + (updates.outboundCalls || 0);
    updates.totalCalls =
      (existing.metrics.totalCalls || 0) + updates.totalCalls;
    updates.successfulBookings =
      (existing.metrics.successfulBookings || 0) +
      (updates.successfulBookings || 0);
    updates.totalDuration =
      (existing.metrics.totalDuration || 0) + updates.totalDuration;

    // Recalculate average duration
    if (updates.totalCalls > 0) {
      updates.averageDuration = Math.round(
        updates.totalDuration / updates.totalCalls
      );
    }
  } else {
    updates.averageDuration = duration;
  }

  return this.updateAgentMetrics(agentId, year, month, updates);
};

// Compiling the schema into a model
const Client = mongoose.model("Client", clientSchema);

export default Client;

// Example document in MongoDB would look like:
/*
{
  "_id": "6450a47c9c4a7e001d123456",
  "clientId": "5C3JSOVVFiVmBoh8mv3I",
  "clientSecret": "5C3JSBoh8mv3IOVVFim",
  "refreshToken": "5C3JSOVVFiVmBoh8mv3I",
  "tokenExpiresAt": "2025-03-19T10:00:00.000Z",
  "calId": "e0JBV5PARC9sbebxcYnY",
  "agentId": "qvu7240QhEUKLultBI7i",
  "twilioPhoneNumber": "+18632704910",
  "status": "Active",
  "clientMeta": {
    "fullName": "Paul Giovanatto",
    "phone": "+19058363456",
    "businessName": "Affinity Design",        
    "city": "Bradford",
    "jobTitle": "CEO",        
    "email": "paul@affinitydesign.ca",
    "notes": "Prefers morning calls"
  },
  "callHistory": [
    {
      "callId": "call_6450b123b6a89e002a789abc",
      "callData": {
        "callSid": "CA123456789",
        "requestId": "REQ123456",
        "phone": "+19058363456",
        "from": "+18632704910",
        "agentId": "qvu7240QhEUKLultBI7i",
        "startTime": "2025-03-19T12:00:00.000Z",
        "endTime": "2025-03-19T12:15:32.000Z",
        "duration": 932,
        "callCount": 2,
        "status": "completed",
        "recordingUrl": "https://api.twilio.com/recordings/RE123456789"
      },
      "callDetails": {
        "callOutcome": "interested",
        "callSummary": "Client expressed interest in our premium plan, wants a follow-up next week",
        "callTranscript": "Agent: Hello, this is... Client: Hi, I'm interested in...",
        "callSentiment": "positive",
        "nextAction": "schedule_follow_up",
        "nextActionDate": "2025-03-26T12:00:00.000Z",
        "agentNotes": "Be sure to mention the discount code when following up"
      }
    },
    {
      "callId": "call_6450d456b6a89e002a789def",
      "callData": {
        "callSid": "CA987654321",
        "requestId": "REQ654321",
        "phone": "+19058363456",
        "from": "+18632704910",
        "agentId": "qvu7240QhEUKLultBI7i",
        "startTime": "2025-03-20T10:30:00.000Z",
        "endTime": "2025-03-20T10:44:15.000Z",
        "duration": 855,
        "callCount": 3,
        "status": "completed",
        "recordingUrl": "https://api.twilio.com/recordings/RE987654321"
      },
      "callDetails": {
        "callOutcome": "callback",
        "callSummary": "Client asked for more information about implementation timeline. Wants to be called next week after internal discussion.",
        "callTranscript": "Agent: Hello Paul, following up from our last conversation... Client: Thanks for calling back, I've been thinking about...",
        "callSentiment": "positive",
        "nextAction": "schedule_follow_up",
        "nextActionDate": "2025-03-27T10:00:00.000Z",
        "agentNotes": "Paul mentioned they might need additional user accounts. Be prepared to discuss pricing for added seats."
      }
    }
  ],
  "createdAt": "2025-03-19T10:00:00.000Z",
  "updatedAt": "2025-03-20T10:45:00.000Z"
}
*/
