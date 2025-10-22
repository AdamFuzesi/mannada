// Calendar Service
// Handles Google Calendar and other calendar integrations

export class CalendarService {
  constructor() {
    this.accessToken = null;
    this.calendarId = 'primary';
    this.apiBase = 'https://www.googleapis.com/calendar/v3';
  }

  async initialize() {
    await this.loadAccessToken();
  }

  async loadAccessToken() {
    try {
      const result = await chrome.storage.local.get(['googleAccessToken']);
      this.accessToken = result.googleAccessToken;
    } catch (error) {
      console.error('Error loading access token:', error);
    }
  }

  async authenticate() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        
        this.accessToken = token;
        chrome.storage.local.set({ googleAccessToken: token });
        resolve(token);
      });
    });
  }

  async ensureAuthenticated() {
    if (!this.accessToken) {
      await this.authenticate();
    }
    return this.accessToken;
  }

  async createEvent(eventDetails) {
    try {
      await this.ensureAuthenticated();

      // Calculate end time
      const startDateTime = new Date(eventDetails.start.dateTime);
      const endDateTime = new Date(startDateTime.getTime() + eventDetails.duration * 60000);

      const event = {
        summary: eventDetails.summary,
        description: eventDetails.description,
        start: {
          dateTime: eventDetails.start.dateTime,
          timeZone: eventDetails.start.timeZone
        },
        end: {
          dateTime: endDateTime.toISOString().slice(0, -5),
          timeZone: eventDetails.start.timeZone
        },
        attendees: eventDetails.attendees,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 }
          ]
        }
      };

      // Add conference data if provided
      if (eventDetails.conferenceData) {
        event.conferenceData = eventDetails.conferenceData;
      }

      const response = await fetch(
        `${this.apiBase}/calendars/${this.calendarId}/events?conferenceDataVersion=1`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(event)
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Calendar API error: ${error.error.message}`);
      }

      const createdEvent = await response.json();
      console.log('Calendar event created:', createdEvent);
      
      return {
        id: createdEvent.id,
        htmlLink: createdEvent.htmlLink,
        hangoutLink: createdEvent.hangoutLink,
        conferenceData: createdEvent.conferenceData
      };

    } catch (error) {
      console.error('Error creating calendar event:', error);
      throw error;
    }
  }

  async checkAvailability(date, duration = 30) {
    try {
      await this.ensureAuthenticated();

      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      const response = await fetch(
        `${this.apiBase}/freeBusy`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            timeMin: startDate.toISOString(),
            timeMax: endDate.toISOString(),
            items: [{ id: this.calendarId }]
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to check availability');
      }

      const data = await response.json();
      const busySlots = data.calendars[this.calendarId].busy;

      // Find available slots
      const availableSlots = this.findAvailableSlots(
        startDate,
        endDate,
        busySlots,
        duration
      );

      return availableSlots;

    } catch (error) {
      console.error('Error checking availability:', error);
      return [];
    }
  }

  findAvailableSlots(startDate, endDate, busySlots, duration) {
    const slots = [];
    const businessHoursStart = 9; // 9 AM
    const businessHoursEnd = 17; // 5 PM
    
    let currentTime = new Date(startDate);
    currentTime.setHours(businessHoursStart, 0, 0, 0);

    while (currentTime < endDate) {
      const slotEnd = new Date(currentTime.getTime() + duration * 60000);
      
      // Check if within business hours
      if (slotEnd.getHours() > businessHoursEnd) {
        currentTime.setDate(currentTime.getDate() + 1);
        currentTime.setHours(businessHoursStart, 0, 0, 0);
        continue;
      }

      // Check if slot conflicts with busy times
      const isAvailable = !busySlots.some(busy => {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        return (currentTime >= busyStart && currentTime < busyEnd) ||
               (slotEnd > busyStart && slotEnd <= busyEnd);
      });

      if (isAvailable) {
        slots.push({
          start: new Date(currentTime),
          end: new Date(slotEnd)
        });
      }

      // Move to next 30-minute slot
      currentTime = new Date(currentTime.getTime() + 30 * 60000);
    }

    return slots;
  }

  async updateEvent(eventId, updates) {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.apiBase}/calendars/${this.calendarId}/events/${eventId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updates)
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update event');
      }

      return await response.json();

    } catch (error) {
      console.error('Error updating event:', error);
      throw error;
    }
  }

  async deleteEvent(eventId) {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.apiBase}/calendars/${this.calendarId}/events/${eventId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete event');
      }

      return true;

    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  }

  async listUpcomingEvents(maxResults = 10) {
    try {
      await this.ensureAuthenticated();

      const now = new Date();
      const response = await fetch(
        `${this.apiBase}/calendars/${this.calendarId}/events?` +
        `timeMin=${now.toISOString()}&` +
        `maxResults=${maxResults}&` +
        `singleEvents=true&` +
        `orderBy=startTime`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to list events');
      }

      const data = await response.json();
      return data.items || [];

    } catch (error) {
      console.error('Error listing events:', error);
      return [];
    }
  }
}

