import Link from 'next/link';

export const metadata = {
    title: 'Privacy Policy | Imagine Voxa',
    description: 'Privacy policy for the Imagine Voxa platform.',
};

export default function PrivacyPolicyPage() {
    const lastUpdated = 'March 6, 2026';

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-3xl mx-auto px-6 py-16">
                <Link href="/" className="text-violet-600 hover:underline text-sm mb-8 inline-block">
                    ← Back to Imagine Voxa
                </Link>

                <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
                <p className="text-sm text-gray-500 mb-10">Last updated: {lastUpdated}</p>

                <div className="prose prose-gray max-w-none space-y-6 text-[15px] leading-relaxed text-gray-700">
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">1. Introduction</h2>
                        <p>
                            Imagine Voxa (&quot;we&quot;, &quot;our&quot;, or &quot;the Platform&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our AI-powered content creation and social media management platform at <strong>imaginevoxa.com</strong>.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">2. Information We Collect</h2>
                        <p>We collect the following types of information:</p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li><strong>Account Information:</strong> Name, email address, and profile picture provided via Google OAuth sign-in.</li>
                            <li><strong>Brand Data:</strong> Brand names, logos, colors, company descriptions, and uploaded documents (PDFs, images) that you provide for content generation.</li>
                            <li><strong>Generated Content:</strong> Posts, images, and other content created using our AI tools.</li>
                            <li><strong>Social Media Connections:</strong> LinkedIn and Meta (Facebook/Instagram) OAuth tokens used for publishing posts on your behalf.</li>
                            <li><strong>Usage Data:</strong> Pages visited, features used, and credits consumed.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. How We Use Your Information</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>To provide and maintain our content generation and publishing services.</li>
                            <li>To personalize AI-generated content based on your brand identity.</li>
                            <li>To publish posts to LinkedIn, Facebook, or Instagram on your behalf when you authorize it.</li>
                            <li>To track your credit usage and manage your subscription plan.</li>
                            <li>To improve our platform and develop new features.</li>
                            <li>To communicate with you about account-related matters.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. Data Storage &amp; Security</h2>
                        <p>
                            Your data is stored securely using <strong>Supabase</strong> (hosted on AWS). We use industry-standard encryption for data in transit (TLS/SSL) and at rest. Social media OAuth tokens are stored securely and used only for authorized publishing actions.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. Third-Party Services</h2>
                        <p>We use the following third-party services:</p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li><strong>Google OAuth:</strong> For user authentication.</li>
                            <li><strong>Supabase:</strong> For database and file storage.</li>
                            <li><strong>OpenAI:</strong> For AI-powered content and image generation.</li>
                            <li><strong>LinkedIn API:</strong> For publishing posts to LinkedIn.</li>
                            <li><strong>Meta Graph API:</strong> For publishing posts to Facebook and Instagram.</li>
                            <li><strong>Vercel:</strong> For hosting the platform.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. Data Sharing</h2>
                        <p>
                            We do <strong>not</strong> sell, rent, or share your personal data with third parties for marketing purposes. Your data is only shared with the third-party services listed above to the extent necessary to operate the platform.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. Your Rights</h2>
                        <p>You have the right to:</p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li>Access your personal data stored on the platform.</li>
                            <li>Export your data at any time from the Settings page.</li>
                            <li>Delete all your data, including posts and social connections, from the Settings page.</li>
                            <li>Revoke social media connections at any time.</li>
                            <li>Delete your account entirely.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">8. Cookies</h2>
                        <p>
                            We use essential cookies for authentication and session management. We do not use tracking or advertising cookies.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">9. Changes to This Policy</h2>
                        <p>
                            We may update this Privacy Policy from time to time. We will notify you of significant changes by posting a notice on the platform.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">10. Contact Us</h2>
                        <p>
                            If you have any questions about this Privacy Policy, please contact us at{' '}
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
