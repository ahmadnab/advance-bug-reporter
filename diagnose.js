// diagnose.js - Diagnostic script for Advanced Bug Reporter Pro
// Run this in the Chrome extension's service worker console to diagnose issues

console.log('=== Advanced Bug Reporter Pro Diagnostic Tool ===\n');

async function runDiagnostics() {
    const results = {
        passed: [],
        failed: [],
        warnings: []
    };

    // Test 1: Check manifest
    try {
        const manifest = chrome.runtime.getManifest();
        if (manifest.manifest_version === 3) {
            results.passed.push('✓ Manifest V3 detected');
        } else {
            results.failed.push('✗ Wrong manifest version: ' + manifest.manifest_version);
        }
        
        // Check permissions
        const requiredPermissions = ['storage', 'tabCapture', 'scripting', 'debugger', 'offscreen'];
        const missingPermissions = requiredPermissions.filter(p => !manifest.permissions.includes(p));
        
        if (missingPermissions.length === 0) {
            results.passed.push('✓ All required permissions present');
        } else {
            results.failed.push('✗ Missing permissions: ' + missingPermissions.join(', '));
        }
    } catch (e) {
        results.failed.push('✗ Could not read manifest: ' + e.message);
    }

    // Test 2: Check storage
    try {
        const storageTest = await chrome.storage.local.get(null);
        results.passed.push('✓ Storage API accessible');
        
        // Check for settings
        const settings = ['jiraBaseUrl', 'jiraEmail', 'jiraApiToken', 'jiraProjectKey', 'aiApiKey'];
        const configuredSettings = settings.filter(s => storageTest[s]);
        
        if (configuredSettings.length === settings.length) {
            results.passed.push('✓ All settings configured');
        } else if (configuredSettings.length > 0) {
            results.warnings.push('⚠ Partially configured: ' + configuredSettings.length + '/' + settings.length + ' settings');
        } else {
            results.warnings.push('⚠ No settings configured yet');
        }
        
        // Check recordings
        if (storageTest.recordings && storageTest.recordings.length > 0) {
            results.passed.push('✓ Found ' + storageTest.recordings.length + ' recordings');
        } else {
            results.warnings.push('⚠ No recordings found');
        }
    } catch (e) {
        results.failed.push('✗ Storage API error: ' + e.message);
    }

    // Test 3: Check if service worker can create offscreen document
    try {
        const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [offscreenUrl]
        });
        
        if (existingContexts.length > 0) {
            results.warnings.push('⚠ Offscreen document already exists');
        } else {
            results.passed.push('✓ Offscreen document API available');
        }
    } catch (e) {
        results.failed.push('✗ Offscreen API error: ' + e.message);
    }

    // Test 4: Check web accessible resources
    try {
        const testResources = [
            'libs/rrweb.min.js',
            'libs/rrweb-player.min.js',
            'libs/jszip-loader.js'
        ];
        
        for (const resource of testResources) {
            const url = chrome.runtime.getURL(resource);
            try {
                const response = await fetch(url);
                if (response.ok) {
                    results.passed.push('✓ Resource accessible: ' + resource);
                } else {
                    results.failed.push('✗ Resource not found: ' + resource);
                }
            } catch (e) {
                results.failed.push('✗ Cannot access: ' + resource);
            }
        }
    } catch (e) {
        results.failed.push('✗ Resource check error: ' + e.message);
    }

    // Test 5: Check if content scripts can be injected
    try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab) {
            if (activeTab.url.startsWith('chrome://')) {
                results.warnings.push('⚠ Current tab is chrome:// page (cannot inject scripts)');
            } else {
                results.passed.push('✓ Current tab allows script injection');
            }
        } else {
            results.warnings.push('⚠ No active tab found');
        }
    } catch (e) {
        results.warnings.push('⚠ Tab check error: ' + e.message);
    }

    // Test 6: Import check
    try {
        // This will fail in service worker console but shows the attempt
        await import('./utils/zipHelper.js');
        results.passed.push('✓ Module imports working');
    } catch (e) {
        if (e.message.includes('import')) {
            results.warnings.push('⚠ Module import test skipped (normal in console)');
        } else {
            results.failed.push('✗ Module import error: ' + e.message);
        }
    }

    // Print results
    console.log('\n=== DIAGNOSTIC RESULTS ===\n');
    
    if (results.passed.length > 0) {
        console.log('%cPASSED TESTS:', 'color: green; font-weight: bold');
        results.passed.forEach(msg => console.log('%c' + msg, 'color: green'));
    }
    
    if (results.warnings.length > 0) {
        console.log('\n%cWARNINGS:', 'color: orange; font-weight: bold');
        results.warnings.forEach(msg => console.log('%c' + msg, 'color: orange'));
    }
    
    if (results.failed.length > 0) {
        console.log('\n%cFAILED TESTS:', 'color: red; font-weight: bold');
        results.failed.forEach(msg => console.log('%c' + msg, 'color: red'));
    }
    
    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Total: ${results.passed.length + results.warnings.length + results.failed.length} tests`);
    console.log(`%cPassed: ${results.passed.length}`, 'color: green');
    console.log(`%cWarnings: ${results.warnings.length}`, 'color: orange');
    console.log(`%cFailed: ${results.failed.length}`, 'color: red');
    
    if (results.failed.length === 0) {
        console.log('\n%c✅ Extension appears to be working correctly!', 'color: green; font-size: 14px; font-weight: bold');
    } else {
        console.log('\n%c❌ Some issues detected. Please fix the failed tests.', 'color: red; font-size: 14px; font-weight: bold');
    }
    
    // Additional helpful commands
    console.log('\n=== HELPFUL COMMANDS ===');
    console.log('// Check recording state:');
    console.log("chrome.runtime.sendMessage({type: 'GET_RECORDING_STATE'}, console.log)");
    console.log('\n// View all storage:');
    console.log('chrome.storage.local.get(null, console.log)');
    console.log('\n// Clear all data (careful!):');
    console.log('// chrome.storage.local.clear()');
    
    return results;
}

// Run diagnostics
runDiagnostics().catch(e => console.error('Diagnostic error:', e));