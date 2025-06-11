/**
 * Checks if a store is currently accepting orders based on its active status,
 * admin override, owner override, and default schedule.
 * * @param {object} store - The store object. Must contain:
 * is_active (boolean),
 * admin_forced_status (string: 'AUTO', 'FORCE_OPEN', 'FORCE_CLOSED'),
 * owner_choice_status (string: 'AUTO', 'FORCE_CLOSED'),
 * default_opening_time (string: "HH:MM" or "HH:MM:SS" or null),
 * default_closing_time (string: "HH:MM" or "HH:MM:SS" or null)
 * @param {Date} currentTime - The current JavaScript Date object.
 * @returns {boolean} - True if the store is accepting orders, false otherwise.
 */
function isStoreCurrentlyAcceptingOrders(store, currentTime) {
  // 1. Store must be active (admin approved for visibility)
  if (!store || typeof store.is_active === 'undefined' || !store.is_active) {
    return false;
  }

  // 2. Check Admin Forced Status (highest priority after is_active)
  if (store.admin_forced_status === 'FORCE_OPEN') {
    return true;
  }
  if (store.admin_forced_status === 'FORCE_CLOSED') {
    return false;
  }

  // 3. If Admin is 'AUTO', check Owner Choice Status
  // (admin_forced_status is 'AUTO' or was null/undefined from DB)
  if (store.owner_choice_status === 'FORCE_CLOSED') {
    return false;
  }

  // 4. If Owner is 'AUTO' (meaning use schedule), check schedule
  // (owner_choice_status is 'AUTO' or was null/undefined from DB)
  if (store.default_opening_time && store.default_closing_time) {
    try {
      const openingTimeParts = store.default_opening_time.split(':');
      const closingTimeParts = store.default_closing_time.split(':');

      if (openingTimeParts.length < 2 || closingTimeParts.length < 2) {
        // Invalid time string format from DB
        return false; 
      }

      const openHour = parseInt(openingTimeParts[0], 10);
      const openMinute = parseInt(openingTimeParts[1], 10);
      
      const closeHour = parseInt(closingTimeParts[0], 10);
      const closeMinute = parseInt(closingTimeParts[1], 10);

      if (isNaN(openHour) || isNaN(openMinute) || isNaN(closeHour) || isNaN(closeMinute)) {
        // Failed to parse time components
        return false;
      }
      
      const currentHour = currentTime.getHours();
      const currentMinute = currentTime.getMinutes();
      
      const currentTimeInMinutes = currentHour * 60 + currentMinute;
      const openTimeInMinutes = openHour * 60 + openMinute;
      let closeTimeInMinutes = closeHour * 60 + closeMinute;
      
      // Handle overnight schedule (e.g., opens 22:00, closes 02:00 next day)
      if (closeTimeInMinutes < openTimeInMinutes) { 
        // Example: Open 22:00 (1320 min), Close 02:00 (120 min)
        // Store is open if current time is after opening time (on day 1)
        // OR current time is before closing time (on day 2, which means current time is small)
        if (currentTimeInMinutes >= openTimeInMinutes || currentTimeInMinutes < closeTimeInMinutes) {
          return true;
        } else {
          return false;
        }
      } else if (closeTimeInMinutes > openTimeInMinutes) { // Standard same-day schedule
        if (currentTimeInMinutes >= openTimeInMinutes && currentTimeInMinutes < closeTimeInMinutes) {
          return true;
        } else {
          return false;
        }
      } else { // openTimeInMinutes === closeTimeInMinutes
        // If opening and closing times are identical, consider the store closed unless it's a 24h convention
        // A common convention for 24 hours is 00:00 to 00:00 or 00:00 to 23:59.
        // If default_opening_time is "00:00" and default_closing_time is "00:00" (or "23:59"),
        // it means it's open 24 hours. The conditions above would correctly evaluate this.
        // E.g. 00:00 to 23:59 -> openTimeInMinutes = 0, closeTimeInMinutes = 1439. Always true if current is within.
        // E.g. 00:00 to 00:00 (overnight logic) -> open if current >=0 or current < 0 (effectively always true).
        // This specific 'else' (identical non-zero times) means a 0-minute window, so closed.
        return false; 
      }
    } catch (parseError) {
      console.error('Error parsing store schedule times:', parseError);
      return false; // Error parsing times, assume closed for safety
    }
  } else {
    // No schedule defined (default_opening_time or default_closing_time is null),
    // and not forced open/closed by admin or owner.
    // In this 'AUTO' mode without a schedule, assume the store is not accepting orders.
    return false; 
  }
}

module.exports = { isStoreCurrentlyAcceptingOrders };
