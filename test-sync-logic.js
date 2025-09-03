// test-sync-logic.js
// Simple test to validate the sync logic without making API calls

// Mock data that simulates ElevenLabs API response
const mockElevenLabsData = [
  {
    id: "conv_1",
    direction: "inbound",
    duration: 300,
    status: "completed",
    created_at: "2024-01-15T10:00:00Z",
  },
  {
    id: "conv_2",
    direction: "outbound",
    duration: 450,
    status: "completed",
    created_at: "2024-01-16T14:30:00Z",
  },
  {
    id: "conv_3",
    direction: "inbound",
    duration: 0,
    status: "failed",
    created_at: "2024-01-17T09:15:00Z",
  },
  {
    id: "conv_4",
    direction: "outbound",
    duration: 600,
    status: "completed",
    created_at: "2024-01-18T16:45:00Z",
  },
];

// Mock agents data
const mockAgents = [
  { agentId: "agent_1", agentName: "Agent One" },
  { agentId: "agent_2", agentName: "Agent Two" },
  { agentId: "agent_3", agentName: "Agent Three" },
];

// Simulate the aggregateElevenLabsMetrics function
function aggregateElevenLabsMetrics(historyData, agentId = null) {
  console.log(
    `[ElevenLabs] Aggregating metrics for agent: ${agentId || "all"}`
  );
  console.log(`[ElevenLabs] Processing ${historyData.length} records`);

  const metrics = {
    totalCalls: 0,
    inboundCalls: 0,
    outboundCalls: 0,
    totalDuration: 0,
    averageDuration: 0,
    successfulCalls: 0,
    failedCalls: 0,
  };

  historyData.forEach((call, index) => {
    // Debug first few records to see structure
    if (index < 3) {
      console.log(
        `[ElevenLabs] Sample record structure:`,
        JSON.stringify(call, null, 2)
      );
    }

    // For now, since we can't match by agent ID, count all records
    metrics.totalCalls++;

    // Try to determine call direction from various fields
    const direction =
      call.direction ||
      call.call_direction ||
      call.type ||
      call.conversation_type;
    if (
      direction === "inbound" ||
      direction === "incoming" ||
      direction?.toLowerCase().includes("inbound")
    ) {
      metrics.inboundCalls++;
    } else {
      metrics.outboundCalls++;
    }

    // Duration from various possible fields
    const duration =
      call.duration ||
      call.call_duration ||
      call.length ||
      call.conversation_duration ||
      0;
    if (duration) {
      metrics.totalDuration += duration;
    }

    // Success/failure from various fields
    const status =
      call.status || call.call_status || call.state || call.conversation_status;
    if (
      status === "completed" ||
      status === "successful" ||
      status === "ended" ||
      call.success
    ) {
      metrics.successfulCalls++;
    } else if (status === "failed" || status === "error") {
      metrics.failedCalls++;
    } else {
      // Assume successful if we have duration or dialogue
      if (duration > 0 || call.dialogue || call.transcript) {
        metrics.successfulCalls++;
      } else {
        metrics.failedCalls++;
      }
    }
  });

  // Calculate average duration
  if (metrics.totalCalls > 0) {
    metrics.averageDuration = metrics.totalDuration / metrics.totalCalls;
  }

  console.log(`[ElevenLabs] Final metrics:`, metrics);
  return metrics;
}

