// Event delegation — replaces inline on* handlers for strict CSP compatibility.
// Only function names in ALLOWED_ACTIONS are invocable. Never invoke from window[name]
// without this allow-list — otherwise HTML injection becomes arbitrary-function-call.
(function() {
    'use strict';
    const ALLOWED_ACTIONS = new Set([
        'handleSignOut',
        'switchTab',
        'copyLink',
        'resetPassword',
        'createTask',
        'skipTask',
        'loadReferrals',
        'loadSubmissions',
        'loadTaskLogs',
        'loadGuestReferrals',
        'toggleSelectAll',
        'bulkMarkPaid',
        'clearSelection',
        'closeDetailModal',
        'closeEditAwardModal',
        'closeReferralModal',
        'closeTaskLogModal',
        'exportCSV',
        'saveAwardAmount',
        'saveReferral',
        '__reload'
    ]);

    function lookup(name) {
        if (!ALLOWED_ACTIONS.has(name)) return null;
        if (name === '__reload') return () => location.reload();
        const fn = window[name];
        return typeof fn === 'function' ? fn : null;
    }

    function dispatch(el, attr) {
        const name = el.getAttribute(attr);
        if (!name) return;
        const fn = lookup(name);
        if (!fn) { console.warn('[wire-actions] blocked or unknown action:', name); return; }
        const arg = el.getAttribute('data-arg');
        try {
            if (arg !== null) fn(arg);
            else fn();
        } catch (err) {
            console.error('[wire-actions] error in', name, err);
        }
    }

    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-click]');
        if (el) dispatch(el, 'data-click');
    });
    document.addEventListener('change', (e) => {
        const el = e.target.closest('[data-change]');
        if (el) dispatch(el, 'data-change');
    });
})();
