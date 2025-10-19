// Storage Service
// Handles persistent storage of user settings and preferences

export class StorageService {
  constructor() {
    this.settings = null;
    this.defaultSettings = {
      defaultPlatform: 'google-meet',
      defaultDuration: 30,
      defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      voiceActivationEnabled: true,
      voiceTriggerPhrase: 'hey assistant',
      autoSendMessages: false,
      preferredMessageTone: 'professional',
      notificationsEnabled: true,
      privacyMode: false,
      openaiApiKey: null,
      zoomApiKey: null,
      zoomApiSecret: null,
      theme: 'light',
      messageTemplates: this.getDefaultTemplates()
    };
  }

  getDefaultTemplates() {
    return {
      professional: `Hi {name},

Looking forward to our discussion! I've scheduled a {platform} for:

📅 {date}
🕐 {time} {timezone}
⏱️ {duration} minutes
🔗 [Meeting Link]

Calendar invite sent. Let me know if you need to reschedule!

Best regards`,
      
      casual: `Hey {name}!

Let's connect! I set up a {platform} call:

📅 {date}
🕐 {time} {timezone}
⏱️ {duration} minutes
🔗 [Meeting Link]

See you then! 👋`,
      
      formal: `Dear {name},

I hope this message finds you well. I have scheduled a {platform} meeting with the following details:

Date: {date}
Time: {time} {timezone}
Duration: {duration} minutes
Meeting Link: [Meeting Link]

A calendar invitation has been sent to your email address. Please let me know if any adjustments are needed.

Sincerely`
    };
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['userSettings']);
      
      if (result.userSettings) {
        this.settings = { ...this.defaultSettings, ...result.userSettings };
      } else {
        this.settings = { ...this.defaultSettings };
        await this.saveSettings(this.settings);
      }
      
      return this.settings;
    } catch (error) {
      console.error('Error loading settings:', error);
      this.settings = { ...this.defaultSettings };
      return this.settings;
    }
  }

  async saveSettings(settings) {
    try {
      this.settings = { ...this.defaultSettings, ...settings };
      await chrome.storage.sync.set({ userSettings: this.settings });
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      return false;
    }
  }

  async getSettings() {
    if (!this.settings) {
      await this.loadSettings();
    }
    return this.settings;
  }

  async updateSetting(key, value) {
    try {
      const settings = await this.getSettings();
      settings[key] = value;
      await this.saveSettings(settings);
      return true;
    } catch (error) {
      console.error('Error updating setting:', error);
      return false;
    }
  }

  async resetSettings() {
    try {
      this.settings = { ...this.defaultSettings };
      await chrome.storage.sync.set({ userSettings: this.settings });
      return true;
    } catch (error) {
      console.error('Error resetting settings:', error);
      return false;
    }
  }

  // Meeting history management
  async saveMeetingHistory(meeting) {
    try {
      const history = await this.getMeetingHistory();
      history.unshift({
        ...meeting,
        createdAt: new Date().toISOString(),
        id: this.generateId()
      });

      // Keep only last 50 meetings
      const trimmedHistory = history.slice(0, 50);
      
      await chrome.storage.local.set({ meetingHistory: trimmedHistory });
      return true;
    } catch (error) {
      console.error('Error saving meeting history:', error);
      return false;
    }
  }

  async getMeetingHistory() {
    try {
      const result = await chrome.storage.local.get(['meetingHistory']);
      return result.meetingHistory || [];
    } catch (error) {
      console.error('Error getting meeting history:', error);
      return [];
    }
  }

  async clearMeetingHistory() {
    try {
      await chrome.storage.local.set({ meetingHistory: [] });
      return true;
    } catch (error) {
      console.error('Error clearing meeting history:', error);
      return false;
    }
  }

  // Contact cache management
  async cacheContact(contact) {
    try {
      const contacts = await this.getCachedContacts();
      
      // Update existing or add new
      const existingIndex = contacts.findIndex(c => 
        c.email === contact.email || c.linkedInUrl === contact.linkedInUrl
      );

      if (existingIndex >= 0) {
        contacts[existingIndex] = { ...contacts[existingIndex], ...contact };
      } else {
        contacts.push(contact);
      }

      // Keep only last 100 contacts
      const trimmedContacts = contacts.slice(0, 100);
      
      await chrome.storage.local.set({ cachedContacts: trimmedContacts });
      return true;
    } catch (error) {
      console.error('Error caching contact:', error);
      return false;
    }
  }

  async getCachedContacts() {
    try {
      const result = await chrome.storage.local.get(['cachedContacts']);
      return result.cachedContacts || [];
    } catch (error) {
      console.error('Error getting cached contacts:', error);
      return [];
    }
  }

  async findContact(query) {
    try {
      const contacts = await this.getCachedContacts();
      const lowerQuery = query.toLowerCase();
      
      return contacts.find(contact => 
        contact.name?.toLowerCase().includes(lowerQuery) ||
        contact.email?.toLowerCase().includes(lowerQuery)
      );
    } catch (error) {
      console.error('Error finding contact:', error);
      return null;
    }
  }

  // Analytics and usage stats
  async trackUsage(action) {
    try {
      const stats = await this.getUsageStats();
      
      if (!stats[action]) {
        stats[action] = 0;
      }
      stats[action]++;
      
      stats.lastUsed = new Date().toISOString();
      
      await chrome.storage.local.set({ usageStats: stats });
      return true;
    } catch (error) {
      console.error('Error tracking usage:', error);
      return false;
    }
  }

  async getUsageStats() {
    try {
      const result = await chrome.storage.local.get(['usageStats']);
      return result.usageStats || {
        meetingsCreated: 0,
        voiceCommandsUsed: 0,
        manualCreations: 0,
        lastUsed: null
      };
    } catch (error) {
      console.error('Error getting usage stats:', error);
      return {};
    }
  }

  // Utility functions
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async exportData() {
    try {
      const allData = {
        settings: await this.getSettings(),
        history: await this.getMeetingHistory(),
        contacts: await this.getCachedContacts(),
        stats: await this.getUsageStats(),
        exportedAt: new Date().toISOString()
      };
      
      return JSON.stringify(allData, null, 2);
    } catch (error) {
      console.error('Error exporting data:', error);
      return null;
    }
  }

  async importData(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      
      if (data.settings) {
        await this.saveSettings(data.settings);
      }
      
      if (data.history) {
        await chrome.storage.local.set({ meetingHistory: data.history });
      }
      
      if (data.contacts) {
        await chrome.storage.local.set({ cachedContacts: data.contacts });
      }
      
      return true;
    } catch (error) {
      console.error('Error importing data:', error);
      return false;
    }
  }

  async clearAllData() {
    try {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      this.settings = { ...this.defaultSettings };
      return true;
    } catch (error) {
      console.error('Error clearing all data:', error);
      return false;
    }
  }
}

