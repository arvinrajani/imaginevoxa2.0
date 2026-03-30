import Link from 'next/link';

export const metadata = {
    title: 'Refund Policy | Imagine Voxa',
    description: 'Refund and cancellation policy for the Imagine Voxa platform.',
};

export default function RefundPolicyPage() {
    const lastUpdated = 'March 30, 2026';

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-3xl mx-auto px-6 py-16">
                <Link href="/" className="text-violet-600 hover:underline text-sm mb-8 inline-block">
                    ← Back to Imagine Voxa
                </Link>

                <h1 className="text-3xl font-bold text-gray-900 mb-2">Refund &amp; Cancellation Policy</h1>
                <p className="text-sm text-gray-500 mb-10">Last updated: {lastUpdated}</p>

                <div className="prose prose-gray max-w-none space-y-6 text-[15px] leading-relaxed text-gray-700">
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">1. Subscription Plans</h2>
                        <p>
                            Imagine Voxa offers monthly subscription plans (Starter, Pro, and Pro+). Each plan includes a set number of content generation credits that reset at the beginning of each billing cycle.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">2. Cancellation</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>You may cancel your subscription at any time from your account Settings page.</li>
                            <li>Upon cancellation, you will retain access to your current plan until the end of your billing period.</li>
                            <li>No further charges will be made after cancellation takes effect.</li>
                            <li>Your content, brands, and generated posts will remain accessible after cancellation, but you will not be able to generate new content or publish posts once your credits are exhausted.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. Refund Eligibility</h2>
                        <p>We offer refunds under the following conditions:</p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li><strong>Within 7 days of initial purchase:</strong> If you are unsatisfied with the platform, you may request a full refund within 7 days of your first subscription payment, provided you have used fewer than 10 credits.</li>
                            <li><strong>Service outage:</strong> If the platform experiences extended downtime (more than 48 consecutive hours) during your billing period, you may request a pro-rated credit or refund for the affected period.</li>
                            <li><strong>Duplicate charges:</strong> If you were charged twice for the same billing period, we will refund the duplicate charge immediately.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. Non-Refundable Scenarios</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Credits that have already been used for content or image generation.</li>
                            <li>Unused credits from a billing period that has ended (credits do not roll over).</li>
                            <li>Plan downgrades mid-cycle — you will retain your current plan until the end of the billing period.</li>
                            <li>Dissatisfaction with AI-generated content quality (we recommend trying the free tier before committing).</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. How to Request a Refund</h2>
                        <p>
                            To request a refund, email us at{' '}
                            <a href="mailto:arvinrajani71@gmail.com" className="text-violet-600 hover:underline">
                                arvinrajani71@gmail.com
                            </a>{' '}
                            with your account email and the reason for your request. We aim to process all refund requests within 5–7 business days.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. Plan Changes</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>Upgrades:</strong> When upgrading your plan, the new rate takes effect immediately. You will receive the additional credits for the current billing period.</li>
                            <li><strong>Downgrades:</strong> When downgrading, the change takes effect at the start of the next billing period. You keep your current plan&apos;s benefits until then.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. Contact Us</h2>
                        <p>
                            For billing questions or refund requests, contact us at{' '}
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
