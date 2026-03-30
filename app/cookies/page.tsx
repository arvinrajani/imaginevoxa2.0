import Link from 'next/link';

export const metadata = {
    title: 'Cookie Policy | Imagine Voxa',
    description: 'Cookie policy for the Imagine Voxa platform.',
};

export default function CookiePolicyPage() {
    const lastUpdated = 'March 30, 2026';

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-3xl mx-auto px-6 py-16">
                <Link href="/" className="text-violet-600 hover:underline text-sm mb-8 inline-block">
                    ← Back to Imagine Voxa
                </Link>

                <h1 className="text-3xl font-bold text-gray-900 mb-2">Cookie Policy</h1>
                <p className="text-sm text-gray-500 mb-10">Last updated: {lastUpdated}</p>

                <div className="prose prose-gray max-w-none space-y-6 text-[15px] leading-relaxed text-gray-700">
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">1. What Are Cookies</h2>
                        <p>
                            Cookies are small text files stored on your device when you visit a website. They help the site remember your preferences and improve your experience.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">2. How We Use Cookies</h2>
                        <p>Imagine Voxa uses a minimal set of cookies strictly necessary for the platform to function:</p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li><strong>Authentication Cookies:</strong> Session tokens managed by Supabase Auth to keep you signed in securely. These are HTTP-only, secure cookies that cannot be accessed by client-side scripts.</li>
                            <li><strong>OAuth State Cookies:</strong> Temporary cookies used during the LinkedIn and Meta (Facebook/Instagram) OAuth connection flows. These are deleted immediately after the connection is completed.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. Cookies We Do NOT Use</h2>
                        <p>We do <strong>not</strong> use any of the following:</p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li>Advertising or tracking cookies</li>
                            <li>Third-party analytics cookies (e.g., Google Analytics)</li>
                            <li>Social media tracking pixels</li>
                            <li>Cross-site tracking cookies</li>
                            <li>Profiling or behavioral targeting cookies</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. Local Storage</h2>
                        <p>
                            We use browser local storage in limited scenarios to improve your experience:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li><strong>Draft Auto-Save:</strong> When creating content in the Studio, your in-progress draft is temporarily saved to local storage so it is not lost if you close your browser. This data is cleared when you publish.</li>
                            <li><strong>UI Preferences:</strong> Theme and layout preferences that stay on your device.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. Managing Cookies</h2>
                        <p>
                            You can control cookies through your browser settings. However, disabling authentication cookies will prevent you from signing in to the platform. Clearing local storage will remove any auto-saved drafts.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. Changes to This Policy</h2>
                        <p>
                            We may update this Cookie Policy from time to time. Any changes will be reflected on this page with an updated date.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. Contact Us</h2>
                        <p>
                            If you have questions about our use of cookies, contact us at{' '}
                            <a href="mailto:arvinrajani71@gmail.com" className="text-violet-600 hover:underline">
                                arvinrajani71@gmail.com
                            </a>.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}
