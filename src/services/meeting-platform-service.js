// Meeting Platform Service
// Handles Google Meet, Zoom, and Microsoft Teams integration

export class MeetingPlatformService {
  constructor() {
    this.zoomApiKey = null;
    this.zoomApiSecret = null;
    this.teamsAccessToken = null;
    this.loadCredentials();
  }

  async loadCredentials() {
    try {
      const result = await chrome.storage.sync.get([
        'zoomApiKey',
        'zoomApiSecret',
        'teamsAccessToken'
      ]);
      
      this.zoomApiKey = result.zoomApiKey;
      this.zoomApiSecret = result.zoomApiSecret;
      this.teamsAccessToken = result.teamsAccessToken;

    } catch (error) {
      console.error('Error loading credentials:', error);
    }
  }

  // Google Meet Integration
  async createGoogleMeet() {
    try {
      // Google Meet links are created automatically with Calendar events
      // when conferenceDataVersion=1 is used
      // This method generates a standalone link using the Calendar API
      // Get auth token
      const token = await this.getGoogleAuthToken();
      // Create a minimal calendar event to get Meet link
      const now = new Date();
      const end = new Date(now.getTime() + 60 * 60000); // 1 hour later

      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            summary: 'Temporary - Meeting Link Generation',
            start: {
              dateTime: now.toISOString(),
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
            },
            end: {
              dateTime: end.toISOString(),
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
            },
            conferenceData: {
              createRequest: {
                requestId: this.generateUUID(),
                conferenceSolutionKey: {
                  type: 'hangoutsMeet'
                }
              }
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create Google Meet link');
      }

      const event = await response.json();
      const meetLink = event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri;

      // Delete the temporary event
      await this.deleteGoogleCalendarEvent(token, event.id);

      return meetLink || 'https://meet.google.com/';

    } catch (error) {
      console.error('Error creating Google Meet:', error);
      // Fallback to generic Meet URL
      return `https://meet.google.com/${this.generateMeetCode()}`;
    }
  }

