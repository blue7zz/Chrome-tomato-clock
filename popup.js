// popup.js - Frontend logic for Tomato Clock extension

class TomatoTimer {
    constructor() {
        this.isRunning = false;
        this.currentPhase = 'work'; // 'work', 'short-break', 'long-break'
        this.currentCycle = 1;
        this.timeRemaining = 0;
        
        // Default durations in minutes
        this.settings = {
            workDuration: 25,
            shortBreakDuration: 5,
            longBreakDuration: 15
        };
        
        this.initializeElements();
        this.loadSettings();
        this.loadTimerState();
        this.bindEvents();
        this.updateDisplay();
        
        // Check timer state every second
        this.checkInterval = setInterval(() => {
            this.checkTimerState();
        }, 1000);
    }

    initializeElements() {
        // Timer display elements
        this.statusText = document.getElementById('statusText');
        this.timeDisplay = document.getElementById('timeDisplay');
        this.cycleCount = document.getElementById('cycleCount');
        this.timerDisplayContainer = document.querySelector('.timer-display');
        
        // Control buttons
        this.startPauseBtn = document.getElementById('startPauseBtn');
        this.skipBtn = document.getElementById('skipBtn');
        this.resetBtn = document.getElementById('resetBtn');
        
        // Settings
        this.settingsBtn = document.getElementById('settingsBtn');
        this.settingsPanel = document.getElementById('settingsPanel');
        this.workDurationInput = document.getElementById('workDuration');
        this.shortBreakInput = document.getElementById('shortBreakDuration');
        this.longBreakInput = document.getElementById('longBreakDuration');
        this.saveSettingsBtn = document.getElementById('saveSettingsBtn');
    }

    bindEvents() {
        this.startPauseBtn.addEventListener('click', () => this.toggleTimer());
        this.skipBtn.addEventListener('click', () => this.skipPhase());
        this.resetBtn.addEventListener('click', () => this.resetTimer());
        this.settingsBtn.addEventListener('click', () => this.toggleSettings());
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        
        // Listen for messages from service worker
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'TIMER_UPDATE') {
                this.handleTimerUpdate(message.data);
            } else if (message.type === 'PLAY_SOUND') {
                this.playNotificationSound();
            }
        });
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['timerSettings']);
            if (result.timerSettings) {
                this.settings = { ...this.settings, ...result.timerSettings };
                this.updateSettingsInputs();
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async saveSettings() {
        const newSettings = {
            workDuration: parseInt(this.workDurationInput.value) || 25,
            shortBreakDuration: parseInt(this.shortBreakInput.value) || 5,
            longBreakDuration: parseInt(this.longBreakInput.value) || 15
        };

        try {
            await chrome.storage.sync.set({ timerSettings: newSettings });
            this.settings = newSettings;
            
            // Send updated settings to service worker
            chrome.runtime.sendMessage({
                type: 'UPDATE_SETTINGS',
                settings: newSettings
            });
            
            this.toggleSettings();
            this.showNotification('设置已保存');
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showNotification('保存设置失败');
        }
    }

    updateSettingsInputs() {
        this.workDurationInput.value = this.settings.workDuration;
        this.shortBreakInput.value = this.settings.shortBreakDuration;
        this.longBreakInput.value = this.settings.longBreakDuration;
    }

    toggleSettings() {
        this.settingsPanel.classList.toggle('show');
    }

    async loadTimerState() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_TIMER_STATE' });
            if (response && !response.error) {
                this.isRunning = response.isRunning;
                this.currentPhase = response.currentPhase;
                this.currentCycle = response.currentCycle;
                this.timeRemaining = response.timeRemaining;
            } else {
                console.log('Failed to load timer state or service worker not ready');
                this.resetTimerLocal();
            }
        } catch (error) {
            console.error('Failed to load timer state:', error);
            this.resetTimerLocal();
        }
    }

    async checkTimerState() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_TIMER_STATE' });
            if (response && !response.error) {
                const wasRunning = this.isRunning;
                this.isRunning = response.isRunning;
                this.currentPhase = response.currentPhase;
                this.currentCycle = response.currentCycle;
                this.timeRemaining = response.timeRemaining;
                
                // Update display if state changed
                if (wasRunning !== this.isRunning || this.timeRemaining !== response.timeRemaining) {
                    this.updateDisplay();
                }
            }
        } catch (error) {
            // Service worker might not be ready, just continue with current state
            console.log('Could not check timer state - service worker may not be ready');
        }
    }

    handleTimerUpdate(data) {
        this.isRunning = data.isRunning;
        this.currentPhase = data.currentPhase;
        this.currentCycle = data.currentCycle;
        this.timeRemaining = data.timeRemaining;
        this.updateDisplay();
    }

    async toggleTimer() {
        try {
            if (this.isRunning) {
                await chrome.runtime.sendMessage({ type: 'PAUSE_TIMER' });
            } else {
                await chrome.runtime.sendMessage({ 
                    type: 'START_TIMER',
                    settings: this.settings
                });
            }
        } catch (error) {
            console.error('Failed to toggle timer:', error);
        }
    }

    async skipPhase() {
        try {
            await chrome.runtime.sendMessage({ type: 'SKIP_PHASE' });
        } catch (error) {
            console.error('Failed to skip phase:', error);
        }
    }

    async resetTimer() {
        try {
            await chrome.runtime.sendMessage({ type: 'RESET_TIMER' });
            this.resetTimerLocal();
        } catch (error) {
            console.error('Failed to reset timer:', error);
            this.resetTimerLocal();
        }
    }

    resetTimerLocal() {
        this.currentPhase = 'work';
        this.currentCycle = 1;
        this.timeRemaining = this.settings.workDuration * 60;
        this.isRunning = false;
        this.updateDisplay();
    }

    updateDisplay() {
        // Update status text
        const statusTexts = {
            'work': '工作',
            'short-break': '短休息',
            'long-break': '长休息'
        };
        
        this.statusText.textContent = statusTexts[this.currentPhase] || '工作';
        
        // Update time display
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = this.timeRemaining % 60;
        this.timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update cycle count
        this.cycleCount.textContent = this.currentCycle;
        
        // Update start/pause button
        this.startPauseBtn.textContent = this.isRunning ? '暂停' : '开始';
        
        // Update timer display class for styling
        this.timerDisplayContainer.className = `timer-display ${this.currentPhase}`;
        if (this.isRunning) {
            this.timerDisplayContainer.classList.add('active');
        }
    }

    showNotification(message) {
        // Create a simple notification element
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: #667eea;
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 2000);
    }

    playNotificationSound() {
        try {
            // Create a simple notification sound using Web Audio API
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create a simple beep
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            console.log('Audio playback not available:', error);
            // Fallback: Try to play a simple system beep
            if ('vibrate' in navigator) {
                navigator.vibrate(200);
            }
        }
    }

    destroy() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
    }
}

// Initialize the timer when the popup loads
document.addEventListener('DOMContentLoaded', () => {
    window.tomatoTimer = new TomatoTimer();
});

// Clean up when the popup is closed
window.addEventListener('beforeunload', () => {
    if (window.tomatoTimer) {
        window.tomatoTimer.destroy();
    }
});