// utils/historical-import.js
/**
 * Utility functions for importing and processing historical data
 * Combines ElevenLabs conversation data and GoHighLevel appointments
 */

import { syncElevenLabsMetrics } from './elevenlabs.js';
import { syncAppointmentMetrics, getHistoricalAppointmentData } from './ghl-appointments.js';
import { getAllAgentMetrics } from './metrics.js';
import { findClientById } from '../crud.js';

/**
 * Import historical data for a client across multiple months
 * @param {string} clientId - The client ID
 * @param {Date} startDate - Start date for import
 * @param {Date} endDate - End date for import
 * @param {Object} options - Import options
 * @returns {Promise<Object>} - Import results
 */
export async function importHistoricalData(clientId, startDate, endDate, options = {}) {
  const {
    includeElevenLabs = true,
    includeAppointments = true,
    skipExisting = false,
    batchSize = 3 // Process 3 months at a time to avoid overwhelming APIs
  } = options;

  console.log(`[Historical-Import] Starting import for ${clientId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

  try {
    const client = await findClientById(clientId);
    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    // Generate list of months to process
    const months = generateMonthList(startDate, endDate);
    console.log(`[Historical-Import] Processing ${months.length} months of data`);

    const results = {
      clientId,
      clientName: client.clientName,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      totalMonths: months.length,
      processedMonths: 0,
      successfulMonths: 0,
      skippedMonths: 0,
      errorMonths: 0,
      elevenLabsResults: [],
      appointmentResults: [],
      summary: {}
    };

    // Process months in batches
    for (let i = 0; i < months.length; i += batchSize) {
      const batch = months.slice(i, i + batchSize);
      console.log(`[Historical-Import] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(months.length / batchSize)}`);

      // Process batch in parallel
      const batchPromises = batch.map(async ({ year, month }) => {
        const monthResults = {
          period: `${year}-${month.toString().padStart(2, '0')}`,
          year,
          month,
          elevenLabs: { processed: false, success: false },
          appointments: { processed: false, success: false },
          errors: []
        };

        try {
          // Check if data already exists for this month
          if (skipExisting) {
            const existingMetrics = client.getAgentMetrics(null, year, month);
            if (existingMetrics && Object.keys(existingMetrics).length > 0) {
              console.log(`[Historical-Import] Skipping ${year}-${month} - data already exists`);
              monthResults.skipped = true;
              results.skippedMonths++;
              return monthResults;
            }
          }

          // Import ElevenLabs data
          if (includeElevenLabs) {
            try {
              console.log(`[Historical-Import] Importing ElevenLabs data for ${year}-${month}`);
              const elevenLabsResult = await syncElevenLabsMetrics(clientId, year, month);
              monthResults.elevenLabs = {
                processed: true,
                success: elevenLabsResult.success,
                data: elevenLabsResult
              };
              
              if (!elevenLabsResult.success) {
                monthResults.errors.push(`ElevenLabs: ${elevenLabsResult.error}`);
              }
            } catch (error) {
              console.error(`[Historical-Import] ElevenLabs error for ${year}-${month}:`, error);
              monthResults.elevenLabs = {
                processed: true,
                success: false,
                error: error.message
              };
              monthResults.errors.push(`ElevenLabs: ${error.message}`);
            }
          }

          // Import appointments data
          if (includeAppointments) {
            try {
              console.log(`[Historical-Import] Importing appointments data for ${year}-${month}`);
              const appointmentResult = await syncAppointmentMetrics(clientId, year, month);
              monthResults.appointments = {
                processed: true,
                success: appointmentResult.success,
                data: appointmentResult
              };
              
              if (!appointmentResult.success) {
                monthResults.errors.push(`Appointments: ${appointmentResult.error}`);
              }
            } catch (error) {
              console.error(`[Historical-Import] Appointments error for ${year}-${month}:`, error);
              monthResults.appointments = {
                processed: true,
                success: false,
                error: error.message
              };
              monthResults.errors.push(`Appointments: ${error.message}`);
            }
          }

          // Determine if month was successful
          const elevenLabsOk = !includeElevenLabs || monthResults.elevenLabs.success;
          const appointmentsOk = !includeAppointments || monthResults.appointments.success;
          
          if (elevenLabsOk && appointmentsOk) {
            results.successfulMonths++;
          } else {
            results.errorMonths++;
          }

          results.processedMonths++;
          return monthResults;

        } catch (error) {
          console.error(`[Historical-Import] Month processing error for ${year}-${month}:`, error);
          monthResults.errors.push(`General: ${error.message}`);
          results.errorMonths++;
          results.processedMonths++;
          return monthResults;
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Add batch results to main results
      batchResults.forEach(monthResult => {
        if (monthResult.elevenLabs.processed) {
          results.elevenLabsResults.push(monthResult);
        }
        if (monthResult.appointments.processed) {
          results.appointmentResults.push(monthResult);
        }
      });

      // Brief pause between batches to be respectful to APIs
      if (i + batchSize < months.length) {
        console.log(`[Historical-Import] Pausing between batches...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Generate summary
    results.summary = await generateImportSummary(clientId, startDate, endDate);

    console.log(`[Historical-Import] Import completed for ${clientId}. Processed: ${results.processedMonths}, Successful: ${results.successfulMonths}, Errors: ${results.errorMonths}, Skipped: ${results.skippedMonths}`);

    return {
      success: true,
      message: `Historical import completed. ${results.successfulMonths}/${results.totalMonths} months successful.`,
      data: results
    };

  } catch (error) {
    console.error(`[Historical-Import] Import failed for ${clientId}:`, error);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

/**
 * Generate a list of year/month objects between two dates
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Array} - Array of {year, month} objects
 */
function generateMonthList(startDate, endDate) {
  const months = [];
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (current <= end) {
    months.push({
      year: current.getFullYear(),
      month: current.getMonth() + 1
    });
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

/**
 * Generate a summary of imported data
 * @param {string} clientId - The client ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} - Summary data
 */
async function generateImportSummary(clientId, startDate, endDate) {
  try {
    const client = await findClientById(clientId);
    const agents = client.getAllAgents();
    
    // Get all metrics for the date range
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth() + 1;
    
    const allMetrics = await getAllAgentMetrics(clientId, {
      startYear,
      startMonth,
      endYear,
      endMonth
    });

    // Calculate totals
    const summary = {
      totalAgents: agents.length,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      totalInboundCalls: 0,
      totalOutboundCalls: 0,
      totalSuccessfulBookings: 0,
      agentSummaries: {},
      monthlyTotals: {}
    };

    // Process metrics by agent
    agents.forEach(agent => {
      summary.agentSummaries[agent.agentId] = {
        agentName: agent.agentName,
        totalInbound: 0,
        totalOutbound: 0,
        totalBookings: 0,
        monthlyBreakdown: {}
      };
    });

    // Aggregate metrics
    if (allMetrics.success && allMetrics.data) {
      Object.entries(allMetrics.data).forEach(([agentId, agentData]) => {
        if (summary.agentSummaries[agentId]) {
          const agentSummary = summary.agentSummaries[agentId];
          
          Object.entries(agentData.monthlyMetrics || {}).forEach(([period, metrics]) => {
            const inbound = metrics.inboundCalls || 0;
            const outbound = metrics.outboundCalls || 0;
            const bookings = metrics.successfulBookings || 0;
            
            agentSummary.totalInbound += inbound;
            agentSummary.totalOutbound += outbound;
            agentSummary.totalBookings += bookings;
            
            agentSummary.monthlyBreakdown[period] = {
              inbound,
              outbound,
              bookings
            };
            
            // Add to monthly totals
            if (!summary.monthlyTotals[period]) {
              summary.monthlyTotals[period] = {
                inbound: 0,
                outbound: 0,
                bookings: 0
              };
            }
            
            summary.monthlyTotals[period].inbound += inbound;
            summary.monthlyTotals[period].outbound += outbound;
            summary.monthlyTotals[period].bookings += bookings;
            
            // Add to grand totals
            summary.totalInboundCalls += inbound;
            summary.totalOutboundCalls += outbound;
            summary.totalSuccessfulBookings += bookings;
          });
        }
      });
    }

    return summary;
  } catch (error) {
    console.error('[Historical-Import] Error generating summary:', error);
    return {
      error: error.message,
      totalAgents: 0,
      totalInboundCalls: 0,
      totalOutboundCalls: 0,
      totalSuccessfulBookings: 0
    };
  }
}

/**
 * Validate historical data integrity for a client
 * @param {string} clientId - The client ID
 * @param {Date} startDate - Start date for validation
 * @param {Date} endDate - End date for validation
 * @returns {Promise<Object>} - Validation results
 */
export async function validateHistoricalData(clientId, startDate, endDate) {
  try {
    console.log(`[Historical-Import] Validating data for ${clientId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    const client = await findClientById(clientId);
    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    const months = generateMonthList(startDate, endDate);
    const validation = {
      clientId,
      totalMonths: months.length,
      monthsWithData: 0,
      monthsWithoutData: 0,
      dataGaps: [],
      consistency: {
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0,
        issues: []
      }
    };

    for (const { year, month } of months) {
      const period = `${year}-${month.toString().padStart(2, '0')}`;
      
      // Check if any agent has data for this month
      const agents = client.getAllAgents();
      let hasDataForMonth = false;
      
      for (const agent of agents) {
        const metrics = client.getAgentMetrics(agent.agentId, year, month);
        if (metrics && metrics.metrics) {
          const { inboundCalls = 0, outboundCalls = 0, successfulBookings = 0 } = metrics.metrics;
          if (inboundCalls > 0 || outboundCalls > 0 || successfulBookings > 0) {
            hasDataForMonth = true;
            break;
          }
        }
      }
      
      if (hasDataForMonth) {
        validation.monthsWithData++;
      } else {
        validation.monthsWithoutData++;
        validation.dataGaps.push(period);
      }
    }

    // Data consistency checks
    for (const agent of client.getAllAgents()) {
      validation.consistency.totalChecks++;
      
      // Check if agent has realistic call-to-booking ratios
      let totalCalls = 0;
      let totalBookings = 0;
      
      for (const { year, month } of months) {
        const metrics = client.getAgentMetrics(agent.agentId, year, month);
        if (metrics && metrics.metrics) {
          totalCalls += (metrics.metrics.inboundCalls || 0) + (metrics.metrics.outboundCalls || 0);
          totalBookings += metrics.metrics.successfulBookings || 0;
        }
      }
      
      // Flag if booking rate is unrealistically high (>50%) or if there are bookings but no calls
      if (totalBookings > totalCalls * 0.5 && totalCalls > 0) {
        validation.consistency.failedChecks++;
        validation.consistency.issues.push({
          type: 'high_booking_rate',
          agentId: agent.agentId,
          agentName: agent.agentName,
          totalCalls,
          totalBookings,
          rate: totalBookings / totalCalls
        });
      } else if (totalBookings > 0 && totalCalls === 0) {
        validation.consistency.failedChecks++;
        validation.consistency.issues.push({
          type: 'bookings_without_calls',
          agentId: agent.agentId,
          agentName: agent.agentName,
          totalCalls,
          totalBookings
        });
      } else {
        validation.consistency.passedChecks++;
      }
    }

    return {
      success: true,
      message: `Validation completed. ${validation.monthsWithData}/${validation.totalMonths} months have data.`,
      data: validation
    };

  } catch (error) {
    console.error('[Historical-Import] Validation error:', error);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}
