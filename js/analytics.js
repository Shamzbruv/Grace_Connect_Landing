// Google Analytics 4 for the Grace Connect website.
//
// G-EF92D44WSB is the web data stream already configured for this project in
// Firebase, so website traffic reports into the same GA4 property as the app
// rather than a second, disconnected one.
//
// Only static page paths are reported. Authentication and recovery pages are
// excluded entirely; their URLs can carry credentials before the app clears them.
(() => {
    const MEASUREMENT_ID = 'G-EF92D44WSB';

    // Respect an explicit browser "do not track" rather than overriding it.
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
    if (/\/(auth-callback|reset-password)\.html$/.test(window.location.pathname)) return;
    const pageLocation = window.location.origin + window.location.pathname;
    let pageReferrer = '';
    try {
        const referrer = new URL(document.referrer);
        pageReferrer = referrer.origin + referrer.pathname;
    } catch (_) {}

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
        page_location: pageLocation,
        page_referrer: pageReferrer,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
    });

    /** Tracks a site event. Never pass anything that identifies a church. */
    window.gcTrack = (name, params = {}) => {
        try {
            // Page context cannot be replaced by a caller carrying raw URLs.
            gtag('event', name, {
                ...params, page_location: pageLocation, page_referrer: pageReferrer,
            });
        } catch (_) {
            // Analytics must never break the page it measures.
        }
    };
})();
