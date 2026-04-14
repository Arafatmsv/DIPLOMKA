/**
 * RBAC Utility for dynamically showing/hiding/disabling UI elements
 * based on user permissions.
 */
const RBAC = {
    user: null,

    // Default permission matrix per role
    ROLE_DEFAULTS: {
        'Администратор': {
            users: ['Create', 'Read', 'Update', 'Delete'],
            dictionaries: ['Create', 'Read', 'Update', 'Delete'],
            prices: ['Read', 'Update', 'Delete'],
            audit_logs: ['Read'],
            analytics: ['Create', 'Read', 'Update', 'Delete'],
            feedback: ['Read', 'Delete']
        },
        'Аналитик': {
            users: [],
            dictionaries: ['Read'],
            prices: ['Read'],
            audit_logs: [],
            analytics: ['Create', 'Read', 'Update', 'Delete'],
            feedback: ['Read']
        },
        'Оператор': {
            users: [],
            dictionaries: ['Read'],
            prices: ['Create', 'Read'],
            audit_logs: [],
            analytics: [],
            feedback: []
        }
    },

    init(user) {
        this.user = user;
        this.applyToDOM();
    },

    /**
     * Check if the current user has permission for a module+action.
     */
    hasAccess(moduleName, action) {
        if (!this.user) return false;
        if (this.user.role === 'Администратор') return true;

        const perms = this.user.permissions || {};
        const modPerms = perms[moduleName] || [];
        return modPerms.includes(action);
    },

    /**
     * Check if user has ANY access (at least one permission) for a module.
     */
    hasAnyAccess(moduleName) {
        if (!this.user) return false;
        if (this.user.role === 'Администратор') return true;

        const perms = this.user.permissions || {};
        const modPerms = perms[moduleName] || [];
        return modPerms.length > 0;
    },

    /**
     * Get default permissions for a given role.
     */
    getDefaultPermissions(role) {
        return this.ROLE_DEFAULTS[role] || this.ROLE_DEFAULTS['Оператор'];
    },

    /**
     * Apply RBAC rules to all DOM elements with data-rbac-* attributes.
     * Call this after page load and after any dynamic content rendering.
     */
    applyToDOM() {
        if (!this.user) return;

        // Process all elements with data-rbac-module
        document.querySelectorAll('[data-rbac-module]').forEach(el => {
            const moduleName = el.getAttribute('data-rbac-module');
            const action = el.getAttribute('data-rbac-action');

            if (action) {
                // Specific action check
                if (!this.hasAccess(moduleName, action)) {
                    const behavior = el.getAttribute('data-rbac-behavior') || 'hide';
                    if (behavior === 'hide') {
                        el.style.display = 'none';
                    } else if (behavior === 'disable') {
                        this._disableElement(el);
                    }
                }
            } else {
                // Module-level visibility (sidebar items)
                if (!this.hasAnyAccess(moduleName)) {
                    el.style.display = 'none';
                }
            }
        });

        // Process elements meant strictly for Admins
        document.querySelectorAll('[data-rbac-admin-only="true"]').forEach(el => {
            if (this.user.role !== 'Администратор') {
                el.style.display = 'none';
            }
        });
    },

    /**
     * Apply RBAC disable state to a single element.
     */
    _disableElement(el) {
        el.classList.add('rbac-locked');
        el.style.opacity = '0.5';
        el.style.cursor = 'not-allowed';
        el.style.pointerEvents = 'none';
        el.setAttribute('tabindex', '-1');
        el.setAttribute('aria-disabled', 'true');
        el.onclick = (e) => { e.preventDefault(); e.stopPropagation(); return false; };
    },

    /**
     * Check if action buttons (edit/delete) should be disabled for a module.
     * Returns CSS class string for dynamically rendered buttons.
     */
    getActionBtnClass(moduleName, action) {
        if (!this.hasAccess(moduleName, action)) {
            return 'rbac-locked';
        }
        return '';
    },

    /**
     * Returns HTML attributes string to disable a button if no permission.
     */
    getActionBtnAttrs(moduleName, action) {
        if (!this.hasAccess(moduleName, action)) {
            return 'style="opacity:0.5;cursor:not-allowed;pointer-events:none;" aria-disabled="true" tabindex="-1"';
        }
        return '';
    }
};
