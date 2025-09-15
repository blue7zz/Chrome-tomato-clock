// service-worker.js - Background timer management for Tomato Clock

class TomatoClockService {
    constructor() {
        this.timerState = {
            isRunning: false,
            currentPhase: 'work', // 'work', 'short-break', 'long-break'
            currentCycle: 1,
            timeRemaining: 25 * 60, // seconds
            endTime: null
        };
        
        this.settings = {
            workDuration: 25,
            shortBreakDuration: 5,
            longBreakDuration: 15
        };
        
        this.init();
    }
    
    async init() {
        // Load saved state and settings
        await this.loadState();
        await this.loadSettings();
        
        // Set up alarm listener
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'tomato-timer') {
                this.onTimerComplete();
            }
        });
        
        // Set up message listener
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep the message channel open for async responses
        });
        
        // Restore timer if it was running
        if (this.timerState.isRunning && this.timerState.endTime) {
            const now = Date.now();
            const timeLeft = Math.max(0, Math.floor((this.timerState.endTime - now) / 1000));
            
            if (timeLeft > 0) {
                this.timerState.timeRemaining = timeLeft;
                this.startAlarm(timeLeft);
            } else {
                // Timer should have completed while extension was inactive
                this.onTimerComplete();
            }
        }
        
        // Update state periodically
        setInterval(() => {
            this.updateTimeRemaining();
        }, 1000);
    }
    
    async loadState() {
        try {
            const result = await chrome.storage.local.get(['timerState']);
            if (result.timerState) {
                this.timerState = { ...this.timerState, ...result.timerState };
            }
        } catch (error) {
            console.error('Failed to load timer state:', error);
        }
    }
    
    async saveState() {
        try {
            await chrome.storage.local.set({ timerState: this.timerState });
        } catch (error) {
            console.error('Failed to save timer state:', error);
        }
    }
    
    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['timerSettings']);
            if (result.timerSettings) {
                this.settings = { ...this.settings, ...result.timerSettings };
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }
    
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'GET_TIMER_STATE':
                    sendResponse(this.timerState);
                    break;
                    
                case 'START_TIMER':
                    if (message.settings) {
                        this.settings = { ...this.settings, ...message.settings };
                    }
                    await this.startTimer();
                    sendResponse({ success: true });
                    break;
                    
                case 'PAUSE_TIMER':
                    await this.pauseTimer();
                    sendResponse({ success: true });
                    break;
                    
                case 'SKIP_PHASE':
                    await this.skipPhase();
                    sendResponse({ success: true });
                    break;
                    
                case 'RESET_TIMER':
                    await this.resetTimer();
                    sendResponse({ success: true });
                    break;
                    
                case 'UPDATE_SETTINGS':
                    this.settings = { ...this.settings, ...message.settings };
                    sendResponse({ success: true });
                    break;
                    
                default:
                    sendResponse({ error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ error: error.message });
        }
    }
    
    async startTimer() {
        if (this.timerState.timeRemaining <= 0) {
            this.timerState.timeRemaining = this.getCurrentPhaseDuration();
        }
        
        this.timerState.isRunning = true;
        this.timerState.endTime = Date.now() + (this.timerState.timeRemaining * 1000);
        
        this.startAlarm(this.timerState.timeRemaining);
        await this.saveState();
        this.broadcastUpdate();
    }
    
    async pauseTimer() {
        this.timerState.isRunning = false;
        this.timerState.endTime = null;
        
        chrome.alarms.clear('tomato-timer');
        await this.saveState();
        this.broadcastUpdate();
    }
    
    async skipPhase() {
        chrome.alarms.clear('tomato-timer');
        await this.onTimerComplete();
    }
    
    async resetTimer() {
        this.timerState.isRunning = false;
        this.timerState.currentPhase = 'work';
        this.timerState.currentCycle = 1;
        this.timerState.timeRemaining = this.settings.workDuration * 60;
        this.timerState.endTime = null;
        
        chrome.alarms.clear('tomato-timer');
        await this.saveState();
        this.broadcastUpdate();
    }
    
    startAlarm(seconds) {
        chrome.alarms.clear('tomato-timer');
        chrome.alarms.create('tomato-timer', { delayInMinutes: seconds / 60 });
    }
    
    async onTimerComplete() {
        this.timerState.isRunning = false;
        this.timerState.endTime = null;
        
        // Show notification
        await this.showNotification();
        
        // Play sound
        this.playNotificationSound();
        
        // Move to next phase
        this.moveToNextPhase();
        
        await this.saveState();
        this.broadcastUpdate();
    }
    
    moveToNextPhase() {
        if (this.timerState.currentPhase === 'work') {
            // After work, go to break
            if (this.timerState.currentCycle % 4 === 0) {
                // Long break after 4 cycles
                this.timerState.currentPhase = 'long-break';
                this.timerState.timeRemaining = this.settings.longBreakDuration * 60;
            } else {
                // Short break
                this.timerState.currentPhase = 'short-break';
                this.timerState.timeRemaining = this.settings.shortBreakDuration * 60;
            }
        } else {
            // After any break, go back to work
            this.timerState.currentPhase = 'work';
            this.timerState.timeRemaining = this.settings.workDuration * 60;
            
            // Increment cycle only when starting a new work session
            if (this.timerState.currentPhase === 'work') {
                this.timerState.currentCycle++;
            }
        }
    }
    
    getCurrentPhaseDuration() {
        switch (this.timerState.currentPhase) {
            case 'work':
                return this.settings.workDuration * 60;
            case 'short-break':
                return this.settings.shortBreakDuration * 60;
            case 'long-break':
                return this.settings.longBreakDuration * 60;
            default:
                return this.settings.workDuration * 60;
        }
    }
    
    updateTimeRemaining() {
        if (this.timerState.isRunning && this.timerState.endTime) {
            const now = Date.now();
            const timeLeft = Math.max(0, Math.floor((this.timerState.endTime - now) / 1000));
            
            if (timeLeft !== this.timerState.timeRemaining) {
                this.timerState.timeRemaining = timeLeft;
                this.broadcastUpdate();
                
                if (timeLeft <= 0) {
                    this.onTimerComplete();
                }
            }
        }
    }
    
    async showNotification() {
        const phaseNames = {
            'work': '工作时间',
            'short-break': '短休息',
            'long-break': '长休息'
        };
        
        const currentPhase = phaseNames[this.timerState.currentPhase];
        const nextPhase = this.getNextPhaseName();
        
        const notificationOptions = {
            type: 'basic',
            title: '🍅 番茄工作法计时器',
            message: `${currentPhase}结束！现在开始${nextPhase}。`,
            priority: 2
        };
        
        try {
            await chrome.notifications.create('tomato-timer', notificationOptions);
            
            // Auto-clear notification after 5 seconds
            setTimeout(() => {
                chrome.notifications.clear('tomato-timer');
            }, 5000);
        } catch (error) {
            console.error('Failed to create notification:', error);
        }
    }
    
    getNextPhaseName() {
        if (this.timerState.currentPhase === 'work') {
            return this.timerState.currentCycle % 4 === 0 ? '长休息' : '短休息';
        } else {
            return '工作时间';
        }
    }
    
    playNotificationSound() {
        // Create a simple notification sound using Web Audio API
        // This uses a data URL with a simple beep sound
        const audioContext = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
        
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
    }
    
    broadcastUpdate() {
        // Send update to popup if it's open
        chrome.runtime.sendMessage({
            type: 'TIMER_UPDATE',
            data: this.timerState
        }).catch(() => {
            // Popup might not be open, ignore error
        });
    }
}

// Initialize the service when the worker starts
const tomatoService = new TomatoClockService();

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('Tomato Clock extension started');
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('Tomato Clock extension installed');
});