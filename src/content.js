// Content script for LinkedIn messaging integration
// Runs on linkedin.com/messaging/* to extract chat context and inject UI

class LinkedInChatExtractor {
  constructor() {
    this.overlayActive = false;
    this.currentContext = null;
  }

  // Extract comprehensive chat context from LinkedIn messaging
  extractChatContext() {
    try {
      const context = {
        participantInfo: this.extractParticipantInfo(),
        messages: this.extractMessages(),
        profileUrl: this.extractProfileUrl(),
        timestamp: new Date().toISOString()
      };

      return context;
    } catch (error) {
      console.error('Error extracting chat context:', error);
      return null;
    }
  }

  extractParticipantInfo() {
    // Extract participant name from chat header
    const nameSelectors = [
      '.msg-overlay-bubble-header__title',
      '.msg-thread-header__thread-name',
      '.msg-entity-lockup__entity-title'
    ];

    let name = null;
    for (const selector of nameSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        name = element.innerText.trim();
        break;
      }
    }

    // Extract additional info like job title and company
    const subtitle = document.querySelector('.msg-overlay-bubble-header__subtitle, .msg-entity-lockup__entity-subtitle');
    const jobInfo = subtitle ? subtitle.innerText.trim() : null;

    return {
      name,
      jobInfo,
      email: this.extractEmailFromChat(),
      linkedInUrl: this.extractProfileUrl()
    };
  }

  extractMessages() {
    // Extract recent messages from chat
    const messageSelectors = [
      '.msg-s-message-list__event',
      '.msg-s-event-listitem'
    ];

    let messageElements = [];
    for (const selector of messageSelectors) {
      messageElements = Array.from(document.querySelectorAll(selector));
      if (messageElements.length > 0) break;
    }

    return messageElements.slice(-20).map(msg => {
      const senderElement = msg.querySelector('.msg-s-message-group__name, .msg-s-message-list__name');
      const contentElement = msg.querySelector('.msg-s-event-listitem__body, .msg-s-message-list__event-text');
      const timeElement = msg.querySelector('time');

      return {
        sender: senderElement ? senderElement.innerText.trim() : 'Unknown',
        content: contentElement ? contentElement.innerText.trim() : '',
        timestamp: timeElement ? timeElement.getAttribute('datetime') : null
      };
    }).filter(msg => msg.content); // Filter out empty messages
  }

  extractEmailFromChat() {
    // Look for email addresses in chat messages
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const messages = document.querySelectorAll('.msg-s-event-listitem__body, .msg-s-message-list__event-text');
    
    for (const msg of messages) {
      const matches = msg.innerText.match(emailRegex);
      if (matches && matches.length > 0) {
        return matches[0];
      }
    }
    return null;
  }

  extractProfileUrl() {
    // Extract LinkedIn profile URL
    const profileLinkSelectors = [
      '.msg-overlay-bubble-header a',
      '.msg-thread-header a',
      '.msg-entity-lockup__entity-title a'
    ];

    for (const selector of profileLinkSelectors) {
      const element = document.querySelector(selector);
      if (element && element.href) {
        return element.href;
      }
    }
    return null;
  }

  // Inject assistant overlay UI into LinkedIn
  injectAssistantOverlay() {
    if (document.getElementById('meeting-assistant-overlay')) {
      return; // Already injected
    }

    const overlay = document.createElement('div');
    overlay.id = 'meeting-assistant-overlay';
    overlay.className = 'meeting-assistant-overlay hidden';
    overlay.innerHTML = `
      <div class="assistant-panel">
        <div class="assistant-header">
          <div class="assistant-title">
            <span class="assistant-icon">🤖</span>
            <span>Meeting Scheduler</span>
          </div>
          <button class="assistant-close" id="close-assistant">×</button>
        </div>
        <div class="assistant-body">
          <div id="assistant-content">
            <div class="voice-interface">
              <button id="voice-trigger" class="voice-button">
                <span class="mic-icon">🎤</span>
                <span class="voice-text">Click or say "Hey Assistant"</span>
              </button>
              <div id="voice-feedback" class="voice-feedback hidden">
                <div class="listening-animation"></div>
                <div class="transcription"></div>
              </div>
            </div>
            <div id="confirmation-panel" class="confirmation-panel hidden">
              <!-- Dynamic confirmation content will be inserted here -->
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.attachEventListeners();
  }

  attachEventListeners() {
    // Close button
    document.getElementById('close-assistant')?.addEventListener('click', () => {
      this.hideOverlay();
    });

    // Voice trigger button
    document.getElementById('voice-trigger')?.addEventListener('click', () => {
      this.startVoiceRecognition();
    });

    // Keyboard shortcut listener
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Shift + M
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        this.toggleOverlay();
      }
    });
  }

  toggleOverlay() {
    const overlay = document.getElementById('meeting-assistant-overlay');
    if (overlay) {
      overlay.classList.toggle('hidden');
      this.overlayActive = !this.overlayActive;
      
      if (this.overlayActive) {
        this.currentContext = this.extractChatContext();
      }
    }
  }

  showOverlay() {
    const overlay = document.getElementById('meeting-assistant-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      this.overlayActive = true;
      this.currentContext = this.extractChatContext();
    }
  }

  hideOverlay() {
    const overlay = document.getElementById('meeting-assistant-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      this.overlayActive = false;
    }
  }

  startVoiceRecognition() {
    const feedback = document.getElementById('voice-feedback');
    const transcriptionDiv = feedback?.querySelector('.transcription');
    
    if (!feedback || !transcriptionDiv) return;

    feedback.classList.remove('hidden');
    transcriptionDiv.textContent = 'Listening...';

    // Send message to background script to start recognition
    chrome.runtime.sendMessage({
      action: 'startVoiceRecognition',
      context: this.currentContext
    }, (response) => {
      if (response && response.transcription) {
        transcriptionDiv.textContent = response.transcription;
        this.processVoiceCommand(response.transcription);
      }
    });
  }

  processVoiceCommand(command) {
    // Send command and context to background for AI processing
    chrome.runtime.sendMessage({
      action: 'processSchedulingCommand',
      command: command,
      context: this.currentContext
    }, (response) => {
      if (response && response.meetingDetails) {
        this.showConfirmationPanel(response.meetingDetails);
      } else if (response && response.error) {
        this.showError(response.error);
      }
    });
  }

  showConfirmationPanel(meetingDetails) {
    const panel = document.getElementById('confirmation-panel');
    if (!panel) return;

    panel.innerHTML = `
      <div class="confirmation-header">
        <h3>📅 Meeting Details</h3>
      </div>
      <div class="confirmation-content">
        <div class="detail-row">
          <span class="detail-label">👤 Participant:</span>
          <span class="detail-value">${meetingDetails.participantName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">📧 Email:</span>
          <input type="email" class="detail-input" id="email-input" value="${meetingDetails.email || ''}">
        </div>
        <div class="detail-row">
          <span class="detail-label">📆 Date:</span>
          <input type="date" class="detail-input" id="date-input" value="${meetingDetails.date}">
        </div>
        <div class="detail-row">
          <span class="detail-label">🕐 Time:</span>
          <input type="time" class="detail-input" id="time-input" value="${meetingDetails.time}">
        </div>
        <div class="detail-row">
          <span class="detail-label">🌍 Timezone:</span>
          <select class="detail-input" id="timezone-input">
            <option value="${meetingDetails.timezone}" selected>${meetingDetails.timezone}</option>
          </select>
        </div>
        <div class="detail-row">
          <span class="detail-label">⏱️ Duration:</span>
          <select class="detail-input" id="duration-input">
            <option value="30" ${meetingDetails.duration === 30 ? 'selected' : ''}>30 minutes</option>
            <option value="60" ${meetingDetails.duration === 60 ? 'selected' : ''}>1 hour</option>
            <option value="90" ${meetingDetails.duration === 90 ? 'selected' : ''}>1.5 hours</option>
            <option value="120" ${meetingDetails.duration === 120 ? 'selected' : ''}>2 hours</option>
          </select>
        </div>
        <div class="detail-row">
          <span class="detail-label">🎥 Platform:</span>
          <select class="detail-input" id="platform-input">
            <option value="google-meet" ${meetingDetails.platform === 'google-meet' ? 'selected' : ''}>Google Meet</option>
            <option value="zoom" ${meetingDetails.platform === 'zoom' ? 'selected' : ''}>Zoom</option>
            <option value="teams" ${meetingDetails.platform === 'teams' ? 'selected' : ''}>Microsoft Teams</option>
          </select>
        </div>
        <div class="message-preview">
          <label class="detail-label">💬 Message Draft:</label>
          <textarea class="message-textarea" id="message-input" rows="6">${meetingDetails.messageDraft}</textarea>
        </div>
      </div>
      <div class="confirmation-actions">
        <button class="btn btn-secondary" id="edit-details-btn">Edit Details</button>
        <button class="btn btn-primary" id="send-meeting-btn">Create & Send</button>
        <button class="btn btn-cancel" id="cancel-btn">Cancel</button>
      </div>
    `;

    panel.classList.remove('hidden');

    // Attach action listeners
    document.getElementById('send-meeting-btn')?.addEventListener('click', () => {
      this.createAndSendMeeting();
    });

    document.getElementById('cancel-btn')?.addEventListener('click', () => {
      panel.classList.add('hidden');
    });
  }

  createAndSendMeeting() {
    // Gather all details from form
    const meetingDetails = {
      email: document.getElementById('email-input')?.value,
      date: document.getElementById('date-input')?.value,
      time: document.getElementById('time-input')?.value,
      timezone: document.getElementById('timezone-input')?.value,
      duration: parseInt(document.getElementById('duration-input')?.value),
      platform: document.getElementById('platform-input')?.value,
      message: document.getElementById('message-input')?.value,
      context: this.currentContext
    };

    // Send to background script for calendar creation and message sending
    chrome.runtime.sendMessage({
      action: 'createMeeting',
      details: meetingDetails
    }, (response) => {
      if (response && response.success) {
        this.showSuccess('Meeting created successfully!');
        setTimeout(() => this.hideOverlay(), 2000);
      } else {
        this.showError(response?.error || 'Failed to create meeting');
      }
    });
  }

  showSuccess(message) {
    const panel = document.getElementById('confirmation-panel');
    if (panel) {
      panel.innerHTML = `
        <div class="success-message">
          <div class="success-icon">✅</div>
          <div class="success-text">${message}</div>
        </div>
      `;
    }
  }

  showError(message) {
    const panel = document.getElementById('confirmation-panel');
    if (panel) {
      panel.innerHTML = `
        <div class="error-message">
          <div class="error-icon">❌</div>
          <div class="error-text">${message}</div>
        </div>
      `;
      panel.classList.remove('hidden');
    }
  }
}

// Initialize on page load
let chatExtractor;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

function initializeExtension() {
  chatExtractor = new LinkedInChatExtractor();
  chatExtractor.injectAssistantOverlay();
  console.log('Smart Meeting Scheduler initialized on LinkedIn');
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'activateAssistant') {
    chatExtractor?.showOverlay();
    sendResponse({ success: true });
  } else if (request.action === 'getContext') {
    const context = chatExtractor?.extractChatContext();
    sendResponse({ context });
  }
  return true; // Keep channel open for async response
});

