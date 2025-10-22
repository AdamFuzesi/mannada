// Background Service Worker for Smart Meeting Scheduler
// Handles API coordination, AI processing, and calendar integration

import { AIProcessor } from './services/ai-processor.js';
import { CalendarService } from './services/calendar-service.js';
import { MeetingPlatformService } from './services/meeting-platform-service.js';
import { StorageService } from './services/storage-service.js';

class BackgroundService {
  constructor() {
    this.aiProcessor = new AIProcessor();
    this.calendarService = new CalendarService();
    this.meetingPlatform = new MeetingPlatformService();
    this.storage = new StorageService();
    this.voiceRecognition = null;
  }

  async initialize() {
    console.log('Smart Meeting Scheduler background service initialized');
    
    // Load user settings
    await this.storage.loadSettings();
    
    // Set up listeners
    this.setupMessageListeners();
    this.setupCommandListeners();
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep channel open for async responses
    });
  }

  setupCommandListeners() {
    chrome.commands.onCommand.addListener((command) => {
      console.log('Command received:', command);
      if (command === 'activate-assistant') {
        console.log('Activating assistant...');
        this.activateAssistant();
      }
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'startVoiceRecognition':
          await this.handleVoiceRecognition(request, sendResponse);
          break;
        
        case 'processSchedulingCommand':
          await this.processSchedulingCommand(request, sendResponse);
          break;
        
        case 'createMeeting':
          await this.createMeeting(request, sendResponse);
          break;
        
        case 'checkAvailability':
          await this.checkAvailability(request, sendResponse);
          break;
        
        case 'saveSettings':
          await this.saveSettings(request, sendResponse);
          break;
        
        case 'getSettings':
          await this.getSettings(sendResponse);
          break;
        
        case 'getMeetingHistory':
          await this.getMeetingHistory(sendResponse);
          break;
        
        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ error: error.message });
    }
  }

  async handleVoiceRecognition(request, sendResponse) {
    // Voice recognition is handled by popup/content script
    // This is a placeholder for cloud-based fallback
    try {
      // In production, this could call Google Speech-to-Text API
      // For now, we acknowledge the request
      sendResponse({ 
        success: true,
        message: 'Voice recognition initiated in content script'
      });
    } catch (error) {
      sendResponse({ error: error.message });
    }
  }

  async processSchedulingCommand(request, sendResponse) {
    try {
      const { command, context } = request;
      
      console.log('Processing command:', command);
      console.log('With context:', context);

      // Use AI to parse command and context
      const parsedData = await this.aiProcessor.parseSchedulingRequest(
        command,
        context
      );

      if (!parsedData) {
        sendResponse({ 
          error: 'Could not understand the scheduling request. Please try again.' 
        });
        return;
      }

      // Check for missing required information
      const validation = this.validateMeetingData(parsedData, context);
      
      if (!validation.isValid) {
        sendResponse({
          needsInput: true,
          missing: validation.missing,
          partialData: parsedData
        });
        return;
      }

      // Generate meeting details with all inferred information
      const meetingDetails = await this.generateMeetingDetails(
        parsedData,
        context
      );

      sendResponse({ 
        success: true,
        meetingDetails 
      });

    } catch (error) {
      console.error('Error processing command:', error);
      sendResponse({ error: error.message });
    }
  }

  validateMeetingData(parsedData, context) {
    const missing = [];
    
    if (!parsedData.email && !context?.participantInfo?.email) {
      missing.push('email');
    }
    
    if (!parsedData.date) {
      missing.push('date');
    }
    
    if (!parsedData.time) {
      missing.push('time');
    }

    return {
      isValid: missing.length === 0,
      missing
    };
  }

  async generateMeetingDetails(parsedData, context) {
    const settings = await this.storage.getSettings();
    
    // Get participant info
    const participantName = parsedData.participantName || 
                           context?.participantInfo?.name || 
                           'Unknown';
    
    const participantEmail = parsedData.email || 
                            context?.participantInfo?.email || 
                            '';

    // Parse and format date/time
    const dateTime = this.parseDateAndTime(
      parsedData.date,
      parsedData.time,
      parsedData.timezone || settings.defaultTimezone
    );

    // Get or default meeting duration
    const duration = parsedData.duration || settings.defaultDuration || 30;

    // Get or default platform
    const platform = parsedData.platform || settings.defaultPlatform || 'google-meet';

    // Generate professional message
    const messageDraft = await this.aiProcessor.generateMeetingMessage({
      participantName,
      date: dateTime.dateFormatted,
      time: dateTime.timeFormatted,
      timezone: dateTime.timezone,
      duration,
      platform,
      context: context?.messages
    });

    return {
      participantName,
      email: participantEmail,
      date: dateTime.date,
      time: dateTime.time,
      timezone: dateTime.timezone,
      duration,
      platform,
      messageDraft,
      linkedInUrl: context?.participantInfo?.linkedInUrl
    };
  }

  parseDateAndTime(dateStr, timeStr, timezone) {
    // This would use chrono-node for robust parsing
    // For now, simplified implementation
    const date = new Date(dateStr);
    const [hours, minutes] = timeStr.split(':');
    date.setHours(parseInt(hours), parseInt(minutes));

    return {
      date: date.toISOString().split('T')[0],
      time: timeStr,
      dateFormatted: date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      timeFormatted: date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }),
      timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      dateTime: date
    };
  }

  async createMeeting(request, sendResponse) {
    try {
      const { details } = request;
      
      console.log('Creating meeting with details:', details);

      // Step 1: Generate meeting link based on platform
      let meetingLink;
      switch (details.platform) {
        case 'google-meet':
          meetingLink = await this.meetingPlatform.createGoogleMeet();
          break;
        case 'zoom':
          meetingLink = await this.meetingPlatform.createZoomMeeting(details);
          break;
        case 'teams':
          meetingLink = await this.meetingPlatform.createTeamsMeeting(details);
          break;
        default:
          meetingLink = await this.meetingPlatform.createGoogleMeet();
      }

      // Step 2: Create calendar event
      const calendarEvent = await this.calendarService.createEvent({
        summary: `Meeting with ${details.context?.participantInfo?.name || 'Contact'}`,
        description: details.message,
        start: {
          dateTime: `${details.date}T${details.time}:00`,
          timeZone: details.timezone
        },
        duration: details.duration,
        attendees: details.email ? [{ email: details.email }] : [],
        conferenceData: {
          entryPoints: [{
            entryPointType: 'video',
            uri: meetingLink,
            label: meetingLink
          }]
        }
      });

      // Step 3: Send message via LinkedIn (or prepare for sending)
      const messageWithLink = this.insertMeetingLinkInMessage(
        details.message,
        meetingLink
      );

      // Step 4: Inject message into LinkedIn chat box
      await this.sendLinkedInMessage(details.context, messageWithLink);

      sendResponse({
        success: true,
        calendarEvent,
        meetingLink,
        message: 'Meeting created successfully!'
      });

    } catch (error) {
      console.error('Error creating meeting:', error);
      sendResponse({ 
        success: false,
        error: error.message 
      });
    }
  }

  insertMeetingLinkInMessage(message, link) {
    // Replace placeholder or append link
    if (message.includes('[Google Meet Link]') || 
        message.includes('[Meeting Link]') ||
        message.includes('[Zoom Link]')) {
      return message.replace(/\[(Google Meet Link|Meeting Link|Zoom Link)\]/g, link);
    }
    return message + `\n\n🔗 Meeting Link: ${link}`;
  }

  async sendLinkedInMessage(context, message) {
    // Send message to content script to inject into LinkedIn
    const tabs = await chrome.tabs.query({ 
      url: 'https://www.linkedin.com/messaging/*' 
    });
    
    if (tabs.length > 0) {
      await chrome.tabs.sendMessage(tabs[0].id, {
        action: 'sendMessage',
        message: message
      });
    }
  }

  async checkAvailability(request, sendResponse) {
    try {
      const { date, duration } = request;
      const availability = await this.calendarService.checkAvailability(
        date,
        duration
      );
      sendResponse({ availability });
    } catch (error) {
      sendResponse({ error: error.message });
    }
  }

  async saveSettings(request, sendResponse) {
    try {
      await this.storage.saveSettings(request.settings);
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ error: error.message });
    }
  }

  async getSettings(sendResponse) {
    try {
      const settings = await this.storage.getSettings();
      sendResponse({ settings });
    } catch (error) {
      sendResponse({ error: error.message });
    }
  }

  async getMeetingHistory(sendResponse) {
    try {
      const history = await this.storage.getMeetingHistory();
      sendResponse({ history });
    } catch (error) {
      sendResponse({ error: error.message });
    }
  }

  async activateAssistant() {
    // ALWAYS open popup window - NEVER use content script overlay
    // This ensures consistent behavior with clicking the extension icon
    console.log('activateAssistant() called');
    try {
      console.log('Creating popup window...');
      const popupWindow = await chrome.windows.create({
        url: chrome.runtime.getURL('popup.html'),
        type: 'popup',
        width: 380,
        height: 600,
        focused: true
      });
      console.log('Popup window created:', popupWindow.id);
    } catch (error) {
      console.error('Error opening popup:', error);
      // Fallback: try to open action popup
      try {
        console.log('Trying fallback: chrome.action.openPopup()');
        await chrome.action.openPopup();
      } catch (e) {
        console.error('Failed to open popup:', e);
      }
    }
  }
}

// Initialize background service
const backgroundService = new BackgroundService();
backgroundService.initialize();

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Smart Meeting Scheduler installed!');
    console.log('✅ Extension ready! Press Ctrl+Shift+L (Cmd+Shift+L on Mac) on LinkedIn to activate.');
    // Welcome message logged to console instead of opening external page
  }
});