  async getGoogleAuthToken() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(token);
      });
    });
  }

  async deleteGoogleCalendarEvent(token, eventId) {
    try {
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
    } catch (error) {
      console.error('Error deleting temporary event:', error);
    }
  }

  generateMeetCode() {
    // Generate a Google Meet-style code (e.g., abc-defg-hij)
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const part1 = Array(3).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
    const part2 = Array(4).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
    const part3 = Array(3).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${part1}-${part2}-${part3}`;
  }

  // Zoom Integration
  async createZoomMeeting(details) {
    try {
      if (!this.zoomApiKey || !this.zoomApiSecret) {
        console.warn('Zoom credentials not configured');
        return this.generateZoomLink();
      }

      const accessToken = await this.getZoomAccessToken();
      
      const meetingData = {
        topic: details.topic || `Meeting with ${details.participantName || 'Contact'}`,
        type: 2, // Scheduled meeting
        start_time: details.startTime,
        duration: details.duration || 30,
        timezone: details.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: false,
          mute_upon_entry: true,
          waiting_room: false,
          audio: 'both',
          auto_recording: 'none'
        }
      };

      const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(meetingData)
      });

      if (!response.ok) {
        throw new Error('Failed to create Zoom meeting');
      }

      const meeting = await response.json();
      return meeting.join_url;

    } catch (error) {
      console.error('Error creating Zoom meeting:', error);
      return this.generateZoomLink();
    }
  }

  async getZoomAccessToken() {
    // Implement OAuth flow or JWT token generation
    // This is a simplified version
    // In production, you'd implement proper OAuth 2.0 flow
    
    try {
      const result = await chrome.storage.local.get(['zoomAccessToken', 'zoomTokenExpiry']);
      
      if (result.zoomAccessToken && result.zoomTokenExpiry > Date.now()) {
        return result.zoomAccessToken;
      }

      // Need to refresh or get new token
      // This would typically involve a server-side component
      throw new Error('Zoom token expired or not available');

    } catch (error) {
      console.error('Error getting Zoom token:', error);
      throw error;
    }
  }

  generateZoomLink() {
    // Generate a placeholder Zoom link
    const meetingId = Math.floor(Math.random() * 9000000000) + 1000000000;
    return `https://zoom.us/j/${meetingId}`;
  }

  // Microsoft Teams Integration
  async createTeamsMeeting(details) {
    try {
      if (!this.teamsAccessToken) {
        console.warn('Teams credentials not configured');
        return this.generateTeamsLink();
      }

      const meetingData = {
        subject: details.topic || `Meeting with ${details.participantName || 'Contact'}`,
        startDateTime: details.startTime,
        endDateTime: new Date(new Date(details.startTime).getTime() + details.duration * 60000).toISOString(),
        participants: {
          attendees: details.attendees || []
        }
      };

      const response = await fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.teamsAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(meetingData)
      });

      if (!response.ok) {
        throw new Error('Failed to create Teams meeting');
      }

      const meeting = await response.json();
      return meeting.joinUrl;

    } catch (error) {
      console.error('Error creating Teams meeting:', error);
      return this.generateTeamsLink();
    }
  }

  generateTeamsLink() {
    // Generate a placeholder Teams link
    const meetingId = this.generateUUID();
    return `https://teams.microsoft.com/l/meetup-join/${meetingId}`;
  }

  // Utility Functions
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async authenticateZoom() {
    // Open OAuth flow for Zoom
    const authUrl = `https://zoom.us/oauth/authorize?` +
      `response_type=code&` +
      `client_id=${this.zoomApiKey}&` +
      `redirect_uri=${chrome.identity.getRedirectURL()}`;

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      }, (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        // Extract code from redirect URL
        const url = new URL(redirectUrl);
        const code = url.searchParams.get('code');
        
        if (code) {
          this.exchangeZoomCode(code).then(resolve).catch(reject);
        } else {
          reject(new Error('No authorization code received'));
        }
      });
    });
  }

  async exchangeZoomCode(code) {
    // Exchange authorization code for access token
    // This typically requires a backend service to keep client secret secure
    
    const response = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${this.zoomApiKey}:${this.zoomApiSecret}`)
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: chrome.identity.getRedirectURL()
      })
    });

    if (!response.ok) {
      throw new Error('Failed to exchange Zoom authorization code');
    }

    const data = await response.json();
    
    // Store tokens
    await chrome.storage.local.set({
      zoomAccessToken: data.access_token,
      zoomRefreshToken: data.refresh_token,
      zoomTokenExpiry: Date.now() + (data.expires_in * 1000)
    });

    return data.access_token;
  }

  async authenticateTeams() {
    // Open OAuth flow for Microsoft Teams
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
      `client_id=${this.teamsClientId}&` +
      `response_type=code&` +
      `redirect_uri=${chrome.identity.getRedirectURL()}&` +
      `scope=OnlineMeetings.ReadWrite Calendars.ReadWrite`;

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      }, (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        const url = new URL(redirectUrl);
        const code = url.searchParams.get('code');
        
        if (code) {
          this.exchangeTeamsCode(code).then(resolve).catch(reject);
        } else {
          reject(new Error('No authorization code received'));
        }
      });
    });
  }

  async exchangeTeamsCode(code) {
    // Exchange code for Teams access token
    // Similar to Zoom, this should be done server-side in production
    
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: this.teamsClientId,
        client_secret: this.teamsClientSecret,
        redirect_uri: chrome.identity.getRedirectURL(),
        scope: 'OnlineMeetings.ReadWrite Calendars.ReadWrite'
      })
    });

    if (!response.ok) {
      throw new Error('Failed to exchange Teams authorization code');
    }

    const data = await response.json();
    
    await chrome.storage.local.set({
      teamsAccessToken: data.access_token,
      teamsRefreshToken: data.refresh_token,
      teamsTokenExpiry: Date.now() + (data.expires_in * 1000)
    });

    return data.access_token;
  }
}