// Simulate the corrected distribution logic from the admin route
function distributeMetricsAcrossAgents(totalMetrics, agents) {
  console.log(
    `[ElevenLabs] Distributing total metrics across ${agents.length} agents`
  );

  const numAgents = agents.length;

  // Distribute metrics across agents (simple approach: divide evenly)
  const baseMetrics = {
    totalCalls: Math.floor(totalMetrics.totalCalls / numAgents),
    inboundCalls: Math.floor(totalMetrics.inboundCalls / numAgents),
    outboundCalls: Math.floor(totalMetrics.outboundCalls / numAgents),
    totalDuration: Math.floor(totalMetrics.totalDuration / numAgents),
    successfulCalls: Math.floor(totalMetrics.successfulCalls / numAgents),
    failedCalls: Math.floor(totalMetrics.failedCalls / numAgents),
  };

  // Calculate remainders
  const remainders = {
    totalCalls: totalMetrics.totalCalls % numAgents,
    inboundCalls: totalMetrics.inboundCalls % numAgents,
    outboundCalls: totalMetrics.outboundCalls % numAgents,
    totalDuration: totalMetrics.totalDuration % numAgents,
    successfulCalls: totalMetrics.successfulCalls % numAgents,
    failedCalls: totalMetrics.failedCalls % numAgents,
  };

  const distributedMetrics = [];

  // Assign metrics to each agent
  for (let i = 0; i < numAgents; i++) {
    const agent = agents[i];
    const agentMetrics = { ...baseMetrics };

    // Distribute remainders across first few agents
    if (i < remainders.totalCalls) agentMetrics.totalCalls++;
    if (i < remainders.inboundCalls) agentMetrics.inboundCalls++;
    if (i < remainders.outboundCalls) agentMetrics.outboundCalls++;
    if (i < remainders.totalDuration) agentMetrics.totalDuration++;
    if (i < remainders.successfulCalls) agentMetrics.successfulCalls++;
    if (i < remainders.failedCalls) agentMetrics.failedCalls++;

    // Recalculate average duration for this agent
    if (agentMetrics.totalCalls > 0) {
      agentMetrics.averageDuration =
        agentMetrics.totalDuration / agentMetrics.totalCalls;
    } else {
      agentMetrics.averageDuration = 0;
    }

    console.log(
      `[ElevenLabs] Assigning metrics to agent ${agent.agentId}:`,
      agentMetrics
    );

    distributedMetrics.push({
      agentId: agent.agentId,
      agentName: agent.agentName,
      metrics: agentMetrics,
    });
  }

  return distributedMetrics;
}

// Run the test
console.log("=== Testing ElevenLabs Sync Logic ===\n");

// Step 1: Aggregate total metrics
const totalMetrics = aggregateElevenLabsMetrics(mockElevenLabsData);
console.log("\n=== Total Metrics ===");
console.log(JSON.stringify(totalMetrics, null, 2));

// Step 2: Distribute across agents
const distributedMetrics = distributeMetricsAcrossAgents(
  totalMetrics,
  mockAgents
);
console.log("\n=== Distributed Metrics ===");
distributedMetrics.forEach((agent) => {
  console.log(`Agent: ${agent.agentName} (${agent.agentId})`);
  console.log(JSON.stringify(agent.metrics, null, 2));
  console.log("---");
});

// Step 3: Verify totals match (excluding averageDuration which is calculated per agent)
const sumDistributed = distributedMetrics.reduce(
  (sum, agent) => {
    sum.totalCalls += agent.metrics.totalCalls;
    sum.inboundCalls += agent.metrics.inboundCalls;
    sum.outboundCalls += agent.metrics.outboundCalls;
    sum.totalDuration += agent.metrics.totalDuration;
    sum.successfulCalls += agent.metrics.successfulCalls;
    sum.failedCalls += agent.metrics.failedCalls;
    return sum;
  },
  {
    totalCalls: 0,
    inboundCalls: 0,
    outboundCalls: 0,
    totalDuration: 0,
    successfulCalls: 0,
    failedCalls: 0,
  }
);

console.log("\n=== Verification ===");
console.log("Original totals:", totalMetrics);
console.log("Sum of distributed:", sumDistributed);
console.log(
  "Core metrics match:",
  sumDistributed.totalCalls === totalMetrics.totalCalls &&
    sumDistributed.inboundCalls === totalMetrics.inboundCalls &&
    sumDistributed.outboundCalls === totalMetrics.outboundCalls &&
    sumDistributed.totalDuration === totalMetrics.totalDuration &&
    sumDistributed.successfulCalls === totalMetrics.successfulCalls &&
    sumDistributed.failedCalls === totalMetrics.failedCalls
);

console.log("\n=== Test Complete ===");
