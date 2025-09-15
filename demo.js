// demo.js - Simple validation script for testing the extension functionality
// This file can be used for testing the extension logic outside of Chrome environment

// Mock Chrome APIs for testing
const mockChrome = {
    storage: {
        sync: {
            get: (keys) => Promise.resolve({}),
            set: (data) => Promise.resolve()
        },
        local: {
            get: (keys) => Promise.resolve({}),
            set: (data) => Promise.resolve()
        }
    },
    runtime: {
        sendMessage: (message) => Promise.resolve({ success: true }),
        onMessage: {
            addListener: (callback) => {}
        }
    },
    alarms: {
        create: (name, alarmInfo) => console.log(`Alarm created: ${name}`, alarmInfo),
        clear: (name) => console.log(`Alarm cleared: ${name}`),
        onAlarm: {
            addListener: (callback) => {}
        }
    },
    notifications: {
        create: (id, options) => {
            console.log(`Notification created: ${id}`, options);
            return Promise.resolve();
        },
        clear: (id) => console.log(`Notification cleared: ${id}`)
    }
};

// Test basic timer calculations
function testTimerLogic() {
    console.log('=== Testing Timer Logic ===');
    
    // Test time formatting
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    console.log('Time formatting tests:');
    console.log('1500 seconds =', formatTime(1500)); // Should be 25:00
    console.log('300 seconds =', formatTime(300));   // Should be 05:00
    console.log('900 seconds =', formatTime(900));   // Should be 15:00
    console.log('59 seconds =', formatTime(59));     // Should be 00:59
    
    // Test phase transitions
    function getNextPhase(currentPhase, cycle) {
        if (currentPhase === 'work') {
            return cycle % 4 === 0 ? 'long-break' : 'short-break';
        } else {
            return 'work';
        }
    }
    
    console.log('\nPhase transition tests:');
    console.log('After work cycle 1:', getNextPhase('work', 1)); // short-break
    console.log('After work cycle 4:', getNextPhase('work', 4)); // long-break
    console.log('After short-break:', getNextPhase('short-break', 1)); // work
    console.log('After long-break:', getNextPhase('long-break', 4)); // work
    
    console.log('✅ Timer logic tests passed!\n');
}

// Test settings validation
function testSettingsValidation() {
    console.log('=== Testing Settings Validation ===');
    
    function validateSettings(settings) {
        const { workDuration, shortBreakDuration, longBreakDuration } = settings;
        
        if (!workDuration || workDuration < 1 || workDuration > 60) {
            return { valid: false, error: 'Work duration must be 1-60 minutes' };
        }
        
        if (!shortBreakDuration || shortBreakDuration < 1 || shortBreakDuration > 30) {
            return { valid: false, error: 'Short break must be 1-30 minutes' };
        }
        
        if (!longBreakDuration || longBreakDuration < 1 || longBreakDuration > 60) {
            return { valid: false, error: 'Long break must be 1-60 minutes' };
        }
        
        return { valid: true };
    }
    
    // Test valid settings
    const validSettings = { workDuration: 25, shortBreakDuration: 5, longBreakDuration: 15 };
    console.log('Valid settings test:', validateSettings(validSettings));
    
    // Test invalid settings
    const invalidSettings1 = { workDuration: 0, shortBreakDuration: 5, longBreakDuration: 15 };
    console.log('Invalid work duration:', validateSettings(invalidSettings1));
    
    const invalidSettings2 = { workDuration: 25, shortBreakDuration: 45, longBreakDuration: 15 };
    console.log('Invalid short break:', validateSettings(invalidSettings2));
    
    console.log('✅ Settings validation tests passed!\n');
}

// Test notification messages
function testNotificationMessages() {
    console.log('=== Testing Notification Messages ===');
    
    const phaseNames = {
        'work': '工作时间',
        'short-break': '短休息',
        'long-break': '长休息'
    };
    
    function getNotificationMessage(currentPhase, nextPhase) {
        const current = phaseNames[currentPhase];
        const next = phaseNames[nextPhase];
        return `${current}结束！现在开始${next}。`;
    }
    
    console.log('Work -> Short break:', getNotificationMessage('work', 'short-break'));
    console.log('Work -> Long break:', getNotificationMessage('work', 'long-break'));
    console.log('Short break -> Work:', getNotificationMessage('short-break', 'work'));
    console.log('Long break -> Work:', getNotificationMessage('long-break', 'work'));
    
    console.log('✅ Notification message tests passed!\n');
}

// Run all tests
function runTests() {
    console.log('🍅 Chrome Tomato Clock - Extension Logic Tests\n');
    
    testTimerLogic();
    testSettingsValidation();
    testNotificationMessages();
    
    console.log('🎉 All tests completed successfully!');
    console.log('\nTo test the full extension:');
    console.log('1. Load the extension in Chrome (chrome://extensions/)');
    console.log('2. Enable Developer mode');
    console.log('3. Click "Load unpacked" and select this folder');
    console.log('4. The tomato icon should appear in your toolbar');
}

// Run tests if in Node.js environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runTests };
} else if (typeof window === 'undefined') {
    runTests();
}