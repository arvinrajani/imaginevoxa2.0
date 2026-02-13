import { redirect } from 'next/navigation';
import LandingPage from './(marketing)/page';

type RootPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RootPage({ searchParams }: RootPageProps) {
  const params = await searchParams;
  const codeParam = params.code;
  const hasOAuthCode = Array.isArray(codeParam) ? codeParam.length > 0 : Boolean(codeParam);

  if (hasOAuthCode) {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'undefined') continue;

      if (Array.isArray(value)) {
        value.forEach((item) => query.append(key, item));
        continue;
      }

      query.set(key, value);
    }

    if (!query.get('next')) {
      query.set('next', '/app');
    }

    redirect(`/auth/callback?${query.toString()}`);
  }

  return <LandingPage />;
}
