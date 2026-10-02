// Shared public navigation: the same destinations on every public page.
document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('mobileMenuBtn');
    const links = document.getElementById('navLinks');
    if (!button || !links) return;
    const setOpen = (open) => {
        links.classList.toggle('active', open);
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
        const icon = button.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-bars', !open);
            icon.classList.toggle('fa-times', open);
        }
    };
    button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
    links.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
            setOpen(false);
            button.focus();
        }
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('#navbar')) setOpen(false);
    });
    const desktop = window.matchMedia('(min-width: 1101px)');
    desktop.addEventListener('change', event => { if (event.matches) setOpen(false); });
});
