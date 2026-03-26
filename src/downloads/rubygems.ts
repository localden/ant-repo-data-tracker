/**
 * RubyGems download stats.
 * RubyGems only exposes cumulative downloads — no per-day breakdown.
 */

const API = 'https://rubygems.org/api/v1/gems';

export async function fetchRubygemsTotal(pkg: string): Promise<number> {
  const res = await fetch(`${API}/${pkg}.json`);
  if (!res.ok) throw new Error(`RubyGems API ${res.status} for ${pkg}`);
  const data = (await res.json()) as { downloads: number };
  return data.downloads;
}
