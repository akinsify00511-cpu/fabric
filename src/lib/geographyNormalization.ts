export type GeographyLevel = 'country' | 'region' | 'city' | 'district'

export type CanonicalGeography = {
  countryCode: string
  countryName: string
  regionCode?: string
  regionName?: string
  cityCode?: string
  cityName?: string
  districtCode?: string
  districtName?: string
  latitude?: number
  longitude?: number
}

export type GeographyAlias = {
  alias: string
  canonicalKey: string
  level: GeographyLevel
}

export type NormalizedLocation = CanonicalGeography & {
  canonicalKey: string
  confidence: 'low' | 'medium' | 'high'
  matchedAlias?: string
}

const clean = (value?: string) => value?.trim().toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ')

export function normalizeGeography(input: CanonicalGeography, aliases: GeographyAlias[] = []): NormalizedLocation {
  const parts = [input.countryCode, input.regionCode ?? clean(input.regionName), input.cityCode ?? clean(input.cityName), input.districtCode ?? clean(input.districtName)].filter(Boolean)
  const canonicalKey = parts.join(':')
  const candidates = [input.districtName, input.cityName, input.regionName].map(clean).filter(Boolean)
  const matchedAlias = aliases.find((alias) => candidates.includes(clean(alias.alias)))
  return {
    ...input,
    canonicalKey: matchedAlias?.canonicalKey ?? canonicalKey,
    confidence: matchedAlias ? 'high' : input.cityName || input.regionName ? 'medium' : 'low',
    matchedAlias: matchedAlias?.alias,
  }
}

export function buildGeographyHierarchy(locations: NormalizedLocation[]) {
  const hierarchy = new Map<string, Set<string>>()
  for (const location of locations) {
    const levels = [location.countryCode, location.regionCode, location.cityCode, location.districtCode].filter(Boolean) as string[]
    for (let index = 1; index < levels.length; index += 1) {
      const parent = levels.slice(0, index).join(':')
      const child = levels.slice(0, index + 1).join(':')
      const children = hierarchy.get(parent) ?? new Set<string>()
      children.add(child)
      hierarchy.set(parent, children)
    }
  }
  return hierarchy
}
