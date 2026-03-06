import Link from 'next/link';

export const metadata = {
    title: 'Terms of Service | Imagine Voxa',
    description: 'Terms of service for the Imagine Voxa platform.',
};

export default function TermsOfServicePage() {
    const lastUpdated = 'March 6, 2026';

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-3xl mx-auto px-6 py-16">
                <Link href="/" className="text-violet-600 hover:underline text-sm mb-8 inline-block">
                    ← Back to Imagine Voxa
                </Link>

                <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
                <p className="text-sm text-gray-500 mb-10">Last updated: {lastUpdated}</p>

                <div className="prose prose-gray max-w-none space-y-6 text-[15px] leading-relaxed text-gray-700">
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using Imagine Voxa (&quot;the Platform&quot;), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Platform.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">2. Description of Service</h2>
                        <p>
                            Imagine Voxa is an AI-powered content creation and social media management platform that helps users generate, manage, and publish branded content to platforms including LinkedIn, Facebook, and Instagram.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. User Accounts</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>You must sign in using a valid Google account.</li>
                            <li>You are responsible for maintaining the security of your account.</li>
                            <li>You must not share your account with others or allow unauthorized access.</li>
                            <li>You must be at least 18 years old to use the Platform.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. Subscription Plans &amp; Credits</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>The Platform offers Starter, Pro, and Pro+ plans with monthly credit allocations.</li>
                            <li>Credits reset at the beginning of each billing cycle and do not roll over.</li>
                            <li>We reserve the right to modify pricing and plan features with reasonable notice.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. Content Ownership</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>You retain ownership of all brand assets, documents, and content you upload.</li>
                            <li>AI-generated content (text and images) created through the Platform is yours to use.</li>
                            <li>You are responsible for ensuring that published content complies with the respective social media platform&apos;s policies.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. Acceptable Use</h2>
                        <p>You agree not to:</p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li>Use the Platform to generate harmful, misleading, or illegal content.</li>
                            <li>Attempt to circumvent credit limits or abuse the AI generation system.</li>
                            <li>Reverse-engineer, copy, or redistribute the Platform&apos;s technology.</li>
                            <li>Use automated bots to interact with the Platform without authorization.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. Social Media Integrations</h2>
                        <p>
                            When you connect LinkedIn, Facebook, or Instagram, you authorize us to publish content on your behalf. You may revoke these connections at any time. We are not responsible for content moderation decisions made by third-party platforms.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">8. Limitation of Liability</h2>
                        <p>
                            The Platform is provided &quot;as is&quot; without warranties of any kind. We are not liable for any damages arising from the use of AI-generated content, failed social media posts, or service interruptions.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">9. Termination</h2>
                        <p>
                            We may suspend or terminate your account if you violate these Terms. You may delete your account at any time from the Settings page, which will remove all associated data.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">10. Changes to Terms</h2>
                        <p>
                            We may update these Terms from time to time. Continued use of the Platform after changes constitutes acceptance of the updated terms.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">11. Contact Us</h2>
                        <p>
                            For questions about these Terms, please contact us at{' '}
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
