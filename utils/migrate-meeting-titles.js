// Migration script for adding meeting titles to existing agents
// This script will add default meeting titles to existing client records

import Client from "../client.js";
import { connectToDatabase } from "../index.js";

/**
 * Migration script to add meeting titles to existing clients
 */
async function migrateMeetingTitles() {
  try {
    console.log("Starting meeting titles migration...");

    // Connect to database
    await connectToDatabase();

    // Find all active clients
    const clients = await Client.find({ status: "Active" });
    console.log(`Found ${clients.length} active clients to migrate`);

    let updatedCount = 0;

    for (const client of clients) {
      let needsUpdate = false;
      const updates = {};

      // Check if primary agent needs meeting title
      if (!client.meetingTitle) {
        updates.meetingTitle = "Consultation";
        needsUpdate = true;
        console.log(
          `Adding primary agent meeting title for client: ${client.clientId}`
        );
      }

      // Check additional agents for missing meeting titles
      if (client.additionalAgents && client.additionalAgents.length > 0) {
        const updatedAgents = client.additionalAgents.map((agent, index) => {
          if (!agent.meetingTitle) {
            console.log(
              `Adding meeting title for additional agent: ${agent.agentId} (client: ${client.clientId})`
            );
            return { ...agent.toObject(), meetingTitle: "Consultation" };
          }
          return agent;
        });

        // Check if any agents were updated
        const needsAgentUpdate = client.additionalAgents.some(
          (agent) => !agent.meetingTitle
        );
        if (needsAgentUpdate) {
          updates.additionalAgents = updatedAgents;
          needsUpdate = true;
        }
      }

      // Update client if needed
      if (needsUpdate) {
        await Client.findByIdAndUpdate(client._id, updates, { new: true });
        updatedCount++;
        console.log(`✓ Updated client: ${client.clientId}`);
      }
    }

    console.log(`Migration completed. Updated ${updatedCount} clients.`);
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

/**
 * Custom migration for specific business types
 * You can customize meeting titles based on business type
 */
async function customMeetingTitleMigration() {
  try {
    console.log("Starting custom meeting titles migration...");

    // Example: Legal businesses get "Legal Consultation"
    const legalClients = await Client.find({
      status: "Active",
      $or: [
        { "clientMeta.businessName": /legal/i },
        { "clientMeta.businessName": /law/i },
        { "clientMeta.businessName": /attorney/i },
      ],
    });

    for (const client of legalClients) {
      await Client.findByIdAndUpdate(
        client._id,
        { meetingTitle: "Legal Consultation" },
        { new: true }
      );
      console.log(
        `✓ Updated legal client: ${client.clientId} - ${client.clientMeta.businessName}`
      );
    }

    // Example: Medical businesses get "Medical Consultation"
    const medicalClients = await Client.find({
      status: "Active",
      $or: [
        { "clientMeta.businessName": /medical/i },
        { "clientMeta.businessName": /health/i },
        { "clientMeta.businessName": /clinic/i },
        { "clientMeta.businessName": /doctor/i },
      ],
    });

    for (const client of medicalClients) {
      await Client.findByIdAndUpdate(
        client._id,
        { meetingTitle: "Medical Consultation" },
        { new: true }
      );
      console.log(
        `✓ Updated medical client: ${client.clientId} - ${client.clientMeta.businessName}`
      );
    }

    console.log("Custom migration completed.");
  } catch (error) {
    console.error("Custom migration failed:", error);
  }
}

/**
 * Update specific client meeting titles
 */
async function updateSpecificClientTitles(clientUpdates) {
  /*
  Example usage:
  const updates = [
    {
      clientId: "IQUPST2vTUl67YUYZYDy",
      primaryMeetingTitle: "Legal Consultation",
      additionalAgentUpdates: [
        {
          agentId: "agent_01jza2askhfeb89s7abjmasemr",
          meetingTitle: "Legal Matters Consultation"
        }
      ]
    }
  ];
  await updateSpecificClientTitles(updates);
  */

  try {
    console.log(`Updating ${clientUpdates.length} specific clients...`);

    for (const update of clientUpdates) {
      const client = await Client.findOne({ clientId: update.clientId });

      if (!client) {
        console.log(`⚠️  Client not found: ${update.clientId}`);
        continue;
      }

      const updates = {};

      // Update primary agent meeting title
      if (update.primaryMeetingTitle) {
        updates.meetingTitle = update.primaryMeetingTitle;
      }

      // Update additional agents
      if (
        update.additionalAgentUpdates &&
        update.additionalAgentUpdates.length > 0
      ) {
        const updatedAgents = client.additionalAgents.map((agent) => {
          const agentUpdate = update.additionalAgentUpdates.find(
            (au) => au.agentId === agent.agentId
          );

          if (agentUpdate) {
            return {
              ...agent.toObject(),
              meetingTitle: agentUpdate.meetingTitle,
            };
          }
          return agent;
        });

        updates.additionalAgents = updatedAgents;
      }

      await Client.findByIdAndUpdate(client._id, updates, { new: true });
      console.log(`✓ Updated client: ${update.clientId}`);
    }

    console.log("Specific client updates completed.");
  } catch (error) {
    console.error("Specific client updates failed:", error);
  }
}

// Export migration functions
export {
  migrateMeetingTitles,
  customMeetingTitleMigration,
  updateSpecificClientTitles,
};

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Running meeting titles migration...");
  migrateMeetingTitles()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
