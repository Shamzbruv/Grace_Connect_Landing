// Google Analytics 4 for the Grace Connect website.
//
// G-EF92D44WSB is the web data stream already configured for this project in
// Firebase, so website traffic reports into the same GA4 property as the app
// rather than a second, disconnected one.
//
// Anonymised by default: IP anonymisation is on, and nothing identifying is
// ever passed as a parameter. The subscription pages in particular handle
// church credentials and billing amounts, and none of that is sent here.
(() => {
    const MEASUREMENT_ID = 'G-EF92D44WSB';

    // Respect an explicit browser "do not track" rather than overriding it.
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;

    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID, {
        anonymize_ip: true,
        // The subscription pages carry no identifiers in the URL, but pinning
        // the page path keeps a future query string out of the report.
        page_path: window.location.pathname,
    });

    /** Tracks a site event. Never pass anything that identifies a church. */
    window.gcTrack = (name, params = {}) => {
        try {
            gtag('event', name, params);
        } catch (_) {
            // Analytics must never break the page it measures.
        }
    };
})();
