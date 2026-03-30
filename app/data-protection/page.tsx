import Link from 'next/link';

export const metadata = {
    title: 'Data Protection & GDPR | Imagine Voxa',
    description: 'Data protection and GDPR compliance information for the Imagine Voxa platform.',
};

export default function DataProtectionPage() {
    const lastUpdated = 'March 30, 2026';

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-3xl mx-auto px-6 py-16">
                <Link href="/" className="text-violet-600 hover:underline text-sm mb-8 inline-block">
                    ← Back to Imagine Voxa
                </Link>

                <h1 className="text-3xl font-bold text-gray-900 mb-2">Data Protection &amp; GDPR</h1>
                <p className="text-sm text-gray-500 mb-10">Last updated: {lastUpdated}</p>

                <div className="prose prose-gray max-w-none space-y-6 text-[15px] leading-relaxed text-gray-700">
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">1. Our Commitment</h2>
                        <p>
                            Imagine Voxa is committed to protecting your personal data in accordance with the General Data Protection Regulation (GDPR) and other applicable data protection laws. This page explains how we handle your data and the rights you have.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">2. Data Controller</h2>
                        <p>
                            Imagine Voxa acts as the data controller for the personal information collected through the platform. For data protection inquiries, contact us at{' '}
                            <a href="mailto:arvinrajani71@gmail.com" className="text-violet-600 hover:underline">
                                arvinrajani71@gmail.com
                            </a>.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. Legal Basis for Processing</h2>
                        <p>We process your personal data under the following legal bases:</p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li><strong>Contract Performance:</strong> Processing necessary to provide you with the services you signed up for (account management, content generation, social media publishing).</li>
                            <li><strong>Legitimate Interest:</strong> Improving our platform, preventing abuse, and ensuring security.</li>
                            <li><strong>Consent:</strong> Where you explicitly consent to specific data processing activities (e.g., connecting social media accounts).</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. Data We Collect</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>Identity Data:</strong> Name, email address, and profile picture from Google OAuth.</li>
                            <li><strong>Brand Data:</strong> Brand names, logos, color palettes, descriptions, and uploaded documents you provide.</li>
                            <li><strong>Content Data:</strong> AI-generated posts, images, and associated metadata.</li>
                            <li><strong>Connection Data:</strong> OAuth tokens for LinkedIn and Meta platforms (encrypted at rest).</li>
                            <li><strong>Usage Data:</strong> Feature usage, credit consumption, and platform interactions.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. Your Rights Under GDPR</h2>
                        <p>If you are located in the European Economic Area (EEA), you have the following rights:</p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li><strong>Right of Access:</strong> Request a copy of all personal data we hold about you.</li>
                            <li><strong>Right to Rectification:</strong> Request correction of inaccurate personal data.</li>
                            <li><strong>Right to Erasure:</strong> Request deletion of your personal data (&quot;right to be forgotten&quot;). You can delete your account and all associated data from the Settings page.</li>
                            <li><strong>Right to Restriction:</strong> Request restriction of processing in certain circumstances.</li>
                            <li><strong>Right to Data Portability:</strong> Request your data in a structured, machine-readable format. You can export your data from the Settings page.</li>
                            <li><strong>Right to Object:</strong> Object to processing based on our legitimate interests.</li>
                            <li><strong>Right to Withdraw Consent:</strong> Withdraw consent at any time where processing is based on consent (e.g., revoking social media connections).</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. Data Storage &amp; Security</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>All data is stored on <strong>Supabase</strong> infrastructure (hosted on AWS in the EU/US depending on project configuration).</li>
                            <li>Data in transit is protected by TLS 1.2+ encryption.</li>
                            <li>Data at rest is encrypted using AES-256.</li>
                            <li>OAuth access tokens are stored securely and never exposed to the client.</li>
                            <li>We do not store payment card details — all billing is handled by our payment processor.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. Data Retention</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Account data is retained as long as your account is active.</li>
                            <li>Generated content is retained until you delete it or close your account.</li>
                            <li>Upon account deletion, all personal data is permanently removed within 30 days.</li>
                            <li>Anonymized usage statistics may be retained for service improvement purposes.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">8. International Transfers</h2>
                        <p>
                            Your data may be processed by third-party services (OpenAI, Vercel) located outside the EEA. Where this occurs, we ensure adequate safeguards are in place, including Standard Contractual Clauses (SCCs) approved by the European Commission.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">9. Data Sub-Processors</h2>
                        <p>We use the following sub-processors:</p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li><strong>Supabase (AWS):</strong> Database, authentication, and file storage.</li>
                            <li><strong>OpenAI:</strong> AI text generation and image generation.</li>
                            <li><strong>Vercel:</strong> Application hosting and edge functions.</li>
                            <li><strong>Google:</strong> OAuth authentication provider.</li>
                            <li><strong>LinkedIn (Microsoft):</strong> Social media publishing API.</li>
                            <li><strong>Meta:</strong> Facebook and Instagram publishing API.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">10. Exercising Your Rights</h2>
                        <p>
                            To exercise any of your data protection rights, email us at{' '}
                            <a href="mailto:arvinrajani71@gmail.com" className="text-violet-600 hover:underline">
                                arvinrajani71@gmail.com
                            </a>{' '}
                            with the subject line &quot;GDPR Request&quot;. We will respond within 30 days. You also have the right to lodge a complaint with your local data protection authority.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}
