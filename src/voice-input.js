// Voice Input Page - Full extension page with proper microphone permissions
// This page is opened in a new tab/window where getUserMedia works properly

class VoiceInputController {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.micStream = null;
    this.initializeVoiceRecognition();
    this.attachEventListeners();
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
        this.updateUI(true, 'Listening... Speak now!');
      };

      this.recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0])
          .map(result => result.transcript)
          .join('');

        document.getElementById('transcription').textContent = transcript;

        // If final result
        if (event.results[0].isFinal) {
          this.updateUI(false, 'Processing your command...');
          this.processVoiceCommand(transcript);
        }
      };

      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        this.isListening = false;

        if (event.error === 'not-allowed') {
          this.showError('Microphone access was denied. Please allow microphone access and try again.');
        } else if (event.error === 'no-speech') {
          this.updateUI(false, 'No speech detected. Click the microphone to try again.');
        } else {
          this.showError('Speech recognition error: ' + event.error);
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (this.micStream) {
          this.micStream.getTracks().forEach(track => track.stop());
          this.micStream = null;
        }
        document.getElementById('mic-button').classList.remove('listening');
      };
    } else {
      this.showError('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
    }
  }

  attachEventListeners() {
    document.getElementById('mic-button').addEventListener('click', () => {
      this.toggleVoiceRecognition();
    });

    document.getElementById('close-button').addEventListener('click', () => {
      window.close();
    });
  }

  async toggleVoiceRecognition() {
    if (!this.recognition) {
      this.showError('Voice recognition not available. Please use a supported browser.');
      return;
    }

    if (this.isListening) {
      this.recognition.stop();
      this.updateUI(false, 'Click the microphone to start');
    } else {
      // Request microphone permission first
      try {
        this.updateUI(false, 'Requesting microphone access...');
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Clear any previous errors
        document.getElementById('error-message').style.display = 'none';

        // Start speech recognition
        document.getElementById('transcription').textContent = '';
        this.recognition.start();
      } catch (error) {
        console.error('Microphone permission error:', error);

        if (error.name === 'NotAllowedError') {
          this.showError('Microphone access denied. Please click the camera icon in your browser\'s address bar and allow microphone access.');
        } else if (error.name === 'NotFoundError') {
          this.showError('No microphone found. Please connect a microphone and try again.');
        } else {
          this.showError('Error accessing microphone: ' + error.message);
        }

        this.updateUI(false, 'Click the microphone to try again');
      }
    }
  }

  updateUI(listening, statusText) {
    const button = document.getElementById('mic-button');
    const status = document.getElementById('status');

    if (listening) {
      button.classList.add('listening');
      status.classList.add('listening');
    } else {
      button.classList.remove('listening');
      status.classList.remove('listening');
    }

    status.textContent = statusText;
  }

  showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }

  processVoiceCommand(command) {
    console.log('Processing command:', command);

    // Send to background script
    chrome.runtime.sendMessage({
      action: 'processSchedulingCommand',
      command: command,
      context: null // Will be fetched from active LinkedIn tab if available
    }, (response) => {
      if (response && response.success) {
        this.updateUI(false, '✅ Command processed successfully!');

        // Show success message
        document.getElementById('transcription').textContent =
          `"${command}"\n\n✅ Your meeting request has been processed. Check your LinkedIn messages.`;

        // Auto-close after 3 seconds
        setTimeout(() => {
          window.close();
        }, 3000);
      } else {
        const errorMsg = response?.error || 'Failed to process command';
        this.showError(errorMsg);
        this.updateUI(false, 'Click the microphone to try again');
      }
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new VoiceInputController();
  });
} else {
  new VoiceInputController();
}
