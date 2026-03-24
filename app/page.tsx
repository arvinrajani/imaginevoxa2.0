import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import LandingPage from './(marketing)/page';

type RootPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getFirstSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function buildSearchQuery(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'undefined') continue;

    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
      continue;
    }

    query.set(key, value);
  }

  return query;
}

export default async function RootPage({ searchParams }: RootPageProps) {
  const params = await searchParams;
  const code = getFirstSearchParam(params.code);
  const error = getFirstSearchParam(params.error);
  const state = getFirstSearchParam(params.state);
  const hasOAuthPayload = Boolean(code || error);

  if (hasOAuthPayload && state) {
    const cookieStore = await cookies();
    const metaState = cookieStore.get('meta_oauth_state')?.value;
    const linkedInState = cookieStore.get('linkedin_oauth_state')?.value;
    const query = buildSearchQuery(params);

    if (state === metaState) {
      redirect(`/api/meta/callback?${query.toString()}`);
    }

    if (state === linkedInState) {
      redirect(`/api/linkedin/callback?${query.toString()}`);
    }
  }

  if (code) {
    const query = buildSearchQuery(params);

    if (!query.get('next')) {
      query.set('next', '/app');
    }

    redirect(`/auth/callback?${query.toString()}`);
  }

  return <LandingPage />;
}
