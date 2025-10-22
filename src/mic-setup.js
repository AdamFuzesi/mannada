// One-time microphone permission setup
// After permission is granted here, it will work in the popup

class MicSetup {
  constructor() {
    this.attachEventListeners();
  }

  attachEventListeners() {
    document.getElementById('setup-button').addEventListener('click', () => {
      this.requestPermission();
    });
  }

  showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
  }

  async requestPermission() {
    const button = document.getElementById('setup-button');
    button.disabled = true;
    button.textContent = 'Requesting permission...';

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Stop the stream - we just needed the permission
      stream.getTracks().forEach(track => track.stop());

      // Store permission state
      await chrome.storage.local.set({ microphonePermissionGranted: true });

      this.showStatus('✅ Success! Microphone permission granted. You can now close this tab and use voice commands in the popup.', 'success');

      button.textContent = 'Permission Granted ✓';

      // Auto-close after 2 seconds
      setTimeout(() => {
        window.close();
      }, 2000);

    } catch (error) {
      console.error('Microphone permission error:', error);

      let errorMessage = 'Permission denied. ';

      if (error.name === 'NotAllowedError') {
        errorMessage += 'Please click "Allow" when Chrome asks for microphone access. You may need to click the camera icon in the address bar to change the permission.';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No microphone found. Please connect a microphone and try again.';
      } else {
        errorMessage += error.message;
      }

      this.showStatus('❌ ' + errorMessage, 'error');

      button.disabled = false;
      button.textContent = 'Try Again';
    }
  }
}

// Initialize
new MicSetup();
