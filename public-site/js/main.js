document.addEventListener('DOMContentLoaded', () => {

    // Mobile Menu Toggle
    const menuToggle = document.getElementById('menuToggle');
    const navbar = document.getElementById('navbar');
    if (menuToggle && navbar) {
        menuToggle.addEventListener('click', () => {
            navbar.classList.toggle('open');
        });
    }

    // Fade-in on scroll animation
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.fade-in').forEach(el => {
        observer.observe(el);
    });

    // Modal logic
    const modalOverlays = document.querySelectorAll('.modal-overlay');
    const modalTriggers = document.querySelectorAll('[data-modal-target]');
    const modalCloses = document.querySelectorAll('.modal-close, [data-modal-close]');

    modalTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = trigger.getAttribute('data-modal-target');
            const target = document.getElementById(targetId);
            if (target) {
                target.classList.add('active');
            }
        });
    });

    modalCloses.forEach(close => {
        close.addEventListener('click', (e) => {
            e.preventDefault();
            close.closest('.modal-overlay').classList.remove('active');
        });
    });

    modalOverlays.forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    // Accordion Logic
    const accordions = document.querySelectorAll('.accordion-header');
    accordions.forEach(acc => {
        acc.addEventListener('click', () => {
            const parent = acc.parentElement;
            parent.classList.toggle('active');
            const icon = acc.querySelector('.accordion-icon');
            if (icon) {
                icon.textContent = parent.classList.contains('active') ? '−' : '+';
            }
        });
    });

    // Feedback form (Contact Page and Modal)
    const forms = document.querySelectorAll('.feedback-form');
    forms.forEach(form => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            // Show toast
            showToast('Сообщение успешно отправлено. Спасибо!');
            form.reset();

            const modal = form.closest('.modal-overlay');
            if (modal) {
                modal.classList.remove('active');
            }
        });
    });
});

// Toast functionality
function showToast(message) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;

    container.appendChild(toast);

    // trigger reflow
    toast.offsetHeight;

    toast.classList.add('active');

    setTimeout(() => {
        toast.classList.remove('active');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}
