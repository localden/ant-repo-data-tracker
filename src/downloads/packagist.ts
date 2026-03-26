/**
 * Packagist (PHP/Composer) download stats.
 * Packagist exposes both daily and cumulative natively.
 */

const API = 'https://packagist.org/packages';

export async function fetchPackagistStats(pkg: string): Promise<{ daily: number; total: number }> {
  const res = await fetch(`${API}/${pkg}/stats.json`);
  if (!res.ok) throw new Error(`Packagist API ${res.status} for ${pkg}`);
  const data = (await res.json()) as { downloads: { total: number; daily: number } };
  return { daily: data.downloads.daily, total: data.downloads.total };
}
