import Link from 'next/link';

export const metadata = {
    title: 'Acceptable Use Policy | Imagine Voxa',
    description: 'Acceptable use policy for the Imagine Voxa platform.',
};

export default function AcceptableUsePolicyPage() {
    const lastUpdated = 'March 30, 2026';

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-3xl mx-auto px-6 py-16">
                <Link href="/" className="text-violet-600 hover:underline text-sm mb-8 inline-block">
                    ← Back to Imagine Voxa
                </Link>

                <h1 className="text-3xl font-bold text-gray-900 mb-2">Acceptable Use Policy</h1>
                <p className="text-sm text-gray-500 mb-10">Last updated: {lastUpdated}</p>

                <div className="prose prose-gray max-w-none space-y-6 text-[15px] leading-relaxed text-gray-700">
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">1. Purpose</h2>
                        <p>
                            This Acceptable Use Policy outlines the rules and guidelines for using Imagine Voxa. By using the platform, you agree to comply with this policy. Violations may result in account suspension or termination.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">2. Permitted Use</h2>
                        <p>You may use Imagine Voxa to:</p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li>Generate professional content for LinkedIn, Facebook, and Instagram using AI.</li>
                            <li>Create branded images and visuals for social media posts.</li>
                            <li>Manage and publish content to your connected social media accounts.</li>
                            <li>Upload brand assets (logos, documents, PDFs) for content personalization.</li>
                            <li>Schedule and organize your content calendar.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. Prohibited Activities</h2>
                        <p>You must <strong>not</strong> use Imagine Voxa to:</p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li><strong>Generate harmful content:</strong> Content that is defamatory, threatening, harassing, hateful, discriminatory, or promotes violence.</li>
                            <li><strong>Create misleading content:</strong> Fake news, disinformation, impersonation of other individuals or organizations, or deceptive claims.</li>
                            <li><strong>Produce illegal content:</strong> Content that violates applicable laws, promotes illegal activities, or infringes on intellectual property rights.</li>
                            <li><strong>Spam or abuse:</strong> Automated mass posting, spamming, or flooding social media platforms with low-quality content.</li>
                            <li><strong>Circumvent platform limits:</strong> Creating multiple accounts to bypass credit limits, manipulating usage tracking, or exploiting bugs.</li>
                            <li><strong>Reverse-engineer the platform:</strong> Attempting to extract, copy, or replicate the AI models, algorithms, or proprietary technology.</li>
                            <li><strong>Automated scraping:</strong> Using bots, scrapers, or automated tools to interact with the platform without authorization.</li>
                            <li><strong>Share account access:</strong> Sharing your login credentials or allowing unauthorized users to access your account.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. Content Responsibility</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>You are solely responsible for reviewing AI-generated content before publishing.</li>
                            <li>You must ensure all published content complies with the terms of service of the target social media platform (LinkedIn, Facebook, Instagram).</li>
                            <li>Imagine Voxa does not guarantee the accuracy, originality, or appropriateness of AI-generated content.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. Rate Limits &amp; Fair Use</h2>
                        <p>
                            To ensure a fair experience for all users, the platform enforces rate limits on API calls and content generation. Excessive or abusive usage patterns may trigger temporary throttling. Persistent abuse may result in account suspension.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. Reporting Violations</h2>
                        <p>
                            If you become aware of any violations of this policy, please report them to{' '}
                            <a href="mailto:arvinrajani71@gmail.com" className="text-violet-600 hover:underline">
                                arvinrajani71@gmail.com
                            </a>. We take all reports seriously and will investigate promptly.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. Enforcement</h2>
                        <p>
                            Violations of this policy may result in:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li>A warning notice sent to your registered email.</li>
                            <li>Temporary suspension of your account and content generation access.</li>
                            <li>Permanent account termination for severe or repeated violations.</li>
                            <li>Reporting to relevant authorities if illegal activity is suspected.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">8. Contact Us</h2>
                        <p>
                            For questions about this policy, contact us at{' '}
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
