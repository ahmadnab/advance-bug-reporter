// utils/module-test.js
// Quick test to verify all modules are loaded correctly

console.log('=== Module Test Starting ===');

// Safely get global object
let globalObj;
try {
    if (typeof self !== 'undefined') {
        globalObj = self;
        console.log('Global object type: self (service worker)');
    }
} catch (e) {}

if (!globalObj) {
    try {
        if (typeof window !== 'undefined') {
            globalObj = window;
            console.log('Global object type: window');
        }
    } catch (e) {}
}

if (!globalObj) {
    console.error('Could not determine global object');
    globalObj = {};
}

// Check if BugReporter namespace exists
if (globalObj.BugReporter) {
    console.log('✅ BugReporter namespace exists');
} else {
    console.error('❌ BugReporter namespace NOT FOUND');
}

// Check each module
const modules = [
    'storageHelper',
    'logFormatter', 
    'geminiApi',
    'jiraApi',
    'zipHelper'
];

modules.forEach(moduleName => {
    if (globalObj.BugReporter?.utils?.[moduleName]) {
        const methods = Object.keys(globalObj.BugReporter.utils[moduleName]);
        console.log(`✅ ${moduleName} loaded with methods:`, methods);
    } else {
        console.error(`❌ ${moduleName} NOT LOADED`);
    }
});

console.log('=== Module Test Complete ===');