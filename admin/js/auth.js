document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMsg = document.getElementById('errorMsg');
    const errorText = document.getElementById('errorText');
    const loginBtn = document.getElementById('loginBtn');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = usernameInput.value.trim().toLowerCase();
        const password = passwordInput.value;

        if (!username || !password) return;

        // UI state
        loginBtn.classList.add('loading');
        loginBtn.disabled = true;
        errorMsg.classList.add('hidden');
        if (errorText) errorText.textContent = '';

        try {
            await API.login(username, password);
            window.location.href = 'dashboard.html';
        } catch (err) {
            const msg = err.message || 'Ошибка входа. Проверьте данные.';
            if (errorText) {
                errorText.textContent = msg;
            } else {
                errorMsg.textContent = msg;
            }
            errorMsg.classList.remove('hidden');
        } finally {
            loginBtn.classList.remove('loading');
            loginBtn.disabled = false;
        }
    });
});
