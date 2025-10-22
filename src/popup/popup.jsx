// Popup JavaScript with Voice Recognition
// Note: This is a .jsx file but we're not using React here for simplicity
// The webpack config will handle it

class PopupController {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.settings = null;
    this.micPermissionGranted = false;
    this.checkMicrophonePermission();
    this.initializeVoiceRecognition();
    this.loadSettings();
    this.attachEventListeners();
    this.populateTimezones();
    this.loadHistory();
  }

  async checkMicrophonePermission() {
    // Check if permission was granted during setup
    const result = await chrome.storage.local.get(['microphonePermissionGranted']);
    this.micPermissionGranted = result.microphonePermissionGranted || false;
  }

  initializeVoiceRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
        this.updateVoiceUI(true);
      };

      this.recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0])
          .map(result => result.transcript)
          .join('');

        document.getElementById('transcription').textContent = transcript;

        // If final result
        if (event.results[0].isFinal) {
          this.processVoiceCommand(transcript);
        }
      };

      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          this.updateVoiceUI(false, 'Microphone blocked. Please allow microphone access in browser settings.');
        } else {
          this.updateVoiceUI(false, 'Error: ' + event.error);
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.updateVoiceUI(false);
      };
    } else {
      console.warn('Speech recognition not supported');
      document.getElementById('voice-status').textContent = 
        'Voice recognition not supported in this browser';
    }
  }

  attachEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Voice button
    document.getElementById('voice-button').addEventListener('click', () => {
      this.handleVoiceButtonClick();
    });

    // Quick actions
    document.getElementById('open-linkedin').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://www.linkedin.com/messaging/' });
    });

    document.getElementById('open-calendar').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://calendar.google.com' });
    });

    document.getElementById('check-availability').addEventListener('click', () => {
      this.checkAvailability();
    });

    // Settings
    document.getElementById('save-settings').addEventListener('click', () => {
      this.saveSettings();
    });
  }

  switchTab(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');

    // Load data if needed
    if (tabName === 'history') {
      this.loadHistory();
    }
  }

  openVoiceInputPage() {
    // Open voice input in a new window where microphone permissions work properly
    chrome.windows.create({
      url: chrome.runtime.getURL('voice-input.html'),
      type: 'popup',
      width: 650,
      height: 700,
      focused: true
    });
  }

  updateVoiceUI(listening, statusText = null) {
    const button = document.getElementById('voice-button');
    const status = document.getElementById('voice-status');

    if (listening) {
      button.classList.add('listening');
      status.textContent = statusText || 'Listening... Speak now';
    } else {
      button.classList.remove('listening');
      status.textContent = statusText || 'Click to start voice command';
    }
  }

  processVoiceCommand(command) {
    document.getElementById('voice-status').textContent = 'Processing...';

    // Send to background script
    chrome.runtime.sendMessage({
      action: 'processSchedulingCommand',
      command: command,
      context: null // Will be fetched from active LinkedIn tab if available
    }, (response) => {
      if (response && response.success) {
        document.getElementById('voice-status').textContent = 
          'Command processed! Check LinkedIn tab.';
        
        // Activate assistant in LinkedIn tab
        chrome.tabs.query({ url: 'https://www.linkedin.com/messaging/*' }, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'activateAssistant'
            });
          }
        });
      } else {
        document.getElementById('voice-status').textContent = 
          'Error: ' + (response?.error || 'Failed to process command');
      }
    });
  }

  async loadSettings() {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
      if (response && response.settings) {
        this.settings = response.settings;
        this.populateSettingsForm();
      }
    });
  }

  populateSettingsForm() {
    if (!this.settings) return;

    document.getElementById('default-platform').value = 
      this.settings.defaultPlatform || 'google-meet';
    
    document.getElementById('default-duration').value = 
      this.settings.defaultDuration || 30;
    
    document.getElementById('timezone').value = 
      this.settings.defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    document.getElementById('openai-key').value = 
      this.settings.openaiApiKey || '';
    
    document.getElementById('voice-activation').checked = 
      this.settings.voiceActivationEnabled !== false;
    
    document.getElementById('auto-send').checked = 
      this.settings.autoSendMessages || false;
  }

  saveSettings() {
    const settings = {
      defaultPlatform: document.getElementById('default-platform').value,
      defaultDuration: parseInt(document.getElementById('default-duration').value),
      defaultTimezone: document.getElementById('timezone').value,
      openaiApiKey: document.getElementById('openai-key').value,
      voiceActivationEnabled: document.getElementById('voice-activation').checked,
      autoSendMessages: document.getElementById('auto-send').checked
    };

    chrome.runtime.sendMessage({
      action: 'saveSettings',
      settings: settings
    }, (response) => {
      const statusDiv = document.getElementById('settings-status');
      
      if (response && response.success) {
        statusDiv.innerHTML = '<div class="status-message status-success">Settings saved successfully!</div>';
      } else {
        statusDiv.innerHTML = '<div class="status-message status-error">Failed to save settings</div>';
      }

      setTimeout(() => {
        statusDiv.innerHTML = '';
      }, 3000);
    });
  }

  populateTimezones() {
    const timezones = [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Anchorage',
      'Pacific/Honolulu',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Asia/Dubai',
      'Asia/Kolkata',
      'Asia/Singapore',
      'Asia/Tokyo',
      'Australia/Sydney',
      'Pacific/Auckland'
    ];

    const select = document.getElementById('timezone');
    const currentTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Add current timezone first if not in list
    if (!timezones.includes(currentTz)) {
      const option = document.createElement('option');
      option.value = currentTz;
      option.textContent = currentTz + ' (Current)';
      select.appendChild(option);
    }

    timezones.forEach(tz => {
      const option = document.createElement('option');
      option.value = tz;
      option.textContent = tz + (tz === currentTz ? ' (Current)' : '');
      select.appendChild(option);
    });

    select.value = currentTz;
  }

  async loadHistory() {
    chrome.runtime.sendMessage({ action: 'getMeetingHistory' }, (response) => {
      const historyList = document.getElementById('history-list');
      
      if (response && response.history && response.history.length > 0) {
        historyList.innerHTML = response.history.map(meeting => `
          <div class="history-item">
            <div class="history-item-name">${meeting.participantName || 'Unknown'}</div>
            <div class="history-item-date">
              ${new Date(meeting.createdAt).toLocaleDateString()} - 
              ${meeting.platform} - 
              ${meeting.duration} min
            </div>
          </div>
        `).join('');
      } else {
        historyList.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <div>No meetings scheduled yet</div>
          </div>
        `;
      }
    });
  }

  checkAvailability() {
    const today = new Date().toISOString().split('T')[0];
    
    chrome.runtime.sendMessage({
      action: 'checkAvailability',
      date: today,
      duration: 30
    }, (response) => {
      if (response && response.availability) {
        const slots = response.availability.slice(0, 5);
        const message = slots.length > 0
          ? `Available slots today:\n${slots.map(slot => 
              new Date(slot.start).toLocaleTimeString()
            ).join(', ')}`
          : 'No available slots found today';
        
        alert(message);
      } else {
        alert('Could not check availability. Make sure Google Calendar is connected.');
      }
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
  });
} else {
  new PopupController();
}

