import { describe, expect, it } from 'vitest';

import {
  addMinutes,
  estimateTravel,
  gameLocations,
  getLocationBackground,
  getLocationById,
  normalizeLocationId,
} from './locations';

describe('location catalog', () => {
  it('contains the ten fixed story locations', () => {
    expect(gameLocations).toHaveLength(10);
    expect(new Set(gameLocations.map(location => location.id)).size).toBe(10);
  });

  it('falls back to the player apartment for an unknown saved location', () => {
    expect(normalizeLocationId(undefined)).toBe('home');
    expect(normalizeLocationId('missing-location')).toBe('home');
  });

  it('does not charge travel within the current location', () => {
    expect(estimateTravel('home', 'home')).toEqual({
      distance: 0,
      distanceKm: 0,
      timeMinutes: 0,
      staminaCost: 0,
    });
  });

  it('charges more for a distant destination than the nearby senpai building', () => {
    const near = estimateTravel('home', 'senpai-building');
    const far = estimateTravel('home', 'detective-inn');
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    expect(far!.distance).toBeGreaterThan(near!.distance);
    expect(far!.timeMinutes).toBeGreaterThan(near!.timeMinutes);
    expect(far!.staminaCost).toBeGreaterThan(near!.staminaCost);
    expect(near!.timeMinutes).toBe(5);
  });

  it('selects day and night variants from the arrival time', () => {
    const school = getLocationById('school')!;
    expect(getLocationBackground(school, new Date(2024, 8, 9, 10, 0))).toBe('school-day');
    expect(getLocationBackground(school, new Date(2024, 8, 9, 20, 0))).toBe('school-night');
  });

  it('advances time without mutating the source date', () => {
    const source = new Date(2024, 8, 9, 7, 30);
    const result = addMinutes(source, 25);
    expect(result.getHours()).toBe(7);
    expect(result.getMinutes()).toBe(55);
    expect(source.getMinutes()).toBe(30);
  });
});
