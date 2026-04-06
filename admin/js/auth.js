document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMsg = document.getElementById('errorMsg');
    const loginBtn = document.getElementById('loginBtn');

    // Auto-fill credentials for demo purposes
    emailInput.value = 'admin@example.com';
    passwordInput.value = 'Admin123!';

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) return;

        // UI state
        loginBtn.classList.add('loading');
        errorMsg.classList.add('hidden');
        errorMsg.textContent = '';

        try {
            await API.login(email, password);
            // On success, redirect to dashboard
            window.location.href = 'dashboard.html';
        } catch (err) {
            errorMsg.textContent = err.message || 'Ошибка входа. Проверьте данные.';
            errorMsg.classList.remove('hidden');
        } finally {
            loginBtn.classList.remove('loading');
        }
    });
});
