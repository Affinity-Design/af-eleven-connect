// utils/ghl-appointments.js
/**
 * Utility functions for GoHighLevel appointments integration
 * Handles fetching historical appointment data and correlating with agents
 */

import fetch from 'node-fetch';
import { checkAndRefreshToken } from './ghl.js';
import { findClientById } from '../crud.js';

/**
 * Fetch appointments from GoHighLevel for a specific calendar and date range
 * @param {string} accessToken - GHL access token
 * @param {string} calendarId - The calendar ID
 * @param {string} locationId - The location ID
 * @param {Date} startDate - Start date for appointment search
 * @param {Date} endDate - End date for appointment search
 * @returns {Promise<Array>} - Array of appointments
 */
export async function fetchGhlAppointments(accessToken, calendarId, locationId, startDate, endDate) {
  try {
    // Convert dates to timestamps for GHL API
    const startTimestamp = startDate.getTime();
    const endTimestamp = endDate.getTime();
    
    const url = new URL('https://services.leadconnectorhq.com/calendars/events/appointments');
    url.searchParams.set('calendarId', calendarId);
    url.searchParams.set('locationId', locationId);
    url.searchParams.set('startDate', startTimestamp.toString());
    url.searchParams.set('endDate', endTimestamp.toString());
    
    console.log(`[GHL-Appointments] Fetching appointments from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`[GHL-Appointments] Calendar: ${calendarId}, Location: ${locationId}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Version': '2021-04-15',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GHL-Appointments] API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`GHL API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    const appointments = data.events || [];
    
    console.log(`[GHL-Appointments] Retrieved ${appointments.length} appointments`);
    return appointments;
  } catch (error) {
    console.error('[GHL-Appointments] Error fetching appointments:', error);
    throw error;
  }
}

/**
 * Get appointment details by ID
 * @param {string} accessToken - GHL access token
 * @param {string} appointmentId - The appointment ID
 * @returns {Promise<Object>} - Appointment details
 */
export async function getAppointmentDetails(accessToken, appointmentId) {
  try {
    const url = `https://services.leadconnectorhq.com/calendars/events/appointments/${appointmentId}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Version': '2021-04-15',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GHL API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[GHL-Appointments] Error fetching appointment details:', error);
    throw error;
  }
}

/**
 * Count successful bookings by month for a specific client
 * @param {string} clientId - The client ID
 * @param {number} year - The year
 * @param {number} month - The month (1-12)
 * @returns {Promise<Object>} - Booking counts and details
 */
export async function getMonthlyBookingCounts(clientId, year, month) {
  try {
    const client = await findClientById(clientId);
    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }
    
    if (!client.refreshToken || !client.calId) {
      return {
        success: false,
        error: 'Client does not have GHL integration or calendar configured',
        bookingCount: 0,
        appointments: []
      };
    }
    
    // Get valid access token
    const { accessToken } = await checkAndRefreshToken(clientId);
    
    // Calculate date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    console.log(`[GHL-Appointments] Getting bookings for ${clientId} in ${year}-${month.toString().padStart(2, '0')}`);
    
    // Fetch appointments for the month
    const appointments = await fetchGhlAppointments(
      accessToken,
      client.calId,
      clientId,
      startDate,
      endDate
    );
    
    // Filter for confirmed appointments (successful bookings)
    const confirmedBookings = appointments.filter(apt => 
      apt.appointmentStatus === 'confirmed' || 
      apt.appointmentStatus === 'showed'
    );
    
    // Group by agent if possible (this is challenging since appointments don't directly link to agents)
    // We'll need to correlate based on the phone number used or other identifiers
    const agentBookings = {};
    const allAgents = client.getAllAgents();
    
    // Initialize counts for all agents
    allAgents.forEach(agent => {
      agentBookings[agent.agentId] = {
        agentId: agent.agentId,
        agentName: agent.agentName,
        twilioPhoneNumber: agent.twilioPhoneNumber,
        bookingCount: 0,
        appointments: []
      };
    });
    
    // For now, we'll assign all bookings to the primary agent
    // In the future, this could be enhanced with more sophisticated correlation
    const primaryAgent = allAgents.find(agent => agent.isPrimary);
    if (primaryAgent) {
      agentBookings[primaryAgent.agentId].bookingCount = confirmedBookings.length;
      agentBookings[primaryAgent.agentId].appointments = confirmedBookings.map(apt => ({
        id: apt.id,
        title: apt.title,
        startTime: apt.startTime,
        endTime: apt.endTime,
        contactId: apt.contactId,
        status: apt.appointmentStatus
      }));
    }
    
    return {
      success: true,
      clientId,
      period: `${year}-${month.toString().padStart(2, '0')}`,
      totalBookings: confirmedBookings.length,
      totalAppointments: appointments.length,
      agentBookings,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    };
  } catch (error) {
    console.error('[GHL-Appointments] Error getting monthly booking counts:', error);
    return {
      success: false,
      error: error.message,
      bookingCount: 0,
      appointments: []
    };
  }
}

/**
 * Sync appointment data to agent metrics for a specific period
 * @param {string} clientId - The client ID
 * @param {number} year - The year
 * @param {number} month - The month (1-12)
 * @returns {Promise<Object>} - Sync result
 */
export async function syncAppointmentMetrics(clientId, year, month) {
  try {
    console.log(`[GHL-Appointments] Syncing appointment metrics for ${clientId}, period ${year}-${month}`);
    
    // Get booking counts for the month
    const bookingData = await getMonthlyBookingCounts(clientId, year, month);
    
    if (!bookingData.success) {
      return {
        success: false,
        error: bookingData.error,
        period: `${year}-${month.toString().padStart(2, '0')}`,
        clientId
      };
    }
    
    // Update metrics for each agent
    const client = await findClientById(clientId);
    const updates = {};
    
    for (const [agentId, agentData] of Object.entries(bookingData.agentBookings)) {
      if (agentData.bookingCount > 0) {
        // Get existing metrics for the agent
        const existingMetrics = client.getAgentMetrics(agentId, year, month);
        
        // Update successful bookings count
        const currentBookings = existingMetrics?.metrics?.successfulBookings || 0;
        const newBookingCount = Math.max(currentBookings, agentData.bookingCount);
        
        client.updateAgentMetrics(agentId, year, month, {
          successfulBookings: newBookingCount,
          lastUpdated: new Date()
        });
        
        updates[agentId] = {
          agentName: agentData.agentName,
          previousBookings: currentBookings,
          newBookings: newBookingCount,
          appointmentsFound: agentData.bookingCount
        };
        
        console.log(`[GHL-Appointments] Updated agent ${agentId}: ${newBookingCount} successful bookings`);
      }
    }
    
    // Save changes to database
    await client.save();
    
    return {
      success: true,
      message: `Appointment metrics synced for period ${year}-${month}`,
      period: `${year}-${month.toString().padStart(2, '0')}`,
      clientId,
      totalAppointments: bookingData.totalAppointments,
      totalConfirmedBookings: bookingData.totalBookings,
      agentUpdates: updates,
      dateRange: bookingData.dateRange
    };
  } catch (error) {
    console.error('[GHL-Appointments] Error syncing appointment metrics:', error);
    return {
      success: false,
      error: error.message,
      period: `${year}-${month.toString().padStart(2, '0')}`,
      clientId
    };
  }
}

/**
 * Get historical appointment data for multiple months
 * @param {string} clientId - The client ID
 * @param {Date} startDate - Start date for historical data
 * @param {Date} endDate - End date for historical data
 * @returns {Promise<Object>} - Historical appointment data grouped by month
 */
export async function getHistoricalAppointmentData(clientId, startDate, endDate) {
  try {
    const client = await findClientById(clientId);
    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }
    
    if (!client.refreshToken || !client.calId) {
      return {
        success: false,
        error: 'Client does not have GHL integration or calendar configured',
        monthlyData: {}
      };
    }
    
    const { accessToken } = await checkAndRefreshToken(clientId);
    
    console.log(`[GHL-Appointments] Getting historical data from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Fetch all appointments in the date range
    const appointments = await fetchGhlAppointments(
      accessToken,
      client.calId,
      clientId,
      startDate,
      endDate
    );
    
    // Group appointments by month
    const monthlyData = {};
    
    appointments.forEach(apt => {
      const aptDate = new Date(apt.startTime);
      const monthKey = `${aptDate.getFullYear()}-${String(aptDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          period: monthKey,
          totalAppointments: 0,
          confirmedBookings: 0,
          appointments: []
        };
      }
      
      monthlyData[monthKey].totalAppointments++;
      if (apt.appointmentStatus === 'confirmed' || apt.appointmentStatus === 'showed') {
        monthlyData[monthKey].confirmedBookings++;
      }
      
      monthlyData[monthKey].appointments.push({
        id: apt.id,
        title: apt.title,
        startTime: apt.startTime,
        endTime: apt.endTime,
        status: apt.appointmentStatus,
        contactId: apt.contactId
      });
    });
    
    return {
      success: true,
      clientId,
      totalAppointments: appointments.length,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      monthlyData
    };
  } catch (error) {
    console.error('[GHL-Appointments] Error getting historical appointment data:', error);
    return {
      success: false,
      error: error.message,
      monthlyData: {}
    };
  }
}
